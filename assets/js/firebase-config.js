import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc as _getDoc, 
    getDocs as _getDocs,
    setDoc, 
    deleteDoc, 
    serverTimestamp,
    collection,
    query,
    onSnapshot as _onSnapshot,
    updateDoc,
    increment,
    where,
    orderBy,
    limit,
    addDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
  authDomain: "agro-divel.firebaseapp.com",
  projectId: "agro-divel",
  storageBucket: "agro-divel.firebasestorage.app", 
  messagingSenderId: "583977436505",
  appId: "1:583977436505:web:3754ec029aebb3d9d67848"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Expõe db globalmente para o tracker
window._firebaseDb = db;

// ============ SISTEMA DE TRACKING DE LEITURAS (GLOBAL) ============
// Este sistema intercepta TODAS as leituras do Firebase, independente de como foram importadas

const readTracker = {
    counts: {},
    lastFlush: Date.now(),
    isEnabled: true,
    
    track(collectionName, operation, docCount = 1) {
        if (!this.isEnabled || !collectionName || collectionName === '_analytics' || collectionName === '_firebaseReadStats') return;
        
        if (!this.counts[collectionName]) {
            this.counts[collectionName] = { reads: 0, getDoc: 0, getDocs: 0, onSnapshot: 0 };
        }
        this.counts[collectionName].reads += docCount;
        this.counts[collectionName][operation] = (this.counts[collectionName][operation] || 0) + 1;
        
        // Log menos verboso
        // console.log(`📊 [${operation}] ${collectionName}: ${docCount} doc(s)`);
        
        // Flush a cada 2 minutos ou 30 leituras
        const totalReads = Object.values(this.counts).reduce((s, c) => s + c.reads, 0);
        if (totalReads >= 30 || Date.now() - this.lastFlush > 120000) {
            this.flush();
        }
    },
    
    async flush() {
        if (Object.keys(this.counts).length === 0) return;
        
        // Desabilita tracking temporariamente para evitar loop infinito
        this.isEnabled = false;
        
        try {
            const today = new Date().toISOString().split('T')[0];
            const ref = doc(db, '_firebaseReadStats', `reads_${today}`);
            const snap = await _getDoc(ref);
            const data = snap.exists() ? snap.data() : { collections: {}, totalReads: 0, date: today };
            
            for (const [col, stats] of Object.entries(this.counts)) {
                if (!data.collections[col]) {
                    data.collections[col] = { reads: 0, getDoc: 0, getDocs: 0, onSnapshot: 0 };
                }
                data.collections[col].reads += stats.reads;
                data.collections[col].getDoc += stats.getDoc || 0;
                data.collections[col].getDocs += stats.getDocs || 0;
                data.collections[col].onSnapshot += stats.onSnapshot || 0;
                data.totalReads += stats.reads;
            }
            
            data.updatedAt = serverTimestamp();
            await setDoc(ref, data, { merge: true });
            
            console.log('📊 Stats salvo:', Object.keys(this.counts).map(k => `${k}:${this.counts[k].reads}`).join(', '));
            this.counts = {};
            this.lastFlush = Date.now();
        } catch (e) {
            console.warn('Stats erro:', e);
        } finally {
            this.isEnabled = true;
        }
    },
    
    getStats() {
        return { ...this.counts };
    }
};

// Extrai nome da coleção de uma referência (melhorado)
function getCollectionName(ref) {
    if (!ref) return null;
    try {
        // DocumentReference ou CollectionReference
        if (ref._path?.segments) return ref._path.segments[0];
        if (ref.path) return ref.path.split('/')[0];
        // Query
        if (ref._query?._path?.segments) return ref._query._path.segments[0];
        // Firestore v9+ estrutura interna
        if (ref.firestore && ref.type === 'document') {
            return ref._key?.path?.segments?.[0] || ref.path?.split('/')[0];
        }
        if (ref.firestore && ref.type === 'query') {
            return ref._query?.path?.segments?.[0];
        }
    } catch (e) {}
    return null;
}

// Wrappers com tracking
async function getDoc(docRef) {
    const result = await _getDoc(docRef);
    const colName = getCollectionName(docRef);
    if (colName) {
        readTracker.track(colName, 'getDoc', 1);
        // Também notifica o tracker global se existir
        if (typeof window !== 'undefined' && window._fbTrack) {
            window._fbTrack(colName, 'getDoc', 1);
        }
    }
    return result;
}

