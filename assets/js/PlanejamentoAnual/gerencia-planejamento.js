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
                        <button class="btn-acao" onclick="moverConta(${grupoIdx},${realContaIdx})">Mover</button>
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

// Mover uma conta para outro grupo
window.moverConta = function(grupoIdx, contaIdx) {
    const conta = gruposContas[grupoIdx].contas[contaIdx];
    const grupoAtual = gruposContas[grupoIdx].grupo;
    
    // Criar opções de grupos (excluindo o grupo atual)
    const opcoesSgrupos = gruposContas
        .map((g, idx) => idx !== grupoIdx ? `<option value="${idx}">${g.grupo} (${g.contas.length} conta${g.contas.length !== 1 ? 's' : ''})</option>` : '')
        .filter(o => o)
        .join('');
    
    if (!opcoesSgrupos) {
        Swal.fire('Aviso', 'Não há outros grupos para mover esta conta', 'warning');
        return;
    }
    
    Swal.fire({
        title: 'Mover Conta',
        html: `
            <div style="text-align: left;">
                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <p style="font-size: 12px; margin: 0 0 5px 0;"><strong>Grupo Atual:</strong> ${grupoAtual}</p>
                    <p style="font-size: 12px; margin: 0;"><strong>Conta:</strong> ${conta.id} - ${conta.descricao}</p>
                </div>
                <p style="margin-bottom: 10px; font-size: 13px; font-weight: bold;">Para qual grupo deseja mover?</p>
                <select id="select-grupo-mover" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                    <option value="">-- Selecione um grupo --</option>
                    ${opcoesSgrupos}
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Mover',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            document.getElementById('select-grupo-mover').focus();
        },
        preConfirm: () => {
            const selectElement = document.getElementById('select-grupo-mover');
            if (!selectElement.value) {
                Swal.showValidationMessage('Por favor, selecione um grupo');
                return false;
            }
            return parseInt(selectElement.value);
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const novoGrupoIdx = result.value;
            
            // Remover da conta do grupo atual
            gruposContas[grupoIdx].contas.splice(contaIdx, 1);
            
            // Adicionar no novo grupo
            gruposContas[novoGrupoIdx].contas.push(conta);
            
            // Expandir novo grupo
            gruposExpandidos[novoGrupoIdx] = true;
            
            renderTabela();
            
            Swal.fire({
                title: 'Sucesso!',
                html: `Conta movida para <strong>${gruposContas[novoGrupoIdx].grupo}</strong>`,
                icon: 'success',
                confirmButtonText: 'Fechar'
            });
        }
    });
}

// Mover múltiplas contas em massa
window.moverEmMassa = function() {
    if (gruposContas.length === 0) {
        Swal.fire('Aviso', 'Nenhum grupo disponível', 'warning');
        return;
    }
    
    // Criar lista de todas as contas com checkbox
    let htmlContas = '<div style="max-height: 500px; overflow-y: auto; text-align: left; margin-bottom: 20px; padding-right: 10px;">';
    htmlContas += '<p style="font-size: 13px; color: #666; margin-bottom: 15px; font-weight: bold;"><strong>Selecione as contas para mover:</strong></p>';
    
    gruposContas.forEach((grupo, grupoIdx) => {
        if (grupo.contas.length > 0) {
            htmlContas += `<p style="font-size: 12px; font-weight: bold; margin: 15px 0 8px 0; color: #1a3263; background: #f0f4f9; padding: 8px 10px; border-radius: 4px;">${grupo.grupo}</p>`;
            grupo.contas.forEach((conta, contaIdx) => {
                const id = `check-${grupoIdx}-${contaIdx}`;
                htmlContas += `
                    <div style="font-size: 12px; margin-left: 15px; margin-bottom: 8px; display: flex; align-items: center;">
                        <input type="checkbox" id="${id}" data-grupo="${grupoIdx}" data-conta="${contaIdx}" style="cursor: pointer; margin-right: 10px;">
                        <label for="${id}" style="cursor: pointer; flex: 1;"><strong>${conta.id}</strong> - ${conta.descricao}</label>
                    </div>
                `;
            });
        }
    });
    htmlContas += '</div>';
    
    // Criar opções de grupos
    const opcoesSgrupos = gruposContas
        .map((g, idx) => `<option value="${idx}">${g.grupo}</option>`)
        .join('');
    
    Swal.fire({
        title: 'Mover Contas em Massa',
        html: `
            <div style="text-align: left; width: 100%;">
                ${htmlContas}
                <p style="margin-bottom: 12px; font-size: 13px; font-weight: bold; color: #1a3263;">Para qual grupo deseja mover?</p>
                <select id="select-grupo-massa" style="width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
                    <option value="">-- Selecione um grupo --</option>
                    ${opcoesSgrupos}
                </select>
            </div>
        `,
        width: '70%',
        showCancelButton: true,
        confirmButtonText: 'Mover Selecionadas',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            document.getElementById('select-grupo-massa').focus();
        },
        preConfirm: () => {
            const selectElement = document.getElementById('select-grupo-massa');
            if (!selectElement.value) {
                Swal.showValidationMessage('Por favor, selecione um grupo');
                return false;
            }
            
            // Verificar se há contas selecionadas
            const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
            if (checkboxes.length === 0) {
                Swal.showValidationMessage('Por favor, selecione pelo menos uma conta');
                return false;
            }
            
            return {
                novoGrupo: parseInt(selectElement.value),
                contas: Array.from(checkboxes).map(c => ({
                    grupoIdx: parseInt(c.dataset.grupo),
                    contaIdx: parseInt(c.dataset.conta)
                }))
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const { novoGrupo, contas } = result.value;
            const novoGrupoNome = gruposContas[novoGrupo].grupo;
            
            // Coletar as contas e removê-las (do fim para o início para evitar problemas de índice)
            const contasParaMover = [];
            
            // Ordenar por grupoIdx e contaIdx descrescente para remover do final
            const contasOrdenadas = [...contas].sort((a, b) => {
                if (a.grupoIdx === b.grupoIdx) {
                    return b.contaIdx - a.contaIdx;
                }
                return b.grupoIdx - a.grupoIdx;
            });
            
            contasOrdenadas.forEach(({ grupoIdx, contaIdx }) => {
                const conta = gruposContas[grupoIdx].contas[contaIdx];
                contasParaMover.push(conta);
                gruposContas[grupoIdx].contas.splice(contaIdx, 1);
            });
            
            // Adicionar no novo grupo
            gruposContas[novoGrupo].contas.push(...contasParaMover);
            gruposExpandidos[novoGrupo] = true;
            
            renderTabela();
            
            Swal.fire({
                title: 'Sucesso!',
                html: `<strong>${contasParaMover.length}</strong> conta(s) movida(s) para <strong>${novoGrupoNome}</strong>`,
                icon: 'success',
                confirmButtonText: 'Fechar'
            });
        }
    });
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
        title: 'Importar Plano de Contas',
        html: `
            <div style="text-align: left;">
                <p style="margin-bottom: 15px; font-size: 14px;">
                    Carregue um arquivo Excel (CSV) com o plano de contas contábil.
                </p>
                <p style="margin-bottom: 10px; font-size: 12px; color: #666;">
                    <strong>Formato esperado:</strong>
                </p>
                <ul style="text-align: left; font-size: 12px; margin-bottom: 15px;">
                    <li><strong>Coluna A (Situação):</strong> "A" para contas analíticas (será filtrado)</li>
                    <li><strong>Coluna C (Código):</strong> ID único da conta</li>
                    <li><strong>Coluna E (Descrição):</strong> Nome/descrição da conta</li>
                </ul>
                <p style="margin-bottom: 15px; font-size: 11px; color: #999;">
                    Apenas contas com situação "A" serão importadas. Você escolherá o grupo onde adicionar as contas.
                </p>
                <input type="file" id="arquivo-excel" accept=".xlsx,.xls,.csv" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
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

            // Parse dos dados com mapeamento de colunas
            const contas_importadas = [];
            
            // Pular linha de cabeçalho (índice 0 e 1)
            for (let i = 2; i < dados_json.length; i++) {
                const linha = dados_json[i];
                
                // Coluna B (índice 1) = A/S
                const a_s = String(linha[1] || '').trim().toUpperCase();
                
                // Filtrar apenas contas analíticas (A/S = "A")
                if (a_s !== 'A') continue;
                
                // Coluna C (índice 2) = Código (ID da conta)
                const codigo = String(linha[2] || '').trim();
                
                // Coluna E (índice 4) = Descrição
                const descricao = String(linha[4] || '').trim();
                
                // Validar dados obrigatórios
                if (!codigo || !descricao) continue;
                
                contas_importadas.push({
                    id: codigo,
                    descricao: descricao
                });
            }
            
            if (contas_importadas.length === 0) {
                Swal.fire('Aviso', 'Nenhuma conta válida foi encontrada no arquivo', 'warning');
                return;
            }
            
            // Separar contas novas das existentes
            const contas_novas = [];
            const contas_existentes = [];
            
            contas_importadas.forEach(conta => {
                let jaExiste = false;
                
                // Procurar a conta em todos os grupos
                for (let grupo of gruposContas) {
                    for (let contaGrupo of grupo.contas) {
                        // Comparar como string trimado para evitar problemas de tipo
                        if (String(contaGrupo.id).trim() === String(conta.id).trim()) {
                            jaExiste = true;
                            break;
                        }
                    }
                    if (jaExiste) break;
                }
                
                if (jaExiste) {
                    contas_existentes.push(conta);
                } else {
                    contas_novas.push(conta);
                }
            });
            
            // Se há contas novas, processar uma por uma
            if (contas_novas.length > 0) {
                processarContasNovasSequencial(contas_novas, 0, contas_existentes.length);
            } else {
                // Se todas já existem, apenas avisar
                Swal.fire(
                    'Aviso',
                    `Todas as ${contas_existentes.length} conta(s) já existem no sistema.`,
                    'info'
                );
            }
            
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            Swal.fire('Erro', 'Erro ao processar o arquivo: ' + error.message, 'error');
        }
    };
    reader.readAsBinaryString(arquivo);
}

