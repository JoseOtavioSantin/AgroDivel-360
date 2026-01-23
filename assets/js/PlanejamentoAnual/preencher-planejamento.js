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
let telaAtual = 'departamento'; // 'departamento', 'subdepartamento', 'filial'
let filiaisSelecionadasGeral = []; // Filiais selecionadas no modo GERAL
let departamentosSelecionadosGeral = []; // Departamentos selecionados no filtro (modo GERAL)
let podeEditarFormulas = false; // Permissão para editar fórmulas
let formulasContas = {}; // Armazenamento de fórmulas: { "Grupo_ContaID": "=CONTA_123 * 0.0165" }

// Meses do ano
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ===== FUNÇÕES DE LOADING =====
function mostrarLoading(texto = 'Carregando dados...', subtexto = 'Por favor, aguarde') {
    const overlay = document.getElementById('loading-overlay');
    const textoEl = overlay.querySelector('.loading-text');
    const subtextoEl = overlay.querySelector('.loading-subtext');
    
    if (textoEl) textoEl.textContent = texto;
    if (subtextoEl) subtextoEl.textContent = subtexto;
    
    overlay.classList.add('ativo');
}

function esconderLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('ativo');
}

// ===== ESTRUTURA HIERÁRQUICA DE DEPARTAMENTOS =====
const ESTRUTURA_DEPARTAMENTOS = {
    'Vendas': {
        'Novos': null,
        'Usados': null
    },
    'Pós-vendas': {
        'Peças': null,
        'Serviços': null,
        'PLM': null
    },
    'ADM': {
        'IF': null,
        'CTB CONTR': null,
        'FINAN': null,
        'MARKTING': null,
        'COMPRAS': null,
        'RH/DP': null
    }
};

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
                await carregarFormulas();
                
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
            podeEditarFormulas = dados.podeEditarFormulas || false; // Nova permissão
            
            console.log('✅ Permissões carregadas:', {
                departamentos: departamentosDisponsiveis,
                filiais: filiaisDisponiveis,
                geral: { visualizar: geralVisualizar, editar: geralEditar },
                podeEditarFormulas: podeEditarFormulas,
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
            podeEditarFormulas = false;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar permissões:', error);
        usuarioPermissoes = {};
        departamentosDisponsiveis = [];
        filiaisDisponiveis = [];
        geralVisualizar = false;
        geralEditar = false;
        podeEditarFormulas = false;
    }
}

// ===== CARREGAR FÓRMULAS SALVAS =====
async function carregarFormulas() {
    try {
        const docRef = doc(db, 'planejamento_formulas', 'formulas_globais');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            formulasContas = docSnap.data().formulas || {};
            console.log('✅ Fórmulas carregadas:', Object.keys(formulasContas).length);
        } else {
            formulasContas = {};
            console.log('ℹ️ Nenhuma fórmula configurada');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar fórmulas:', error);
        formulasContas = {};
    }
}

// ===== SALVAR FÓRMULAS =====
async function salvarFormulas() {
    if (!podeEditarFormulas) {
        Swal.fire('Erro', 'Você não tem permissão para editar fórmulas', 'error');
        return;
    }
    
    try {
        await setDoc(doc(db, 'planejamento_formulas', 'formulas_globais'), {
            formulas: formulasContas,
            ultimaAtualizacao: new Date(),
            usuarioAtualizacao: usuarioId
        });
        
        console.log('✅ Fórmulas salvas');
        mostrarToast('Fórmulas salvas com sucesso');
    } catch (error) {
        console.error('❌ Erro ao salvar fórmulas:', error);
        Swal.fire('Erro', 'Erro ao salvar fórmulas', 'error');
    }
}

// ===== SISTEMA DE FÓRMULAS =====
// Avaliar fórmula e calcular valor
function avaliarFormula(formula, chaveConta, mesIdx) {
    try {
        console.log(`\n🧮 ===== AVALIANDO FÓRMULA =====`);
        console.log(`📝 Conta: ${chaveConta}, Mês: ${mesIdx}`);
        console.log(`📐 Fórmula original: ${formula}`);
        
        // Remove o sinal de igual
        formula = formula.trim();
        if (formula.startsWith('=')) {
            formula = formula.substring(1);
        }
        
        // Substituir referências a contas pelo valor real
        // Ex: "CONTA_123 * 0.0165" ou "Grupo_123 * 1.65%"
        const regexConta = /([A-Za-z0-9_]+)/g;
        let formulaProcessada = formula;
        
        // Substituir percentuais por decimais (ex: 1,65% -> 0.0165)
        formulaProcessada = formulaProcessada.replace(/(\d+[,.]?\d*)\s*%/g, (match, num) => {
            const decimal = (parseFloat(num.replace(',', '.')) / 100).toString();
            console.log(`📊 Percentual convertido: ${match} -> ${decimal}`);
            return decimal;
        });
        
        console.log(`📐 Após conversão de %: ${formulaProcessada}`);
        
        // Substituir referências de contas
        formulaProcessada = formulaProcessada.replace(regexConta, (match) => {
            // Se for um número, deixar como está
            if (!isNaN(match)) {
                console.log(`🔢 Número mantido: ${match}`);
                return match;
            }
            
            // Se for operador, deixar como está
            if (['+', '-', '*', '/', '(', ')'].includes(match)) {
                console.log(`➕ Operador mantido: ${match}`);
                return match;
            }
            
            // Buscar valor da conta referenciada
            console.log(`🔎 Buscando valor para referência: ${match}`);
            const valorConta = buscarValorConta(match, mesIdx);
            console.log(`💰 Valor encontrado: ${valorConta}`);
            return valorConta !== null ? valorConta : '0';
        });
        
        console.log(`📐 Fórmula processada: ${formulaProcessada}`);
        
        // Avaliar expressão matemática
        // IMPORTANTE: eval é perigoso, mas aqui está controlado
        const resultado = eval(formulaProcessada);
        
        console.log(`✅ Resultado final: ${resultado}`);
        console.log(`===== FIM AVALIAÇÃO =====\n`);
        
        return isNaN(resultado) ? 0 : parseFloat(resultado.toFixed(2));
        
    } catch (error) {
        console.error('❌ Erro ao avaliar fórmula:', formula, error);
        return 0;
    }
}

