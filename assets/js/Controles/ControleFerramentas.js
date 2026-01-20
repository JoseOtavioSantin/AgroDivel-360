document.addEventListener("DOMContentLoaded", () => {
    // --- CONFIGURAÇÃO DO FIREBASE ---
    const firebaseConfig = {
        apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
        authDomain: "agro-divel.firebaseapp.com",
        projectId: "agro-divel",
        storageBucket: "agro-divel.firebasestorage.app",
        messagingSenderId: "583977436505",
        appId: "1:583977436505:web:3754ec029aebb3d9d67848"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    const db = firebase.firestore();
    const ferramentasCollection = db.collection('ferramentas');
    const alocacoesCollection = db.collection('alocacoes');
    const gruposCollection = db.collection('grupos');
    const historicoCollection = db.collection('historico');

    // --- ESTADO DA APLICAÇÃO ---
    let todosGrupos = [];
    let todasFerramentas = [];
    let todasAlocacoes = [];
    let todoHistorico = [];

    // --- FUNÇÕES UTILITÁRIAS ---
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toastContainer.removeChild(toast), 300);
        }, 3000);
    }

    function formatarDataHora(timestamp) {
        if (!timestamp) return 'Data inválida';
        const data = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
        return data.toLocaleString('pt-BR');
    }

    async function adicionarHistorico(tipo, ferramentaId, detalhes = {}) {
        const ferramenta = todasFerramentas.find(f => f.id === ferramentaId);
        if (!ferramenta) return;
        const historico = {
            tipo: tipo,
            ferramentaId: ferramentaId,
            ferramentaCodigo: ferramenta.codigo,
            ferramentaDescricao: ferramenta.descricao,
            filial: ferramenta.filial,
            timestamp: new Date(),
            detalhes: detalhes
        };
        try {
            await historicoCollection.add(historico);
        } catch (error) {
            console.error('Erro ao adicionar histórico:', error);
        }
    }

    // --- NAVEGAÇÃO ENTRE ABAS ---
    function alternarTela(telaAtiva) {
        document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById(`nav-${telaAtiva}`).classList.add('active');
        document.getElementById(`view-${telaAtiva}`).classList.add('active');
    }

    document.getElementById('nav-alocacao').addEventListener('click', () => alternarTela('alocacao'));
    document.getElementById('nav-estoque').addEventListener('click', () => alternarTela('estoque'));
    document.getElementById('nav-grupos').addEventListener('click', () => alternarTela('grupos'));
    document.getElementById('nav-historico').addEventListener('click', () => alternarTela('historico'));

    // --- LÓGICA DE RENDERIZAÇÃO ---
    function renderizarTabelaFerramentas(ferramentas) {
        const tabelaBody = document.getElementById('tabela-ferramentas');
        tabelaBody.innerHTML = '';
        ferramentas.forEach(f => {
            const grupo = todosGrupos.find(g => g.id === f.grupoId);
            const tr = document.createElement('tr');

            // Verifica se a ferramenta tem uma URL de imagem válida
            const temImagem = f.imagemUrl && f.imagemUrl.trim() !== '';
            
            // Cria o botão de imagem (desabilitado se não houver imagem)
            const botaoImagem = `
                <td style="text-align: center;">
                    <button class="btn btn-secundario btn-ver-imagem" 
                            data-img-url="${f.imagemUrl || ''}" 
                            data-descricao="${f.descricao}"
                            title="Ver Imagem" 
                            ${!temImagem ? 'disabled' : ''}>
                        <i data-lucide="image"></i>
                    </button>
                </td>
            `;

            tr.innerHTML = `
                ${botaoImagem}
                <td>${f.filial}</td>
                <td>${f.codigo}</td>
                <td>${f.descricao}</td>
                <td>${grupo ? grupo.nome : 'Sem grupo'}</td>
                <td>${f.localizacao}</td>
                <td style="text-align: center;">${f.quantidade}</td>
                <td style="text-align: center;"><span class="status-reparo ${f.reparo ? 'sim' : 'nao'}">${f.reparo ? 'SIM' : 'NÃO'}</span></td>
                <td style="text-align: center; display: flex; gap: 5px; justify-content: center;">
                    <button class="btn btn-info btn-historico-ferramenta" data-id="${f.id}" title="Ver Histórico"><i data-lucide="history"></i></button>
                    <a href="/Pages/Formularios/form_cadastroferramenta.html?id=${f.id}" class="btn btn-aviso" title="Editar"><i data-lucide="edit"></i></a>
                    <button class="btn btn-alerta btn-remover-ferramenta" data-id="${f.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            tabelaBody.appendChild(tr);
        });
        lucide.createIcons();
    }

    // --- FUNÇÃO ATUALIZADA PARA RENDERIZAR ALOCAÇÕES ---
    function renderizarTabelaAlocacao(alocacoes) {
        const tabelaBody = document.getElementById('tabela-alocacao');
        tabelaBody.innerHTML = '';
        
        if (alocacoes.length === 0) {
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px; color: #666;">
                        <i data-lucide="inbox" style="width: 40px; height: 40px; margin-bottom: 10px;"></i>
                        <br>Nenhuma ferramenta alocada
                    </td>
                </tr>
            `;
            lucide.createIcons();
            return;
        }

        alocacoes.forEach(a => {
            const ferramenta = todasFerramentas.find(f => f.id === a.ferramentaId);
            const tr = document.createElement('tr');
            
            // Formata a data
            const dataAlocacao = formatarDataHora(a.dataAlocacao);
            
            // Status de disponibilidade
            const statusHTML = ferramenta ? 
                `<span class="status-alocado">🟢 Alocada</span>` : 
                `<span class="status-erro">🔴 Ferramenta não encontrada</span>`;

            tr.innerHTML = `
                <td>
                    <strong style="color: #2c5aa0;">${a.ordemServico || 'N/A'}</strong>
                </td>
                <td>
                    <div class="ferramenta-info">
                        <strong>${ferramenta ? ferramenta.descricao : 'Ferramenta não encontrada'}</strong>
                        <div class="ferramenta-detalhes">
                            ${ferramenta ? `
                                <span class="codigo">Código: ${ferramenta.codigo}</span>
                                <span class="filial">Filial: ${ferramenta.filial}</span>
                            ` : ''}
                        </div>
                        ${statusHTML}
                    </div>
                </td>
                <td>
                    <div class="funcionario-info">
                        <strong>${a.funcionario}</strong>
                        ${a.responsavelLancamento ? `
                            <div class="responsavel">Lançado por: ${a.responsavelLancamento}</div>
                        ` : ''}
                    </div>
                </td>
                <td>
                    <div class="data-info">
                        <strong>${dataAlocacao.split(' ')[0]}</strong>
                        <div class="hora">${dataAlocacao.split(' ')[1]}</div>
                    </div>
                </td>
                <td style="text-align: center;">
                    <div class="acoes-container">
                        <button class="btn btn-sucesso btn-devolver" 
                                data-id="${a.id}" 
                                data-ferramenta-id="${a.ferramentaId}" 
                                data-funcionario="${a.funcionario}" 
                                title="Registrar Devolução">
                            <i data-lucide="arrow-left-circle"></i> Devolver
                        </button>
                        ${a.ordemServico ? `
                            <a href="/Pages/Formularios/os.html?os=${a.ordemServico}" 
                               class="btn-pdf" 
                               title="Gerar PDF desta OS">
                                <i data-lucide="file-text"></i> PDF
                            </a>
                        ` : ''}
                    </div>
                </td>
            `;
            tabelaBody.appendChild(tr);
        });
        lucide.createIcons();
    }

    function renderizarListaGrupos() {
        const lista = document.getElementById('lista-grupos');
        lista.innerHTML = '';
        todosGrupos.forEach(g => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${g.nome}</span><div><button class="btn btn-alerta btn-remover-grupo" data-id="${g.id}" title="Remover"><i data-lucide="trash-2"></i></button></div>`;
            lista.appendChild(li);
        });
        lucide.createIcons();
    }

    function renderizarHistorico(historico) {
        const container = document.getElementById('lista-historico');
        container.innerHTML = '';
        if (historico.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #ccc;">Nenhum registro encontrado.</p>';
            return;
        }
        historico.forEach(h => {
            const div = document.createElement('div');
            div.className = `log-entry ${h.tipo}`;
            let titulo = '', detalhes = '', icone = 'help-circle';
            switch (h.tipo) {
                case 'criacao': titulo = `Ferramenta Criada: ${h.ferramentaDescricao}`; detalhes = `Código: ${h.ferramentaCodigo} | Filial: ${h.filial}`; icone = 'plus-circle'; break;
                case 'edicao': titulo = `Ferramenta Editada: ${h.ferramentaDescricao}`; detalhes = `Código: ${h.ferramentaCodigo} | Filial: ${h.filial}${h.detalhes.alteracoes ? ` | Alterações: ${h.detalhes.alteracoes}` : ''}`; icone = 'edit-3'; break;
                case 'alocacao': titulo = `Ferramenta Alocada: ${h.ferramentaDescricao}`; detalhes = `Para: ${h.detalhes.funcionario} | Código: ${h.ferramentaCodigo} | Filial: ${h.filial}`; icone = 'arrow-right-circle'; break;
                case 'devolucao': titulo = `Ferramenta Devolvida: ${h.ferramentaDescricao}`; detalhes = `Por: ${h.detalhes.funcionario} | Código: ${h.ferramentaCodigo} | Filial: ${h.filial}`; icone = 'arrow-left-circle'; break;
            }
            div.innerHTML = `<div class="log-entry-icon"><i data-lucide="${icone}"></i></div><div class="log-entry-content"><div class="log-entry-header">${titulo}</div><div class="log-entry-details">${detalhes}</div></div><div class="log-entry-timestamp">${formatarDataHora(h.timestamp)}</div>`;
            container.appendChild(div);
        });
        lucide.createIcons();
    }

    function renderizarHistoricoFerramenta(ferramentaId) {
        const historicoFerramenta = todoHistorico.filter(h => h.ferramentaId === ferramentaId);
        const container = document.getElementById('historico-ferramenta-content');
        container.innerHTML = '';
        if (historicoFerramenta.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #ccc;">Nenhum histórico para esta ferramenta.</p>';
            return;
        }
        historicoFerramenta.forEach(h => {
            const div = document.createElement('div');
            div.className = `log-entry ${h.tipo}`;
            let titulo = '', detalhes = '';
            switch (h.tipo) {
                case 'criacao': titulo = 'Ferramenta Criada'; detalhes = 'Ferramenta adicionada ao sistema'; break;
                case 'edicao': titulo = 'Ferramenta Editada'; detalhes = h.detalhes.alteracoes || 'Dados da ferramenta foram alterados'; break;
                case 'alocacao': titulo = 'Ferramenta Alocada'; detalhes = `Alocada para: ${h.detalhes.funcionario}`; break;
                case 'devolucao': titulo = 'Ferramenta Devolvida'; detalhes = `Devolvida por: ${h.detalhes.funcionario}`; break;
            }
            div.innerHTML = `<div class="log-entry-header">${titulo}</div><div class="log-entry-details">${detalhes}</div><div class="log-entry-details">${formatarDataHora(h.timestamp)}</div>`;
            container.appendChild(div);
        });
    }

    // --- LÓGICA DO FIREBASE (CRUD) ---
    function carregarDados() {
        gruposCollection.orderBy('nome').onSnapshot(snapshot => {
            todosGrupos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderizarListaGrupos();
            atualizarSelectsDeGrupo();
            aplicarFiltrosEstoque();
        });
        ferramentasCollection.orderBy('codigo').onSnapshot(snapshot => {
            todasFerramentas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aplicarFiltrosEstoque();
            aplicarFiltrosAlocacao();
        });
        alocacoesCollection.orderBy('dataAlocacao', 'desc').onSnapshot(snapshot => {
            todasAlocacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aplicarFiltrosAlocacao();
        });
        historicoCollection.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
            todoHistorico = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aplicarFiltrosHistorico();
        });
    }

    // --- LÓGICA DOS MODAIS E FORMULÁRIOS ---
    function abrirModal(modal) { modal.classList.add('active'); }
    function fecharModal(modal) { modal.classList.remove('active'); }

    document.querySelectorAll('.modal-ferramentas .close-button').forEach(btn => {
        btn.addEventListener('click', () => fecharModal(btn.closest('.modal-ferramentas')));
    });

    // Formulário de Grupo
    document.getElementById('form-grupo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nomeInput = document.getElementById('grupo-nome');
        const nome = nomeInput.value.trim().toUpperCase();
        if (nome) {
            try {
                await gruposCollection.add({ nome });
                nomeInput.value = '';
                showToast('Grupo adicionado com sucesso!', 'success');
            } catch (error) {
                showToast('Erro ao adicionar grupo', 'error');
            }
        }
    });

    document.getElementById('lista-grupos').addEventListener('click', (e) => {
        const btnRemover = e.target.closest('.btn-remover-grupo');
        if (btnRemover) {
            const id = btnRemover.dataset.id;
            const ferramentasNoGrupo = todasFerramentas.some(f => f.grupoId === id);
            if (ferramentasNoGrupo) {
                showToast('Não é possível remover. Existem ferramentas associadas a este grupo.', 'error');
                return;
            }
            if (confirm('Tem certeza que deseja remover este grupo?')) {
                gruposCollection.doc(id).delete()
                    .then(() => showToast('Grupo removido com sucesso!', 'success'))
                    .catch(() => showToast('Erro ao remover grupo', 'error'));
            }
        }
    });

    // Ações na tabela de ferramentas
    document.getElementById('tabela-ferramentas').addEventListener('click', (e) => {
        // Lógica para abrir o modal de imagem
        const btnImagem = e.target.closest('.btn-ver-imagem');
        if (btnImagem) {
            const url = btnImagem.dataset.imgUrl;
            const descricao = btnImagem.dataset.descricao;
            const modalImagem = document.getElementById('modal-imagem');
            const imgElement = document.getElementById('imagem-modal-src');
            const pVazia = document.getElementById('imagem-modal-vazia');
            
            document.getElementById('modal-imagem-titulo').innerText = descricao;

            if (url) {
                imgElement.src = url;
                imgElement.style.display = 'block';
                pVazia.style.display = 'none';
            } else {
                imgElement.style.display = 'none';
                pVazia.style.display = 'block';
            }
            
            abrirModal(modalImagem);
        }

        // Lógica para abrir o modal de histórico
        const btnHistorico = e.target.closest('.btn-historico-ferramenta');
        if (btnHistorico) {
            const id = btnHistorico.dataset.id;
            const ferramenta = todasFerramentas.find(f => f.id === id);
            if (ferramenta) {
                document.getElementById('modal-historico-titulo').innerText = `Histórico: ${ferramenta.descricao}`;
                renderizarHistoricoFerramenta(id);
                abrirModal(document.getElementById('modal-historico-ferramenta'));
            }
        }

        // Lógica para remover a ferramenta
        const btnRemover = e.target.closest('.btn-remover-ferramenta');
        if (btnRemover) {
            if (confirm('Tem certeza que deseja remover esta ferramenta? Esta ação não pode ser desfeita.')) {
                ferramentasCollection.doc(btnRemover.dataset.id).delete()
                    .then(() => showToast('Ferramenta removida com sucesso!', 'success'))
                    .catch(() => showToast('Erro ao remover ferramenta', 'error'));
            }
        }
    });
    
    // Devolução de Ferramenta
    document.getElementById('tabela-alocacao').addEventListener('click', async (e) => {
        const btnDevolver = e.target.closest('.btn-devolver');
        if (btnDevolver) {
            if (confirm('Confirmar a devolução desta ferramenta?')) {
                try {
                    const ferramentaId = btnDevolver.dataset.ferramentaId;
                    const funcionario = btnDevolver.dataset.funcionario;
                    
                    await alocacoesCollection.doc(btnDevolver.dataset.id).delete();
                    await adicionarHistorico('devolucao', ferramentaId, { funcionario: funcionario });
                    showToast('Ferramenta devolvida com sucesso!', 'success');
                } catch (error) {
                    showToast('Erro ao devolver ferramenta', 'error');
                }
            }
        }
    });

    // --- ATUALIZAÇÃO DE SELECTS E FILTROS ---
    function atualizarSelectsDeGrupo() {
        const selectFiltro = document.getElementById('filtro-grupo');
        if (!selectFiltro) return;
        
        const currentValue = selectFiltro.value;
        selectFiltro.innerHTML = `<option value="">Todos os Grupos</option>`;
        todosGrupos.forEach(g => {
            selectFiltro.innerHTML += `<option value="${g.id}">${g.nome}</option>`;
        });
        selectFiltro.value = currentValue;
    }
    
    // --- FILTROS ---
    function aplicarFiltrosEstoque() {
        const filialFiltro = document.getElementById('filtro-filial').value;
        const codFiltro = document.getElementById('filtro-codigo').value.toLowerCase();
        const descFiltro = document.getElementById('filtro-descricao').value.toLowerCase();
        const grupoFiltro = document.getElementById('filtro-grupo').value;
        const reparoFiltro = document.getElementById('filtro-reparo').value;

        const filtrado = todasFerramentas.filter(f => {
            return (!filialFiltro || f.filial === filialFiltro) &&
                   (!grupoFiltro || f.grupoId === grupoFiltro) &&
                   (!reparoFiltro || String(f.reparo) === reparoFiltro) &&
                   f.codigo.toLowerCase().includes(codFiltro) &&
                   f.descricao.toLowerCase().includes(descFiltro);
        });
        renderizarTabelaFerramentas(filtrado);
    }

    // --- FUNÇÃO ATUALIZADA PARA FILTRAR ALOCAÇÕES ---
    function aplicarFiltrosAlocacao() {
        const filial = document.getElementById('filtro-aloc-filial').value;
        const ferramenta = document.getElementById('filtro-aloc-ferramenta').value.toLowerCase();
        const funcionario = document.getElementById('filtro-aloc-funcionario').value.toLowerCase();
        const os = document.getElementById('filtro-aloc-os').value.toLowerCase();
        
        const filtrado = todasAlocacoes.filter(a => {
            const ferramentaObj = todasFerramentas.find(f => f.id === a.ferramentaId);
            const descricaoFerramenta = ferramentaObj ? ferramentaObj.descricao.toLowerCase() : '';
            const codigoFerramenta = ferramentaObj ? ferramentaObj.codigo.toLowerCase() : '';
            const filialFerramenta = ferramentaObj ? ferramentaObj.filial : '';
            
            return (
                (!filial || filialFerramenta === filial) &&
                (!ferramenta || 
                 descricaoFerramenta.includes(ferramenta) || 
                 codigoFerramenta.includes(ferramenta)) &&
                (!funcionario || a.funcionario.toLowerCase().includes(funcionario)) &&
                (!os || (a.ordemServico && a.ordemServico.toLowerCase().includes(os)))
            );
        });
        
        // Ordenar por data mais recente primeiro
        filtrado.sort((a, b) => {
            const dataA = a.dataAlocacao?.toDate?.() || new Date(0);
            const dataB = b.dataAlocacao?.toDate?.() || new Date(0);
            return dataB - dataA;
        });
        
        renderizarTabelaAlocacao(filtrado);
    }

    function aplicarFiltrosHistorico() {
        const filialFiltro = document.getElementById('filtro-hist-filial').value;
        const ferrFiltro = document.getElementById('filtro-hist-ferramenta').value.toLowerCase();
        const funcFiltro = document.getElementById('filtro-hist-funcionario').value.toLowerCase();
        const tipoFiltro = document.getElementById('filtro-hist-tipo').value;

        const filtrado = todoHistorico.filter(h => {
            return (!filialFiltro || h.filial === filialFiltro) &&
                   (!ferrFiltro || h.ferramentaDescricao.toLowerCase().includes(ferrFiltro) || h.ferramentaCodigo.toLowerCase().includes(ferrFiltro)) &&
                   (!funcFiltro || (h.detalhes.funcionario && h.detalhes.funcionario.toLowerCase().includes(funcFiltro))) &&
                   (!tipoFiltro || h.tipo === tipoFiltro);
        });
        renderizarHistorico(filtrado);
    }

    // Event listeners para filtros
    document.querySelectorAll('#filtro-filial, #filtro-codigo, #filtro-descricao, #filtro-grupo, #filtro-reparo').forEach(el => {
        el.addEventListener('input', aplicarFiltrosEstoque);
        el.addEventListener('change', aplicarFiltrosEstoque);
    });
    document.querySelectorAll('#filtro-aloc-filial, #filtro-aloc-ferramenta, #filtro-aloc-funcionario, #filtro-aloc-os').forEach(el => {
        el.addEventListener('input', aplicarFiltrosAlocacao);
    });
    document.querySelectorAll('#filtro-hist-filial, #filtro-hist-ferramenta, #filtro-hist-funcionario, #filtro-hist-tipo').forEach(el => {
        el.addEventListener('input', aplicarFiltrosHistorico);
        el.addEventListener('change', aplicarFiltrosHistorico);
    });

    // --- INICIALIZAÇÃO ---
    lucide.createIcons();
    carregarDados();
    alternarTela('alocacao');
});
