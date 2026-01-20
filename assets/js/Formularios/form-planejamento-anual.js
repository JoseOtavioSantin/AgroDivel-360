import { db, auth } from '../firebase-config.js'; 
import { collection, addDoc, doc, getDoc, setDoc, query, where, getDocs, deleteDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// --- DADOS DE CONTAS ESTRUTURADOS POR GRUPOS ---
const GRUPOS_CONTAS = [
    {
        grupo: "1. RECEITA OPERACIONAL BRUTA",
        contas: [
            { id: 3005, descricao: "VENDAS MAQUINAS E IMPLEMENTOS DIVERSOS NOVOS" },
            { id: 3004, descricao: "VENDAS MAQUINAS E IMPLEMENTOS NEW HOLLAND NOVOS" },
            { id: 3006, descricao: "VENDAS MAQUINAS E IMPLEMENTOS USADOS" },
            { id: 3010, descricao: "PEÇAS DIVERSOS" },
            { id: 3009, descricao: "PEÇAS GARANTIA" },
            { id: 3008, descricao: "PEÇAS NEW HOLLAND" },
            { id: 3011, descricao: "PEÇAS PLANO DE MANUTENCAO" },
            { id: 46002, descricao: "LICENCAS AGRICULTURA DE PRECISAO" },
            { id: 3014, descricao: "PEÇAS AGRICULTURA DE PRECISAO DIVERSOS" },
            { id: 3013, descricao: "PEÇAS AGRICULTURA DE PRECISAO NEW HOLLAND" },
            { id: 3016, descricao: "OLEOS E LUBRIFICANTES" },
            { id: 279, descricao: "FENO E FORRAGEM" },
            { id: 281, descricao: "GRAOS" },
            { id: 3025, descricao: "MILHO PRODUCAO TERCEIROS" },
            { id: 3026, descricao: "SOJA PRODUCAO TERCEIROS" },
            { id: 45480, descricao: "COMISSOES AGRICULTURA DE PRECISAO" },
            { id: 3022, descricao: "COMISSOES CONSORCIO" },
            { id: 48275, descricao: "COMISSOES IAT" },
            { id: 3021, descricao: "COMISSOES SEGUROS" },
            { id: 3023, descricao: "COMISSOES VENDAS DIRETAS" },
            { id: 49506, descricao: "SERVICOS DIVERSOS" },
            { id: 3020, descricao: "SERVICOS GARANTIA" },
            { id: 49130, descricao: "SERVICOS KM DESLOCAMENTO" },
            { id: 3019, descricao: "SERVICOS OFICINA" },
            { id: 46508, descricao: "SERVICOS PLANO DE MANUTECAO" },
            { id: 3018, descricao: "SERVICOS TERCEIROS" },
            { id: 50241, descricao: "SERVICOS TREINAMENTOS MINISTRADOS" },
            { id: 49064, descricao: "SERVICOS GARANTIA PROPRIA (GERENCIAL)" },
            { id: 49067, descricao: "SERVICOS TRANSFERENCIA INTERNA (GERENCIAL)" }
        ]
    }
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// --- REFERÊNCIAS AOS ELEMENTOS ---
const form = document.getElementById('form-planejamento');
const anoInput = document.getElementById('ano');
const departamentoSelect = document.getElementById('departamento');
const filialSelect = document.getElementById('filial');
const tabelaBody = document.getElementById('tabela-body');
const btnLimpar = document.getElementById('btn-limpar');

let usuarioAtual = null;
let nomeUsuario = null;
let departamentoAtual = null;
let filialAtual = null;

// --- LÓGICA DE AUTENTICAÇÃO ---
// --- FUNÇÃO PARA BUSCAR DEPARTAMENTOS ---
async function carregarDepartamentos() {
    try {
        // Buscar lista de departamentos da empresa
        const gestoresRef = doc(db, "gestores", usuarioAtual);
        const gestoresSnap = await getDoc(gestoresRef);
        
        if (gestoresSnap.exists() && gestoresSnap.data().departamentos) {
            const departamentos = gestoresSnap.data().departamentos;
            
            // Limpar e preencher select
            departamentoSelect.innerHTML = '';
            departamentos.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                departamentoSelect.appendChild(option);
            });
            
            // Selecionar primeiro departamento
            if (departamentos.length > 0) {
                departamentoSelect.value = departamentos[0];
                departamentoAtual = departamentos[0];
            }
        } else {
            // Se não houver departamentos, criar um padrão
            departamentoSelect.innerHTML = '<option value="Geral">Geral</option>';
            departamentoSelect.value = "Geral";
            departamentoAtual = "Geral";
        }
    } catch (error) {
        console.error("Erro ao buscar departamentos:", error);
        departamentoSelect.innerHTML = '<option value="Geral">Geral</option>';
        departamentoSelect.value = "Geral";
        departamentoAtual = "Geral";
    }
}

// Listener para mudar departamento
departamentoSelect.addEventListener('change', async () => {
    departamentoAtual = departamentoSelect.value;
    if (anoInput.value) {
        construirTabela();
        await carregarPlanejamento();
    }
});

// --- FUNÇÃO PARA BUSCAR FILIAIS ---
async function carregarFiliais() {
    try {
        // Buscar filiais permitidas do localStorage (gestorFilial)
        const filiaisLogadas = JSON.parse(localStorage.getItem("gestorFilial") || "[]");
        
        // Buscar todas as filiais disponíveis do gestor
        const gestoresRef = doc(db, "gestores", usuarioAtual);
        const gestoresSnap = await getDoc(gestoresRef);
        
        let filiaisDisponiveis = [];
        
        if (gestoresSnap.exists() && gestoresSnap.data().filiais) {
            filiaisDisponiveis = gestoresSnap.data().filiais;
        } else {
            filiaisDisponiveis = ["Filial Principal"];
        }
        
        // Filtrar filiais baseado nas permissões
        let filiaisPermitidas = filiaisDisponiveis;
        if (filiaisLogadas.length > 0) {
            // Normalizar para comparação
            const filiaisLogadasNormalizadas = filiaisLogadas.map(f => f.toLowerCase().trim());
            filiaisPermitidas = filiaisDisponiveis.filter(f => 
                filiaisLogadasNormalizadas.includes(f.toLowerCase().trim())
            );
        }
        
        // Se não houver filiais permitidas, mostrar todas
        if (filiaisPermitidas.length === 0) {
            filiaisPermitidas = filiaisDisponiveis;
        }
        
        // Limpar e preencher select
        filialSelect.innerHTML = '';
        filiaisPermitidas.forEach(filial => {
            const option = document.createElement('option');
            option.value = filial;
            option.textContent = filial;
            filialSelect.appendChild(option);
        });
        
        // Selecionar primeira filial
        if (filiaisPermitidas.length > 0) {
            filialSelect.value = filiaisPermitidas[0];
            filialAtual = filiaisPermitidas[0];
        }
    } catch (error) {
        console.error("Erro ao buscar filiais:", error);
        filialSelect.innerHTML = '<option value="Filial Principal">Filial Principal</option>';
        filialSelect.value = "Filial Principal";
        filialAtual = "Filial Principal";
    }
}

// Listener para mudar filial
filialSelect.addEventListener('change', async () => {
    filialAtual = filialSelect.value;
    if (anoInput.value) {
        construirTabela();
        await carregarPlanejamento();
    }
});