// Buscar valor de uma conta específica
function buscarValorConta(identificador, mesIdx) {
    console.log(`🔍 Buscando valor de: "${identificador}" para mês ${mesIdx}`);
    console.log(`📋 Chaves disponíveis em planejamentoData:`, Object.keys(planejamentoData).slice(0, 10));
    
    // Procurar em planejamentoData
    // Formato pode ser "Grupo_ContaID" ou só "ContaID" ou "CONTA_123"
    
    // 1. Tentar busca direta pelo identificador completo
    if (planejamentoData[identificador] && planejamentoData[identificador][mesIdx] !== undefined) {
        const valor = parseFloat(planejamentoData[identificador][mesIdx]) || 0;
        console.log(`✅ Encontrado (busca direta): ${identificador} = ${valor}`);
        return valor;
    }
    
    // 2. Se o identificador é "CONTA_123", extrair só o número 123
    const matchConta = identificador.match(/CONTA[_-]?(\d+)/i);
    if (matchConta) {
        const idConta = matchConta[1];
        console.log(`🔢 Extraído ID da conta: ${idConta}`);
        
        // Buscar por chaves que terminam com esse ID
        for (const chave in planejamentoData) {
            // Verificar se a chave termina com _idConta
            if (chave.endsWith(`_${idConta}`) || chave === idConta) {
                const valor = planejamentoData[chave][mesIdx];
                if (valor !== undefined) {
                    const valorFinal = parseFloat(valor) || 0;
                    console.log(`✅ Encontrado: ${chave} = ${valorFinal}`);
                    return valorFinal;
                }
            }
        }
    }
    
    // 3. Tentar buscar por substring (última tentativa)
    for (const chave in planejamentoData) {
        if (chave.includes(identificador)) {
            const valor = planejamentoData[chave][mesIdx];
            if (valor !== undefined) {
                const valorFinal = parseFloat(valor) || 0;
                console.log(`✅ Encontrado (substring): ${chave} = ${valorFinal}`);
                return valorFinal;
            }
        }
    }
    
    console.log(`❌ Não encontrado valor para: ${identificador}`);
    return 0;
}

// Calcular valores de todas as contas com fórmulas
function calcularFormulas() {
    if (Object.keys(formulasContas).length === 0) {
        return; // Sem fórmulas configuradas
    }
    
    console.log('🧮 Calculando fórmulas automáticas...');
    
    for (const chaveConta in formulasContas) {
        const formula = formulasContas[chaveConta];
        
        // Calcular para cada mês
        for (let mesIdx = 0; mesIdx < 12; mesIdx++) {
            const valorCalculado = avaliarFormula(formula, chaveConta, mesIdx);
            
            // Atualizar planejamentoData
            if (!planejamentoData[chaveConta]) {
                planejamentoData[chaveConta] = {};
            }
            planejamentoData[chaveConta][mesIdx] = valorCalculado;
        }
    }
    
    console.log('✅ Fórmulas calculadas');
}

