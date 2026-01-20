let gruposContas = [];
let gruposExpandidos = {}; // Usar objeto para melhor rastreamento
let todasExpandidas = true; // Controla estado global dos grupos

// Importar configurações do Firebase
import { db } from '/assets/js/firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    deleteDoc,
    query,
    where,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";



// Renderiza a tabela de grupos e contas
function renderTabela() {


    const tabelaBody = document.getElementById('tabela-body');
    tabelaBody.innerHTML = '';
    const termo = (document.getElementById('campo-pesquisa-grupos-contas')?.value || '').toLowerCase();
    gruposContas.forEach((grupo, grupoIdx) => {
        // Filtro: mostra grupo se nome do grupo bate OU alguma conta bate
        const grupoNome = (grupo.grupo || '').toLowerCase();
        const contasFiltradas = grupo.contas.filter(conta =>
            (conta.id + '').toLowerCase().includes(termo) ||
            (conta.descricao || '').toLowerCase().includes(termo)
        );
        const grupoMatch = grupoNome.includes(termo);
        if (!grupoMatch && termo && contasFiltradas.length === 0) return;
        // Inicializa estado expandido se não existir
        if (!(grupoIdx in gruposExpandidos)) gruposExpandidos[grupoIdx] = true;
        // Grupo
        const grupoRow = document.createElement('tr');
        grupoRow.innerHTML = `
            <td style="display:flex;align-items:center;gap:6px;">
                <button class="btn-acao" style="padding:2px 7px;" title="Expandir/Minimizar" onclick="window.toggleGrupo(${grupoIdx})">
                    <i class='bx bx-chevron-${gruposExpandidos[grupoIdx] ? 'down' : 'right'}'></i>
                </button>
                <input type="text" class="input-melhorado" value="${grupo.grupo}" onchange="editarGrupo(${grupoIdx}, this.value)">
            </td>
            <td></td>
            <td></td>
            <td>
                <button class="btn-acao" onclick="removerGrupo(${grupoIdx})">Remover</button>
                <button class="btn-add-conta" onclick="adicionarConta(${grupoIdx})">+ Conta</button>
            </td>
        `;
        tabelaBody.appendChild(grupoRow);
        // Contas (só mostra se expandido)
        if (gruposExpandidos[grupoIdx]) {
            (termo ? contasFiltradas : grupo.contas).forEach((conta, contaIdx) => {
                // Precisa do índice real para editar/remover
                const realContaIdx = grupo.contas.indexOf(conta);
                const contaRow = document.createElement('tr');
                contaRow.innerHTML = `
                    <td></td>
                    <td><input type="number" class="input-melhorado" value="${conta.id}" onchange="editarContaId(${grupoIdx},${realContaIdx},this.value)"></td>
                    <td><input type="text" class="input-melhorado" value="${conta.descricao}" onchange="editarContaDescricao(${grupoIdx},${realContaIdx},this.value)"></td>
                    <td>
                        <button class="btn-acao" onclick="removerConta(${grupoIdx},${realContaIdx})">Remover</button>
                    </td>
                `;
                tabelaBody.appendChild(contaRow);
            });
        }
    });
}
// Campo de pesquisa: filtra em tempo real
const campoPesquisa = document.getElementById('campo-pesquisa-grupos-contas');
if (campoPesquisa) {
    campoPesquisa.addEventListener('input', renderTabela);
}
// Adicionar conta a um grupo (no topo)
window.adicionarConta = function(grupoIdx) {
    gruposContas[grupoIdx].contas.unshift({ id: '', descricao: '' });
    gruposExpandidos[grupoIdx] = true; // sempre expande ao adicionar
    renderTabela();
}
// Minimizar/expandir grupo
window.toggleGrupo = function(grupoIdx) {
    gruposExpandidos[grupoIdx] = !gruposExpandidos[grupoIdx];
    renderTabela();
}

// Funções de edição
window.editarGrupo = function(grupoIdx, valor) {
    gruposContas[grupoIdx].grupo = valor;
    renderTabela();
}
window.editarContaId = function(grupoIdx, contaIdx, valor) {
    gruposContas[grupoIdx].contas[contaIdx].id = valor;
    renderTabela();
}
window.editarContaDescricao = function(grupoIdx, contaIdx, valor) {
    gruposContas[grupoIdx].contas[contaIdx].descricao = valor;
    renderTabela();
}
window.removerGrupo = function(grupoIdx) {
    gruposContas.splice(grupoIdx, 1);
    renderTabela();
}
window.removerConta = function(grupoIdx, contaIdx) {
    gruposContas[grupoIdx].contas.splice(contaIdx, 1);
    renderTabela();
}


// Garantir que os botões só sejam registrados após o DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
    const btnNovoGrupo = document.getElementById('btn-novo-grupo');
    if (btnNovoGrupo) {
        btnNovoGrupo.addEventListener('click', () => {
            const novoIdx = gruposContas.length;
            gruposContas.push({ grupo: 'Novo Grupo', contas: [] });
            gruposExpandidos[novoIdx] = true;
            renderTabela();
        });
    }
    const btnImportar = document.getElementById('btn-importar');
    if (btnImportar) {
        btnImportar.addEventListener('click', abrirDialogoImportar);
    }
    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar) {
        btnSalvar.addEventListener('click', salvarNoFirebase);
    }
    
    const btnToggle = document.getElementById('btn-toggle-grupos');
    if (btnToggle) {
        btnToggle.addEventListener('click', toggleTodosGrupos);
    }
    
    // Carregar dados do Firebase ao abrir a página
    carregarDoFirebase();
});

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

