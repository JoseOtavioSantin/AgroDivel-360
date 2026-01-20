// ===== PREENCHER PLANEJAMENTO ANUAL =====
import { db, auth } from '/assets/js/firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query,
    where,
    updateDoc,
    doc,
    setDoc,
    getDoc,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Estado da aplicação
let gruposContas = []; // Dados da base
let planejamentoData = {}; // Dados do planejamento preenchido
let gruposExpandidos = {}; // Controle de expansão
let todasExpandidas = true;
let usuarioPermissoes = {}; // Permissões do usuário
let geralVisualizar = false; // Pode visualizar modo Geral
let geralEditar = false; // Pode editar modo Geral
let usuarioId = null;
let departamentoSelecionado = null; // Departamento atual selecionado
let filiaSelecionada = null; // Filial atual selecionada
let departamentosDisponsiveis = []; // Departamentos que o usuário pode acessar
let filiaisDisponiveis = []; // Filiais que o usuário pode acessar
let termoPesquisa = ''; // Termo de pesquisa atual
let todosGruposExpandidos = true; // Controlar se todos os grupos estão expandidos

// Meses do ano
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', async () => {
    try {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                usuarioId = user.uid;
                console.log('✅ Usuário autenticado:', usuarioId);
                
                // Carregar dados
                await carregarGruposContas();
                await carregarPermissoes();
                
                // Mostrar tela de seleção de departamento (primeiro passo)
                mostrarTelaSelecaoDepartamento();
            } else {
                Swal.fire('Erro', 'Faça login para continuar', 'error');
            }
        });

    } catch (error) {
        console.error('❌ Erro ao inicializar:', error);
    }
});

// ===== CARREGAR GRUPOS E CONTAS DA BASE =====
async function carregarGruposContas() {
    try {
        const colecao = collection(db, 'planejamento_anual');
        const q = query(colecao, where('usuarioId', '==', 'planejamento_anual'));
        
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            const dados = doc.data();
            
            if (dados.gruposContas && Array.isArray(dados.gruposContas)) {
                gruposContas = dados.gruposContas;
                console.log('✅ Grupos e contas carregados:', gruposContas);
            }
        } else {
            Swal.fire('Atenção', 'Nenhuma base de grupos e contas configurada.', 'warning');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar grupos e contas:', error);
    }
}

