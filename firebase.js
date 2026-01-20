// ===== CONFIGURAÇÃO DO FIREBASE =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    query, 
    where, 
    doc, 
    getDoc, 
    updateDoc,
    addDoc,
    deleteDoc,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
    authDomain: "agro-divel.firebaseapp.com",
    projectId: "agro-divel",
    storageBucket: "agro-divel.firebasestorage.app",
    messagingSenderId: "583977436505",
    appId: "1:583977436505:web:3754ec029aebb3d9d67848"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== UTILITÁRIOS ORIGINAIS DO PROJETO =====

// 🔧 Função para limpar dados vazios
function limparDados(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) =>
            v !== undefined &&
            v !== null &&
            (typeof v === "string" ? v.trim() !== "" : true) &&
            (!Array.isArray(v) || v.length > 0)
        )
    );
}

// Popup bonito
function mostrarPopup(mensagem, sucesso = true) {
    const fundo = document.createElement("div");
    fundo.style.position = "fixed";
    fundo.style.top = "0";
    fundo.style.left = "0";
    fundo.style.width = "100vw";
    fundo.style.height = "100vh";
    fundo.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
    fundo.style.display = "flex";
    fundo.style.alignItems = "center";
    fundo.style.justifyContent = "center";
    fundo.style.zIndex = "9999";

    const popup = document.createElement("div");
    popup.textContent = mensagem;
    popup.style.padding = "20px 30px";
    popup.style.borderRadius = "12px";
    popup.style.backgroundColor = sucesso ? "#00bbf9" : "#ff4d4d";
    popup.style.color = "white";
    popup.style.fontSize = "18px";
    popup.style.fontWeight = "bold";
    popup.style.boxShadow = "0 8px 20px rgba(0,0,0,0.4)";
    popup.style.textAlign = "center";
    popup.style.maxWidth = "90%";

    fundo.appendChild(popup);
    document.body.appendChild(fundo);

    setTimeout(() => {
        fundo.remove();
    }, 3000);
}

// Envio pro Firebase
async function enviarParaFirebase(dados, colecao) {
    try {
        await addDoc(collection(db, colecao), dados);
        console.log("✅ Dados enviados ao Firebase:", dados);
        return true;
    } catch (e) {
        console.error("❌ Erro ao enviar:", e);
        return false;
    }
}

// Enviar formulário
window.enviarChecklist = async function (event, colecao) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const dados = {
        dataVisita: formData.get("dataVisita") || "",
        nomeCliente: formData.get("nomeCliente") || "",
        nomeFazenda: formData.get("nomeFazenda") || "",
        telefone: formData.get("telefone") || "",
        filial: formData.get("filial") || "",
        municipio: formData.get("municipio") || "",
        modelo: formData.get("modeloMaquina") || "",
        horimetro: formData.get("horimetro") || "",
        modeloTrator: formData.get("modeloTrator") || "",
        consultor: formData.get("nomeConsultor") || "",
        departamentoInsatisfacao: formData.get("departamentoInsatisfacao") || "",
        observacoes: formData.get("observacoes") || "",
        checklist: formData.getAll("checklist"),
        criadoEm: new Date().toISOString()
    };

    const dadosLimpos = limparDados(dados);

    if (navigator.onLine) {
        const sucesso = await enviarParaFirebase(dadosLimpos, colecao);
        if (sucesso) {
            mostrarPopup("✅ Dados enviados com sucesso!");
            form.reset();
        } else {
            mostrarPopup("❌ Erro ao enviar os dados.", false);
        }
    } else {
        // Salvar localmente
        const pendentes = JSON.parse(localStorage.getItem("checklistsPendentes")) || [];
        pendentes.push({ colecao, dados: dadosLimpos });
        localStorage.setItem("checklistsPendentes", JSON.stringify(pendentes));
        mostrarPopup("📴 Sem internet! dados salvos localmente. Reabra o aplicativo quando tiver internet");
        form.reset();
    }
};

// Ao reconectar, enviar pendentes
window.addEventListener("online", async () => {
    const pendentes = JSON.parse(localStorage.getItem("checklistsPendentes")) || [];

    if (pendentes.length > 0) {
        mostrarPopup("🌐 Conectado! Enviando dados salvos...");

        for (const item of pendentes) {
            await enviarParaFirebase(item.dados, item.colecao);
        }

        localStorage.removeItem("checklistsPendentes");
        mostrarPopup("✅ Todos os dados pendentes foram enviados!");
    }
});

// ===== NOVOS UTILITÁRIOS DO FIREBASE =====