async function getDocs(queryRef) {
    const result = await _getDocs(queryRef);
    const colName = getCollectionName(queryRef);
    if (colName) {
        readTracker.track(colName, 'getDocs', result.size || 1);
        if (typeof window !== 'undefined' && window._fbTrack) {
            window._fbTrack(colName, 'getDocs', result.size || 1);
        }
    }
    return result;
}

function onSnapshot(ref, ...args) {
    const colName = getCollectionName(ref);
    return _onSnapshot(ref, (snapshot) => {
        const count = snapshot.docs ? snapshot.docs.length : 1;
        if (colName) {
            readTracker.track(colName, 'onSnapshot', count);
            if (typeof window !== 'undefined' && window._fbTrack) {
                window._fbTrack(colName, 'onSnapshot', count);
            }
        }
        if (typeof args[0] === 'function') args[0](snapshot);
        else if (args[0]?.next) args[0].next(snapshot);
    }, args[1]);
}

// ============ FUNÇÕES GLOBAIS PARA CONSOLE ============

// Ver relatório de leituras
window.verRelatorioLeituras = async (dias = 7) => {
    console.log('\n📊 ========== RELATÓRIO DE LEITURAS FIREBASE ==========');
    const collections = {};
    let total = 0;
    
    // Desabilita tracking durante a consulta
    readTracker.isEnabled = false;
    
    for (let i = 0; i < dias; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        try {
            const snap = await _getDoc(doc(db, '_firebaseReadStats', `reads_${dateStr}`));
            if (snap.exists()) {
                const data = snap.data();
                total += data.totalReads || 0;
                for (const [col, stats] of Object.entries(data.collections || {})) {
                    if (!collections[col]) collections[col] = { reads: 0, getDoc: 0, getDocs: 0, onSnapshot: 0 };
                    collections[col].reads += stats.reads || 0;
                    collections[col].getDoc += stats.getDoc || 0;
                    collections[col].getDocs += stats.getDocs || 0;
                    collections[col].onSnapshot += stats.onSnapshot || 0;
                }
            }
        } catch (e) {}
    }
    
    readTracker.isEnabled = true;
    
    const sorted = Object.entries(collections).sort((a, b) => b[1].reads - a[1].reads);
    console.log(`📅 Período: ${dias} dias | Total: ${total.toLocaleString()} leituras\n`);
    
    if (sorted.length === 0) {
        console.log('⚠️ Nenhum dado encontrado ainda. Use o sistema por alguns minutos e tente novamente.');
        console.log('💡 Os dados são salvos a cada 2 minutos ou a cada 30 leituras.');
    } else {
        console.log('🏆 TOP COLEÇÕES:');
        sorted.forEach(([col, stats], i) => {
            const pct = total > 0 ? ((stats.reads / total) * 100).toFixed(1) : 0;
            const bar = '█'.repeat(Math.min(20, Math.round(pct / 5)));
            console.log(`${(i + 1).toString().padStart(2)}. ${col.padEnd(25)} ${stats.reads.toLocaleString().padStart(6)} (${pct}%) ${bar}`);
            console.log(`    └─ getDoc: ${stats.getDoc} | getDocs: ${stats.getDocs} | onSnapshot: ${stats.onSnapshot}`);
        });
    }
    console.log('========================================================\n');
    return { total, collections: sorted };
};

// Ver stats em tempo real (não salvas ainda)
window.verStatsAtuais = () => {
    const stats = readTracker.getStats();
    console.log('📊 Stats atuais (não salvos):', stats);
    return stats;
};

// Forçar salvamento agora
window.salvarStatsAgora = () => {
    readTracker.flush();
    console.log('✅ Stats salvos!');
};

// Salva ao fechar página
window.addEventListener('beforeunload', () => readTracker.flush());

// Salva periodicamente (2 min)
setInterval(() => {
    if (Object.keys(readTracker.counts).length > 0) {
        readTracker.flush();
    }
}, 120000);

// Expõe tracker globalmente para interceptação
window._firebaseReadTracker = readTracker;

console.log('📊 Firebase Stats ativo!');
console.log('   → verRelatorioLeituras()   - Ver relatório completo');
console.log('   → verStatsAtuais()         - Ver stats em tempo real');
console.log('   → salvarStatsAgora()       - Forçar salvamento');

export { 
    db, auth, storage, 
    onAuthStateChanged, signOut, 
    doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
    serverTimestamp, collection, query, onSnapshot,
    increment, where, orderBy, limit, addDoc
};