// ===== CARREGAR PERMISSÕES DO USUÁRIO =====
async function carregarPermissoes() {
    try {
        console.log('🔍 Carregando permissões para usuário:', usuarioId);
        const docRef = doc(db, 'permissoes_planejamento', usuarioId);
        const docSnap = await getDoc(docRef);
        
        console.log('📄 Documento existe?', docSnap.exists());
        
        if (docSnap.exists()) {
            const dados = docSnap.data();
            usuarioPermissoes = dados.contas || {};
            departamentosDisponsiveis = dados.departamentos || [];
            filiaisDisponiveis = dados.filiais || [];
            geralVisualizar = dados.geral?.visualizar || false;
            geralEditar = dados.geral?.editar || false;
            
            console.log('✅ Permissões carregadas:', {
                departamentos: departamentosDisponsiveis,
                filiais: filiaisDisponiveis,
                geral: { visualizar: geralVisualizar, editar: geralEditar },
                totalContas: Object.keys(usuarioPermissoes).length,
                contasLiberas: Object.values(usuarioPermissoes).filter(v => v === true).length
            });
        } else {
            console.log('ℹ️ Nenhuma permissão configurada para este usuário');
            usuarioPermissoes = {};
            departamentosDisponsiveis = [];
            filiaisDisponiveis = [];
            geralVisualizar = false;
            geralEditar = false;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar permissões:', error);
        usuarioPermissoes = {};
        departamentosDisponsiveis = [];
        filiaisDisponiveis = [];
        geralVisualizar = false;
        geralEditar = false;
    }
}

// ===== MOSTRAR TELA DE SELEÇÃO DE FILIAL =====
// ===== MOSTRAR TELA DE SELEÇÃO DE DEPARTAMENTO =====
function mostrarTelaSelecaoDepartamento() {
    console.log('🎯 Iniciando mostrarTelaSelecaoDepartamento()');
    const gridDepartamentos = document.getElementById('grid-departamentos');
    
    if (!gridDepartamentos) {
        console.error('❌ Elemento grid-departamentos não encontrado!');
        return;
    }
    
    gridDepartamentos.innerHTML = '';

    // Resetar seleção anterior
    filiaSelecionada = null;

    // Mudar título de volta para departamento
    const containerSelecao = document.querySelector('.container-selecao');
    if (containerSelecao) {
        containerSelecao.querySelector('h1').innerHTML = '📋 Selecione o Departamento';
        containerSelecao.querySelector('p').innerHTML = 'Escolha qual departamento você deseja preencher o planejamento anual:';
    }

    console.log('📋 Departamentos disponíveis:', departamentosDisponsiveis);
    console.log('🔐 Permissões do usuário:', usuarioPermissoes);

    // Se não há departamentos configurados, mostrar erro
    if (!departamentosDisponsiveis || departamentosDisponsiveis.length === 0) {
        console.warn('⚠️ Nenhum departamento disponível');
        gridDepartamentos.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: #999;">Nenhum departamento liberado para você. Entre em contato com o administrador.</p>';
        
        const telaSelecao = document.getElementById('tela-selecao-filial');
        if (telaSelecao) {
            telaSelecao.style.display = 'flex';
            console.log('📺 Tela de seleção exibida (sem departamentos)');
        }
        return;
    }

    // Se houver apenas 1 departamento, auto-selecionar
    if (departamentosDisponsiveis.length === 1) {
        departamentoSelecionado = departamentosDisponsiveis[0];
        console.log('✅ Auto-selecionado departamento único:', departamentoSelecionado);
        confirmarSelecaoDepartamento();
        return;
    }

    // Se houver múltiplos, mostrar cards
    console.log(`🃏 Renderizando ${departamentosDisponsiveis.length} departamentos`);
    
    // Card "Geral" - Consolidado de todos os departamentos (só se tiver permissão)
    if (geralVisualizar) {
        const cardGeral = document.createElement('div');
        cardGeral.className = 'card-departamento';
        cardGeral.innerHTML = `
            <div class="card-departamento-nome"><i class='bx bx-bar-chart'></i> Geral</div>
            <div class="card-departamento-info">Ver consolidado</div>
        `;
        cardGeral.onclick = () => selecionarDepartamento(cardGeral, 'GERAL');
        gridDepartamentos.appendChild(cardGeral);
    }
    
    departamentosDisponsiveis.forEach(departamento => {
        const card = document.createElement('div');
        card.className = 'card-departamento';
        card.innerHTML = `
            <div class="card-departamento-nome"><i class='bx bx-folder'></i> ${departamento}</div>
            <div class="card-departamento-info">Clique para selecionar</div>
        `;
        
        card.onclick = () => selecionarDepartamento(card, departamento);
        gridDepartamentos.appendChild(card);
    });

    // Registrar botão confirmar
    const btnConfirmar = document.getElementById('btn-confirmar-filial');
    if (btnConfirmar) {
        btnConfirmar.onclick = confirmarSelecaoDepartamento;
        btnConfirmar.disabled = true; // Desabilitar até selecionar
    }

    // Mostrar tela de seleção
    const telaSelecao = document.getElementById('tela-selecao-filial');
    if (telaSelecao) {
        telaSelecao.style.display = 'flex';
        console.log('📺 Tela de seleção de departamento exibida');
    } else {
        console.error('❌ Elemento tela-selecao-filial não encontrado!');
    }
    
    const telaPlanejamento = document.getElementById('tela-planejamento');
    if (telaPlanejamento) {
        telaPlanejamento.style.display = 'none';
    }
}

// ===== MOSTRAR TELA DE SELEÇÃO DE FILIAL =====
function mostrarTelaSelecaoFilial() {
    console.log('🎯 Iniciando mostrarTelaSelecaoFilial()');
    const gridDepartamentos = document.getElementById('grid-departamentos');
    
    if (!gridDepartamentos) {
        console.error('❌ Elemento grid-departamentos não encontrado!');
        return;
    }
    
    gridDepartamentos.innerHTML = '';
    
    // Mudar título
    const containerSelecao = document.querySelector('.container-selecao');
    if (containerSelecao) {
        containerSelecao.querySelector('h1').innerHTML = '🏢 Selecione a Filial';
        containerSelecao.querySelector('p').innerHTML = 'Escolha qual filial você deseja preencher o planejamento:';
    }

    console.log('🏪 Filiais disponíveis:', filiaisDisponiveis);

    // Se não há filiais configuradas, mostrar erro
    if (!filiaisDisponiveis || filiaisDisponiveis.length === 0) {
        console.warn('⚠️ Nenhuma filial disponível');
        gridDepartamentos.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: #999;">Nenhuma filial liberada para você. Entre em contato com o administrador.</p>';
        return;
    }

    // Se houver apenas 1 filial, auto-selecionar
    if (filiaisDisponiveis.length === 1) {
        filiaSelecionada = filiaisDisponiveis[0];
        console.log('✅ Auto-selecionada filial única:', filiaSelecionada);
        confirmarSelecaoFilial();
        return;
    }

    // Se houver múltiplas, mostrar cards
    console.log(`🃏 Renderizando ${filiaisDisponiveis.length} filiais`);
    filiaisDisponiveis.forEach(filial => {
        const card = document.createElement('div');
        card.className = 'card-departamento';
        card.innerHTML = `
            <div class="card-departamento-nome"><i class='bx bx-map'></i> ${filial}</div>
            <div class="card-departamento-info">Clique para selecionar</div>
        `;
        
        card.onclick = () => selecionarFilial(card, filial);
        gridDepartamentos.appendChild(card);
    });

    // Registrar botão confirmar
    const btnConfirmar = document.getElementById('btn-confirmar-filial');
    if (btnConfirmar) {
        btnConfirmar.onclick = confirmarSelecaoFilial;
    }

    // Mostrar tela de seleção
    const telaSelecao = document.getElementById('tela-selecao-filial');
    if (telaSelecao) {
        telaSelecao.style.display = 'flex';
        console.log('📺 Tela de seleção de filial exibida');
    }
}

// ===== SELECIONAR DEPARTAMENTO =====
function selecionarDepartamento(cardElement, departamento) {
    // Remover seleção anterior
    document.querySelectorAll('.card-departamento').forEach(card => {
        card.classList.remove('selecionado');
    });
    
    // Adicionar seleção ao card clicado
    cardElement.classList.add('selecionado');
    departamentoSelecionado = departamento;
    
    // Habilitar botão confirmar
    document.getElementById('btn-confirmar-filial').disabled = false;
    
    console.log('👤 Departamento selecionado:', departamento);
}

// ===== CONFIRMAR SELEÇÃO DE DEPARTAMENTO =====
async function confirmarSelecaoDepartamento() {
    if (!departamentoSelecionado) {
        Swal.fire('Aviso', 'Selecione um departamento', 'warning');
        return;
    }

    console.log('✅ Departamento confirmado:', departamentoSelecionado);
    
    // Mostrar seleção de filial
    mostrarTelaSelecaoFilial();
}

// ===== SELECIONAR FILIAL =====
function selecionarFilial(cardElement, filial) {
    // Remover seleção anterior
    document.querySelectorAll('.card-departamento').forEach(card => {
        card.classList.remove('selecionado');
    });
    
    // Adicionar seleção ao card clicado
    cardElement.classList.add('selecionado');
    filiaSelecionada = filial;
    
    // Habilitar botão confirmar
    document.getElementById('btn-confirmar-filial').disabled = false;
    
    console.log('🏪 Filial selecionada:', filial);
}

// ===== CONFIRMAR SELEÇÃO DE FILIAL =====
async function confirmarSelecaoFilial() {
    if (!filiaSelecionada) {
        Swal.fire('Aviso', 'Selecione uma filial', 'warning');
        return;
    }

    console.log('✅ Filial confirmada:', filiaSelecionada);
    
    // Esconder tela de seleção
    const telaSelecao = document.getElementById('tela-selecao-filial');
    if (telaSelecao) {
        telaSelecao.style.display = 'none';
    }
    
    // Atualizar display de departamento/filial selecionados
    const infoDepartamento = document.getElementById('info-departamento-selecionado');
    if (infoDepartamento) {
        infoDepartamento.innerHTML = `👤 <strong>${departamentoSelecionado}</strong> | 🏢 <strong>${filiaSelecionada}</strong>`;
    }
    
    // Carregar planejamento e renderizar tabela
    await carregarPlanejamento();
    renderTabela();
    
    // Mostrar tela de planejamento
    const telaplanejamento = document.getElementById('tela-planejamento');
    if (telaplanejamento) {
        telaplanejamento.style.display = 'block';
    }
}

// ===== CARREGAR PLANEJAMENTO EXISTENTE =====
async function carregarPlanejamento() {
    try {
        const ano = new Date().getFullYear();
        
        if (!departamentoSelecionado || !filiaSelecionada) {
            console.log('ℹ️ Selecione departamento e filial para carregar planejamento');
            return;
        }

        // Modo GERAL - Consolidado de todos os departamentos
        if (departamentoSelecionado === 'GERAL') {
            console.log('📊 Carregando modo GERAL (consolidado)...');
            planejamentoData = {};
            
            // Carregar dados de todos os departamentos autorizados
            for (const departamento of departamentosDisponsiveis) {
                const chaveDoc = `${ano}_${departamento}_${filiaSelecionada}`;
                const docRef = doc(db, 'planejamento_preenchido', chaveDoc);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const dados = docSnap.data().dados || {};
                    console.log(`✅ Carregados dados de ${departamento}:`, dados);
                    
                    // Mesclar dados com prefixo do departamento
                    Object.keys(dados).forEach(chave => {
                        const novaChave = `${departamento}__${chave}`;
                        planejamentoData[novaChave] = dados[chave];
                    });
                } else {
                    console.log(`ℹ️ Sem dados anteriores para ${departamento}`);
                }
            }
            console.log('✅ Planejamento GERAL carregado:', planejamentoData);
            return;
        }

        // Modo normal - Um departamento específico
        const chaveDoc = `${ano}_${departamentoSelecionado}_${filiaSelecionada}`;
        const docRef = doc(db, 'planejamento_preenchido', chaveDoc);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            planejamentoData = docSnap.data().dados || {};
            console.log('✅ Planejamento carregado:', planejamentoData);
        } else {
            console.log('ℹ️ Nenhum planejamento anterior encontrado para:', chaveDoc);
            planejamentoData = {};
        }
    } catch (error) {
        console.error('❌ Erro ao carregar planejamento:', error);
    }
}

