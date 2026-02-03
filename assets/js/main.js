// /assets/js/main.js (VERSÃO COM SUBMENU CORRIGIDO)

function inicializarInterface() {

    console.log("SUCESSO: A função inicializarInterface() foi chamada e está executando!");

    const body = document.querySelector('body');
    const sidebar = body.querySelector('nav.sidebar');
    const toggle = body.querySelector(".toggle");
    const submenuParents = document.querySelectorAll(".submenu-parent");

    if (toggle && sidebar) {
        toggle.addEventListener("click", () => {
            sidebar.classList.toggle("close");
            localStorage.setItem("sidebarState", sidebar.classList.contains("close") ? "closed" : "open");

            // Ao fechar o menu principal, também fecha todos os submenus
            if (sidebar.classList.contains("close")) {
                submenuParents.forEach(parent => {
                    parent.classList.remove("open");
                });
            }
        });
    } else {
        console.error("Elemento '.toggle' ou 'nav.sidebar' não encontrado!");
        return;
    }

    // --- AJUSTE NOS SUBMENUS COMEÇA AQUI ---
    submenuParents.forEach(parent => {
        const linkPai = parent.querySelector(':scope > a'); // Seleciona apenas o link direto do pai
        if (linkPai) {
            // Remove event listeners antigos para evitar duplicação
            const novoLinkPai = linkPai.cloneNode(true);
            linkPai.parentNode.replaceChild(novoLinkPai, linkPai);
            
            novoLinkPai.addEventListener("click", (e) => {
                e.preventDefault(); // Impede a navegação, permitindo que o clique abra o submenu
                e.stopPropagation(); // Evita que o evento propague para outros elementos

                // Se a sidebar estiver fechada, a primeira ação é sempre abri-la.
                if (sidebar.classList.contains("close")) {
                    sidebar.classList.remove("close");
                    localStorage.setItem("sidebarState", "open");
                    // Abre o submenu junto ao abrir a sidebar
                    setTimeout(() => {
                        submenuParents.forEach(p => p.classList.remove("open"));
                        parent.classList.add("open");
                    }, 100);
                    return;
                }

                const isOpen = parent.classList.contains("open");

                // Fecha todos os OUTROS submenus para manter a interface limpa
                submenuParents.forEach(p => {
                    if (p !== parent) {
                        p.classList.remove("open");
                    }
                });

                // Abre ou fecha o submenu que foi clicado.
                // A classe 'open' é adicionada/removida APENAS no elemento pai (o <li>).
                // O CSS fará o resto.
                if (isOpen) {
                    parent.classList.remove("open");
                } else {
                    parent.classList.add("open");
                }
            });
        }
    });
    // --- FIM DO AJUSTE NOS SUBMENUS ---

    // Lógica que verifica o estado salvo do menu (continua igual)
    if (localStorage.getItem("sidebarState") === "closed") {
        sidebar.classList.add("close");
    }

    // --- FECHAR SIDEBAR AUTOMATICAMENTE ---
    // Fechar ao carregar uma nova página
    sidebar.classList.add("close");
    localStorage.setItem("sidebarState", "closed");

    // Timer de inatividade: fecha sidebar após 1 minuto
    let inactivityTimer;
    
    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            if (!sidebar.classList.contains("close")) {
                sidebar.classList.add("close");
                localStorage.setItem("sidebarState", "closed");
                // Fecha submenus também
                submenuParents.forEach(parent => {
                    parent.classList.remove("open");
                });
            }
        }, 60000); // 60 segundos (1 minuto)
    }

    // Eventos que resetam o timer de inatividade
    const resetEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    resetEvents.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, true);
    });

    // Iniciar o timer
    resetInactivityTimer();

    // Fallback global: botões com a classe `.import-btn` abrem o `input[type=file]` mais próximo.
    // Isso corrige páginas onde o botão existe mas o input está oculto/fora de alcance do handler local.
    document.addEventListener('click', (ev) => {
        try {
            const btn = ev.target && ev.target.closest && ev.target.closest('.import-btn');
            if (!btn) return;
            const scope = btn.closest('section, .content-card, .upload-container') || document;
            const input = scope.querySelector('input[type=file]') || document.querySelector('input[type=file]');
            if (!input) return;
            // chamada dentro do evento de usuário — navegadores permitem abrir o file picker
            input.click();
            console.log('Fallback: import-btn -> abriu input[type=file]', { btn, input });
        } catch (err) {
            console.warn('Fallback import-btn falhou:', err);
        }
    });

} // Fim da função