// Abrir modal para editar fórmula de uma conta
async function editarFormulaConta(chaveConta, nomeConta) {
    if (!podeEditarFormulas) {
        Swal.fire('Sem Permissão', 'Você não tem permissão para editar fórmulas', 'warning');
        return;
    }
    
    const formulaAtual = formulasContas[chaveConta] || '';
    
    // Extrair o ID numérico da chave se possível (ex: "Grupo_123" -> "123")
    const matchId = chaveConta.match(/_(\d+)$/);
    const idConta = matchId ? matchId[1] : chaveConta;
    
    const { value: novaFormula } = await Swal.fire({
        title: `Fórmula: ${nomeConta}`,
        html: `
            <div style="text-align: left; margin-bottom: 15px; background: #f0f0f0; padding: 12px; border-radius: 5px;">
                <p style="margin: 5px 0;"><strong>🔑 Chave da conta:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${chaveConta}</code></p>
                <p style="margin: 5px 0;"><strong>📊 Para referenciar:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">CONTA_${idConta}</code></p>
            </div>
            <div style="text-align: left; margin-bottom: 15px; font-size: 12px; color: #666;">
                <p><strong>💡 Como usar:</strong></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>Referências: <code>CONTA_${idConta}</code></li>
                    <li>Operadores: <code>+</code> <code>-</code> <code>*</code> <code>/</code> <code>(</code> <code>)</code></li>
                    <li>Percentuais: <code>1,65%</code> ou <code>1.65%</code></li>
                </ul>
                <p><strong>📝 Exemplo:</strong> <code>=CONTA_123 * 1,65%</code></p>
            </div>
            <input id="input-formula" class="swal2-input" placeholder="=CONTA_123 * 1,65%" value="${formulaAtual}" style="font-family: monospace;">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Salvar Fórmula',
        cancelButtonText: 'Cancelar',
        showDenyButton: formulaAtual ? true : false,
        denyButtonText: 'Remover Fórmula',
        preConfirm: () => {
            return document.getElementById('input-formula').value;
        }
    });
    
    if (novaFormula !== undefined) {
        if (novaFormula.trim()) {
            formulasContas[chaveConta] = novaFormula.trim();
            await salvarFormulas();
            calcularFormulas();
            atualizarCamposFormula();
            mostrarToast(`Fórmula configurada para ${nomeConta}`);
        }
    }
}

// Atualizar visualmente os campos que têm fórmulas
function atualizarCamposFormula() {
    for (const chaveConta in formulasContas) {
        const valores = planejamentoData[chaveConta];
        if (!valores) continue;
        
        // Atualizar cada campo de mês
        for (let mesIdx = 0; mesIdx < 12; mesIdx++) {
            const valor = valores[mesIdx];
            if (valor === undefined) continue;
            
            // Buscar input correspondente
            const inputs = document.querySelectorAll(`input[data-mes="${mesIdx}"]`);
            inputs.forEach(input => {
                // Verificar se é o input correto pela chave de armazenamento
                const onchangeAttr = input.getAttribute('onchange');
                if (onchangeAttr && onchangeAttr.includes(chaveConta)) {
                    input.value = parseFloat(valor).toFixed(2);
                }
            });
        }
    }
}

// Expor funções globalmente
window.editarFormulaConta = editarFormulaConta;

// Adicionar botão de gerenciar fórmulas no cabeçalho
function adicionarBotaoFormulas() {
    console.log('🔧 Tentando adicionar botão de fórmulas...', { podeEditarFormulas });
    
    if (!podeEditarFormulas) {
        console.log('❌ Usuário não tem permissão podeEditarFormulas');
        return;
    }
    
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) {
        console.log('❌ .header-actions não encontrado no DOM');
        return;
    }
    
    // Verificar se já existe
    if (document.getElementById('btn-formulas')) {
        console.log('ℹ️ Botão de fórmulas já existe');
        return;
    }
    
    const btnFormulas = document.createElement('button');
    btnFormulas.type = 'button';
    btnFormulas.className = 'btn-limpar-header';
    btnFormulas.id = 'btn-formulas';
    btnFormulas.title = 'Gerenciar Fórmulas';
    btnFormulas.innerHTML = '<i class="bx bx-math"></i> Fórmulas';
    btnFormulas.style.background = '#9b59b6';
    btnFormulas.onclick = mostrarInfoFormulas;
    
    // Inserir antes do botão de salvar
    const btnSalvar = headerActions.querySelector('.btn-salvar-header');
    headerActions.insertBefore(btnFormulas, btnSalvar);
    
    console.log('✅ Botão de fórmulas adicionado com sucesso!');
}

// Mostrar informações sobre fórmulas configuradas
async function mostrarInfoFormulas() {
    const totalFormulas = Object.keys(formulasContas).length;
    
    let listaHtml = '<div style="max-height: 400px; overflow-y: auto; text-align: left;">';
    
    if (totalFormulas === 0) {
        listaHtml += '<p style="text-align: center; color: #999;">Nenhuma fórmula configurada</p>';
    } else {
        listaHtml += '<table style="width: 100%; font-size: 13px;">';
        listaHtml += '<thead><tr><th>Conta</th><th>Fórmula</th><th>Ações</th></tr></thead><tbody>';
        
        for (const chaveConta in formulasContas) {
            const formula = formulasContas[chaveConta];
            listaHtml += `
                <tr>
                    <td><code>${chaveConta}</code></td>
                    <td><code>${formula}</code></td>
                    <td>
                        <button onclick="window.removerFormula('${chaveConta}')" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">
                            Remover
                        </button>
                    </td>
                </tr>
            `;
        }
        
        listaHtml += '</tbody></table>';
    }
    
    listaHtml += '</div>';
    
    await Swal.fire({
        title: `Fórmulas Configuradas (${totalFormulas})`,
        html: listaHtml,
        icon: 'info',
        width: 800,
        confirmButtonText: 'Fechar'
    });
}

// Remover uma fórmula
window.removerFormula = async function(chaveConta) {
    const resultado = await Swal.fire({
        title: 'Remover Fórmula?',
        text: `Deseja remover a fórmula da conta ${chaveConta}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, remover',
        cancelButtonText: 'Cancelar'
    });
    
    if (resultado.isConfirmed) {
        delete formulasContas[chaveConta];
        await salvarFormulas();
        mostrarToast('Fórmula removida');
        mostrarInfoFormulas(); // Atualizar lista
        renderTabela(); // Re-renderizar tabela
    }
};

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

    console.log('📋 Departamentos disponíveis (raw):', departamentosDisponsiveis);
    console.log('🔐 Permissões do usuário:', usuarioPermissoes);

    // Se não há departamentos configurados, usar todos da estrutura (para teste/demo)
    if (!departamentosDisponsiveis || departamentosDisponsiveis.length === 0) {
        console.warn('⚠️ Nenhum departamento configurado - usando estrutura padrão para demo');
        departamentosDisponsiveis = Object.keys(ESTRUTURA_DEPARTAMENTOS);
        geralVisualizar = true; // Permitir Geral em modo demo
    } else {
        // Extrair departamentos principais de nomes como "Vendas - Novos"
        const deptsPrincipais = new Set();
        departamentosDisponsiveis.forEach(depto => {
            const principal = depto.split(' - ')[0]; // Pega a primeira parte
            deptsPrincipais.add(principal);
        });
        departamentosDisponsiveis = Array.from(deptsPrincipais);
    }

    console.log('✅ Departamentos principais a renderizar:', departamentosDisponsiveis);

    // Resetar estado
    telaAtual = 'departamento';
    departamentoSelecionado = null;
    
    // Renderizar departamentos com hierarquia
    renderizarDepartamentosHierarquicos(gridDepartamentos);

    // Registrar botão confirmar
    const btnConfirmar = document.getElementById('btn-confirmar-selecao');
    if (btnConfirmar) {
        btnConfirmar.onclick = () => confirmarSelecaoAtual();
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

// ===== RENDERIZAR DEPARTAMENTOS COM HIERARQUIA =====
function renderizarDepartamentosHierarquicos(container) {
    container.innerHTML = '';
    
    // Card "Geral" - Consolidado de todos os departamentos (só se tiver permissão)
    if (geralVisualizar) {
        const cardGeral = document.createElement('div');
        cardGeral.className = 'card-departamento';
        cardGeral.style.gridColumn = '1 / -1';
        cardGeral.innerHTML = `
            <div class="card-departamento-nome"><i class='bx bx-bar-chart'></i> Geral</div>
            <div class="card-departamento-info">Ver consolidado de todos os departamentos</div>
        `;
        cardGeral.onclick = () => selecionarDepartamento(cardGeral, 'GERAL');
        container.appendChild(cardGeral);
    }

    // Renderizar apenas departamentos principais
    Object.entries(ESTRUTURA_DEPARTAMENTOS).forEach(([depPrincipal, subdeps]) => {
        // Se o departamento não está na lista disponível, pular
        if (departamentosDisponsiveis.length > 0 && !departamentosDisponsiveis.includes(depPrincipal)) {
            return;
        }

        const card = document.createElement('div');
        card.className = 'card-departamento';
        card.innerHTML = `
            <div class="card-departamento-nome"><i class='bx bx-folder-open'></i> ${depPrincipal}</div>
            <div class="card-departamento-info">Clique para selecionar</div>
        `;
        card.onclick = () => selecionarDepartamento(card, depPrincipal);
        container.appendChild(card);
    });
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
    telaAtual = 'filial';
    
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
    const btnConfirmar = document.getElementById('btn-confirmar-selecao');
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
    document.getElementById('btn-confirmar-selecao').disabled = false;
    
    console.log('👤 Departamento selecionado:', departamento);
}

// ===== CONFIRMAR SELEÇÃO ATUAL (GERENCIA QUAL ESTÁGIO) =====
function confirmarSelecaoAtual() {
    if (telaAtual === 'departamento') {
        confirmarSelecaoDepartamento();
    } else if (telaAtual === 'subdepartamento') {
        confirmarSelecaoSubdepartamento();
    } else if (telaAtual === 'filial') {
        confirmarSelecaoFilial();
    }
}

// ===== CONFIRMAR SELEÇÃO DE DEPARTAMENTO =====
async function confirmarSelecaoDepartamento() {
    if (!departamentoSelecionado) {
        Swal.fire('Aviso', 'Selecione um departamento', 'warning');
        return;
    }

    console.log('✅ Departamento confirmado:', departamentoSelecionado);
    
    // Se selecionou "GERAL" na primeira tela, não exigir filial - usar "GERAL" como filial
    if (departamentoSelecionado === 'GERAL') {
        filiaSelecionada = 'GERAL';
        console.log('✅ Modo GERAL selecionado - consolidando todos os departamentos e filiais');
        
        // Esconder tela de seleção
        const telaSelecao = document.getElementById('tela-selecao-filial');
        if (telaSelecao) {
            telaSelecao.style.display = 'none';
        }
        
        // Atualizar display
        const infoDepartamento = document.getElementById('info-departamento-selecionado');
        if (infoDepartamento) {
            infoDepartamento.innerHTML = `📊 <strong>GERAL - Consolidado de Todos os Departamentos e Filiais</strong>`;
        }
        
        // Carregar planejamento consolidado
        await carregarPlanejamento();
        renderTabela();
        calcularFormulas(); // Calcular fórmulas após carregar dados
        atualizarCamposFormula(); // Atualizar campos visuais
        
        // Mostrar tela de planejamento
        const telaplanejamento = document.getElementById('tela-planejamento');
        if (telaplanejamento) {
            telaplanejamento.style.display = 'block';
        }
        
        // Adicionar botão de fórmulas se tiver permissão
        adicionarBotaoFormulas();

        // Mostrar filtro de filiais
        mostrarFiltroFiliais();
        return;
    }
    
    // Verificar se o departamento tem subdivisões
    const subdeps = ESTRUTURA_DEPARTAMENTOS[departamentoSelecionado];
    
    if (subdeps && subdeps !== null) {
        // Tem subdivisões - mostrar tela de seleção de subdepartamentos
        mostrarTelaSelecaoSubdepartamentos();
    } else {
        // Não tem subdivisões - ir direto para filial
        mostrarTelaSelecaoFilial();
    }
}

// ===== MOSTRAR TELA DE SELEÇÃO DE SUBDEPARTAMENTOS =====
function mostrarTelaSelecaoSubdepartamentos() {
    console.log('🎯 Iniciando mostrarTelaSelecaoSubdepartamentos()');
    const gridDepartamentos = document.getElementById('grid-departamentos');
    
    if (!gridDepartamentos) {
        console.error('❌ Elemento grid-departamentos não encontrado!');
        return;
    }
    
    gridDepartamentos.innerHTML = '';
    telaAtual = 'subdepartamento';

    // Mudar título
    const containerSelecao = document.querySelector('.container-selecao');
    if (containerSelecao) {
        containerSelecao.querySelector('h1').innerHTML = `📂 Selecione a Opção de ${departamentoSelecionado}`;
        containerSelecao.querySelector('p').innerHTML = `Escolha qual opção dentro de ${departamentoSelecionado} você deseja preencher:`;
    }

    const subdeps = ESTRUTURA_DEPARTAMENTOS[departamentoSelecionado];
    
    if (!subdeps) {
        console.error('❌ Subdepartamentos não encontrados');
        return;
    }

    console.log(`📋 Subdepartamentos disponíveis de ${departamentoSelecionado}:`, Object.keys(subdeps));

    // Card "Geral" - Consolidado dentro deste departamento (na primeira posição)
    const cardGeral = document.createElement('div');
    cardGeral.className = 'card-departamento';
    cardGeral.style.gridColumn = '1 / -1';
    cardGeral.innerHTML = `
        <div class="card-departamento-nome"><i class='bx bx-bar-chart'></i> Geral de ${departamentoSelecionado}</div>
        <div class="card-departamento-info">Consolidado de todas as opções</div>
    `;
    cardGeral.onclick = () => selecionarSubdepartamento(cardGeral, `Geral`);
    gridDepartamentos.appendChild(cardGeral);

    // Criar cards para cada subdepartamento
    Object.keys(subdeps).forEach(subdep => {
        const card = document.createElement('div');
        card.className = 'card-departamento';
        card.innerHTML = `
            <div class="card-departamento-nome"><i class='bx bx-file'></i> ${subdep}</div>
            <div class="card-departamento-info">Clique para selecionar</div>
        `;
        card.onclick = () => selecionarSubdepartamento(card, subdep);
        gridDepartamentos.appendChild(card);
    });

    // Registrar botão confirmar
    const btnConfirmar = document.getElementById('btn-confirmar-selecao');
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
    }

    // Mostrar tela de seleção
    const telaSelecao = document.getElementById('tela-selecao-filial');
    if (telaSelecao) {
        telaSelecao.style.display = 'flex';
        console.log('📺 Tela de seleção de subdepartamentos exibida');
    }
}