// ===== RENDERIZAR TABELA =====
function renderTabela() {
    console.log('📊 Renderizando tabela de planejamento...');
    const tabelaBody = document.getElementById('tabela-body');
    tabelaBody.innerHTML = '';

    // Se está em modo GERAL, renderizar de forma consolidada
    if (departamentoSelecionado === 'GERAL') {
        renderTabelaConsolidada();
        return;
    }

    // Modo normal - um departamento
    let gruposExibidos = 0;
    let contasExibidas = 0;
    
    // Mostrar botão expandir/minimizar para modo normal
    const btnExpandirTudo = document.getElementById('btn-expandir-tudo');
    if (btnExpandirTudo) {
        btnExpandirTudo.style.display = 'inline-block';
        btnExpandirTudo.onclick = () => toggleTodosGruposModoNormal();
    }

    gruposContas.forEach((grupo, grupoIdx) => {
        gruposExpandidos[grupoIdx] = gruposExpandidos[grupoIdx] ?? true;

        // Filtrar contas que têm permissão
        let contasComPermissao = grupo.contas.filter(conta => {
            const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
            return usuarioPermissoes[chaveArmazenamento] === true;
        });

        // Filtrar por pesquisa
        if (termoPesquisa.trim()) {
            const termoLower = termoPesquisa.toLowerCase();
            contasComPermissao = contasComPermissao.filter(conta => {
                return conta.id.toString().toLowerCase().includes(termoLower) ||
                       conta.descricao.toLowerCase().includes(termoLower);
            });
        }

        // Se não houver contas com permissão, pula o grupo inteiro
        if (contasComPermissao.length === 0) {
            return;
        }

        gruposExibidos++;
        contasExibidas += contasComPermissao.length;

        // Linha do grupo
        const grupoRow = document.createElement('tr');
        grupoRow.className = 'grupo-row';
        grupoRow.innerHTML = `
            <td style="display:flex;align-items:center;gap:6px;font-weight:bold;">
                <button type="button" class="btn-acao" style="padding:2px 7px;" title="Expandir/Minimizar" onclick="window.toggleGrupo(${grupoIdx})">
                    <i class='bx ${gruposExpandidos[grupoIdx] ? 'bx-expand-alt' : 'bx-expand'}'></i>
                </button>
                ${grupo.grupo}
            </td>
            <td></td>
            ${MESES.map(() => '<td style="background-color:#1a3263;"></td>').join('')}
            <td style="background-color:#1a3263;font-weight:bold;text-align:center;">Total</td>
        `;
        tabelaBody.appendChild(grupoRow);

        // Contas do grupo (se expandido e com permissão)
        if (gruposExpandidos[grupoIdx]) {
            contasComPermissao.forEach((conta, contaIdx) => {
                const contaId = `${grupoIdx}_${contaIdx}`;
                const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
                const valores = planejamentoData[chaveArmazenamento] || {};

                const contaRow = document.createElement('tr');
                contaRow.className = `grupo-contas-${grupoIdx}`;
                contaRow.dataset.contaId = contaId;
                
                let html = `
                    <td style="padding-left:40px;">
                        ${conta.id}
                        <span class="badge-permissao liberado">Liberado</span>
                    </td>
                    <td>${conta.descricao}</td>
                `;

                // Adicionar campos para cada mês
                MESES.forEach((mes, mesIdx) => {
                    const valor = valores[mesIdx] || '';
                    html += `
                        <td>
                            <input 
                                type="number" 
                                step="0.01"
                                class="valor-mes" 
                                value="${valor}" 
                                data-grupo="${grupoIdx}" 
                                data-conta="${contaIdx}" 
                                data-mes="${mesIdx}"
                                onchange="window.atualizarValor(this, '${chaveArmazenamento}')">
                        </td>
                    `;
                });

                // Total
                const total = Object.values(valores).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
                html += `<td style="font-weight:bold;text-align:center;">${total.toFixed(2)}</td>`;

                contaRow.innerHTML = html;
                tabelaBody.appendChild(contaRow);
            });
        }
    });

    console.log(`✅ Tabela renderizada: ${gruposExibidos} grupos, ${contasExibidas} contas exibidas`);
    
    // Registrar eventos dos botões
    registrarEventos();
}

