// /assets/js/auth-guard.js

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Suas credenciais do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
  authDomain: "agro-divel.firebaseapp.com",
  projectId: "agro-divel"
};

// Função de inicialização segura
function inicializarFirebase( ) {
    if (!getApps().length) {
        console.log("Firebase não inicializado. Inicializando agora...");
        return initializeApp(firebaseConfig);
    } else {
        return getApp();
    }
}

const app = inicializarFirebase();
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Tenta buscar um documento de usuário em uma lista de coleções.
 * @param {string} uid - O ID do usuário.
 * @returns {Promise<object|null>} Os dados do usuário ou null se não encontrado.
 */
async function findUserInCollections(uid) {
    const collectionsToSearch = ["gestores", "usuarios"]; // Adicione outras coleções se necessário

    for (const collectionName of collectionsToSearch) {
        const userDocRef = doc(db, collectionName, uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            console.log(`Usuário encontrado na coleção '${collectionName}'.`);
            return userDoc.data();
        }
    }
    console.log("Usuário não encontrado em nenhuma coleção de perfis.");
    return null;
}

/**
 * Função exportada que protege a página.
 * Retorna uma Promise que resolve com os dados do usuário se a autenticação for bem-sucedida.
 */
export function garantirAutenticacao() {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe(); // Evita múltiplas execuções

            if (user) {
                try {
                    // Procura o usuário em ambas as coleções
                    const userData = await findUserInCollections(user.uid);

                    if (userData) {
                        console.log(`Acesso concedido para: ${userData.nome} (Grupo: ${userData.grupo})`);
                        
                        // Salva os dados no localStorage para uso geral
                        localStorage.setItem("userName", userData.nome);
                        localStorage.setItem("userEmail", userData.email);
                        localStorage.setItem("userGroups", JSON.stringify(userData.grupo || [])); // Garante que seja um array
                        localStorage.setItem("gestorFilial", JSON.stringify(userData.filial || []));
                        
                        // Verifica acesso à página atual
                        verificarAcessoPagina(userData);
                        
                        // Resolve a Promise com os dados do usuário, permitindo que a página continue
                        resolve(userData); 
                    } else {
                        alert("Seu perfil não foi encontrado. Contate o administrador.");
                        auth.signOut();
                        window.location.href = '/Pages/Login.html';
                        reject("Perfil do usuário não encontrado no Firestore.");
                    }
                } catch (error) {
                    console.error("Erro ao verificar perfil do usuário:", error);
                    auth.signOut();
                    reject(error);
                }
            } else {
                // Se não houver usuário, redireciona para o login
                alert("Acesso restrito. Por favor, faça o login.");
                window.location.href = '/Pages/Login.html';
                reject("Nenhum usuário logado.");
            }
        });
    });
}

/**
 * Mapa de permissões por página e IDs de menu
 */
const pagePermissions = {
    '/Pages/Dashboard/DashboardGeral.html': ['admin', 'diretoria'],
    '/Pages/Dashboard/DashboardAnalisarParadas.html': ['admin', 'diretoria'],
    '/Pages/Dashboard/DashboardComercial.html': ['admin', 'diretoria', 'comercial'],
    '/Pages/Dashboard/DashboardSeguro.html': ['admin', 'diretoria', 'comercial'],
    '/Pages/Dashboard/DashboardConsorcio.html': ['admin', 'diretoria', 'comercial'],
    '/Pages/Dashboard/DashboardPecas.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Dashboard/DashboardServicos.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Dashboard/DashboardPLM.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Dashboard/DashboardPlanosManutencao.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Controles/Kits50Horas.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Controles/ContagemDiaria.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Controles/PedidosPecas.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Controles/PedidosPrim.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Controles/prim.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Controles/ControleFerramentas.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Controles/PlanosVigentes.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Controles/MaquinasParadas.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Controles/Telemetria.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Tempario/Tempario.html': ['admin', 'diretoria', 'servicos', 'pecas'],
    '/Pages/Lubrificantes/AnaliseLubrificantes.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Formularios/form-planejamento-anual.html': ['admin', 'diretoria'],
    '/Pages/Cadastros/CadastroGestores.html': ['admin'],
    '/Pages/Cadastros/CadastroTecnicos.html': ['admin'],
    '/Pages/Suporte/SolicitacaoSuporte.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/Suporte/MinhasSolicitacoes.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/Suporte/GerenciarSolicitacoes.html': ['admin']
};