// ===== SELECIONAR SUBDEPARTAMENTO =====
function selecionarSubdepartamento(cardElement, subdepartamento) {
    // Remover seleção anterior
    document.querySelectorAll('.card-departamento').forEach(card => {
        card.classList.remove('selecionado');
    });
    
    // Adicionar seleção ao card clicado
    cardElement.classList.add('selecionado');
    
    // Se selecionou "Geral" dentro de um departamento, usar GERAL_<Departamento>
    if (subdepartamento === 'Geral') {
        departamentoSelecionado = `GERAL_${departamentoSelecionado}`;
    } else {
        // Armazenar combinação: "Vendas - Novos"
        departamentoSelecionado = `${departamentoSelecionado} - ${subdepartamento}`;
    }
    
    // Habilitar botão confirmar
    document.getElementById('btn-confirmar-selecao').disabled = false;
    
    console.log('👤 Subdepartamento selecionado:', departamentoSelecionado);
}

// ===== CONFIRMAR SELEÇÃO DE SUBDEPARTAMENTO =====
async function confirmarSelecaoSubdepartamento() {
    if (!departamentoSelecionado) {
        Swal.fire('Aviso', 'Selecione um subdepartamento', 'warning');
        return;
    }

    console.log('✅ Subdepartamento confirmado:', departamentoSelecionado);
    
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
    document.getElementById('btn-confirmar-selecao').disabled = false;
    
    console.log('🏪 Filial selecionada:', filial);
}

// ===== CONFIRMAR SELEÇÃO DE FILIAL =====
async function confirmarSelecaoFilial() {
    if (!filiaSelecionada) {
        Swal.fire('Aviso', 'Selecione uma filial', 'warning');
        return;
    }

    console.log('✅ Filial confirmada:', filiaSelecionada);
    
    // Mostrar loading
    mostrarLoading('Carregando planejamento...', 'Aguarde enquanto carregamos os dados');
    
    // Esconder tela de seleção
    const telaSelecao = document.getElementById('tela-selecao-filial');
    if (telaSelecao) {
        telaSelecao.style.display = 'none';
    }
    
    // Se está em modo GERAL (dentro de um departamento), usar filial especial "GERAL"
    if (departamentoSelecionado.startsWith('GERAL_')) {
        filiaSelecionada = 'GERAL';
        console.log('✅ Modo GERAL de departamento - consolidando todos os subdepartamentos');
    }
    
    // Atualizar display de departamento/filial selecionados
    const infoDepartamento = document.getElementById('info-departamento-selecionado');
    if (infoDepartamento) {
        if (departamentoSelecionado.startsWith('GERAL_') || departamentoSelecionado === 'GERAL') {
            infoDepartamento.innerHTML = `📊 <strong>${departamentoSelecionado}</strong> | 🏢 <strong>Filiais Selecionáveis</strong>`;
        } else {
            infoDepartamento.innerHTML = `👤 <strong>${departamentoSelecionado}</strong> | 🏢 <strong>${filiaSelecionada}</strong>`;
        }
    }
    
    try {
        // Carregar planejamento e renderizar tabela
        await carregarPlanejamento();
        renderTabela();
        calcularFormulas(); // Calcular fórmulas após carregar dados
        atualizarCamposFormula(); // Atualizar campos visuais
        
        // Mostrar tela de planejamento
        const telaplanejamento = document.getElementById('tela-planejamento');
        if (telaplanejamento) {
            telaplanejamento.style.display = 'block';
        }
        
        // Adicionar botão de fórmulas se tiver permissão
        adicionarBotaoFormulas();

        // Se está em modo GERAL, popular o dropdown de filiais
        mostrarFiltroFiliais();
    } finally {
        // Esconder loading sempre, mesmo se der erro
        esconderLoading();
    }
}

// ===== MOSTRAR/POPULAR FILTRO DE FILIAIS =====
function mostrarFiltroFiliais() {
    const container = document.getElementById('filtro-filiais-container');
    const dropdownContent = document.getElementById('dropdown-filiais-content');
    
    // Mostrar filtro apenas em modo GERAL
    if (departamentoSelecionado === 'GERAL' || departamentoSelecionado.startsWith('GERAL_')) {
        container.classList.add('ativo');
        
        // Popular dropdown com as filiais disponíveis
        dropdownContent.innerHTML = '';
        
        filiaisDisponiveis.forEach((filial, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'dropdown-filiais-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `checkbox-filial-${index}`;
            checkbox.value = filial;
            checkbox.checked = true; // Por padrão, todas selecionadas
            checkbox.onchange = () => atualizarFiliaisSelecionadasDropdown();
            
            const label = document.createElement('label');
            label.htmlFor = `checkbox-filial-${index}`;
            label.textContent = filial;
            
            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(label);
            dropdownContent.appendChild(itemDiv);
        });

        // Inicializar com todas as filiais selecionadas
        filiaisSelecionadasGeral = [...filiaisDisponiveis];
        atualizarBadgesFiliais();
        atualizarResumoDropdown();
        
        // Popular filtro de departamentos também
        popularFiltroDeptos();
    } else {
        container.classList.remove('ativo');
    }
}