// ===== RENDERIZAR TABELA CONSOLIDADA (MODO GERAL) =====
function renderTabelaConsolidada() {
    console.log('📊 Renderizando tabela CONSOLIDADA - Uma linha por conta, com SOMAS...');
    console.log('👁️ Geral Visualizar:', geralVisualizar, '| ✏️ Geral Editar:', geralEditar);
    const tabelaBody = document.getElementById('tabela-body');
    
    // Esconder botão expandir/minimizar do modo normal
    const btnExpandirTudo = document.getElementById('btn-expandir-tudo');
    if (btnExpandirTudo) {
        btnExpandirTudo.style.display = 'none';
    }

    // Renderizar por grupos (uma única vez) - MOSTRA TODAS as contas, sem filtrar
    gruposContas.forEach((grupo, grupoIdx) => {
        // Em modo Geral, mostra TODAS as contas (sem filtrar por permissão)
        const contasParaMostrar = grupo.contas;

        if (contasParaMostrar.length === 0) return;

        // Filtrar contas baseado na pesquisa
        const contasFiltradas = contasParaMostrar.filter(conta => {
            const termoLower = termoPesquisa.toLowerCase();
            return conta.id.toString().toLowerCase().includes(termoLower) ||
                   conta.descricao.toLowerCase().includes(termoLower);
        });

        // Se nenhuma conta corresponde à pesquisa, pular grupo
        if (contasFiltradas.length === 0 && termoPesquisa) return;

        // Linha do grupo (exibido apenas uma vez)
        const grupoRow = document.createElement('tr');
        grupoRow.className = 'grupo-row';
        grupoRow.innerHTML = `
            <td style="display:flex;align-items:center;gap:6px;font-weight:bold;">
                <button type="button" class="btn-acao" style="padding:2px 7px;" title="Expandir/Minimizar" onclick="window.toggleGrupo(${grupoIdx})">
                    <i class='bx ${todosGruposExpandidos ? 'bx-expand-alt' : 'bx-expand'}'></i>
                </button>
                <i class='bx bx-folder'></i> ${grupo.grupo}
            </td>
            <td></td>
            ${MESES.map(() => '<td style="background-color:#1a3263;"></td>').join('')}
            <td style="background-color:#1a3263;font-weight:bold;text-align:center;">Total</td>
        `;
        tabelaBody.appendChild(grupoRow);

        // Para cada conta - MOSTRA UMA ÚNICA LINHA com soma de todos os departamentos
        contasFiltradas.forEach((conta, contaIdx) => {
            const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
            const grupoContainerId = `grupo-contas-${grupoIdx}`;

            const contaRow = document.createElement('tr');
            contaRow.className = `conta-row ${grupoContainerId}`;
            contaRow.style.backgroundColor = '#ffffff';
            contaRow.style.display = todosGruposExpandidos ? 'table-row' : 'none';
            
            let html = `
                <td style="padding-left:40px;font-size:0.9em;">
                    ${conta.id}
                    <span class="badge-permissao liberado">Consolidado</span>
                </td>
                <td style="font-size:0.9em;">${conta.descricao}</td>
            `;

            // Campos para cada mês - SOMA de todos os departamentos
            let somaGeral = 0;
            MESES.forEach((mes, mesIdx) => {
                let somaDoMes = 0;
                
                // Somar este mês em TODOS os departamentos
                departamentosDisponsiveis.forEach((departamento) => {
                    const chaveConsolidada = `${departamento}__${chaveArmazenamento}`;
                    const valores = planejamentoData[chaveConsolidada] || {};
                    const valor = parseFloat(valores[mesIdx]) || 0;
                    somaDoMes += valor;
                });

                somaGeral += somaDoMes;

                // Campo readonly se não tiver permissão de editar
                const readonly = !geralEditar ? 'readonly' : '';
                const bgColor = !geralEditar ? '#f9f9f9' : '#ffffff';
                
                html += `
                    <td>
                        <input 
                            type="number" 
                            step="0.01"
                            class="valor-mes" 
                            value="${somaDoMes.toFixed(2)}" 
                            data-chave="${chaveArmazenamento}" 
                            data-mes="${mesIdx}"
                            data-soma="true"
                            ${readonly}
                            style="background-color: ${bgColor}; font-weight: bold; text-align: center;">
                    </td>
                `;
            });

            // Total geral (soma de tudo)
            html += `<td style="font-weight:bold;text-align:center;background-color:#e8e8e8;font-size:0.9em;">${somaGeral.toFixed(2)}</td>`;

            contaRow.innerHTML = html;
            tabelaBody.appendChild(contaRow);
        });
    });

    console.log(`✅ Tabela CONSOLIDADA COM SOMAS renderizada - Uma linha por conta`);
    registrarEventos();
}

// ===== FUNÇÕES GLOBAIS =====
window.toggleGrupo = function(grupoIdx) {
    gruposExpandidos[grupoIdx] = !gruposExpandidos[grupoIdx];
    renderTabela();
};