/**
 * Mapa de páginas para IDs de menu (para permissões individuais)
 */
const pageToMenuId = {
    '/Pages/Dashboard/DashboardGeral.html': 'dash-geral',
    '/Pages/Dashboard/DashboardAnalisarParadas.html': 'dash-AnalisarParadas',
    '/Pages/Dashboard/DashboardComercial.html': 'dash-comercial',
    '/Pages/Dashboard/DashboardSeguro.html': 'dash-Seguro',
    '/Pages/Dashboard/DashboardConsorcio.html': 'dash-Consorcio',
    '/Pages/Dashboard/DashboardPecas.html': 'dash-pecas',
    '/Pages/Dashboard/DashboardServicos.html': 'dash-servicos',
    '/Pages/Dashboard/DashboardPLM.html': 'dash-PLM',
    '/Pages/Dashboard/DashboardPlanosManutencao.html': 'dash-planos-manutencao',
    '/Pages/Controles/Kits50Horas.html': 'ctrl-Kit50',
    '/Pages/Controles/ContagemDiaria.html': 'ctrl-ContagemDiaria',
    '/Pages/Controles/PedidosPecas.html': 'ctrl-PedidosPecas',
    '/Pages/Controles/PedidosPrim.html': 'ctrl-PedidosPrim',
    '/Pages/Controles/prim.html': 'ctrl-Prim',
    '/Pages/Controles/ControleFerramentas.html': 'ctrl-ControleFerramentas',
    '/Pages/Controles/PlanosVigentes.html': 'ctrl-PlanosVigentes',
    '/Pages/Controles/MaquinasParadas.html': 'ctrl-MaquinaParada',
    '/Pages/Controles/Telemetria.html': 'ctrl-Telemetria',
    '/Pages/Tempario/Tempario.html': 'ctrl-Tempario',
    '/Pages/Lubrificantes/AnaliseLubrificantes.html': 'lubri-AnaliseLubrificantes',
    '/Pages/Formularios/form-planejamento-anual.html': 'plan-Anual',
    '/Pages/Cadastros/CadastroGestores.html': 'admin-CadastroGestores',
    '/Pages/Cadastros/CadastroTecnicos.html': 'admin-CadastroTecnicos',
    '/Pages/Suporte/SolicitacaoSuporte.html': 'suporte-SolicitacaoSuporte',
    '/Pages/Suporte/MinhasSolicitacoes.html': 'suporte-MinhasSolicitacoes',
    '/Pages/Suporte/GerenciarSolicitacoes.html': 'suporte-GerenciarSolicitacoes'
};

/**
 * Função que verifica se o usuário tem acesso à página atual
 * @param {object} userData - Dados do usuário (grupo, permissoes)
 */
function verificarAcessoPagina(userData) {
    const currentPage = window.location.pathname;
    const permissoesIndividuais = userData.permissoes || [];
    
    console.log("Verificando acesso para página:", currentPage);
    console.log("Grupo do usuário:", userData.grupo);
    console.log("Permissões individuais:", permissoesIndividuais);

    // Se for a página de menu ou login, não redireciona
    if (currentPage.includes('Menu.html') || currentPage.endsWith('/') || currentPage.includes('Login.html')) {
        return true;
    }

    // Verifica se a página está no mapa de permissões
    const allowedGroups = pagePermissions[currentPage];
    
    if (!allowedGroups) {
        // Se a página não está mapeada, libera acesso (é uma página pública)
        console.log("Página não encontrada no mapa de permissões, acesso liberado:", currentPage);
        return true;
    }

    // Verifica acesso pelo grupo
    if (userData.grupo && allowedGroups.includes(userData.grupo)) {
        console.log("Acesso permitido via grupo:", userData.grupo);
        return true;
    }

    // Verifica acesso por permissões individuais
    const menuId = pageToMenuId[currentPage];
    if (menuId && permissoesIndividuais.includes(menuId)) {
        console.log("Acesso permitido via permissão individual:", menuId);
        return true;
    }

    // Se não tem acesso, redireciona
    console.log("Acesso NEGADO para página:", currentPage);
    console.log("Grupos permitidos:", allowedGroups);
    console.log("Grupo do usuário:", userData.grupo);
    alert("Você não tem permissão para acessar esta página.");
    window.location.href = '/Pages/Menu.html';
    return false;
}