// ===== TOGGLE DROPDOWN FILIAIS =====
window.toggleDropdownFiliais = function(event) {
    event.preventDefault();
    const trigger = document.getElementById('dropdown-filiais-trigger');
    const content = document.getElementById('dropdown-filiais-content');
    
    trigger.classList.toggle('aberto');
    content.classList.toggle('aberto');
    
    // Fechar ao clicar fora
    if (trigger.classList.contains('aberto')) {
        document.addEventListener('click', fecharDropdownAoClicarFora);
    } else {
        document.removeEventListener('click', fecharDropdownAoClicarFora);
    }
};

// ===== FECHAR DROPDOWN AO CLICAR FORA =====
function fecharDropdownAoClicarFora(event) {
    const dropdown = document.getElementById('dropdown-filiais');
    const trigger = document.getElementById('dropdown-filiais-trigger');
    
    if (!dropdown.contains(event.target)) {
        trigger.classList.remove('aberto');
        document.getElementById('dropdown-filiais-content').classList.remove('aberto');
        document.removeEventListener('click', fecharDropdownAoClicarFora);
    }
}

// ===== ATUALIZAR FILIAIS SELECIONADAS (DROPDOWN) =====
async function atualizarFiliaisSelecionadasDropdown() {
    const checkboxes = document.querySelectorAll('#dropdown-filiais-content input[type="checkbox"]');
    filiaisSelecionadasGeral = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    console.log('📍 Filiais selecionadas:', filiaisSelecionadasGeral);
    
    // Atualizar badges e resumo
    atualizarBadgesFiliais();
    atualizarResumoDropdown();
    
    // Mostrar loading
    mostrarLoading('Atualizando dados...', 'Carregando filiais selecionadas');
    
    try {
        // Recarregar planejamento com novas filiais
        await carregarPlanejamento();
        // Re-renderizar tabela com novas filiais
        renderTabela();
        calcularFormulas(); // Calcular fórmulas após carregar dados
        atualizarCamposFormula(); // Atualizar campos visuais
    } finally {
        esconderLoading();
    }
}

// ===== ATUALIZAR RESUMO DO DROPDOWN =====
function atualizarResumoDropdown() {
    const resumoEl = document.getElementById('dropdown-filiais-resumo');
    
    if (filiaisSelecionadasGeral.length === 0) {
        resumoEl.textContent = 'Nenhuma filial selecionada';
    } else if (filiaisSelecionadasGeral.length === filiaisDisponiveis.length) {
        resumoEl.textContent = `Todas as filiais (${filiaisSelecionadasGeral.length})`;
    } else {
        resumoEl.textContent = `${filiaisSelecionadasGeral.length} filial(is) selecionada(s)`;
    }
}

// ===== ATUALIZAR BADGES DE FILIAIS SELECIONADAS =====
function atualizarBadgesFiliais() {
    const badgeContainer = document.getElementById('badge-filiais-selecionadas');
    badgeContainer.innerHTML = '';
    
    filiaisSelecionadasGeral.forEach(filial => {
        const badge = document.createElement('div');
        badge.className = 'badge-filial';
        badge.innerHTML = `<i class='bx bx-map'></i> ${filial}`;
        badgeContainer.appendChild(badge);
    });
}

// ===== POPULAR FILTRO DE DEPARTAMENTOS =====
function popularFiltroDeptos() {
    const dropdownContent = document.getElementById('dropdown-departamentos-content');
    
    if (!dropdownContent) return;
    
    // Limpar conteúdo anterior
    dropdownContent.innerHTML = '';
    
    // Estrutura hierárquica de departamentos
    const estrutura = {
        'Vendas': {
            icon: 'bx-cart',
            subdepartamentos: ['Novos', 'Usados']
        },
        'Pós-vendas': {
            icon: 'bx-wrench',
            subdepartamentos: ['Peças', 'Serviços', 'PLM']
        },
        'ADM': {
            icon: 'bx-briefcase',
            subdepartamentos: ['IF', 'CTB CONTR', 'FINAN', 'MARKTING', 'COMPRAS', 'RH/DP']
        }
    };
    
    let checkboxIndex = 0;
    let todosSubdepartamentos = [];
    
    // Para cada seção principal (Vendas, Pós-vendas, ADM)
    Object.keys(estrutura).forEach(secao => {
        const { icon, subdepartamentos } = estrutura[secao];
        
        // Criar cabeçalho de seção (não selecionável)
        const secaoDiv = document.createElement('div');
        secaoDiv.className = 'dropdown-departamento-secao';
        secaoDiv.innerHTML = `<i class='bx ${icon}'></i> ${secao}`;
        dropdownContent.appendChild(secaoDiv);
        
        // Criar itens para cada subdepartamento
        subdepartamentos.forEach(subdepto => {
            // Construir o nome completo do departamento
            // Ex: "Vendas - Novos", "Pós-vendas - Peças", etc.
            const nomeCompleto = `${secao} - ${subdepto}`;
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'dropdown-departamentos-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `checkbox-depto-${checkboxIndex}`;
            checkbox.value = nomeCompleto;
            checkbox.checked = true; // Por padrão, todos selecionados
            checkbox.onchange = () => atualizarDeptosSelecionadosDropdown();
            
            const label = document.createElement('label');
            label.htmlFor = `checkbox-depto-${checkboxIndex}`;
            label.textContent = subdepto;
            
            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(label);
            dropdownContent.appendChild(itemDiv);
            
            todosSubdepartamentos.push(nomeCompleto);
            checkboxIndex++;
        });
    });

    // Inicializar com todos os subdepartamentos selecionados
    departamentosSelecionadosGeral = [...todosSubdepartamentos];
    atualizarBadgesDeptos();
    atualizarResumoDropdownDeptos();
    
    console.log('📂 Filtro de departamentos populado:', todosSubdepartamentos);
}

// ===== TOGGLE DROPDOWN DEPARTAMENTOS =====
window.toggleDropdownDepartamentos = function(event) {
    event.preventDefault();
    const trigger = document.getElementById('dropdown-departamentos-trigger');
    const content = document.getElementById('dropdown-departamentos-content');
    
    trigger.classList.toggle('aberto');
    content.classList.toggle('aberto');
    
    // Fechar ao clicar fora
    if (trigger.classList.contains('aberto')) {
        document.addEventListener('click', fecharDropdownDeptosAoClicarFora);
    } else {
        document.removeEventListener('click', fecharDropdownDeptosAoClicarFora);
    }
};

// ===== FECHAR DROPDOWN DEPTOS AO CLICAR FORA =====
function fecharDropdownDeptosAoClicarFora(event) {
    const dropdown = document.getElementById('dropdown-departamentos');
    const trigger = document.getElementById('dropdown-departamentos-trigger');
    
    if (!dropdown || !dropdown.contains(event.target)) {
        trigger.classList.remove('aberto');
        document.getElementById('dropdown-departamentos-content').classList.remove('aberto');
        document.removeEventListener('click', fecharDropdownDeptosAoClicarFora);
    }
}