// Função para obter dados de uma coleção com filtros
async function getCollectionData(collectionName, filters = []) {
    try {
        let q = collection(db, collectionName);
        
        // Aplicar filtros se fornecidos
        if (filters.length > 0) {
            filters.forEach(filter => {
                q = query(q, where(filter.field, filter.operator, filter.value));
            });
        }
        
        const querySnapshot = await getDocs(q);
        const data = [];
        
        querySnapshot.forEach((doc) => {
            data.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return data;
    } catch (error) {
        console.error(`Erro ao obter dados da coleção ${collectionName}:`, error);
        throw error;
    }
}

// Função para obter dados de um documento específico
async function getDocumentData(collectionName, documentId) {
    try {
        const docRef = doc(db, collectionName, documentId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        } else {
            throw new Error('Documento não encontrado');
        }
    } catch (error) {
        console.error(`Erro ao obter documento ${documentId}:`, error);
        throw error;
    }
}

// Função para atualizar um documento
async function updateDocument(collectionName, documentId, data) {
    try {
        const docRef = doc(db, collectionName, documentId);
        await updateDoc(docRef, data);
        return true;
    } catch (error) {
        console.error(`Erro ao atualizar documento ${documentId}:`, error);
        throw error;
    }
}

// Função para adicionar um novo documento
async function addDocument(collectionName, data) {
    try {
        const docRef = await addDoc(collection(db, collectionName), data);
        return docRef.id;
    } catch (error) {
        console.error(`Erro ao adicionar documento na coleção ${collectionName}:`, error);
        throw error;
    }
}

// Função para deletar um documento
async function deleteDocument(collectionName, documentId) {
    try {
        await deleteDoc(doc(db, collectionName, documentId));
        return true;
    } catch (error) {
        console.error(`Erro ao deletar documento ${documentId}:`, error);
        throw error;
    }
}

// ===== FUNÇÕES ESPECÍFICAS DO PROJETO =====

// Função para carregar dados do gestor
async function loadGestorData(email) {
    try {
        const gestores = await getCollectionData('gestores', [
            { field: 'email', operator: '==', value: email }
        ]);
        
        if (gestores.length > 0) {
            const gestorData = gestores[0];
            
            // Salvar dados no localStorage
            localStorage.setItem('gestorData', JSON.stringify(gestorData));
            localStorage.setItem('gestorEmail', email);
            localStorage.setItem('gestorFilial', JSON.stringify(gestorData.filial || []));
            localStorage.setItem('gestorDashboard', gestorData.dashboard || 'index.html');
            
            return gestorData;
        } else {
            throw new Error('Gestor não encontrado');
        }
    } catch (error) {
        console.error('Erro ao carregar dados do gestor:', error);
        throw error;
    }
}

// Função para carregar dados filtrados por filial
async function loadDataByFilial(collectionName) {
    try {
        const gestorFilial = JSON.parse(localStorage.getItem('gestorFilial') || '[]');
        
        if (gestorFilial.length === 0) {
            // Se não há filiais específicas, carregar todos os dados
            return await getCollectionData(collectionName);
        }
        
        // Carregar dados apenas das filiais do gestor
        const allData = [];
        
        for (const filial of gestorFilial) {
            const data = await getCollectionData(collectionName, [
                { field: 'filial', operator: '==', value: filial }
            ]);
            allData.push(...data);
        }
        
        return allData;
    } catch (error) {
        console.error(`Erro ao carregar dados por filial da coleção ${collectionName}:`, error);
        throw error;
    }
}

// Função para fazer login
async function loginGestor(email, password) {
    try {
        // Autenticar com Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        // Carregar dados do gestor
        const gestorData = await loadGestorData(email);
        
        // Marcar como logado
        localStorage.setItem('gestorLogado', 'true');
        
        return {
            user: userCredential.user,
            gestorData: gestorData
        };
    } catch (error) {
        console.error('Erro no login:', error);
        throw error;
    }
}

// Função para fazer logout
async function logoutGestor() {
    try {
        await signOut(auth);
        
        // Limpar localStorage
        localStorage.removeItem('gestorLogado');
        localStorage.removeItem('gestorEmail');
        localStorage.removeItem('gestorFilial');
        localStorage.removeItem('gestorDashboard');
        localStorage.removeItem('gestorData');
        
        return true;
    } catch (error) {
        console.error('Erro no logout:', error);
        throw error;
    }
}

// Função para verificar estado de autenticação
function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// ===== UTILITÁRIOS DE DADOS =====

// Função para formatar data
function formatDate(date) {
    if (!date) return '';
    
    if (typeof date === 'string') {
        return date;
    }
    
    if (date.toDate) {
        // Timestamp do Firestore
        return date.toDate().toLocaleDateString('pt-BR');
    }
    
    if (date instanceof Date) {
        return date.toLocaleDateString('pt-BR');
    }
    
    return '';
}

// Função para formatar moeda
function formatCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,00';
    
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Função para calcular estatísticas
function calculateStats(data, statusField = 'statusChecklist', valueField = 'valorNegociado') {
    const stats = {
        total: data.length,
        concluidos: 0,
        emAndamento: 0,
        cancelados: 0,
        valorTotal: 0
    };
    
    data.forEach(item => {
        const status = item[statusField] || '';
        const valor = parseFloat(item[valueField]) || 0;
        
        switch (status) {
            case 'Concluído':
                stats.concluidos++;
                break;
            case 'Em andamento':
                stats.emAndamento++;
                break;
            case 'Cancelado':
                stats.cancelados++;
                break;
        }
        
        if (status === 'Concluído') {
            stats.valorTotal += valor;
        }
    });
    
    return stats;
}

// ===== EXPORTAR PARA WINDOW =====
window.firebase = {
    db,
    auth,
    getCollectionData,
    getDocumentData,
    updateDocument,
    addDocument,
    deleteDocument,
    loadGestorData,
    loadDataByFilial,
    loginGestor,
    logoutGestor,
    onAuthChange,
    formatDate,
    formatCurrency,
    calculateStats,
    // Funções originais
    limparDados,
    mostrarPopup,
    enviarParaFirebase
};

// ===== EXPORTAR FUNÇÕES INDIVIDUAIS =====
window.getCollectionData = getCollectionData;
window.getDocumentData = getDocumentData;
window.updateDocument = updateDocument;
window.addDocument = addDocument;
window.deleteDocument = deleteDocument;
window.loadGestorData = loadGestorData;
window.loadDataByFilial = loadDataByFilial;
window.loginGestor = loginGestor;
window.logoutGestor = logoutGestor;
window.formatDate = formatDate;
window.formatCurrency = formatCurrency;
window.calculateStats = calculateStats;

// Manter compatibilidade com funções originais
window.limparDados = limparDados;
window.mostrarPopup = mostrarPopup;
window.enviarParaFirebase = enviarParaFirebase;

export { app, db };