function processarArquivoExcel(arquivo) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const dados = e.target.result;
            const workbook = XLSX.read(dados, { type: 'binary' });
            let nomeAba = workbook.SheetNames[0];
            const planilha = workbook.Sheets[nomeAba];
            const dados_json = XLSX.utils.sheet_to_json(planilha, { header: 1 });
            if (dados_json.length < 2) {
                Swal.fire('Erro', 'Arquivo vazio ou sem dados', 'error');
                return;
            }
            const novoGrupos = [];
            let grupoAtual = null;
            for (let i = 1; i < dados_json.length; i++) {
                const linha = dados_json[i];
                const contaId = linha[0];
                const descricao = linha[1];
                if (!descricao) continue;
                if (contaId === undefined || contaId === null || contaId === '') {
                    grupoAtual = { grupo: String(descricao), contas: [] };
                    novoGrupos.push(grupoAtual);
                } else {
                    if (!grupoAtual) {
                        grupoAtual = { grupo: 'SEM GRUPO', contas: [] };
                        novoGrupos.push(grupoAtual);
                    }
                    grupoAtual.contas.push({ id: contaId, descricao: String(descricao) });
                }
            }
            gruposContas = novoGrupos;
            gruposExpandidos = novoGrupos.map(() => true);
            renderTabela();
            Swal.fire('Sucesso!', 'Grupos e contas importados!', 'success');
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            Swal.fire('Erro', 'Erro ao processar o arquivo: ' + error.message, 'error');
        }
    };
    reader.readAsBinaryString(arquivo);
}

// Inicializa a tabela
renderTabela();
//

// ===== FUNÇÕES FIREBASE =====

// Salvar dados no Firebase
async function salvarNoFirebase() {
    try {
        // Validar dados
        if (gruposContas.length === 0) {
            Swal.fire('Atenção', 'Nenhum grupo para salvar', 'warning');
            return;
        }

        // Mostrar loading
        Swal.fire({
            title: 'Salvando...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Validar se há grupos ou contas vazias
        const gruposValidos = gruposContas.filter(g => g.grupo && g.grupo.trim() !== '');
        if (gruposValidos.length === 0) {
            Swal.fire('Erro', 'Todos os grupos estão vazios', 'error');
            return;
        }

        // Obter ID do usuário (se tiver autenticação)
        const usuarioId = 'planejamento_anual'; // Você pode usar a autenticação real se desejar

        // Salvar no Firestore
        const colecao = collection(db, 'planejamento_anual');
        
        // Deletar dados antigos para evitar duplicação
        const q = query(colecao, where('usuarioId', '==', usuarioId));
        const querySnapshot = await getDocs(q);
        for (const docSnap of querySnapshot.docs) {
            await deleteDoc(doc(db, 'planejamento_anual', docSnap.id));
        }

        // Salvar novos dados
        const dataAtual = new Date();
        await addDoc(colecao, {
            usuarioId: usuarioId,
            gruposContas: gruposContas,
            dataSalva: dataAtual,
            timestamp: dataAtual.getTime()
        });

        Swal.fire('Sucesso!', 'Grupos e contas salvos no Firebase!', 'success');
        console.log('✅ Dados salvos no Firebase:', gruposContas);
    } catch (error) {
        console.error('❌ Erro ao salvar no Firebase:', error);
        Swal.fire('Erro', 'Erro ao salvar: ' + error.message, 'error');
    }
}

// Carregar dados do Firebase
async function carregarDoFirebase() {
    try {
        const usuarioId = 'planejamento_anual';
        const colecao = collection(db, 'planejamento_anual');
        const q = query(colecao, where('usuarioId', '==', usuarioId));
        
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            const dados = doc.data();
            
            if (dados.gruposContas && Array.isArray(dados.gruposContas)) {
                gruposContas = dados.gruposContas;
                gruposExpandidos = gruposContas.map(() => true);
                renderTabela();
                console.log('✅ Dados carregados do Firebase:', gruposContas);
            }
        } else {
            console.log('ℹ️ Nenhum dado de planejamento anual encontrado no Firebase');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar do Firebase:', error);
        // Não mostrar erro ao usuário, apenas no console
    }
}

// Minimizar/Expandir todos os grupos
window.toggleTodosGrupos = function() {
    todasExpandidas = !todasExpandidas;
    gruposExpandidos = gruposExpandidos.map(() => todasExpandidas);
    
    const btnToggle = document.getElementById('btn-toggle-grupos');
    if (btnToggle) {
        if (todasExpandidas) {
            btnToggle.innerHTML = "<i class='bx bx-collapse-alt'></i> Minimizar Tudo";
            btnToggle.title = "Minimizar todos os grupos";
        } else {
            btnToggle.innerHTML = "<i class='bx bx-expand-alt'></i> Expandir Tudo";
            btnToggle.title = "Expandir todos os grupos";
        }
    }
    
    renderTabela();
}