// --- FUNÇÃO PARA BUSCAR TODOS OS ANOS PLANEJADOS ---
async function buscarAnosDisponiveis() {
    try {
        const planejamentosRef = collection(db, "usuarios", usuarioAtual, "planejamentos");
        const snapshot = await getDocs(planejamentosRef);
        
        const anos = [];
        
        for (const doc of snapshot.docs) {
            if (doc.id.startsWith('anual_')) {
                const ano = parseInt(doc.id.replace('anual_', ''));
                const dados = doc.data();
                
                // Calcular valor total lendo as subcoleções de departamentos
                let valorTotal = 0;
                let departamentosPlanejamento = [];
                
                try {
                    const departamentosRef = collection(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "departamentos");
                    const departamentosSnap = await getDocs(departamentosRef);
                    
                    departamentosSnap.forEach(deptDoc => {
                        const deptData = deptDoc.data();
                        departamentosPlanejamento.push(deptDoc.id);
                        
                        // Somar valores de contas
                        if (deptData.contas && typeof deptData.contas === 'object') {
                            Object.keys(deptData.contas).forEach(contaId => {
                                const meses = deptData.contas[contaId];
                                if (typeof meses === 'object') {
                                    Object.keys(meses).forEach(mesIndex => {
                                        valorTotal += parseFloat(meses[mesIndex]) || 0;
                                    });
                                }
                            });
                        }
                    });
                } catch (e) {
                    console.log(`Sem departamentos salvos para o ano ${ano}`);
                }
                
                // Verificar se está fechado
                const fechado = dados.fechado || false;
                
                // Usar departamento da raiz se existir, senão usar lista de departamentos
                let departamentoExibicao = dados.departamento || departamentosPlanejamento.join(', ') || 'Sem departamento';
                
                anos.push({
                    ano: ano,
                    valorTotal: valorTotal,
                    fechado: fechado,
                    departamentos: departamentosPlanejamento,
                    departamento: departamentoExibicao,
                    filial: dados.filial || "Filial Principal"
                });
            }
        }
        
        // Ordenar do ano mais recente para o mais antigo
        anos.sort((a, b) => b.ano - a.ano);
        
        return anos;
    } catch (error) {
        console.error("Erro ao buscar anos:", error);
        return [];
    }
}

