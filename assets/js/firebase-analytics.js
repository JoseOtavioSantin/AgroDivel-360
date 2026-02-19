// /assets/js/firebase-analytics.js
// Sistema de rastreamento de leituras do Firebase

import { db } from './firebase-config.js';
import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Armazena contadores locais antes de enviar ao Firebase
const localReadCounts = {};
let lastFlushTime = Date.now();
const FLUSH_INTERVAL = 60000; // Envia para o Firebase a cada 1 minuto
const MIN_READS_TO_FLUSH = 5; // Mínimo de leituras para enviar

/**
 * Registra uma leitura em uma coleção específica
 * @param {string} collectionName - Nome da coleção que foi lida
 * @param {string} operation - Tipo de operação: 'getDoc', 'getDocs', 'onSnapshot', 'query'
 * @param {number} docCount - Número de documentos lidos (para getDocs/query)
 */
export function trackRead(collectionName, operation = 'getDoc', docCount = 1) {
    if (!collectionName) return;
    
    const key = collectionName;
    
    if (!localReadCounts[key]) {
        localReadCounts[key] = {
            collection: collectionName,
            reads: 0,
            operations: {
                getDoc: 0,
                getDocs: 0,
                onSnapshot: 0,
                query: 0
            },
            lastRead: new Date().toISOString()
        };
    }
    
    localReadCounts[key].reads += docCount;
    localReadCounts[key].operations[operation] = (localReadCounts[key].operations[operation] || 0) + 1;
    localReadCounts[key].lastRead = new Date().toISOString();
    
    // Log no console para debug
    console.log(`📊 Firebase Read: ${collectionName} (${operation}) - ${docCount} doc(s)`);
    
    // Verifica se deve enviar para o Firebase
    checkAndFlush();
}

/**
 * Verifica se deve enviar os dados para o Firebase
 */
function checkAndFlush() {
    const totalReads = Object.values(localReadCounts).reduce((sum, item) => sum + item.reads, 0);
    const timeSinceLastFlush = Date.now() - lastFlushTime;
    
    if (totalReads >= MIN_READS_TO_FLUSH && timeSinceLastFlush >= FLUSH_INTERVAL) {
        flushToFirebase();
    }
}

/**
 * Envia os dados acumulados para o Firebase
 */
async function flushToFirebase() {
    if (Object.keys(localReadCounts).length === 0) return;
    
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const analyticsRef = doc(db, '_analytics', `reads_${today}`);
        
        // Busca dados existentes
        const existingDoc = await getDoc(analyticsRef);
        const existingData = existingDoc.exists() ? existingDoc.data() : { collections: {}, totalReads: 0 };
        
        // Mescla com os novos dados
        for (const [key, data] of Object.entries(localReadCounts)) {
            if (!existingData.collections[key]) {
                existingData.collections[key] = {
                    reads: 0,
                    operations: { getDoc: 0, getDocs: 0, onSnapshot: 0, query: 0 }
                };
            }
            existingData.collections[key].reads += data.reads;
            existingData.collections[key].lastRead = data.lastRead;
            
            for (const [op, count] of Object.entries(data.operations)) {
                existingData.collections[key].operations[op] = 
                    (existingData.collections[key].operations[op] || 0) + count;
            }
            
            existingData.totalReads += data.reads;
        }
        
        existingData.updatedAt = serverTimestamp();
        existingData.date = today;
        
        await setDoc(analyticsRef, existingData, { merge: true });
        
        console.log('📊 Analytics enviado para Firebase:', existingData);
        
        // Limpa contadores locais
        Object.keys(localReadCounts).forEach(key => delete localReadCounts[key]);
        lastFlushTime = Date.now();
        
    } catch (error) {
        console.error('Erro ao enviar analytics:', error);
    }
}

/**
 * Força o envio dos dados (útil antes de fechar a página)
 */
export function forceFlush() {
    if (Object.keys(localReadCounts).length > 0) {
        flushToFirebase();
    }
}

/**
 * Retorna estatísticas locais atuais
 */
export function getLocalStats() {
    return { ...localReadCounts };
}

/**
 * Busca relatório de leituras de um período
 * @param {number} days - Número de dias para buscar (padrão: 7)
 */
export async function getReadReport(days = 7) {
    const report = {
        period: `${days} dias`,
        collections: {},
        totalReads: 0,
        topCollections: []
    };
    
    try {
        const today = new Date();
        
        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const analyticsRef = doc(db, '_analytics', `reads_${dateStr}`);
            const docSnap = await getDoc(analyticsRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                report.totalReads += data.totalReads || 0;
                
                for (const [collection, stats] of Object.entries(data.collections || {})) {
                    if (!report.collections[collection]) {
                        report.collections[collection] = { reads: 0, operations: {} };
                    }
                    report.collections[collection].reads += stats.reads || 0;
                    
                    for (const [op, count] of Object.entries(stats.operations || {})) {
                        report.collections[collection].operations[op] = 
                            (report.collections[collection].operations[op] || 0) + count;
                    }
                }
            }
        }
        
        // Ordena por número de leituras
        report.topCollections = Object.entries(report.collections)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.reads - a.reads);
        
        return report;
        
    } catch (error) {
        console.error('Erro ao buscar relatório:', error);
        return report;
    }
}

/**
 * Exibe relatório no console de forma formatada
 */
export async function printReadReport(days = 7) {
    const report = await getReadReport(days);
    
    console.log('\n📊 ========== RELATÓRIO DE LEITURAS FIREBASE ==========');
    console.log(`📅 Período: últimos ${days} dias`);
    console.log(`📖 Total de leituras: ${report.totalReads.toLocaleString()}`);
    console.log('\n🏆 Top Coleções (mais leituras):');
    
    report.topCollections.slice(0, 10).forEach((col, index) => {
        const bar = '█'.repeat(Math.min(20, Math.round(col.reads / (report.totalReads || 1) * 100)));
        console.log(`   ${index + 1}. ${col.name}: ${col.reads.toLocaleString()} leituras ${bar}`);
        console.log(`      ↳ getDoc: ${col.operations.getDoc || 0} | getDocs: ${col.operations.getDocs || 0} | onSnapshot: ${col.operations.onSnapshot || 0}`);
    });
    
    console.log('=======================================================\n');
    
    return report;
}

// Envia dados quando a página está sendo fechada
window.addEventListener('beforeunload', () => {
    forceFlush();
});

// Envia dados periodicamente (a cada 2 minutos)
setInterval(() => {
    if (Object.keys(localReadCounts).length > 0) {
        flushToFirebase();
    }
}, 120000);

// Exporta para uso global no console
window.firebaseAnalytics = {
    trackRead,
    getLocalStats,
    getReadReport,
    printReadReport,
    forceFlush
};

console.log('📊 Firebase Analytics carregado. Use window.firebaseAnalytics.printReadReport() para ver o relatório.');
