// Importa tudo que precisamos do nosso arquivo de configuração
import { db, auth, onAuthStateChanged, signOut, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from './firebase-config.js';

// ============ CARREGA O TRACKER GLOBAL ============
// Isso garante que o sistema de tracking está disponível em todas as páginas
const trackerScript = document.createElement('script');
trackerScript.src = '/assets/js/firebase-tracker-global.js';
document.head.appendChild(trackerScript);

// --- MAPA DE PERMISSÕES ---
const menuPermissions = {
    // --- CHECKLIST ---
    'checklist-inicio': ['admin', 'diretoria', 'pecas', 'servicos'],
    
    // --- ADMIN ---
    'admin-CadastroGestores': ['admin'],
    'admin-CadastroTecnicos': ['admin'],
    'admin-UsuariosOnline': ['admin'],

    // --- DIRETORIA ---
    'dash-geral': ['admin', 'diretoria'],

    // --- COMERCIAL ---
    'dash-comercial': ['admin', 'diretoria', 'comercial'],
    'dash-Seguro': ['admin', 'diretoria', 'comercial'],
    'dash-Consorcio': ['admin', 'diretoria', 'comercial'],

    // --- PECAS ---
    'dash-pecas': ['admin', 'diretoria', 'pecas'],
    'ctrl-PedidosPecas': ['admin', 'diretoria', 'pecas'],

    // --- SERVICOS ---
    'dash-servicos': ['admin', 'diretoria', 'servicos'],
    'dash-PLM': ['admin', 'diretoria', 'servicos'],
    'dash-planos-manutencao': ['admin', 'diretoria', 'servicos'],
    'ctrl-PlanosVigentes': ['admin', 'diretoria', 'servicos'],
    
    // --- MENUS (Grupos de submenu) ---
    'menu-controles': ['admin', 'diretoria', 'pecas', 'comercial', 'servicos'],
    'menu-planos': ['admin', 'diretoria', 'servicos'],
    'menu-planejamento': ['admin', 'diretoria'],
    'menu-suporte': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    'menu-cadastros': ['admin'],
    'menu-dashboards': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    
    // --- PLANEJAMENTO ---
    'plan-Anual': ['admin', 'diretoria'],
    'plan-Preencher': ['admin', 'diretoria'],
    'plan-Gerenciar': ['admin', 'diretoria'],
    'plan-Permissoes': ['admin', 'diretoria'],

    // --- PLANO DE AÇÃO ---
    'menu-plano-acao': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    'acao-Gerenciar': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    'acao-Novo': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    'acao-KPIs': ['admin', 'diretoria'],

    // --- SUPORTE ---
    'suporte-SolicitacaoSuporte': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    'suporte-MinhasSolicitacoes': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    'suporte-GerenciarSolicitacoes': ['admin'],
};

// --- MAPA DE PÁGINAS PARA VERIFICAÇÃO ---
const pagePermissions = {
    '/Pages/Dashboard/DashboardGeral.html': ['admin', 'diretoria'],
    '/Pages/Dashboard/DashboardComercial.html': ['admin', 'diretoria', 'comercial'],
    '/Pages/Dashboard/DashboardSeguro.html': ['admin', 'diretoria', 'comercial'],
    '/Pages/Dashboard/DashboardConsorcio.html': ['admin', 'diretoria', 'comercial'],
    '/Pages/Dashboard/DashboardPecas.html': ['admin', 'diretoria', 'pecas'],
    '/Pages/Dashboard/DashboardServicos.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Dashboard/DashboardPLM.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Dashboard/DashboardPlanosManutencao.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/Controles/PlanosVigentes.html': ['admin', 'diretoria', 'servicos'],
    '/Pages/PlanejamentoAnual/PreencherPlanejamento.html': ['admin', 'diretoria'],
    '/Pages/PlanejamentoAnual/GerenciaPlanejamento.html': ['admin', 'diretoria'],
    '/Pages/PlanejamentoAnual/GerenciarPermissoes.html': ['admin', 'diretoria'],
    '/Pages/PlanodeAcao/form_KPIs.html': ['admin', 'diretoria'],
    '/Pages/PlanodeAcao/GerenciarPlanosAcao.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/PlanodeAcao/form_PlanoAcao.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/PlanodeAcao/DetalhesPlanoAcao.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/Cadastros/CadastroGestores.html': ['admin'],
    '/Pages/Cadastros/CadastroTecnicos.html': ['admin'],
    '/Pages/Cadastros/UsuariosOnline.html': ['admin'],
    '/Pages/Suporte/SolicitacaoSuporte.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/Suporte/MinhasSolicitacoes.html': ['admin', 'diretoria', 'comercial', 'pecas', 'servicos'],
    '/Pages/Suporte/GerenciarSolicitacoes.html': ['admin']
};

// Função para verificar se o usuário tem acesso à página atual
function checkPageAccess(userGroup, permissoesIndividuais) {
    const currentPage = window.location.pathname;
    
    console.log("Verificando acesso para página:", currentPage);
    console.log("Grupo do usuário:", userGroup);
    console.log("Permissões individuais:", permissoesIndividuais);

    // Se for a página de menu, não redireciona
    if (currentPage.includes('Menu.html') || currentPage.endsWith('/') || currentPage.includes('Login.html')) {
        return true;
    }

    // Verifica se a página está no mapa de permissões
    const allowedGroups = pagePermissions[currentPage];
    
    if (!allowedGroups) {
        console.log("Página não encontrada no mapa de permissões, acesso liberado:", currentPage);
        return true; // Se a página não está mapeada, libera acesso
    }

    // Verifica acesso pelo grupo
    if (userGroup !== 'nenhum' && allowedGroups.includes(userGroup)) {
        console.log("Acesso permitido via grupo");
        return true;
    }

    // Verifica acesso por permissões individuais
    // Para isso, precisamos mapear a página de volta para o ID do menu
    const pageToMenuId = Object.entries(pagePermissions).find(([page, groups]) => page === currentPage);
    if (pageToMenuId) {
        // Encontra o ID do menu correspondente a esta página
        const menuId = Object.keys(menuPermissions).find(key => {
            // Mapeia páginas para IDs de menu (você pode precisar ajustar isso)
            const pageMap = {
                '/Pages/Dashboard/DashboardGeral.html': 'dash-geral',
                '/Pages/Dashboard/DashboardComercial.html': 'dash-comercial',
                '/Pages/Dashboard/DashboardSeguro.html': 'dash-Seguro',
                '/Pages/Dashboard/DashboardConsorcio.html': 'dash-Consorcio',
                '/Pages/Dashboard/DashboardPecas.html': 'dash-pecas',
                '/Pages/Dashboard/DashboardServicos.html': 'dash-servicos',
                '/Pages/Dashboard/DashboardPLM.html': 'dash-PLM',
                '/Pages/Dashboard/DashboardPlanosManutencao.html': 'dash-planos-manutencao',
                '/Pages/Controles/PlanosVigentes.html': 'ctrl-PlanosVigentes',
                '/Pages/PlanejamentoAnual/PreencherPlanejamento.html': 'plan-Preencher',
                '/Pages/PlanejamentoAnual/GerenciaPlanejamento.html': 'plan-Gerenciar',
                '/Pages/PlanejamentoAnual/GerenciarPermissoes.html': 'plan-Permissoes',
                '/Pages/PlanodeAcao/form_KPIs.html': 'acao-KPIs',
                '/Pages/PlanodeAcao/GerenciarPlanosAcao.html': 'acao-Gerenciar',
                '/Pages/PlanodeAcao/form_PlanoAcao.html': 'acao-Novo',
                '/Pages/PlanodeAcao/DetalhesPlanoAcao.html': 'acao-Gerenciar',
                '/Pages/Cadastros/CadastroGestores.html': 'admin-CadastroGestores',
                '/Pages/Cadastros/CadastroTecnicos.html': 'admin-CadastroTecnicos',
                '/Pages/Cadastros/UsuariosOnline.html': 'admin-UsuariosOnline',
                '/Pages/Suporte/SolicitacaoSuporte.html': 'suporte-SolicitacaoSuporte',
                '/Pages/Suporte/MinhasSolicitacoes.html': 'suporte-MinhasSolicitacoes',
                '/Pages/Suporte/GerenciarSolicitacoes.html': 'suporte-GerenciarSolicitacoes'
            };
            return pageMap[currentPage] === key;
        });

        if (menuId && permissoesIndividuais.includes(menuId)) {
            console.log("Acesso permitido via permissão individual:", menuId);
            return true;
        }
    }

    // Se não tem acesso, redireciona
    console.log("Acesso NEGADO para página:", currentPage);
    alert("Você não tem permissão para acessar esta página.");
    window.location.href = '/Pages/Menu.html';
    return false;
}

// Função que verifica se o usuário tem acesso a um item de menu
// --- MAPA DE QUAIS ITENS PERTENCEM A CADA MENU ---
const menuItems = {
    'menu-controles': ['ctrl-PedidosPecas'],
    'menu-planos': ['ctrl-PlanosVigentes'],
    'menu-planejamento': ['plan-Preencher', 'plan-Gerenciar', 'plan-Permissoes'],
    'menu-plano-acao': ['acao-Gerenciar', 'acao-Novo', 'acao-KPIs'],
    'menu-suporte': ['suporte-SolicitacaoSuporte', 'suporte-MinhasSolicitacoes', 'suporte-GerenciarSolicitacoes'],
    'menu-cadastros': ['admin-CadastroGestores', 'admin-CadastroTecnicos', 'admin-UsuariosOnline'],
    'menu-dashboards': ['dash-geral', 'dash-comercial', 'dash-Seguro', 'dash-Consorcio', 'dash-pecas', 'dash-servicos', 'dash-PLM', 'dash-planos-manutencao']
};

function hasPermission(menuItemId, userGroup, permissoesIndividuais) {
    const allowedGroups = menuPermissions[menuItemId];
    
    // Verifica se o grupo principal tem acesso
    if (userGroup !== 'nenhum' && allowedGroups && allowedGroups.includes(userGroup)) {
        return true;
    }
    
    // Verifica se tem permissão individual específica
    if (permissoesIndividuais.includes(menuItemId)) {
        return true;
    }

    // Para menus (menu-*), verifica se tem permissão em ALGUM dos itens dentro
    if (menuItemId.startsWith('menu-') && menuItems[menuItemId]) {
        for (const itemId of menuItems[menuItemId]) {
            if (hasPermission(itemId, userGroup, permissoesIndividuais)) {
                return true;
            }
        }
    }
    
    return false;
}

// Função principal que roda quando o estado de autenticação muda
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuário logado:", user.uid);

        const userDocRef = doc(db, "gestores", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const userGroup = userData.grupo; 
            const userName = userData.nome;
            // Novo campo para permissões individuais (usa array vazio se não existir)
            const permissoesIndividuais = userData.permissoes || [];
            // Filiais do gestor
            const filiaisGestor = userData.filial || [];

            const userNameElement = document.getElementById('user-name');

            // determinar nome consistente do app (prioriza nome no doc, depois displayName/email)
            const appUserName = userName || (user.displayName || (user.email && user.email.split('@')[0])) || 'Usuário';

            if (userNameElement) {
                userNameElement.textContent = appUserName;
            }

            // persistir localmente para que outros formularios (ex: Plano de Ação) mostrem corretamente o criador
            try { localStorage.setItem('userName', appUserName); } catch (err) { /* silencioso */ }

            if (!userGroup) {
                console.error("Campo 'grupo' não encontrado para o usuário no Firestore!");
                alert("Erro de permissão. Contate o administrador.");
                return;
            }
            
            // Salvar filiais no localStorage para uso em dashboards
            localStorage.setItem('gestorFilial', JSON.stringify(filiaisGestor));
            
            // Registrar usuário como online
            await registrarUsuarioOnline(user.uid, appUserName, filiaisGestor[0] || "N/A");
            
            console.log("Grupo do usuário:", userGroup);
            console.log("Nome do usuário:", appUserName);
            console.log("Permissões individuais:", permissoesIndividuais);
            console.log("Filiais do gestor:", filiaisGestor);

            // Verifica acesso à página atual
            const hasAccess = checkPageAccess(userGroup, permissoesIndividuais);
            
            if (hasAccess) {
                // Só aplica as permissões do menu se o usuário tem acesso à página
                applyMenuPermissions(userGroup, permissoesIndividuais);
            }

        } else {
            console.error("Documento do usuário não encontrado no Firestore!");
            alert("Seu usuário não foi encontrado na base de dados. Redirecionando para o login.");
            try { localStorage.removeItem('userName'); localStorage.removeItem('gestorFilial'); } catch (err) { /* silencioso */ }
            window.location.href = '/Pages/Login.html';
        }

    } else {
        console.log("Nenhum usuário logado. Redirecionando para a página de login.");
        try { localStorage.removeItem('userName'); localStorage.removeItem('gestorFilial'); } catch (err) { /* silencioso */ }
        window.location.href = '/Pages/Login/Login.html';
    }
});