// --- FUNÇÃO PARA MOSTRAR MODAL DE SELEÇÃO DE ANO ---
async function mostrarSelectorAno() {
    const anos = await buscarAnosDisponiveis();
    const anoAtual = new Date().getFullYear();
    
    // Buscar departamentos e filiais
    let departamentos = [];
    let filiais = [];
    
    try {
        const gestoresRef = doc(db, "gestores", usuarioAtual);
        const gestoresSnap = await getDoc(gestoresRef);
        
        if (gestoresSnap.exists()) {
            const data = gestoresSnap.data();
            departamentos = data.departamentos || [];
            filiais = data.filiais || [];
        }
    } catch (error) {
        console.error("Erro ao buscar departamentos e filiais:", error);
    }
    
    // Se não houver, usar padrão
    if (departamentos.length === 0) departamentos = ["Geral"];
    if (filiais.length === 0) filiais = ["Filial Principal"];
    
    // Criar HTML do modal
    let htmlAnnos = `
        <div style="text-align: left; max-height: 600px; overflow-y: auto;">
            <p style="margin-bottom: 20px; color: #555; font-size: 15px;"><strong>Selecione Ano, Departamento e Filial:</strong></p>
            
            <!-- SELETORES -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px; background-color: #f9fafb; padding: 15px; border-radius: 8px;">
                <div>
                    <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 6px; color: #333;">Ano</label>
                    <select id="selector-ano" style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px;">
                        <option value="">Selecionar Ano</option>
                        ${anos.map(a => `<option value="${a.ano}">${a.ano}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 6px; color: #333;">Departamento</label>
                    <select id="selector-departamento" style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px;">
                        <option value="">Selecionar Depto</option>
                        ${departamentos.map(d => `<option value="${d}">${d}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 6px; color: #333;">Filial</label>
                    <select id="selector-filial" style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px;">
                        <option value="">Selecionar Filial</option>
                        ${filiais.map(f => `<option value="${f}">${f}</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
    `;
    
    // Mostrar anos existentes
    anos.forEach((item) => {
        const valorFormatado = formatarMoeda(item.valorTotal);
        const statusBadge = item.fechado 
            ? '<span style="background-color: #e0e0e0; color: #666; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">FECHADO</span>'
            : '<span style="background-color: #e3f2fd; color: #033ca7; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">ABERTO</span>';
        
        const departamentosTexto = item.departamento || 'Nenhum departamento';
        const filialTexto = item.filial || 'Filial Principal';
        
        htmlAnnos += `
            <div style="border: 1px solid #e0e0e0; padding: 14px; border-radius: 8px; background-color: ${item.fechado ? '#f9f9f9' : '#ffffff'}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);" data-ano="${item.ano}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong style="font-size: 18px; color: #001439;">${item.ano}</strong>
                    ${statusBadge}
                </div>
                <div style="font-size: 13px; color: #666; margin-bottom: 12px; border-top: 1px solid #f0f0f0; padding-top: 8px;">
                    <p style="margin: 4px 0;"><strong style="color: #333;">Departamento(s):</strong> <span style="color: #033ca7; font-weight: 600;">${departamentosTexto}</span></p>
                    <p style="margin: 4px 0;"><strong style="color: #333;">Filial:</strong> <span style="color: #033ca7; font-weight: 600;">${filialTexto}</span></p>
                    <p style="margin: 4px 0;"><strong style="color: #333;">Valor Total:</strong> <span style="color: #033ca7; font-weight: 600;">${valorFormatado}</span></p>
                </div>
                <button type="button" class="btn-selecionar-ano" data-ano="${item.ano}" style="
                    background-color: #033ca7;
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 600;
                    width: 100%;
                    transition: all 0.25s ease;
                    font-size: 14px;
                "
                onmouseover="this.style.backgroundColor='#022d7f'; this.style.boxShadow='0 2px 6px rgba(3,60,167,0.3)';"
                onmouseout="this.style.backgroundColor='#033ca7'; this.style.boxShadow='none';">
                    ${item.fechado ? 'Visualizar (Fechado)' : 'Abrir'}
                </button>
            </div>
        `;
    });
    
    // Mostrar opção para novo ano
    htmlAnnos += `
        <div style="border: 2px dashed #033ca7; padding: 16px; border-radius: 8px; background: linear-gradient(135deg, #f0f4ff 0%, #ffffff 100%); margin-top: 5px;">
            <p style="margin: 0 0 12px 0; color: #033ca7; font-size: 14px; font-weight: 600;">✨ Criar Novo Planejamento</p>
            
            <!-- ABAS DE CRIAÇÃO -->
            <div style="margin-bottom: 12px; border-bottom: 2px solid #ddd;">
                <button id="tab-criar-planejamento" class="btn-tab-criar" data-tab="planejamento" style="
                    background: none; border: none; padding: 8px 12px; color: #033ca7; font-weight: 600; cursor: pointer; border-bottom: 2px solid #033ca7; font-size: 13px;
                ">Planejamento</button>
                <button id="tab-criar-depto" class="btn-tab-criar" data-tab="departamento" style="
                    background: none; border: none; padding: 8px 12px; color: #999; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px;
                ">Novo Departamento</button>
                <button id="tab-criar-filial" class="btn-tab-criar" data-tab="filial" style="
                    background: none; border: none; padding: 8px 12px; color: #999; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px;
                ">Nova Filial</button>
            </div>
            
            <!-- TAB PLANEJAMENTO -->
            <div id="form-criar-planejamento" style="display: block;">
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                    <div>
                        <label style="display: block; font-size: 11px; color: #666; margin-bottom: 4px; font-weight: 600;">Ano</label>
                        <input type="number" id="novo-ano-input" min="2020" max="2100" placeholder="2025" 
                               style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; color: #666; margin-bottom: 4px; font-weight: 600;">Departamento</label>
                        <select id="novo-departamento-input" style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px; box-sizing: border-box;">
                            <option value="">Selecionar</option>
                            ${departamentos.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; color: #666; margin-bottom: 4px; font-weight: 600;">Filial</label>
                        <select id="novo-filial-input" style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px; box-sizing: border-box;">
                            <option value="">Selecionar</option>
                            ${filiais.map(f => `<option value="${f}">${f}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <button type="button" id="btn-criar-novo-ano" style="
                    background-color: #033ca7;
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 600;
                    width: 100%;
                    transition: all 0.25s ease;
                    font-size: 14px;
                "
                onmouseover="this.style.backgroundColor='#022d7f'; this.style.boxShadow='0 2px 6px rgba(3,60,167,0.3)';"
                onmouseout="this.style.backgroundColor='#033ca7'; this.style.boxShadow='none';">
                    Criar Novo Planejamento
                </button>
            </div>
            
            <!-- TAB NOVO DEPARTAMENTO -->
            <div id="form-criar-departamento" style="display: none;">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 11px; color: #666; margin-bottom: 4px; font-weight: 600;">Nome do Departamento</label>
                    <input type="text" id="novo-depto-nome" placeholder="Ex: Vendas, Operações" 
                           style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px; box-sizing: border-box;">
                </div>
                
                <button type="button" id="btn-criar-depto" style="
                    background-color: #033ca7;
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 600;
                    width: 100%;
                    transition: all 0.25s ease;
                    font-size: 14px;
                "
                onmouseover="this.style.backgroundColor='#022d7f'; this.style.boxShadow='0 2px 6px rgba(3,60,167,0.3)';"
                onmouseout="this.style.backgroundColor='#033ca7'; this.style.boxShadow='none';">
                    Criar Departamento
                </button>
            </div>
            
            <!-- TAB NOVA FILIAL -->
            <div id="form-criar-filial" style="display: none;">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 11px; color: #666; margin-bottom: 4px; font-weight: 600;">Nome da Filial</label>
                    <input type="text" id="novo-filial-nome" placeholder="Ex: Filial SP, Filial RJ" 
                           style="width: 100%; padding: 8px; border: 1px solid #bbb; border-radius: 5px; font-size: 13px; box-sizing: border-box;">
                </div>
                
                <button type="button" id="btn-criar-filial" style="
                    background-color: #033ca7;
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 600;
                    width: 100%;
                    transition: all 0.25s ease;
                    font-size: 14px;
                "
                onmouseover="this.style.backgroundColor='#022d7f'; this.style.boxShadow='0 2px 6px rgba(3,60,167,0.3)';"
                onmouseout="this.style.backgroundColor='#033ca7'; this.style.boxShadow='none';">
                    Criar Filial
                </button>
            </div>
        </div>
    `;
    
    htmlAnnos += `
            </div>
        </div>
    `;
    
    const { isConfirmed } = await Swal.fire({
        title: 'Planejamento Anual',
        html: htmlAnnos,
        width: 600,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: async () => {
            // Adicionar listeners aos botões de selecionar ano
            document.querySelectorAll('.btn-selecionar-ano').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const anoSelecionado = e.target.dataset.ano;
                    const departamentoSelecionado = document.getElementById('selector-departamento').value;
                    const filialSelecionada = document.getElementById('selector-filial').value;
                    
                    const anoFechado = anos.find(a => a.ano == anoSelecionado)?.fechado || false;
                    
                    anoInput.value = anoSelecionado;
                    
                    // Se houver departamento selecionado, usar; senão usar o primeiro disponível
                    if (departamentoSelecionado) {
                        departamentoSelect.value = departamentoSelecionado;
                        departamentoAtual = departamentoSelecionado;
                    } else {
                        // Usar o primeiro departamento disponível
                        departamentoAtual = departamentos.length > 0 ? departamentos[0] : 'Geral';
                        departamentoSelect.value = departamentoAtual;
                    }
                    
                    // Se houver filial selecionada, usar; senão usar a primeira disponível
                    if (filialSelecionada) {
                        filialSelect.value = filialSelecionada;
                        filialAtual = filialSelecionada;
                    } else {
                        // Usar a primeira filial disponível
                        filialAtual = filiais.length > 0 ? filiais[0] : 'Filial Principal';
                        filialSelect.value = filialAtual;
                    }
                    
                    construirTabela();
                    await carregarPlanejamento();
                    
                    // Se o ano está fechado, desabilitar edição
                    if (anoFechado) {
                        desabilitarEdicao();
                    }
                    
                    Swal.close();
                });
            });
            
            // Listener para criar novo ano
            document.getElementById('btn-criar-novo-ano').addEventListener('click', async () => {
                const novoAno = document.getElementById('novo-ano-input').value;
                const departamentoSelecionado = document.getElementById('novo-departamento-input').value;
                const filialSelecionada = document.getElementById('novo-filial-input').value;
                
                if (!novoAno) {
                    Swal.showValidationMessage('Por favor, digite um ano');
                    return;
                }
                
                if (!departamentoSelecionado) {
                    Swal.showValidationMessage('Por favor, selecione um departamento');
                    return;
                }
                
                if (!filialSelecionada) {
                    Swal.showValidationMessage('Por favor, selecione uma filial');
                    return;
                }
                
                if (novoAno < 2020 || novoAno > 2100) {
                    Swal.showValidationMessage('O ano deve estar entre 2020 e 2100');
                    return;
                }
                
                // Verificar se já existe
                if (anos.some(a => a.ano == novoAno)) {
                    Swal.showValidationMessage('Este ano já existe');
                    return;
                }
                
                anoInput.value = novoAno;
                departamentoSelect.value = departamentoSelecionado;
                departamentoAtual = departamentoSelecionado;
                filialSelect.value = filialSelecionada;
                filialAtual = filialSelecionada;
                construirTabela();
                // Novo ano, não precisa carregar planejamento
                
                Swal.close();
            });
            
            // ===== GERENCIAR ABAS DE CRIAÇÃO =====
            document.querySelectorAll('.btn-tab-criar').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const tabSelecionada = e.target.dataset.tab;
                    
                    // Ocultar todas as abas
                    document.getElementById('form-criar-planejamento').style.display = 'none';
                    document.getElementById('form-criar-departamento').style.display = 'none';
                    document.getElementById('form-criar-filial').style.display = 'none';
                    
                    // Desativar todos os botões de aba
                    document.querySelectorAll('.btn-tab-criar').forEach(btn => {
                        btn.style.color = '#999';
                        btn.style.borderBottomColor = 'transparent';
                    });
                    
                    // Ativar aba selecionada
                    if (tabSelecionada === 'planejamento') {
                        document.getElementById('form-criar-planejamento').style.display = 'block';
                        document.getElementById('tab-criar-planejamento').style.color = '#033ca7';
                        document.getElementById('tab-criar-planejamento').style.borderBottomColor = '#033ca7';
                    } else if (tabSelecionada === 'departamento') {
                        document.getElementById('form-criar-departamento').style.display = 'block';
                        document.getElementById('tab-criar-depto').style.color = '#033ca7';
                        document.getElementById('tab-criar-depto').style.borderBottomColor = '#033ca7';
                    } else if (tabSelecionada === 'filial') {
                        document.getElementById('form-criar-filial').style.display = 'block';
                        document.getElementById('tab-criar-filial').style.color = '#033ca7';
                        document.getElementById('tab-criar-filial').style.borderBottomColor = '#033ca7';
                    }
                });
            });
            
            // ===== CRIAR NOVO DEPARTAMENTO =====
            document.getElementById('btn-criar-depto').addEventListener('click', async () => {
                const novoDeptoNome = document.getElementById('novo-depto-nome').value.trim().toUpperCase();
                
                if (!novoDeptoNome) {
                    Swal.showValidationMessage('Por favor, digite o nome do departamento');
                    return;
                }
                
                if (departamentos.includes(novoDeptoNome)) {
                    Swal.showValidationMessage('Este departamento já existe');
                    return;
                }
                
                try {
                    // Adicionar à array local
                    departamentos.push(novoDeptoNome);
                    
                    // Salvar no Firebase
                    const userDocRef = doc(db, "gestores", usuarioAtual);
                    await setDoc(userDocRef, { departamentos }, { merge: true });
                    
                    // Atualizar campo de departamento no novo planejamento
                    const selectDepartamento = document.getElementById('novo-departamento-input');
                    const option = document.createElement('option');
                    option.value = novoDeptoNome;
                    option.text = novoDeptoNome;
                    selectDepartamento.appendChild(option);
                    selectDepartamento.value = novoDeptoNome; // Selecionar o novo item
                    
                    // Limpar input
                    document.getElementById('novo-depto-nome').value = '';
                    
                    // Mostrar sucesso
                    Swal.showValidationMessage(`✓ Departamento "${novoDeptoNome}" criado com sucesso!`);
                    
                    // Voltar para aba de planejamento após 1.5s
                    setTimeout(() => {
                        document.getElementById('tab-criar-planejamento').click();
                    }, 1500);
                    
                } catch (error) {
                    console.error('Erro ao criar departamento:', error);
                    Swal.showValidationMessage('Erro ao criar departamento: ' + error.message);
                }
            });
            
            // ===== CRIAR NOVA FILIAL =====
            document.getElementById('btn-criar-filial').addEventListener('click', async () => {
                const novaFilialNome = document.getElementById('novo-filial-nome').value.trim().toUpperCase();
                
                if (!novaFilialNome) {
                    Swal.showValidationMessage('Por favor, digite o nome da filial');
                    return;
                }
                
                if (filiais.includes(novaFilialNome)) {
                    Swal.showValidationMessage('Esta filial já existe');
                    return;
                }
                
                try {
                    // Adicionar à array local
                    filiais.push(novaFilialNome);
                    
                    // Salvar no Firebase
                    const userDocRef = doc(db, "gestores", usuarioAtual);
                    await setDoc(userDocRef, { filiais }, { merge: true });
                    
                    // Atualizar campo de filial no novo planejamento
                    const selectFilial = document.getElementById('novo-filial-input');
                    const option = document.createElement('option');
                    option.value = novaFilialNome;
                    option.text = novaFilialNome;
                    selectFilial.appendChild(option);
                    selectFilial.value = novaFilialNome; // Selecionar o novo item
                    
                    // Limpar input
                    document.getElementById('novo-filial-nome').value = '';
                    
                    // Mostrar sucesso
                    Swal.showValidationMessage(`✓ Filial "${novaFilialNome}" criada com sucesso!`);
                    
                    // Voltar para aba de planejamento após 1.5s
                    setTimeout(() => {
                        document.getElementById('tab-criar-planejamento').click();
                    }, 1500);
                    
                } catch (error) {
                    console.error('Erro ao criar filial:', error);
                    Swal.showValidationMessage('Erro ao criar filial: ' + error.message);
                }
            });
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = user.uid;
        
        // Carregar nome do usuário
        try {
            const userDocRef = doc(db, "gestores", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                nomeUsuario = userDocSnap.data().nome || user.displayName || 'Usuário';
            } else {
                nomeUsuario = user.displayName || 'Usuário';
            }
        } catch (error) {
            nomeUsuario = user.displayName || 'Usuário';
            console.error("Erro ao buscar nome do usuário:", error);
        }
        
        // Carregar departamentos disponíveis
        await carregarDepartamentos();
        
        // Carregar filiais disponíveis
        await carregarFiliais();
        
        // Mostrar modal de seleção de ano
        await mostrarSelectorAno();
    } else {
        window.location.href = '/Pages/Login/index.html';
    }
});