// ===== MOSTRAR TOAST =====
function mostrarToast(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const icone = tipo === 'success' ? 'bx-check-circle' : 'bx-x-circle';
    const cor = tipo === 'success' ? '#27ae60' : '#e74c3c';
    
    toast.innerHTML = `
        <i class='bx ${icone}' style="color: ${cor};"></i>
        <span>${mensagem}</span>
    `;
    
    toast.style.borderLeftColor = cor;
    
    container.appendChild(toast);
    
    // Remover toast após 3 segundos
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

window.atualizarValor = async function(input, chaveArmazenamento) {
    const mesIdx = parseInt(input.dataset.mes);
    const novoValor = parseFloat(input.value) || 0;
    const valorAnterior = planejamentoData[chaveArmazenamento]?.[mesIdx] || 0;
    
    if (!planejamentoData[chaveArmazenamento]) {
        planejamentoData[chaveArmazenamento] = {};
    }
    
    planejamentoData[chaveArmazenamento][mesIdx] = novoValor;
    console.log(`✏️ Valor atualizado: ${chaveArmazenamento}[Mês ${mesIdx + 1}] = ${novoValor}`);
    
    // Registrar no histórico
    try {
        const ano = new Date().getFullYear();
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamentoSelecionado}_${filiaSelecionada}`, "historico");
        
        const partes = chaveArmazenamento.split('_');
        const grupo = partes[0];
        const conta = partes[1];
        
        // Buscar nome do usuário
        let nomeUsuario = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || usuarioId;
        
        await addDoc(historicoRef, {
            timestamp: new Date().getTime(),
            usuarioId: usuarioId,
            usuario: nomeUsuario,
            grupo: grupo,
            conta: conta,
            mes: meses[mesIdx],
            valorAnterior: valorAnterior,
            novoValor: novoValor,
            diferenca: novoValor - valorAnterior
        });
        
        // Salvar no Firebase
        const ano2 = new Date().getFullYear();
        const chaveDoc = `${ano2}_${departamentoSelecionado}_${filiaSelecionada}`;
        await setDoc(doc(db, 'planejamento_preenchido', chaveDoc), {
            ano: ano2,
            departamento: departamentoSelecionado,
            filial: filiaSelecionada,
            usuarioId,
            dados: planejamentoData,
            dataSalva: new Date(),
            timestamp: new Date().getTime()
        });
        
        // Mostrar toast de sucesso
        mostrarToast('Salvo com sucesso');
        
    } catch (error) {
        console.error('⚠️ Erro ao atualizar:', error);
        mostrarToast('Erro ao salvar', 'error');
    }
    
    // Recalcular total
    renderTabela();
};

// ===== ATUALIZAR VALOR NO MODO CONSOLIDADO =====
window.atualizarValorConsolidado = async function(input, chaveConsolidada, departamento, chaveArmazenamento) {
    const mesIdx = parseInt(input.dataset.mes);
    const novoValor = parseFloat(input.value) || 0;
    const valorAnterior = planejamentoData[chaveConsolidada]?.[mesIdx] || 0;
    
    if (!planejamentoData[chaveConsolidada]) {
        planejamentoData[chaveConsolidada] = {};
    }
    
    planejamentoData[chaveConsolidada][mesIdx] = novoValor;
    console.log(`✏️ Valor consolidado atualizado: ${chaveConsolidada}[Mês ${mesIdx + 1}] = ${novoValor}`);
    
    try {
        const ano = new Date().getFullYear();
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        // Registrar no histórico do departamento específico
        const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamento}_${filiaSelecionada}`, "historico");
        
        const partes = chaveArmazenamento.split('_');
        const grupo = partes[0];
        const conta = partes[1];
        
        let nomeUsuario = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || usuarioId;
        
        await addDoc(historicoRef, {
            timestamp: new Date().getTime(),
            usuarioId: usuarioId,
            usuario: nomeUsuario,
            grupo: grupo,
            conta: conta,
            mes: meses[mesIdx],
            valorAnterior: valorAnterior,
            novoValor: novoValor,
            diferenca: novoValor - valorAnterior,
            fonte: 'GERAL_CONSOLIDADO'
        });
        
        // Salvar no documento específico do departamento
        const chaveDoc = `${ano}_${departamento}_${filiaSelecionada}`;
        const docRef = doc(db, 'planejamento_preenchido', chaveDoc);
        const docSnap = await getDoc(docRef);
        
        let dadosDepartamento = docSnap.exists() ? (docSnap.data().dados || {}) : {};
        
        // Atualizar apenas a chave específica (removendo prefixo do departamento se houver)
        dadosDepartamento[chaveArmazenamento] = dadosDepartamento[chaveArmazenamento] || {};
        dadosDepartamento[chaveArmazenamento][mesIdx] = novoValor;
        
        // Salvar os dados do departamento específico
        await setDoc(docRef, {
            ano: ano,
            departamento: departamento,
            filial: filiaSelecionada,
            usuarioId,
            dados: dadosDepartamento,
            dataSalva: new Date(),
            timestamp: new Date().getTime()
        });
        
        console.log(`✅ Salvo em ${departamento} via GERAL consolidado`);
        mostrarToast('Salvo com sucesso');
        
    } catch (error) {
        console.error('⚠️ Erro ao atualizar valor consolidado:', error);
        mostrarToast('Erro ao salvar', 'error');
    }
    
    // Recalcular total
    renderTabela();
};