// ===== ATUALIZAR DEPARTAMENTOS SELECIONADOS (DROPDOWN) =====
async function atualizarDeptosSelecionadosDropdown() {
    const checkboxes = document.querySelectorAll('#dropdown-departamentos-content input[type=\"checkbox\"]');
    departamentosSelecionadosGeral = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    console.log('📂 Departamentos selecionados:', departamentosSelecionadosGeral);
    
    // Atualizar badges e resumo
    atualizarBadgesDeptos();
    atualizarResumoDropdownDeptos();
    
    // Mostrar loading
    mostrarLoading('Atualizando dados...', 'Carregando departamentos selecionados');
    
    try {
        // Recarregar planejamento com novos departamentos
        await carregarPlanejamento();
        // Re-renderizar tabela com novos departamentos
        renderTabela();
        calcularFormulas(); // Calcular fórmulas após carregar dados
        atualizarCamposFormula(); // Atualizar campos visuais
    } finally {
        esconderLoading();
    }
}

// ===== ATUALIZAR RESUMO DO DROPDOWN DEPARTAMENTOS =====
function atualizarResumoDropdownDeptos() {
    const resumoEl = document.getElementById('dropdown-departamentos-resumo');
    
    if (!resumoEl) return;
    
    if (departamentosSelecionadosGeral.length === 0) {
        resumoEl.textContent = 'Nenhum departamento selecionado';
    } else if (departamentosSelecionadosGeral.length === departamentosDisponsiveis.length) {
        resumoEl.textContent = `Todos os departamentos (${departamentosSelecionadosGeral.length})`;
    } else {
        resumoEl.textContent = `${departamentosSelecionadosGeral.length} departamento(s) selecionado(s)`;
    }
}

// ===== ATUALIZAR BADGES DE DEPARTAMENTOS SELECIONADOS =====
function atualizarBadgesDeptos() {
    const badgeContainer = document.getElementById('badge-departamentos-selecionados');
    
    if (!badgeContainer) return;
    
    badgeContainer.innerHTML = '';
    
    departamentosSelecionadosGeral.forEach(depto => {
        const badge = document.createElement('div');
        badge.className = 'badge-departamento';
        // Extrair apenas o nome do subdepartamento (após o " - ")
        const nomeExibicao = depto.includes(' - ') ? depto.split(' - ')[1] : depto;
        badge.innerHTML = `<i class='bx bx-briefcase'></i> ${nomeExibicao}`;
        badgeContainer.appendChild(badge);
    });
}