// --- DESABILITAR EDIÇÃO (PARA ANOS FECHADOS) ---
function desabilitarEdicao() {
    const inputs = tabelaBody.querySelectorAll('.valor-mes');
    inputs.forEach(input => {
        input.disabled = true;
        input.style.backgroundColor = '#f0f0f0';
        input.style.cursor = 'not-allowed';
        input.style.color = '#999';
    });
    
    // Desabilitar botões de ação
    document.getElementById('btn-importar').disabled = true;
    document.getElementById('btn-novo-grupo').disabled = true;
    document.getElementById('btn-limpar').disabled = true;
    document.querySelectorAll('.btn-adicionar-conta').forEach(btn => btn.disabled = true);
    
    // Mudar cor do botão salvar
    const btnSalvar = document.querySelector('.btn-salvar-header');
    btnSalvar.disabled = true;
    btnSalvar.style.opacity = '0.5';
    btnSalvar.style.cursor = 'not-allowed';
}

// --- HABILITAR EDIÇÃO ---
function habilitarEdicao() {
    const inputs = tabelaBody.querySelectorAll('.valor-mes');
    inputs.forEach(input => {
        input.disabled = false;
        input.style.backgroundColor = '';
        input.style.cursor = 'text';
        input.style.color = '';
    });
    
    // Habilitar botões de ação
    document.getElementById('btn-importar').disabled = false;
    document.getElementById('btn-novo-grupo').disabled = false;
    document.getElementById('btn-limpar').disabled = false;
    document.querySelectorAll('.btn-adicionar-conta').forEach(btn => btn.disabled = false);
    
    // Mudar cor do botão salvar
    const btnSalvar = document.querySelector('.btn-salvar-header');
    btnSalvar.disabled = false;
    btnSalvar.style.opacity = '1';
    btnSalvar.style.cursor = 'pointer';
}

// --- CONSTRUIR TABELA COM GRUPOS E CONTAS ---
function construirTabela() {
    tabelaBody.innerHTML = '';
    habilitarEdicao(); // Habilitar por padrão
    
    GRUPOS_CONTAS.forEach((grupoObj, grupoIndex) => {
        // Linha de Grupo COM SUBTOTAIS
        const rowGrupo = document.createElement('tr');
        rowGrupo.classList.add('linha-grupo');
        rowGrupo.dataset.grupoIndex = grupoIndex;
        rowGrupo.style.cursor = 'pointer';
        
        let cellsGrupo = `<td colspan="2" class="titulo-grupo">
            <span class="grupo-header" style="display: flex; align-items: center; justify-content: space-between;">
                <span><i class='bx bxs-chevron-down chevron-grupo'></i> <strong>${grupoObj.grupo}</strong></span>
                <button type="button" class="btn-adicionar-conta" title="Adicionar conta" onclick="event.stopPropagation()">
                    <i class='bx bx-plus'></i>
                </button>
            </span>
        </td>`;
        
        // Adicionar cells para cada mês (subtotal do grupo)
        for (let i = 0; i < MESES.length; i++) {
            cellsGrupo += `<td class="titulo-grupo valor-subtotal subtotal-grupo-mes-${grupoIndex}-${i}">0,00</td>`;
        }
        
        // Cell para total do grupo
        cellsGrupo += `<td class="titulo-grupo valor-subtotal subtotal-grupo-total-${grupoIndex}">0,00</td>`;
        
        rowGrupo.innerHTML = cellsGrupo;
        tabelaBody.appendChild(rowGrupo);
        
        // Adicionar listener para expandir/colapsar
        rowGrupo.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-adicionar-conta')) {
                e.stopPropagation();
                toggleGrupo(grupoIndex, rowGrupo);
            }
        });
        
        // Adicionar listener ao botão de adicionar conta
        rowGrupo.querySelector('.btn-adicionar-conta').addEventListener('click', (e) => {
            e.stopPropagation();
            adicionarContaAoGrupo(grupoIndex);
        });
        
        // Linhas de Contas
        grupoObj.contas.forEach((conta, contaIndex) => {
            const row = document.createElement('tr');
            row.classList.add('linha-conta');
            row.dataset.contaId = conta.id;
            row.dataset.grupoIndex = grupoIndex;
            row.dataset.contaIndex = contaIndex;
            
            let cellsHTML = `
                <td class="conta-id">
                    <button type="button" class="btn-expandir-conta" style="padding: 2px 5px; margin-right: 5px;" title="Expandir/Minimizar">
                        <i class='bx bxs-chevron-right'></i>
                    </button>
                    ${conta.id}
                </td>
                <td class="conta-desc">${conta.descricao}</td>
            `;
            
            // Adicionar inputs para cada mês
            MESES.forEach((mes, mesIndex) => {
                cellsHTML += `
                    <td>
                        <input 
                            type="text" 
                            class="valor-mes mes-${mesIndex}" 
                            placeholder="0" 
                            data-mes="${mesIndex}"
                            data-valorAnterior="0"
                        >
                    </td>
                `;
            });
            
            // Coluna de Total
            cellsHTML += `<td class="total-conta">0,00</td>`;
            
            row.innerHTML = cellsHTML;
            tabelaBody.appendChild(row);
            
            // Adicionar listener para o botão expandir/minimizar da conta
            const btnExpandirConta = row.querySelector('.btn-expandir-conta');
            btnExpandirConta.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleContaIndividual(row, contaIndex, grupoIndex);
            });
            
            // Adicionar listener para calcular total
            const inputs = row.querySelectorAll('.valor-mes');
            inputs.forEach(input => {
                input.addEventListener('change', calcularTotais);
                input.addEventListener('input', calcularTotais);
            });
        });
    });
    
    // Adicionar linha de TOTAL GERAL
    adicionarLinhaTotal();
    
    // Registrar listeners após construir tabela
    registrarTodosOsListeners();
}