// Processar contas novas sequencialmente, uma por uma
function processarContasNovasSequencial(contas_novas, indice_atual, total_existentes) {
    // Se chegou ao fim, mostrar resumo final
    if (indice_atual >= contas_novas.length) {
        Swal.fire({
            title: 'Importação Concluída!',
            html: `
                <div style="text-align: left; font-size: 13px;">
                    <p style="margin-bottom: 10px;">
                        <strong>${contas_novas.length}</strong> conta(s) adicionada(s) com sucesso!
                    </p>
                    ${total_existentes > 0 ? `<p style="margin-bottom: 10px; color: #666; font-size: 12px;">(<strong>${total_existentes}</strong> conta(s) ignorada(s) por já existirem)</p>` : ''}
                    <p style="font-size: 12px; color: #666;">
                        💾 Não se esqueça de clicar em "Salvar" para guardar as alterações no Firebase!
                    </p>
                </div>
            `,
            icon: 'success',
            confirmButtonText: 'Fechar'
        });
        return;
    }
    
    const conta_atual = contas_novas[indice_atual];
    const progresso = `${indice_atual + 1} de ${contas_novas.length}`;
    
    // Mostrar diálogo para esta conta específica
    if (gruposContas.length === 0) {
        Swal.fire(
            'Nenhum Grupo',
            'Você precisa criar um grupo antes de importar contas. Clique em "+ Novo Grupo" para criar um.',
            'warning'
        );
        return;
    }
    
    const opcoesSgrupos = gruposContas
        .map((g, idx) => `<option value="${idx}">${g.grupo} (${g.contas.length} conta${g.contas.length !== 1 ? 's' : ''})</option>`)
        .join('');
    
    Swal.fire({
        title: `Adicionar Conta (${progresso})`,
        html: `
            <div style="text-align: left;">
                <div style="background: #e3f2fd; padding: 12px; border-radius: 4px; margin-bottom: 15px; border-left: 4px solid #2196F3;">
                    <p style="font-size: 12px; margin: 0;"><strong>ID:</strong> ${conta_atual.id}</p>
                    <p style="font-size: 12px; margin: 5px 0 0 0;"><strong>Descrição:</strong> ${conta_atual.descricao}</p>
                </div>
                <p style="margin-bottom: 10px; font-size: 13px; font-weight: bold;">
                    Em qual grupo deseja adicionar esta conta?
                </p>
                <select id="select-grupo-destino" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                    ${opcoesSgrupos}
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Adicionar',
        cancelButtonText: 'Cancelar Importação',
        didOpen: () => {
            document.getElementById('select-grupo-destino').focus();
        },
        preConfirm: () => {
            const selectElement = document.getElementById('select-grupo-destino');
            if (selectElement.value === '') {
                Swal.showValidationMessage('Por favor, selecione um grupo');
                return false;
            }
            return parseInt(selectElement.value);
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const grupoIdx = result.value;
            const grupoDestino = gruposContas[grupoIdx];
            
            // Adicionar a conta ao grupo
            grupoDestino.contas.push(conta_atual);
            
            // Expandir o grupo se contraído
            gruposExpandidos[grupoIdx] = true;
            
            // Renderizar tabela
            renderTabela();
            
            // Processar próxima conta
            processarContasNovasSequencial(contas_novas, indice_atual + 1, total_existentes);
        } else {
            // Se cancelou, mostrar aviso
            Swal.fire(
                'Importação Cancelada',
                `${indice_atual} de ${contas_novas.length} conta(s) foram adicionadas antes do cancelamento.`,
                'warning'
            );
        }
    });
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