// Função que percorre o mapa de permissões e esconde os itens
function applyMenuPermissions(userGroup, permissoesIndividuais = []) {
    for (const menuItemId in menuPermissions) {
        const element = document.getElementById(menuItemId);

        if (element) {
            const temAcesso = hasPermission(menuItemId, userGroup, permissoesIndividuais);
            
            if (!temAcesso) {
                element.style.display = 'none';
            } else {
                element.style.display = ''; // Garante que está visível
            }
        }
    }

    // Esconde menus pais sem itens visíveis
    document.querySelectorAll('.submenu-parent').forEach(menu => {
        const totalItems = menu.querySelectorAll('ul.submenu > li');
        const visibleItems = Array.from(totalItems).filter(item => item.style.display !== 'none');

        if (visibleItems.length === 0 && totalItems.length > 0) {
            menu.style.display = 'none';
        }
    });
    
    // Mostrar sidebar após aplicar permissões
    const menuLinks = document.querySelector('.menu-links');
    if (menuLinks) {
        menuLinks.classList.add('loaded');
    }
}

// Lógica do botão de Logout
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            // Remover usuário de online antes de fazer logout
            const currentUser = auth.currentUser;
            if (currentUser) {
                await removerUsuarioOnline(currentUser.uid);
            }
            
            await signOut(auth);
            try { localStorage.removeItem('userName'); localStorage.removeItem('gestorFilial'); } catch (err) { /* silencioso */ }
            console.log('Logout bem-sucedido.');
            window.location.href = '/Pages/Login.html';
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    });
}