// --- FUNÇÃO PARA ADICIONAR NOVA CONTA AO GRUPO ---
function adicionarContaAoGrupo(grupoIndex) {
    Swal.fire({
        title: 'Adicionar Nova Conta',
        html: `
            <div style="display: grid; gap: 15px;">
                <div style="text-align: left;">
                    <label for="nova-conta-id" style="display: block; margin-bottom: 5px; font-weight: bold;">ID da Conta:</label>
                    <input type="number" id="nova-conta-id" class="swal2-input" placeholder="Ex: 3050" style="text-align: left;">
                </div>
                <div style="text-align: left;">
                    <label for="nova-conta-desc" style="display: block; margin-bottom: 5px; font-weight: bold;">Descrição:</label>
                    <input type="text" id="nova-conta-desc" class="swal2-input" placeholder="Ex: DESCRIÇÃO DA CONTA" style="text-align: left;">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Adicionar',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            document.getElementById('nova-conta-id').focus();
        },
        preConfirm: () => {
            const id = document.getElementById('nova-conta-id').value;
            const desc = document.getElementById('nova-conta-desc').value;
            
            if (!id || !desc) {
                Swal.showValidationMessage('Por favor, preencha ID e Descrição');
                return false;
            }
            
            return { id: parseInt(id), descricao: desc };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            GRUPOS_CONTAS[grupoIndex].contas.push(result.value);
            construirTabela();
            Swal.fire('Sucesso', 'Conta adicionada ao grupo!', 'success');
        }
    });
}

// --- FUNÇÃO PARA ADICIONAR NOVO GRUPO ---
function adicionarNovoGrupo() {
    Swal.fire({
        title: 'Criar Novo Grupo',
        html: `
            <div style="text-align: left;">
                <label for="novo-grupo-nome" style="display: block; margin-bottom: 5px; font-weight: bold;">Nome do Grupo:</label>
                <input type="text" id="novo-grupo-nome" class="swal2-input" placeholder="Ex: 2. DEDUÇÕES E DEVOLUÇÕES" style="text-align: left;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Criar',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            document.getElementById('novo-grupo-nome').focus();
        },
        preConfirm: () => {
            const nome = document.getElementById('novo-grupo-nome').value;
            
            if (!nome) {
                Swal.showValidationMessage('Por favor, preencha o nome do grupo');
                return false;
            }
            
            return nome;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            GRUPOS_CONTAS.push({
                grupo: result.value,
                contas: []
            });
            construirTabela();
            Swal.fire('Sucesso', 'Novo grupo criado!', 'success');
        }
    });
}

// --- ADICIONAR LISTENERS QUANDO DOM ESTIVER PRONTO ---
function registrarTodosOsListeners() {
    // Botão novo grupo
    const btnNovoGrupo = document.getElementById('btn-novo-grupo');
    if (btnNovoGrupo) {
        btnNovoGrupo.removeEventListener('click', adicionarNovoGrupo);
        btnNovoGrupo.addEventListener('click', adicionarNovoGrupo);
    }

    // Botão importar
    const btnImportar = document.getElementById('btn-importar');
    if (btnImportar) {
        btnImportar.removeEventListener('click', abrirDialogoImportar);
        btnImportar.addEventListener('click', abrirDialogoImportar);
    }
    
    // Botão expandir/colapsar
    registrarListenerExpandirTudo();
}

document.addEventListener('DOMContentLoaded', registrarTodosOsListeners);
window.addEventListener('load', registrarTodosOsListeners);

// --- ADICIONAR LISTENER DO BOTÃO NOVO GRUPO ---
// (Será registrado em registrarTodosOsListeners)

// --- ADICIONAR LISTENER DO BOTÃO IMPORTAR ---
// (Será registrado em registrarTodosOsListeners)

// --- ADICIONAR LISTENER DO BOTÃO EXPANDIR/COLAPSAR TUDO ---
let todasGroupasExpandidas = false;

// Função para adicionar o listener com proteção
function registrarListenerExpandirTudo() {
    const btn = document.getElementById('btn-expandir-tudo');
    if (!btn) {
        console.warn('⚠️ Botão btn-expandir-tudo não encontrado');
        return;
    }
    
    btn.removeEventListener('click', handleExpandirTudo); // Remover listeners antigos
    btn.addEventListener('click', handleExpandirTudo);
}

// Handler separado para facilitar remoção
function handleExpandirTudo(e) {
    e.preventDefault();
    e.stopPropagation();
    
    todasGroupasExpandidas = !todasGroupasExpandidas;
    
    const todosGrupos = tabelaBody.querySelectorAll('tr.linha-grupo');
    const btn = document.getElementById('btn-expandir-tudo');
    
    todosGrupos.forEach((rowGrupo) => {
        const grupoIndex = rowGrupo.dataset.grupoIndex;
        const chevron = rowGrupo.querySelector('.chevron-grupo');
        const linhasContas = tabelaBody.querySelectorAll(`tr.linha-conta[data-grupo-index="${grupoIndex}"]`);
        
        if (todasGroupasExpandidas) {
            // Expandir
            linhasContas.forEach(linha => {
                linha.classList.remove('hidden-grupo');
            });
            chevron.classList.remove('rotacionado');
        } else {
            // Colapsar
            linhasContas.forEach(linha => {
                linha.classList.add('hidden-grupo');
            });
            chevron.classList.add('rotacionado');
        }
    });
    
    // Alternar ícone do botão
    const icon = btn.querySelector('i');
    if (todasGroupasExpandidas) {
        icon.classList.remove('bx-expand');
        icon.classList.add('bx-collapse');
        btn.title = 'Colapsar todas as contas';
    } else {
        icon.classList.remove('bx-collapse');
        icon.classList.add('bx-expand');
        btn.title = 'Expandir todas as contas';
    }
}

// Registrar listener quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', registrarListenerExpandirTudo);
window.addEventListener('load', registrarListenerExpandirTudo);

// --- ADICIONAR LISTENER DO BOTÃO HISTÓRICO COM DOUBLE-CLICK ---
// --- FUNÇÃO AUXILIAR PARA DESTACAR CAMPOS EDITADOS ---
async function destacarCamposEditados() {
    const ano = anoInput.value;
    
    try {
        // Remover destaque anterior
        const todosInputs = tabelaBody.querySelectorAll('.valor-mes');
        todosInputs.forEach(input => {
            input.classList.remove('campo-editado-historico');
            input.style.cursor = 'default';
        });
        
        // Buscar todos os registros do histórico
        const historicoRef = collection(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "historico");
        const snapshot = await getDocs(historicoRef);
        
        // Coletar todos os campos que foram editados (contaId + mesIndex únicos)
        const camposEditados = new Set();
        snapshot.forEach((doc) => {
            const mudanca = doc.data();
            const chave = `${mudanca.contaId}_${mudanca.mesIndex}`;
            camposEditados.add(chave);
        });
        
        // Destacar os campos editados
        camposEditados.forEach((chave) => {
            const [contaId, mesIndex] = chave.split('_');
            const row = tabelaBody.querySelector(`tr.linha-conta[data-conta-id="${contaId}"]`);
            if (row) {
                const input = row.querySelector(`.mes-${mesIndex}`);
                if (input) {
                    input.classList.add('campo-editado-historico');
                    input.style.cursor = 'pointer';
                    
                    // Adicionar listener para mostrar histórico ao clicar
                    input.addEventListener('click', (e) => {
                        e.stopPropagation();
                        verHistoricoPorCampo(contaId, mesIndex);
                    });
                }
            }
        });
        
    } catch (error) {
        console.error("Erro ao destacar campos editados:", error);
    }
}

// --- LISTENER DO BOTÃO HISTÓRICO ---
document.getElementById('btn-historico').addEventListener('click', async (e) => {
    e.stopPropagation();
    await destacarCamposEditados();
    Swal.fire({
        position: 'top',
        icon: 'info',
        title: 'Campos Destacados',
        text: 'Aperte no campo em laranja para ver seu histórico de alterações',
        timer: 3000,
        timerProgressBar: true,
        showConfirmButton: false
    });
});