// ===== REGISTRAR EVENTOS =====
function registrarEventos() {
    const btnLimpar = document.getElementById('btn-limpar');
    if (btnLimpar) {
        btnLimpar.removeEventListener('click', limparFormulario);
        btnLimpar.addEventListener('click', limparFormulario);
        
        // Esconder botão Limpar se está em modo GERAL sem permissão de editar
        if (departamentoSelecionado === 'GERAL' && !geralEditar) {
            btnLimpar.style.display = 'none';
        } else {
            btnLimpar.style.display = 'block';
        }
    }

    const form = document.getElementById('form-planejamento');
    const btnSalvar = form?.querySelector('button[type="submit"]');
    if (form) {
        form.removeEventListener('submit', salvarPlanejamento);
        form.addEventListener('submit', salvarPlanejamento);
    }
    
    // Esconder botão Salvar se está em modo GERAL sem permissão de editar
    if (btnSalvar) {
        if (departamentoSelecionado === 'GERAL' && !geralEditar) {
            btnSalvar.style.display = 'none';
        } else {
            btnSalvar.style.display = 'block';
        }
    }

    const btnVoltar = document.getElementById('btn-voltar-filial');
    if (btnVoltar) {
        btnVoltar.removeEventListener('click', voltarParaSelecao);
        btnVoltar.addEventListener('click', voltarParaSelecao);
    }

    const btnExpandirTabela = document.getElementById('btn-expandir-tudo');
    if (btnExpandirTabela) {
        btnExpandirTabela.removeEventListener('click', toggleTodos);
        btnExpandirTabela.addEventListener('click', toggleTodos);
    }

    const btnHistorico = document.getElementById('btn-historico');
    if (btnHistorico) {
        btnHistorico.removeEventListener('click', verHistorico);
        btnHistorico.addEventListener('click', verHistorico);
    }

    // Registrar eventos de pesquisa e expandir/minimizar
    const inputPesquisa = document.getElementById('input-pesquisa-planejamento');
    if (inputPesquisa) {
        // Remover listener anterior (se existir)
        if (inputPesquisa.__pesquisaListener) {
            inputPesquisa.removeEventListener('keyup', inputPesquisa.__pesquisaListener);
        }
        
        // Criar nova função de listener e armazená-la para removê-la depois
        inputPesquisa.__pesquisaListener = function(e) {
            window.atualizarPesquisa(e.target.value);
        };
        
        inputPesquisa.addEventListener('keyup', inputPesquisa.__pesquisaListener);
    }

    const btnExpandirTodos = document.getElementById('btn-expandir-todos-grupos');
    if (btnExpandirTodos) {
        btnExpandirTodos.removeEventListener('click', toggleExpandirTodos);
        btnExpandirTodos.addEventListener('click', toggleExpandirTodos);
    }

    // Ano removido - usa automaticamente o ano atual
}

// ===== VOLTAR PARA SELEÇÃO DE FILIAL =====
function voltarParaSelecao() {
    departamentoSelecionado = null;
    filiaSelecionada = null;
    planejamentoData = {};
    gruposExpandidos = {};
    
    // Esconder tela de planejamento
    const telaplanejamento = document.getElementById('tela-planejamento');
    if (telaplanejamento) {
        telaplanejamento.style.display = 'none';
    }
    
    // Voltar para seleção de departamento
    mostrarTelaSelecaoDepartamento();
}

// ===== PESQUISA E FILTRO =====
let debounceTimer = null;

window.atualizarPesquisa = function(termo) {
    termoPesquisa = termo;
    console.log('🔍 Pesquisando por:', termo);
    
    // Usar debounce para evitar múltiplas renderizações
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
        renderTabela();
    }, 300); // Esperar 300ms após parar de digitar
};

// ===== EXPANDIR/MINIMIZAR GRUPOS =====
function toggleExpandirTodos() {
    todosGruposExpandidos = !todosGruposExpandidos;
    console.log('🔄 Expandir/Minimizar tudo:', todosGruposExpandidos);
    
    // Atualizar texto e ícone do botão
    const btnExpandirTodos = document.getElementById('btn-expandir-todos-grupos');
    if (btnExpandirTodos) {
        const icon = btnExpandirTodos.querySelector('i');
        const texto = btnExpandirTodos.querySelector('span');
        if (todosGruposExpandidos) {
            icon.className = 'bx bx-collapse';
            texto.textContent = 'Minimizar Tudo';
        } else {
            icon.className = 'bx bx-expand';
            texto.textContent = 'Expandir Tudo';
        }
    }
    
    renderTabela();
}

window.toggleGrupo = function(grupoIdx) {
    const grupoContainer = document.querySelectorAll(`.grupo-contas-${grupoIdx}`);
    const isVisible = grupoContainer[0]?.style.display !== 'none';
    
    grupoContainer.forEach(el => {
        el.style.display = isVisible ? 'none' : 'table-row';
    });
    
    console.log(`📁 Grupo ${grupoIdx} ${isVisible ? 'minimizado' : 'expandido'}`);
};