// ===== CARREGAR PLANEJAMENTO EXISTENTE =====
async function carregarPlanejamento() {
    try {
        const ano = new Date().getFullYear();
        
        if (!departamentoSelecionado || !filiaSelecionada) {
            console.log('ℹ️ Selecione departamento e filial para carregar planejamento');
            return;
        }

        // Modo GERAL na primeira tela - Consolidado de todos os departamentos e filiais
        if (departamentoSelecionado === 'GERAL' && filiaSelecionada === 'GERAL') {
            console.log('📊 Carregando modo GERAL TOTAL (departamentos e filiais selecionadas)...');
            console.log('📋 Filiais selecionadas no dropdown:', filiaisSelecionadasGeral);
            console.log('📂 Departamentos selecionados no dropdown:', departamentosSelecionadosGeral);
            console.log('📋 Filiais disponíveis:', filiaisDisponiveis);
            console.log('📂 Departamentos disponíveis:', departamentosDisponsiveis);
            planejamentoData = {};
            
            // Usar filiais selecionadas, ou todas se nenhuma selecionada
            const filiaisParaCarregar = filiaisSelecionadasGeral.length > 0 ? filiaisSelecionadasGeral : filiaisDisponiveis;
            // Usar departamentos selecionados, ou todos se nenhum selecionado
            const deptosParaCarregar = departamentosSelecionadosGeral.length > 0 ? departamentosSelecionadosGeral : departamentosDisponsiveis;
            console.log('🎯 Filiais que serão carregadas:', filiaisParaCarregar);
            console.log('🎯 Departamentos que serão carregados:', deptosParaCarregar);
            
            // Carregar dados dos departamentos e filiais selecionadas
            for (const departamento of deptosParaCarregar) {
                for (const filial of filiaisParaCarregar) {
                    const chaveDoc = `${ano}_${departamento}_${filial}`;
                    const docRef = doc(db, 'planejamento_preenchido', chaveDoc);
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        const dados = docSnap.data().dados || {};
                        console.log(`✅ Carregados dados de ${departamento}/${filial}:`, Object.keys(dados));
                        
                        // Mesclar dados com prefixo do departamento e filial
                        Object.keys(dados).forEach(chave => {
                            const novaChave = `${departamento}__${filial}__${chave}`;
                            planejamentoData[novaChave] = dados[chave];
                            console.log(`   └─ Salvando chave: ${novaChave}`);
                        });
                    } else {
                        console.log(`ℹ️ Sem dados anteriores para ${departamento}/${filial}`);
                    }
                }
            }
            console.log('✅ Planejamento GERAL TOTAL carregado. Total de chaves:', Object.keys(planejamentoData).length);
            console.log('📊 Amostra de chaves:', Object.keys(planejamentoData).slice(0, 5));
            return;
        }

        // Modo GERAL dentro de um departamento - Consolidado de subdepartamentos deste departamento
        if (departamentoSelecionado.startsWith('GERAL_')) {
            const depPrincipal = departamentoSelecionado.replace('GERAL_', '');
            console.log(`📊 Carregando GERAL para departamento ${depPrincipal} em filial ${filiaSelecionada}...`);
            planejamentoData = {};
            
            // Obter todos os subdepartamentos deste departamento
            const subdeps = ESTRUTURA_DEPARTAMENTOS[depPrincipal];
            if (subdeps) {
                // Carregar dados de cada subdepartamento (Ex: "Vendas - Novos", "Vendas - Usados")
                for (const subdep of Object.keys(subdeps)) {
                    const depCompleto = `${depPrincipal} - ${subdep}`;
                    const chaveDoc = `${ano}_${depCompleto}_${filiaSelecionada}`;
                    const docRef = doc(db, 'planejamento_preenchido', chaveDoc);
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        const dados = docSnap.data().dados || {};
                        console.log(`✅ Carregados dados de ${depCompleto}:`, dados);
                        
                        // Mesclar com prefixo
                        Object.keys(dados).forEach(chave => {
                            const novaChave = `${subdep}__${chave}`;
                            planejamentoData[novaChave] = dados[chave];
                        });
                    } else {
                        console.log(`ℹ️ Sem dados anteriores para ${depCompleto}`);
                    }
                }
            }
            console.log(`✅ Planejamento GERAL de ${depPrincipal} carregado:`, planejamentoData);
            return;
        }

        // Modo GERAL com filial específica (consolidado apenas desta filial)
        if (departamentoSelecionado === 'GERAL') {
            console.log('📊 Carregando modo GERAL (consolidado de todos departamentos nesta filial)...');
            planejamentoData = {};
            
            // Carregar dados de todos os departamentos autorizados para esta filial
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

    // Se está em modo GERAL (primeira tela), renderizar de forma consolidada com todas filiais
    if (departamentoSelecionado === 'GERAL' && filiaSelecionada === 'GERAL') {
        renderTabelaConsolidadaTotalGeral();
        return;
    }

    // Se está em modo GERAL dentro de um departamento, renderizar consolidado
    if (departamentoSelecionado.startsWith('GERAL_')) {
        renderTabelaConsolidadaDepartamento();
        return;
    }

    // Se está em modo GERAL com filial específica, renderizar consolidado
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
                
                // Verificar se esta conta tem fórmula
                const temFormula = formulasContas[chaveArmazenamento] !== undefined;
                const iconeFormula = temFormula ? 
                    `<i class='bx bx-math icone-formula' title='Fórmula: ${formulasContas[chaveArmazenamento]}'></i>` : '';
                
                let html = `
                    <td style="padding-left:40px;">
                        ${conta.id}
                        <span class="badge-permissao liberado">Liberado</span>
                        ${iconeFormula}
                        ${podeEditarFormulas ? `<button type="button" class="btn-formula" onclick="window.editarFormulaConta('${chaveArmazenamento}', '${conta.descricao}')"><i class='bx bx-math'></i>Fórmula</button>` : ''}
                    </td>
                    <td>${conta.descricao}</td>
                `;

                // Adicionar campos para cada mês
                MESES.forEach((mes, mesIdx) => {
                    const valor = valores[mesIdx] || '';
                    const readonly = temFormula ? 'readonly' : '';
                    const classFormula = temFormula ? 'campo-com-formula' : '';
                    
                    html += `
                        <td>
                            <input 
                                type="number" 
                                step="0.01"
                                class="valor-mes ${classFormula}" 
                                value="${valor}" 
                                data-grupo="${grupoIdx}" 
                                data-conta="${contaIdx}" 
                                data-mes="${mesIdx}"
                                ${readonly}
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
    
    // Calcular fórmulas após renderizar
    calcularFormulas();
    
    // Registrar eventos dos botões
    registrarEventos();
}

// ===== RENDERIZAR TABELA CONSOLIDADA (TODAS FILIAIS - MODO GERAL TOTAL) =====
function renderTabelaConsolidadaTotalGeral() {
    console.log('📊 Renderizando tabela CONSOLIDADA TOTAL - Todas as filiais, todos departamentos');
    console.log('👁️ Geral Visualizar:', geralVisualizar, '| ✏️ Geral Editar:', geralEditar);
    const tabelaBody = document.getElementById('tabela-body');
    
    // Esconder botão expandir/minimizar do modo normal
    const btnExpandirTudo = document.getElementById('btn-expandir-tudo');
    if (btnExpandirTudo) {
        btnExpandirTudo.style.display = 'none';
    }

    // Renderizar por grupos
    gruposContas.forEach((grupo, grupoIdx) => {
        const contasParaMostrar = grupo.contas;

        if (contasParaMostrar.length === 0) return;

        // Filtrar contas baseado na pesquisa
        const contasFiltradas = contasParaMostrar.filter(conta => {
            const termoLower = termoPesquisa.toLowerCase();
            return conta.id.toString().toLowerCase().includes(termoLower) ||
                   conta.descricao.toLowerCase().includes(termoLower);
        });

        if (contasFiltradas.length === 0 && termoPesquisa) return;

        // Linha do grupo
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

        // Para cada conta - MOSTRA UMA ÚNICA LINHA com soma de TODAS filiais E TODOS departamentos
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
                    <span class="badge-permissao liberado">Consolidado Total</span>
                </td>
                <td style="font-size:0.9em;">${conta.descricao}</td>
            `;

            // Campos para cada mês - SOMA de TODAS filiais E TODOS departamentos
            let somaGeral = 0;
            MESES.forEach((mes, mesIdx) => {
                let somaDoMes = 0;
                
                // Usar filiais selecionadas, ou todas se nenhuma selecionada
                const filiaisParaSomar = filiaisSelecionadasGeral.length > 0 ? filiaisSelecionadasGeral : filiaisDisponiveis;
                
                console.log(`🔍 Buscando dados para ${chaveArmazenamento}, mês ${mesIdx}, filiais:`, filiaisParaSomar);
                
                // Usar departamentos selecionados, ou todos se nenhum selecionado
                const deptosParaSomar = departamentosSelecionadosGeral.length > 0 ? departamentosSelecionadosGeral : departamentosDisponsiveis;
                console.log(`📂 Departamentos para somar:`, deptosParaSomar);
                
                // Somar este mês nos departamentos E filiais selecionadas
                for (const departamento of deptosParaSomar) {
                    for (const filial of filiaisParaSomar) {
                        const chaveConsolidada = `${departamento}__${filial}__${chaveArmazenamento}`;
                        const valores = planejamentoData[chaveConsolidada] || {};
                        const valor = parseFloat(valores[mesIdx]) || 0;
                        
                        if (valor > 0) {
                            console.log(`   ✅ ${chaveConsolidada}: ${valor}`);
                        }
                        
                        somaDoMes += valor;
                    }
                }

                somaGeral += somaDoMes;

                // Campo readonly (não pode editar em modo GERAL TOTAL)
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
                            readonly
                            style="background-color: #f9f9f9; font-weight: bold; text-align: center;">
                    </td>
                `;
            });

            // Total geral
            html += `<td style="font-weight:bold;text-align:center;background-color:#e8e8e8;font-size:0.9em;">${somaGeral.toFixed(2)}</td>`;

            contaRow.innerHTML = html;
            tabelaBody.appendChild(contaRow);
        });
    });

    console.log(`✅ Tabela CONSOLIDADA TOTAL renderizada`);
    registrarEventos();
}

// ===== RENDERIZAR TABELA CONSOLIDADA (GERAL DENTRO DE UM DEPARTAMENTO) =====
function renderTabelaConsolidadaDepartamento() {
    console.log('📊 Renderizando tabela CONSOLIDADA de DEPARTAMENTO');
    const depPrincipal = departamentoSelecionado.replace('GERAL_', '');
    const subdeps = ESTRUTURA_DEPARTAMENTOS[depPrincipal];
    
    const tabelaBody = document.getElementById('tabela-body');
    
    // Esconder botão expandir/minimizar do modo normal
    const btnExpandirTudo = document.getElementById('btn-expandir-tudo');
    if (btnExpandirTudo) {
        btnExpandirTudo.style.display = 'none';
    }

    // Renderizar por grupos
    gruposContas.forEach((grupo, grupoIdx) => {
        const contasParaMostrar = grupo.contas;

        if (contasParaMostrar.length === 0) return;

        // Filtrar contas baseado na pesquisa
        const contasFiltradas = contasParaMostrar.filter(conta => {
            const termoLower = termoPesquisa.toLowerCase();
            return conta.id.toString().toLowerCase().includes(termoLower) ||
                   conta.descricao.toLowerCase().includes(termoLower);
        });

        if (contasFiltradas.length === 0 && termoPesquisa) return;

        // Linha do grupo
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

        // Para cada conta - MOSTRA UMA ÚNICA LINHA com soma de todos os subdepartamentos
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

            // Campos para cada mês - SOMA de todos os subdepartamentos
            let somaGeral = 0;
            MESES.forEach((mes, mesIdx) => {
                let somaDoMes = 0;
                
                // Somar este mês em TODOS os subdepartamentos deste departamento
                if (subdeps) {
                    for (const subdep of Object.keys(subdeps)) {
                        const chaveConsolidada = `${subdep}__${chaveArmazenamento}`;
                        const valores = planejamentoData[chaveConsolidada] || {};
                        const valor = parseFloat(valores[mesIdx]) || 0;
                        somaDoMes += valor;
                    }
                }

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
                            data-departamento="${depPrincipal}"
                            ${readonly}
                            style="background-color: ${bgColor}; font-weight: bold; text-align: center;">
                    </td>
                `;
            });

            // Total geral
            html += `<td style="font-weight:bold;text-align:center;background-color:#e8e8e8;font-size:0.9em;">${somaGeral.toFixed(2)}</td>`;

            contaRow.innerHTML = html;
            tabelaBody.appendChild(contaRow);
        });
    });

    console.log(`✅ Tabela CONSOLIDADA DE DEPARTAMENTO renderizada`);
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
    
    // Recalcular fórmulas que dependem deste valor
    calcularFormulas();
    
    // Atualizar campos na tela (SEM renderizar tabela toda)
    atualizarCamposFormula();
    
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
        
        // Mostrar toast de sucesso (silencioso - sem bloquear navegação)
        mostrarToast('💾 Salvo', 'success');
        
    } catch (error) {
        console.error('⚠️ Erro ao atualizar:', error);
        mostrarToast('Erro ao salvar', 'error');
    }
    
    // NÃO renderizar tabela toda - permite navegação com TAB
    // renderTabela();
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
        mostrarToast('💾 Salvo', 'success');
        
    } catch (error) {
        console.error('⚠️ Erro ao atualizar valor consolidado:', error);
        mostrarToast('Erro ao salvar', 'error');
    }
    
    // NÃO renderizar tabela toda - permite navegação com TAB
    // renderTabela();
};