// --- FUNÇÃO PARA ABRIR DIÁLOGO DE IMPORTAÇÃO ---
function abrirDialogoImportar() {
    Swal.fire({
        title: 'Importar de Excel',
        html: `
            <div style="text-align: left;">
                <p style="margin-bottom: 15px; font-size: 14px;">
                    Carregue um arquivo Excel com a estrutura de grupos e contas.
                </p>
                <p style="margin-bottom: 10px; font-size: 12px; color: #666;">
                    <strong>Formato esperado:</strong>
                </p>
                <ul style="text-align: left; font-size: 12px; margin-bottom: 15px;">
                    <li><strong>Coluna A:</strong> ID da Conta (vazio para grupos)</li>
                    <li><strong>Coluna B:</strong> Descrição da Conta ou Nome do Grupo</li>
                </ul>
                <input type="file" id="arquivo-excel" accept=".xlsx,.xls" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Importar',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            document.getElementById('arquivo-excel').focus();
        },
        preConfirm: () => {
            const fileInput = document.getElementById('arquivo-excel');
            if (!fileInput.files[0]) {
                Swal.showValidationMessage('Por favor, selecione um arquivo Excel');
                return false;
            }
            return fileInput.files[0];
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            processarArquivoExcel(result.value);
        }
    });
}

// --- FUNÇÃO PARA PROCESSAR ARQUIVO EXCEL ---
function processarArquivoExcel(arquivo) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const dados = e.target.result;
            const workbook = XLSX.read(dados, { type: 'binary' });
            
            // Procurar pela aba "TOTAL POS VENDAS" ou usar a primeira aba
            let nomeAba = "TOTAL POS VENDAS";
            if (!workbook.SheetNames.includes(nomeAba)) {
                const abasDisponiveis = workbook.SheetNames.join(', ');
                Swal.fire('Aviso', `Aba "TOTAL POS VENDAS" não encontrada. Abas disponíveis: ${abasDisponiveis}. Usando primeira aba.`, 'warning');
                nomeAba = workbook.SheetNames[0];
            }
            
            const planilha = workbook.Sheets[nomeAba];
            const dados_json = XLSX.utils.sheet_to_json(planilha, { header: 1 });
            
            if (dados_json.length < 2) {
                Swal.fire('Erro', 'Arquivo vazio ou sem dados', 'error');
                return;
            }
            
            // Processar dados
            const novoGrupos = [];
            let grupoAtual = null;
            let totalContas = 0;
            const valoresContas = {}; // Armazenar valores por conta ID e mês
            
            // Detectar índices das colunas de meses na primeira linha
            const primeiraLinha = dados_json[0];
            const indicesMeses = [];
            const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            
            for (let i = 2; i < primeiraLinha.length; i++) {
                const cabecalho = String(primeiraLinha[i] || '').toLowerCase();
                // Procurar por mês no header (ex: "01/2026", "janeiro", "jan", etc)
                if (cabecalho.includes('/') || nomesMeses.some(m => cabecalho.includes(m.toLowerCase()))) {
                    indicesMeses.push(i);
                }
            }
            
            // Se não encontrou pelos nomes, assumir que as colunas C a N são os meses
            if (indicesMeses.length === 0) {
                for (let i = 2; i < Math.min(14, primeiraLinha.length); i++) {
                    indicesMeses.push(i);
                }
            }
            
            // Processar as linhas de dados
            for (let i = 1; i < dados_json.length; i++) {
                const linha = dados_json[i];
                const contaId = linha[0];
                const descricao = linha[1];
                
                if (!descricao) {
                    continue; // Pular linhas vazias
                }
                
                // Se não tem ID, é um grupo
                if (contaId === undefined || contaId === null || contaId === '') {
                    grupoAtual = {
                        grupo: String(descricao).toUpperCase(),
                        contas: []
                    };
                    novoGrupos.push(grupoAtual);
                } else {
                    // Se tem ID, é uma conta
                    if (grupoAtual === null) {
                        grupoAtual = {
                            grupo: "SEM GRUPO",
                            contas: []
                        };
                        novoGrupos.push(grupoAtual);
                    }
                    
                    const contaIdInt = parseInt(contaId);
                    grupoAtual.contas.push({
                        id: contaIdInt,
                        descricao: String(descricao).toUpperCase()
                    });
                    
                    // Armazenar valores dos meses
                    valoresContas[contaIdInt] = {};
                    indicesMeses.forEach((indice, mesIndex) => {
                        const valor = parseFloat(linha[indice]) || 0;
                        valoresContas[contaIdInt][mesIndex] = valor;
                    });
                    
                    totalContas++;
                }
            }
            
            // Atualizar GRUPOS_CONTAS com os novos dados
            GRUPOS_CONTAS.length = 0;
            GRUPOS_CONTAS.push(...novoGrupos);
            
            // Reconstruir tabela
            construirTabela();
            
            // Preencher valores importados
            preencherValoresImportados(valoresContas);
            
            Swal.fire(
                'Sucesso!',
                `${GRUPOS_CONTAS.length} grupo(s) e ${totalContas} conta(s) importados com valores da aba "${nomeAba}"!`,
                'success'
            );
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            Swal.fire('Erro', 'Erro ao processar o arquivo: ' + error.message, 'error');
        }
    };
    
    reader.readAsBinaryString(arquivo);
}

// --- FUNÇÃO PARA PREENCHER VALORES IMPORTADOS ---
function preencherValoresImportados(valoresContas) {
    Object.keys(valoresContas).forEach(contaId => {
        const row = tabelaBody.querySelector(`tr.linha-conta[data-conta-id="${contaId}"]`);
        if (row) {
            const meses = valoresContas[contaId];
            Object.keys(meses).forEach(mesIndex => {
                const input = row.querySelector(`.mes-${mesIndex}`);
                if (input) {
                    input.value = meses[mesIndex] || '';
                    input.dataset.valorAnterior = meses[mesIndex] || 0;
                }
            });
        }
    });
    
    // Recalcular totais
    calcularTotais();
}

function toggleGrupo(grupoIndex, rowGrupo) {
    const linhasContas = tabelaBody.querySelectorAll(`tr.linha-conta[data-grupo-index="${grupoIndex}"]`);
    const chevron = rowGrupo.querySelector('.chevron-grupo');
    
    linhasContas.forEach(linha => {
        linha.classList.toggle('hidden-grupo');
    });
    
    // Rotacionar chevron
    chevron.classList.toggle('rotacionado');
}

// --- FUNÇÃO PARA EXPANDIR/MINIMIZAR CONTA INDIVIDUAL ---
function toggleContaIndividual(rowConta, contaIndex, grupoIndex) {
    const btnExpandir = rowConta.querySelector('.btn-expandir-conta');
    const icon = btnExpandir.querySelector('i');
    
    // Toggle display dos inputs
    const inputs = rowConta.querySelectorAll('.valor-mes');
    const totalConta = rowConta.querySelector('.total-conta');
    
    const estaOculto = rowConta.classList.contains('conta-minimizada');
    
    if (estaOculto) {
        // Mostrar
        inputs.forEach(input => input.style.display = '');
        totalConta.style.display = '';
        rowConta.classList.remove('conta-minimizada');
        icon.classList.remove('bxs-chevron-right');
        icon.classList.add('bxs-chevron-down');
    } else {
        // Ocultar
        inputs.forEach(input => input.style.display = 'none');
        totalConta.style.display = 'none';
        rowConta.classList.add('conta-minimizada');
        icon.classList.remove('bxs-chevron-down');
        icon.classList.add('bxs-chevron-right');
    }
}

// --- ADICIONAR LINHA DE TOTAL GERAL ---
function adicionarLinhaTotal() {
    const row = document.createElement('tr');
    row.classList.add('linha-total');
    
    let cellsHTML = `
        <td colspan="2"><strong>TOTAL GERAL</strong></td>
    `;
    
    for (let i = 0; i < MESES.length; i++) {
        cellsHTML += `<td><strong class="total-mes-${i}">0,00</strong></td>`;
    }
    
    cellsHTML += `<td><strong class="total-geral">0,00</strong></td>`;
    row.innerHTML = cellsHTML;
    tabelaBody.appendChild(row);
}

// --- CALCULAR TOTAIS ---
function calcularTotais() {
    // Calcular totais por conta e subtotais por grupo
    const linhas = tabelaBody.querySelectorAll('tr.linha-conta');
    const totaisPorMes = Array(MESES.length).fill(0);
    const subtotaisPorGrupo = {};
    
    // Inicializar subtotais por grupo
    GRUPOS_CONTAS.forEach((grupo, idx) => {
        subtotaisPorGrupo[idx] = Array(MESES.length).fill(0);
    });
    
    // Contar todas as linhas de conta (visíveis e ocultas)
    linhas.forEach(linha => {
        let totalConta = 0;
        const grupoIndex = linha.dataset.grupoIndex;
        
        MESES.forEach((mes, index) => {
            const input = linha.querySelector(`.mes-${index}`);
            const valor = parseFloat(input.value) || 0;
            totalConta += valor;
            totaisPorMes[index] += valor;
            subtotaisPorGrupo[grupoIndex][index] += valor;
        });
        
        // Atualizar total da conta
        const totalCell = linha.querySelector('.total-conta');
        totalCell.textContent = formatarMoeda(totalConta);
    });
    
    // Atualizar subtotais dos grupos
    Object.keys(subtotaisPorGrupo).forEach((grupoIndex) => {
        let subtotalGrupo = 0;
        subtotaisPorGrupo[grupoIndex].forEach((valor, mesIndex) => {
            const subtotalCell = tabelaBody.querySelector(`.subtotal-grupo-mes-${grupoIndex}-${mesIndex}`);
            if (subtotalCell) {
                subtotalCell.textContent = formatarMoeda(valor);
            }
            subtotalGrupo += valor;
        });
        
        const subtotalGrupoTotalCell = tabelaBody.querySelector(`.subtotal-grupo-total-${grupoIndex}`);
        if (subtotalGrupoTotalCell) {
            subtotalGrupoTotalCell.textContent = formatarMoeda(subtotalGrupo);
        }
    });
    
    // Atualizar totais por mês e total geral
    // Soma TODOS os subtotais dos grupos para evitar erros de arredondamento
    let totalGeral = 0;
    
    // Forma correta: somar os subtotais dos grupos (não os totais por mês)
    Object.keys(subtotaisPorGrupo).forEach((grupoIndex) => {
        subtotaisPorGrupo[grupoIndex].forEach((valor) => {
            totalGeral += valor;
        });
    });
    
    // Atualizar células de total por mês
    totaisPorMes.forEach((total, index) => {
        const totalMesCell = tabelaBody.querySelector(`.total-mes-${index}`);
        if (totalMesCell) {
            totalMesCell.textContent = formatarMoeda(total);
        }
    });
    
    const totalGeralCell = tabelaBody.querySelector('.total-geral');
    if (totalGeralCell) {
        totalGeralCell.textContent = formatarMoeda(totalGeral);
    }
}


// --- VALIDAR E FILTRAR ENTRADA DE NÚMEROS ---
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('valor-mes')) {
        // Permite apenas números, ponto e hífen (negativo)
        let valor = e.target.value;
        valor = valor.replace(/[^\d.-]/g, ''); // Remove caracteres não permitidos
        
        // Evitar múltiplos pontos
        const partes = valor.split('.');
        if (partes.length > 2) {
            valor = partes[0] + '.' + partes.slice(1).join('');
        }
        
        // Evitar múltiplos hífens
        if ((valor.match(/-/g) || []).length > 1) {
            valor = valor.replace(/-/g, '');
            valor = '-' + valor;
        }
        
        // Hífen apenas no início
        if (valor.includes('-') && !valor.startsWith('-')) {
            valor = valor.replace(/-/g, '');
            valor = '-' + valor;
        }
        
        e.target.value = valor;
        calcularTotais();
    }
});

// --- RASTREAR MUDANÇAS NOS VALORES ---
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('valor-mes')) {
        const linha = e.target.closest('tr.linha-conta');
        if (linha) {
            const contaId = linha.dataset.contaId;
            const mesIndex = e.target.dataset.mes;
            const novoValor = parseFloat(e.target.value) || 0;
            const valorAnterior = e.target.dataset.valorAnterior ? parseFloat(e.target.dataset.valorAnterior) : 0;
            
            // Se mudou o valor, registrar
            if (novoValor !== valorAnterior) {
                registrarMudanca(contaId, mesIndex, valorAnterior, novoValor);
                e.target.dataset.valorAnterior = novoValor; // Atualizar valor anterior
            }
        }
    }
});

// --- FUNÇÃO PARA REGISTRAR MUDANÇA ---
async function registrarMudanca(contaId, mesIndex, valorAnterior, novoValor) {
    if (!usuarioAtual || !nomeUsuario) return;
    
    const ano = anoInput.value;
    const agora = new Date();
    const mesNome = MESES[mesIndex];
    
    const mudanca = {
        contaId: parseInt(contaId),
        mesIndex: parseInt(mesIndex),
        mesNome: mesNome,
        valorAnterior: valorAnterior,
        novoValor: novoValor,
        diferenca: novoValor - valorAnterior,
        usuario: nomeUsuario,
        usuarioId: usuarioAtual,
        data: agora,
        timestamp: agora.getTime()
    };
    
    try {
        // Salvar no Firebase
        const historicoRef = collection(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "historico");
        await addDoc(historicoRef, mudanca);
        
        // Adicionar indicador visual na célula
        const linha = tabelaBody.querySelector(`tr.linha-conta[data-conta-id="${contaId}"]`);
        if (linha) {
            const input = linha.querySelector(`.mes-${mesIndex}`);
            if (input) {
                input.classList.add('valor-alterado');
                input.title = `Alterado por ${nomeUsuario} em ${agora.toLocaleString('pt-BR')}`;
                
                // Remover destaque após 3 segundos
                setTimeout(() => {
                    input.classList.remove('valor-alterado');
                }, 3000);
            }
        }
    } catch (error) {
        console.error("Erro ao registrar mudança:", error);
    }
}

// --- FORMATAR MOEDA ---
function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    }).format(valor);
}

// --- CARREGAR PLANEJAMENTO DO FIREBASE ---
async function carregarPlanejamento() {
    try {
        const ano = anoInput.value;
        const departamento = departamentoAtual || 'Geral';
        const planejamentoRef = doc(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "departamentos", departamento);
        const planejamentoSnap = await getDoc(planejamentoRef);
        
        if (planejamentoSnap.exists()) {
            const dados = planejamentoSnap.data();
            
            // Preencher valores dos meses
            if (dados.contas) {
                Object.keys(dados.contas).forEach(contaId => {
                    const row = tabelaBody.querySelector(`tr.linha-conta[data-conta-id="${contaId}"]`);
                    if (row) {
                        const meses = dados.contas[contaId];
                        Object.keys(meses).forEach(mesIndex => {
                            const input = row.querySelector(`.mes-${mesIndex}`);
                            if (input) {
                                input.value = meses[mesIndex] || '';
                                input.dataset.valorAnterior = meses[mesIndex] || 0;
                            }
                        });
                    }
                });
            }
            
            // Verificar se está fechado
            const anoFechado = dados.fechado || false;
            if (anoFechado) {
                desabilitarEdicao();
            }
            
            calcularTotais();
        }
    } catch (error) {
        console.error("Erro ao carregar planejamento:", error);
        // Não mostra aviso, é normal não ter planejamento
    }
}

// --- SALVAR PLANEJAMENTO ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const ano = anoInput.value;
    const departamento = departamentoAtual || 'Geral';
    
    if (!ano) {
        Swal.fire('Erro', 'Por favor, selecione um ano.', 'error');
        return;
    }
    
    // Coletar dados da tabela (apenas contas)
    const dadosContas = {};
    const linhas = tabelaBody.querySelectorAll('tr.linha-conta');
    
    linhas.forEach(linha => {
        const contaId = linha.dataset.contaId;
        if (!contaId) return; // Pular se não houver ID
        
        const meses = {};
        
        MESES.forEach((mes, index) => {
            const input = linha.querySelector(`.mes-${index}`);
            if (input) {
                const valor = parseFloat(input.value) || 0;
                meses[index] = valor;
            }
        });
        
        dadosContas[contaId] = meses;
    });
    
    // Salvar no Firebase
    Swal.fire({
        title: 'Salvando...',
        text: 'Aguarde um momento.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    try {
        // Salvar dados do departamento
        const departamentoRef = doc(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "departamentos", departamento);
        await setDoc(departamentoRef, {
            contas: dadosContas,
            departamento: departamento,
            filial: filialAtual,
            dataAtualizacao: new Date()
        }, { merge: true });
        
        // Salvar estrutura de grupos, filial e departamento na raiz do planejamento
        const planejamentoRef = doc(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`);
        await setDoc(planejamentoRef, {
            ano: parseInt(ano),
            grupos: GRUPOS_CONTAS,
            filial: filialAtual,
            departamento: departamento,
            dataCriacao: new Date()
        }, { merge: true });
        
        Swal.fire('Sucesso', `Planejamento do departamento "${departamento}" salvo com sucesso!`, 'success');
    } catch (error) {
        console.error("Erro ao salvar planejamento:", error);
        Swal.fire('Erro', 'Erro ao salvar planejamento: ' + error.message, 'error');
    }
});