// ===== VER HISTÓRICO =====
async function verHistorico() {
    try {
        const ano = new Date().getFullYear();
        let snapshot;
        
        // Se está em modo GERAL, buscar históricos de todos os departamentos
        if (departamentoSelecionado === 'GERAL') {
            console.log('📋 Carregando histórico CONSOLIDADO de todos departamentos');
            
            let todosDocumentos = [];
            for (const departamento of departamentosDisponsiveis) {
                const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamento}_${filiaSelecionada}`, "historico");
                const snap = await getDocs(historicoRef);
                snap.forEach((doc) => {
                    todosDocumentos.push({
                        timestamp: doc.data().timestamp,
                        departamento: departamento,
                        data: doc.data()
                    });
                });
            }
            
            if (todosDocumentos.length === 0) {
                Swal.fire('Histórico', 'Nenhuma alteração registrada', 'info');
                return;
            }
        } else {
            console.log('📋 Carregando histórico para:', `${ano}_${departamentoSelecionado}_${filiaSelecionada}`);
            
            // Buscar histórico de mudanças para este departamento e filial
            const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamentoSelecionado}_${filiaSelecionada}`, "historico");
            snapshot = await getDocs(historicoRef);
            
            console.log('✅ Snapshot obtido, documentos:', snapshot.size);
            
            if (snapshot.empty) {
                Swal.fire('Histórico', 'Nenhuma alteração registrada', 'info');
                return;
            }
        }
        
        const htmlOpcoes = `
            <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px;">
                <button type="button" style="padding: 10px 20px; background: #033ca7; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Ver Todo o Histórico
                </button>
                <button type="button" style="padding: 10px 20px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Destacar 10 Últimas Alterações
                </button>
            </div>
        `;
        
        Swal.fire({
            title: 'Histórico de Alterações',
            html: htmlOpcoes,
            icon: 'info',
            confirmButtonText: 'Fechar',
            didOpen: () => {
                const btns = Swal.getHtmlContainer().querySelectorAll('button');
                
                // Botão "Ver Todo o Histórico"
                btns[0].onclick = () => {
                    Swal.close();
                    mostrarTodoHistorico();
                };
                
                // Botão "Destacar Últimas Alterações"
                btns[1].onclick = () => {
                    Swal.close();
                    destacarUltimasAlteracoes();
                };
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar histórico:', error);
        Swal.fire('Aviso', 'Nenhum histórico disponível para este planejamento', 'info');
    }
}

async function mostrarTodoHistorico() {
    try {
        const ano = new Date().getFullYear();
        
        let documentos = [];
        
        // Se está em modo GERAL, buscar de todos os departamentos
        if (departamentoSelecionado === 'GERAL') {
            for (const departamento of departamentosDisponsiveis) {
                const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamento}_${filiaSelecionada}`, "historico");
                const snapshot = await getDocs(historicoRef);
                
                snapshot.forEach((doc) => {
                    documentos.push({
                        timestamp: doc.data().timestamp,
                        departamento: departamento,
                        data: doc.data()
                    });
                });
            }
        } else {
            const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamentoSelecionado}_${filiaSelecionada}`, "historico");
            const snapshot = await getDocs(historicoRef);
            
            snapshot.forEach((doc) => {
                documentos.push({
                    timestamp: doc.data().timestamp,
                    data: doc.data()
                });
            });
        }
        
        let htmlHistorico = `
            <div style="text-align: left; max-height: 500px; overflow-y: auto;">
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f0f0f0;">
                            <th style="padding: 8px; border: 1px solid #ddd;">Data/Hora</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Usuário</th>
                            ${departamentoSelecionado === 'GERAL' ? '<th style="padding: 8px; border: 1px solid #ddd;">Departamento</th>' : ''}
                            <th style="padding: 8px; border: 1px solid #ddd;">Grupo</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Conta</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Mês</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Valor Anterior</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Novo Valor</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let totalMudancas = 0;
        
        // Ordenar por timestamp decrescente
        documentos.sort((a, b) => b.timestamp - a.timestamp);
        
        documentos.forEach((item) => {
            const mudanca = item.data;
            const dataHora = new Date(mudanca.timestamp).toLocaleString('pt-BR');
            
            htmlHistorico += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${dataHora}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>${mudanca.usuario || 'Usuário'}</strong></td>
                    ${departamentoSelecionado === 'GERAL' ? `<td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;"><strong>${item.departamento}</strong></td>` : ''}
                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${mudanca.grupo || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${mudanca.conta || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${mudanca.mes || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${mudanca.valorAnterior || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${mudanca.novoValor || '-'}</td>
                </tr>
            `;
            totalMudancas++;
        });
        
        htmlHistorico += `
                    </tbody>
                </table>
            </div>
            <p style="text-align: center; color: #666; margin-top: 10px;">Total: ${totalMudancas} alterações</p>
        `;
        
        Swal.fire({
            title: 'Histórico Completo de Alterações',
            html: htmlHistorico,
            icon: 'info',
            width: '900px',
            confirmButtonText: 'Fechar'
        });
    } catch (error) {
        console.error('❌ Erro:', error);
        Swal.fire('Erro', 'Erro ao carregar histórico', 'error');
    }
}

async function destacarUltimasAlteracoes() {
    try {
        const ano = new Date().getFullYear();
        let documentos = [];
        
        // Se está em modo GERAL, buscar de todos os departamentos
        if (departamentoSelecionado === 'GERAL') {
            for (const departamento of departamentosDisponsiveis) {
                const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamento}_${filiaSelecionada}`, "historico");
                const snapshot = await getDocs(historicoRef);
                
                snapshot.forEach((doc) => {
                    documentos.push({
                        timestamp: doc.data().timestamp,
                        departamento: departamento,
                        data: doc.data()
                    });
                });
            }
        } else {
            const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamentoSelecionado}_${filiaSelecionada}`, "historico");
            const snapshot = await getDocs(historicoRef);
            
            snapshot.forEach((doc) => {
                documentos.push({
                    timestamp: doc.data().timestamp,
                    data: doc.data()
                });
            });
        }
        
        // Ordenar por timestamp decrescente e pegar últimas 10
        documentos.sort((a, b) => b.timestamp - a.timestamp);
        const ultimas10 = documentos.slice(0, 10);
        
        // Limpar destaques anteriores
        document.querySelectorAll('.campo-alterado-historico').forEach(el => {
            el.classList.remove('campo-alterado-historico');
        });
        
        // Destacar os campos das últimas alterações
        ultimas10.forEach((item) => {
            const mudanca = item.data;
            if (mudanca.grupo && mudanca.grupo !== 'SISTEMA') {
                const mesIndex = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].indexOf(mudanca.mes);
                
                if (mesIndex >= 0) {
                    // Em modo GERAL, procurar pelo departamento também
                    if (departamentoSelecionado === 'GERAL') {
                        const chaveConsolidada = `${item.departamento}__${mudanca.grupo}_${mudanca.conta}`;
                        const inputs = document.querySelectorAll(`input[data-mes="${mesIndex}"]`);
                        inputs.forEach(input => {
                            // Encontrar se este input está relacionado à chave consolidada
                            if (input.getAttribute('data-departamento') === item.departamento) {
                                input.classList.add('campo-alterado-historico');
                            }
                        });
                    } else {
                        const chaveArmazenamento = `${mudanca.grupo}_${mudanca.conta}`;
                        const inputs = document.querySelectorAll(`input[data-mes="${mesIndex}"]`);
                        inputs.forEach(input => {
                            const dataGrupo = input.parentElement.parentElement.querySelector('td').textContent;
                            if (dataGrupo.includes(mudanca.conta)) {
                                input.classList.add('campo-alterado-historico');
                            }
                        });
                    }
                }
            }
        });
        
        Swal.fire({
            title: '10 Últimas Alterações Destacadas',
            text: `${ultimas10.length} campos foram destacados em laranja na tabela`,
            icon: 'success',
            confirmButtonText: 'Entendi'
        });
    } catch (error) {
        console.error('❌ Erro:', error);
        Swal.fire('Erro', 'Erro ao destacar alterações', 'error');
    }
}

// ===== RECARREGAR PLANEJAMENTO =====
async function recarregarPlanejamento() {
    await carregarPlanejamento();
    renderTabela();
}

// ===== TOGGLE TODOS OS GRUPOS (MODO NORMAL) =====
function toggleTodosGruposModoNormal() {
    todasExpandidas = !todasExpandidas;
    Object.keys(gruposExpandidos).forEach(idx => {
        gruposExpandidos[idx] = todasExpandidas;
    });

    const btn = document.getElementById('btn-expandir-tudo');
    if (btn) {
        const icon = btn.querySelector('i');
        if (todasExpandidas) {
            btn.innerHTML = "<i class='bx bx-collapse-alt'></i>";
            btn.title = 'Minimizar Tudo';
        } else {
            btn.innerHTML = "<i class='bx bx-expand-alt'></i>";
            btn.title = 'Expandir Tudo';
        }
    }
    
    renderTabela();
}

// ===== TOGGLE TODOS OS GRUPOS =====
function toggleTodos() {
    todasExpandidas = !todasExpandidas;
    Object.keys(gruposExpandidos).forEach(idx => {
        gruposExpandidos[idx] = todasExpandidas;
    });

    const btn = document.getElementById('btn-minimizar-tudo');
    if (btn) {
        if (todasExpandidas) {
            btn.innerHTML = "<i class='bx bx-collapse-alt'></i> Minimizar Tudo";
        } else {
            btn.innerHTML = "<i class='bx bx-expand-alt'></i> Expandir Tudo";
        }
    }
    
    renderTabela();
}

// ===== LIMPAR FORMULÁRIO =====
function limparFormulario() {
    Swal.fire({
        title: 'Limpar Formulário?',
        text: 'Todos os valores serão apagados. Esta ação não pode ser desfeita.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, limpar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // Registrar limpeza no histórico
            try {
                const ano = new Date().getFullYear();
                let nomeUsuario = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || usuarioId;
                
                // Se está em modo GERAL, registrar em todos os departamentos
                if (departamentoSelecionado === 'GERAL') {
                    for (const departamento of departamentosDisponsiveis) {
                        const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamento}_${filiaSelecionada}`, "historico");
                        
                        await addDoc(historicoRef, {
                            timestamp: new Date().getTime(),
                            usuarioId: usuarioId,
                            usuario: nomeUsuario,
                            grupo: 'SISTEMA',
                            conta: 'LIMPEZA_GERAL',
                            mes: '-',
                            valorAnterior: '-',
                            novoValor: '-',
                            acao: 'Formulário GERAL limpo',
                            fonte: 'GERAL_CONSOLIDADO'
                        });
                    }
                } else {
                    const historicoRef = collection(db, "planejamento_preenchido", `${ano}_${departamentoSelecionado}_${filiaSelecionada}`, "historico");
                    
                    await addDoc(historicoRef, {
                        timestamp: new Date().getTime(),
                        usuarioId: usuarioId,
                        usuario: nomeUsuario,
                        grupo: 'SISTEMA',
                        conta: 'LIMPEZA_GERAL',
                        mes: '-',
                        valorAnterior: '-',
                        novoValor: '-',
                        acao: 'Formulário limpo completamente'
                    });
                }
            } catch (error) {
                console.error('⚠️ Erro ao registrar limpeza no histórico:', error);
            }
            
            planejamentoData = {};
            renderTabela();
            Swal.fire('Sucesso!', 'Formulário limpo', 'success');
        }
    });
}