// ===== REGISTRAR EVENTOS =====
function registrarEventos() {
    const btnLimpar = document.getElementById('btn-limpar');
    if (btnLimpar) {
        btnLimpar.removeEventListener('click', limparFormulario);
        btnLimpar.addEventListener('click', limparFormulario);
        
        // Mostrar/Esconder botão Limpar
        // Esconder se está em modo GERAL TOTAL (sem permissão)
        if (departamentoSelecionado === 'GERAL' && filiaSelecionada === 'GERAL') {
            btnLimpar.style.display = 'none';
        }
        // Esconder se está em modo GERAL de departamento e não tem permissão de editar
        else if (departamentoSelecionado.startsWith('GERAL_') && !geralEditar) {
            btnLimpar.style.display = 'none';
        }
        // Esconder se está em modo GERAL com filial e não tem permissão de editar
        else if (departamentoSelecionado === 'GERAL' && !geralEditar) {
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
    
    // Mostrar/Esconder botão Salvar
    if (btnSalvar) {
        // Esconder se está em modo GERAL TOTAL (visualização apenas)
        if (departamentoSelecionado === 'GERAL' && filiaSelecionada === 'GERAL') {
            btnSalvar.style.display = 'none';
        }
        // Se está em modo GERAL de departamento e não tem permissão de editar
        else if (departamentoSelecionado.startsWith('GERAL_') && !geralEditar) {
            btnSalvar.style.display = 'none';
        }
        // Se está em modo GERAL com filial e não tem permissão de editar
        else if (departamentoSelecionado === 'GERAL' && !geralEditar) {
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
            inputPesquisa.removeEventListener('keypress', inputPesquisa.__pesquisaListener);
        }
        
        // Criar nova função de listener - só pesquisa ao pressionar Enter
        inputPesquisa.__pesquisaListener = function(e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                console.log('🔍 Pesquisando:', e.target.value);
                window.atualizarPesquisa(e.target.value);
            }
        };
        
        inputPesquisa.addEventListener('keypress', inputPesquisa.__pesquisaListener);
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
    filiaisSelecionadasGeral = []; // Resetar filiais selecionadas
    
    // Fechar dropdown se estiver aberto
    const trigger = document.getElementById('dropdown-filiais-trigger');
    const content = document.getElementById('dropdown-filiais-content');
    if (trigger && content) {
        trigger.classList.remove('aberto');
        content.classList.remove('aberto');
        document.removeEventListener('click', fecharDropdownAoClicarFora);
    }
    
    // Esconder tela de planejamento
    const telaplanejamento = document.getElementById('tela-planejamento');
    if (telaplanejamento) {
        telaplanejamento.style.display = 'none';
    }
    
    // Esconder filtro de filiais
    const filtroContainer = document.getElementById('filtro-filiais-container');
    if (filtroContainer) {
        filtroContainer.classList.remove('ativo');
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
    calcularFormulas(); // Calcular fórmulas após carregar dados
    atualizarCamposFormula(); // Atualizar campos visuais
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

        // Se está em modo GERAL TOTAL (primeira tela), não pode salvar
        if (departamentoSelecionado === 'GERAL' && filiaSelecionada === 'GERAL') {
            mostrarToast('Modo GERAL TOTAL é apenas para visualização', 'error');
            return;
        }

        // Se está em modo GERAL dentro de um departamento, salvar em todos os subdepartamentos
        if (departamentoSelecionado.startsWith('GERAL_')) {
            console.log('💾 Salvando GERAL de departamento em todos os subdepartamentos...');
            const depPrincipal = departamentoSelecionado.replace('GERAL_', '');
            const subdeps = ESTRUTURA_DEPARTAMENTOS[depPrincipal];
            
            for (const subdep of Object.keys(subdeps)) {
                const depCompleto = `${depPrincipal} - ${subdep}`;
                const chaveDoc = `${ano}_${depCompleto}_${filiaSelecionada}`;
                
                // Filtrar dados apenas deste subdepartamento
                const dadosDepartamento = {};
                Object.keys(planejamentoData).forEach(chave => {
                    if (chave.startsWith(`${subdep}__`)) {
                        const novaChave = chave.replace(`${subdep}__`, '');
                        dadosDepartamento[novaChave] = planejamentoData[chave];
                    }
                });
                
                await setDoc(doc(db, 'planejamento_preenchido', chaveDoc), {
                    ano: parseInt(ano),
                    departamento: depCompleto,
                    filial: filiaSelecionada,
                    usuarioId,
                    dados: dadosDepartamento,
                    dataSalva: dataAtual,
                    timestamp: dataAtual.getTime()
                });
                
                console.log(`✅ ${depCompleto} salvo`);
            }
            
            mostrarToast(`Planejamento de ${depPrincipal} salvo em todos subdepartamentos`);
            return;
        }

        // Se está em modo GERAL (com filial), salvar em todos os departamentos
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
        
        console.log('💾 Salvando modo normal:', chaveDoc);
        console.log('📝 Chaves sendo salvas em planejamentoData:', Object.keys(planejamentoData).slice(0, 5));

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
