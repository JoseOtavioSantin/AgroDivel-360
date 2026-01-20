// No seu arquivo components.js (ou Sidebar.js)

document.addEventListener("DOMContentLoaded", function() {
    const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
    
    if (sidebarPlaceholder) {
        fetch('/assets/components/Sidebar.html')
            .then(response => {
                if (!response.ok) throw new Error('Arquivo sidebar.html não encontrado.');
                return response.text();
            })
            .then(htmlDaSidebar => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlDaSidebar;
                const novaSidebar = tempDiv.querySelector('nav.sidebar');
                
                if (novaSidebar) {
                    // 1. Substitui o <nav id="placeholder"> pela <nav class="sidebar"> completa
                    sidebarPlaceholder.replaceWith(novaSidebar);

                    // 2. AGORA, com a sidebar no lugar certo, chama a função do main.js
                    if (typeof inicializarInterface === 'function') {
                        inicializarInterface();
                    } else {
                        console.error('A função inicializarInterface() não foi encontrada. Verifique se main.js está sendo carregado ANTES deste script.');
                    }
                }
            })
            .catch(error => {
                console.error('Erro ao carregar o componente da sidebar:', error);
            });
    }
});