// ===== SALVAR PLANEJAMENTO =====
async function salvarPlanejamento(e) {
    e.preventDefault();

    try {
        const ano = new Date().getFullYear();

        if (!departamentoSelecionado || !filiaSelecionada) {
            mostrarToast('Selecione departamento e filial', 'error');
            return;
        }

        const dataAtual = new Date();

        // Se está em modo GERAL, salvar em todos os departamentos
        if (departamentoSelecionado === 'GERAL') {
            console.log('💾 Salvando GERAL em todos os departamentos...');
            
            for (const departamento of departamentosDisponsiveis) {
                const chaveDoc = `${ano}_${departamento}_${filiaSelecionada}`;
                
                // Filtrar dados apenas deste departamento
                const dadosDepartamento = {};
                Object.keys(planejamentoData).forEach(chave => {
                    if (chave.startsWith(`${departamento}__`)) {
                        const novaChave = chave.replace(`${departamento}__`, '');
                        dadosDepartamento[novaChave] = planejamentoData[chave];
                    }
                });
                
                await setDoc(doc(db, 'planejamento_preenchido', chaveDoc), {
                    ano: parseInt(ano),
                    departamento: departamento,
                    filial: filiaSelecionada,
                    usuarioId,
                    dados: dadosDepartamento,
                    dataSalva: dataAtual,
                    timestamp: dataAtual.getTime()
                });
                
                console.log(`✅ ${departamento} salvo`);
            }
            
            mostrarToast('Planejamento GERAL salvo em todos departamentos');
            return;
        }

        // Modo normal - salvar apenas o departamento selecionado
        const chaveDoc = `${ano}_${departamentoSelecionado}_${filiaSelecionada}`;

        await setDoc(doc(db, 'planejamento_preenchido', chaveDoc), {
            ano: parseInt(ano),
            departamento: departamentoSelecionado,
            filial: filiaSelecionada,
            usuarioId,
            dados: planejamentoData,
            dataSalva: dataAtual,
            timestamp: dataAtual.getTime()
        });

        mostrarToast('Planejamento salvo com sucesso');
        console.log('✅ Planejamento salvo:', chaveDoc);
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        mostrarToast('Erro ao salvar', 'error');
    }
}

// Exportar funções globais
window.atualizarValor = window.atualizarValor;
window.toggleGrupo = window.toggleGrupo;