// --- LIMPAR FORMULÁRIO ---
document.getElementById('btn-limpar').addEventListener('click', () => {
    Swal.fire({
        title: 'Limpar formulário?',
        text: 'Todos os valores serão removidos.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, limpar!',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            const inputs = tabelaBody.querySelectorAll('.valor-mes');
            inputs.forEach(input => input.value = '');
            calcularTotais();
        }
    });
});

// --- FECHAR/ABRIR ANO ---
document.getElementById('btn-fechar-ano').addEventListener('click', async () => {
    const ano = anoInput.value;
    if (!ano) {
        Swal.fire('Erro', 'Por favor, selecione um ano.', 'error');
        return;
    }

    
    const planejamentoRef = doc(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`);
    const planejamentoSnap = await getDoc(planejamentoRef);
    
    if (!planejamentoSnap.exists()) {
        Swal.fire('Erro', 'Planejamento não encontrado.', 'error');
        return;
    }
    
    const anoFechado = planejamentoSnap.data().fechado || false;
    
    if (anoFechado) {
        // Abrir ano
        Swal.fire({
            title: 'Abrir o ano ' + ano + '?',
            text: 'O ano voltará a ser editável.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4caf50',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, abrir!',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                await setDoc(planejamentoRef, { fechado: false }, { merge: true });
                habilitarEdicao();
                
                const btn = document.getElementById('btn-fechar-ano');
                btn.classList.remove('fechado');
                btn.innerHTML = '<i class=\'bx bx-lock\'></i> Fechar Ano';
                
                Swal.fire('Sucesso', 'Ano aberto para edição!', 'success');
            }
        });
    } else {
        // Fechar ano
        Swal.fire({
            title: 'Fechar o ano ' + ano + '?',
            text: 'O planejamento será salvo automaticamente e não poderá mais ser editado.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, fechar!',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                // Coletar dados antes de fechar
                const dadosContas = {};
                const linhas = tabelaBody.querySelectorAll('tr.linha-conta');
                
                linhas.forEach(linha => {
                    const contaId = linha.dataset.contaId;
                    if (!contaId) return;
                    
                    const meses = {};
                    MESES.forEach((mes, index) => {
                        const input = linha.querySelector(`.mes-${index}`);
                        if (input) {
                            const valor = parseFloat(input.value) || 0;
                            meses[index] = valor;
                        }
                    });
                    
                    dadosContas[contaId] = meses;
                });
                
                // Salvar e fechar
                await setDoc(planejamentoRef, {
                    contas: dadosContas,
                    fechado: true,
                    dataFechamento: new Date()
                }, { merge: true });
                
                desabilitarEdicao();
                
                const btn = document.getElementById('btn-fechar-ano');
                btn.classList.add('fechado');
                btn.innerHTML = '<i class=\'bx bx-lock-open\'></i> Ano Fechado';
                
                Swal.fire('Sucesso', 'Ano fechado com sucesso! Nenhuma edição será permitida.', 'success');
            }
        });
    }
});

// --- MUDAR ANO ---
anoInput.addEventListener('change', async () => {
    await carregarPlanejamento();
});

// --- FUNÇÃO PARA VER HISTÓRICO ---
// Função auxiliar para buscar grupo e descricao da conta
function buscarInfoConta(contaId) {
    for (const grupo of GRUPOS_CONTAS) {
        const conta = grupo.contas.find(c => c.id === contaId);
        if (conta) {
            return {
                grupo: grupo.grupo,
                descricao: conta.descricao
            };
        }
    }
    return { grupo: 'Desconhecido', descricao: 'Conta não encontrada' };
}

// --- FUNÇÃO PARA VER HISTÓRICO DE UM CAMPO ESPECÍFICO ---
async function verHistoricoPorCampo(contaId, mesIndex) {
    const ano = anoInput.value;
    
    try {
        const historicoRef = collection(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "historico");
        const snapshot = await getDocs(historicoRef);
        
        // Filtrar em memória por contaId e mesIndex
        const mudancasFiltradas = [];
        snapshot.forEach((doc) => {
            const mudanca = doc.data();
            if (mudanca.contaId === parseInt(contaId) && mudanca.mesIndex === parseInt(mesIndex)) {
                mudancasFiltradas.push(mudanca);
            }
        });
        
        // Ordenar por timestamp descendente e limitar a 50
        mudancasFiltradas.sort((a, b) => b.timestamp - a.timestamp);
        mudancasFiltradas.splice(50);
        
        const infoContaa = buscarInfoConta(parseInt(contaId));
        const mesNome = MESES[mesIndex];
        
        let htmlHistorico = `
            <div style="text-align: left; max-height: 500px; overflow-y: auto;">
                <div style="margin-bottom: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 5px;">
                    <p style="margin: 5px 0;"><strong>Grupo:</strong> ${infoContaa.grupo}</p>
                    <p style="margin: 5px 0;"><strong>Conta:</strong> ${infoContaa.descricao}</p>
                    <p style="margin: 5px 0;"><strong>Mês:</strong> ${mesNome}</p>
                </div>
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f0f0f0;">
                            <th style="padding: 8px; border: 1px solid #ddd;">Data/Hora</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Usuário</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Valor Anterior</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Novo Valor</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Diferença</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let totalMudancas = 0;
        
        mudancasFiltradas.forEach((mudanca) => {
            const dataHora = new Date(mudanca.timestamp).toLocaleString('pt-BR');
            const valorAnt = formatarMoeda(mudanca.valorAnterior);
            const novoVal = formatarMoeda(mudanca.novoValor);
            const dif = formatarMoeda(mudanca.diferenca);
            const corDif = mudanca.diferenca >= 0 ? 'green' : 'red';
            
            htmlHistorico += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${dataHora}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>${mudanca.usuario}</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${valorAnt}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${novoVal}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${corDif};"><strong>${dif}</strong></td>
                </tr>
            `;
            totalMudancas++;
        });
        
        htmlHistorico += `
                    </tbody>
                </table>
            </div>
            <p style="margin-top: 15px; font-size: 12px;"><strong>Total de alterações: ${totalMudancas}</strong></p>
        `;
        
        Swal.fire({
            title: `Histórico - ${mesNome}`,
            html: htmlHistorico,
            width: 900,
            didOpen: () => {
                Swal.getHtmlContainer().style.maxHeight = 'none';
            }
        });
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        Swal.fire('Erro', 'Erro ao carregar histórico: ' + error.message, 'error');
    }
}

async function verHistorico() {
    const ano = anoInput.value;
    
    try {
        const historicoRef = collection(db, "usuarios", usuarioAtual, "planejamentos", `anual_${ano}`, "historico");
        const q = query(historicoRef, orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        let htmlHistorico = `
            <div style="text-align: left; max-height: 500px; overflow-y: auto;">
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f0f0f0;">
                            <th style="padding: 8px; border: 1px solid #ddd;">Data/Hora</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Usuário</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Grupo</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Conta</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Mês</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Valor Anterior</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Novo Valor</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Diferença</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let totalMudancas = 0;
        
        snapshot.forEach((doc) => {
            const mudanca = doc.data();
            const dataHora = new Date(mudanca.timestamp).toLocaleString('pt-BR');
            const valorAnt = formatarMoeda(mudanca.valorAnterior);
            const novoVal = formatarMoeda(mudanca.novoValor);
            const dif = formatarMoeda(mudanca.diferenca);
            const corDif = mudanca.diferenca >= 0 ? 'green' : 'red';
            
            const infoContaa = buscarInfoConta(mudanca.contaId);
            
            htmlHistorico += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${dataHora}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>${mudanca.usuario}</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${infoContaa.grupo}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${infoContaa.descricao}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${mudanca.mesNome}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${valorAnt}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${novoVal}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${corDif};"><strong>${dif}</strong></td>
                </tr>
            `;
            totalMudancas++;
        });
        
        htmlHistorico += `
                    </tbody>
                </table>
            </div>
            <p style="margin-top: 15px; font-size: 12px;"><strong>Total de alterações: ${totalMudancas}</strong></p>
        `;
        
        Swal.fire({
            title: `Histórico de Alterações - ${ano}`,
            html: htmlHistorico,
            width: 1200,
            didOpen: () => {
                Swal.getHtmlContainer().style.maxHeight = 'none';
            }
        });
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        Swal.fire('Erro', 'Erro ao carregar histórico: ' + error.message, 'error');
    }
}
