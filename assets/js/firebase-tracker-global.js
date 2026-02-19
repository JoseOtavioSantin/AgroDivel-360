// /assets/js/firebase-tracker-global.js
// Sistema de tracking de leituras Firebase - usa SDK autenticado

(function() {
    'use strict';
    
    // Contador local
    const tracker = {
        counts: {},
        lastFlush: Date.now(),
        sessionTotal: 0,
        db: null,
        
        track(collection, operation = 'read', count = 1) {
            if (!collection || collection.startsWith('_')) return;
            
            if (!this.counts[collection]) {
                this.counts[collection] = { reads: 0, getDoc: 0, getDocs: 0, onSnapshot: 0 };
            }
            this.counts[collection].reads += count;
            this.counts[collection][operation] = (this.counts[collection][operation] || 0) + 1;
            this.sessionTotal += count;
            
            // Auto-flush a cada 20 leituras ou 1 minuto
            const pending = Object.values(this.counts).reduce((s, c) => s + c.reads, 0);
            if (pending >= 20 || Date.now() - this.lastFlush > 60000) {
                this.flush();
            }
        },
        
        async flush() {
            if (Object.keys(this.counts).length === 0) return;
            
            // Aguarda o Firebase estar disponível
            if (!this.db) {
                await this.waitForFirebase();
            }
            if (!this.db) {
                console.warn('📊 Firebase não disponível ainda');
                return;
            }
            
            const toSave = { ...this.counts };
            this.counts = {};
            this.lastFlush = Date.now();
            
            try {
                const today = new Date().toISOString().split('T')[0];
                const docId = `reads_${today}`;
                
                // Importa funções necessárias
                const { doc, getDoc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
                
                const docRef = doc(this.db, '_firebaseReadStats', docId);
                const docSnap = await getDoc(docRef);
                
                let existing = { collections: {}, totalReads: 0, date: today };
                if (docSnap.exists()) {
                    existing = docSnap.data();
                }
                
                // Mescla os dados
                for (const [col, stats] of Object.entries(toSave)) {
                    if (!existing.collections[col]) {
                        existing.collections[col] = { reads: 0, getDoc: 0, getDocs: 0, onSnapshot: 0 };
                    }
                    existing.collections[col].reads += stats.reads;
                    existing.collections[col].getDoc += stats.getDoc || 0;
                    existing.collections[col].getDocs += stats.getDocs || 0;
                    existing.collections[col].onSnapshot += stats.onSnapshot || 0;
                    existing.totalReads += stats.reads;
                }
                existing.updatedAt = serverTimestamp();
                
                await setDoc(docRef, existing, { merge: true });
                
                console.log('📊 Salvo:', Object.entries(toSave).map(([k,v]) => `${k}:${v.reads}`).join(' | '));
            } catch (e) {
                console.warn('📊 Erro ao salvar:', e.message);
                // Restaura em caso de erro
                for (const [col, stats] of Object.entries(toSave)) {
                    if (!this.counts[col]) this.counts[col] = { reads: 0, getDoc: 0, getDocs: 0, onSnapshot: 0 };
                    Object.keys(stats).forEach(k => this.counts[col][k] = (this.counts[col][k] || 0) + (stats[k] || 0));
                }
            }
        },
        
        async waitForFirebase() {
            // Tenta obter db do firebase-config ou inicializa
            for (let i = 0; i < 20; i++) {
                // Verifica se já existe uma instância global
                if (window._firebaseDb) {
                    this.db = window._firebaseDb;
                    return;
                }
                
                // Tenta importar do firebase-config
                try {
                    const config = await import('/assets/js/firebase-config.js');
                    if (config.db) {
                        this.db = config.db;
                        window._firebaseDb = this.db;
                        return;
                    }
                } catch (e) {}
                
                await new Promise(r => setTimeout(r, 500));
            }
        }
    };
    
    // Expõe globalmente
    window._fbTrack = (col, op, n) => tracker.track(col, op, n);
    window._fbFlush = () => tracker.flush();
    
    // Relatório
    window.verRelatorioLeituras = async (dias = 7) => {
        console.log('\n📊 ====== RELATÓRIO DE LEITURAS FIREBASE ======');
        
        // Aguarda Firebase
        if (!tracker.db) await tracker.waitForFirebase();
        if (!tracker.db) {
            console.log('❌ Firebase não disponível');
            return;
        }
        
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
        
        let total = 0;
        const cols = {};
        
        for (let i = 0; i < dias; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            
            try {
                const docRef = doc(tracker.db, '_firebaseReadStats', `reads_${dateStr}`);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    total += data.totalReads || 0;
                    for (const [col, stats] of Object.entries(data.collections || {})) {
                        if (!cols[col]) cols[col] = 0;
                        cols[col] += stats.reads || 0;
                    }
                }
            } catch (e) {}
        }
        
        const sorted = Object.entries(cols).sort((a, b) => b[1] - a[1]);
        
        console.log(`📅 Período: ${dias} dias | Total: ${total.toLocaleString()} leituras`);
        console.log(`🔄 Sessão atual: ${tracker.sessionTotal} leituras\n`);
        
        if (sorted.length === 0) {
            console.log('⚠️ Nenhum dado ainda. Navegue pelo sistema e tente novamente.');
        } else {
            sorted.slice(0, 15).forEach(([col, reads], i) => {
                const pct = total > 0 ? ((reads / total) * 100).toFixed(1) : 0;
                console.log(`${i+1}. ${col}: ${reads.toLocaleString()} (${pct}%)`);
            });
        }
        console.log('================================================\n');
        return { total, sessionTotal: tracker.sessionTotal, collections: sorted };
    };
    
    // Testa o tracker - registra uma leitura de teste
    window.testarTracker = async () => {
        console.log('🧪 Testando tracker...');
        tracker.track('_teste_manual', 'getDoc', 1);
        await tracker.flush();
        console.log('✅ Teste concluído! Rode verRelatorioLeituras() para ver.');
    };
    
    // Auto-save
    window.addEventListener('beforeunload', () => tracker.flush());
    setInterval(() => {
        if (Object.keys(tracker.counts).length > 0) {
            tracker.flush();
        }
    }, 60000);
    
    // Inicializa o Firebase assim que possível
    setTimeout(() => tracker.waitForFirebase(), 1000);
    
    console.log('📊 Firebase Tracker carregado!');
    console.log('   → testarTracker()         - Testar se está funcionando');
    console.log('   → verRelatorioLeituras()  - Ver relatório');
})();