// Função para registrar usuário como online
async function registrarUsuarioOnline(uid, nome, filial) {
    try {
        if (!uid) return;
        const usuarioRef = doc(db, "usuariosOnline", uid);
        await setDoc(usuarioRef, {
            uid,
            nome,
            filial,
            loginTime: serverTimestamp(),
            lastActivity: serverTimestamp()
        }, { merge: true });
        console.log("Usuário registrado como online:", nome);
    } catch (error) {
        console.error("Erro ao registrar usuário online:", error);
    }
}

// Função para remover usuário de online
async function removerUsuarioOnline(uid) {
    try {
        if (!uid) return;
        const usuarioRef = doc(db, "usuariosOnline", uid);
        await deleteDoc(usuarioRef);
        console.log("Usuário removido de online");
    } catch (error) {
        console.error("Erro ao remover usuário online:", error);
    }
}

// Atualizar última atividade ao clicar em qualquer lugar
document.addEventListener('click', async () => {
    try {
        const currentUser = auth.currentUser;
        if (currentUser) {
            const usuarioRef = doc(db, "usuariosOnline", currentUser.uid);
            await setDoc(usuarioRef, {
                lastActivity: serverTimestamp()
            }, { merge: true });
        }
    } catch (error) {
        // Silenciar erros de atualização
    }
});





