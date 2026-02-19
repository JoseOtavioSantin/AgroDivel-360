// ===== GERENCIAR PERMISSÕES DE PLANEJAMENTO =====
import { db, auth } from '/assets/js/firebase-config.js';
import { 
    collection, 
    getDocs,
    query,
    where,
    doc,
    setDoc,
    getDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Estado
let gruposContas = [];
let usuariosLista = [];
let usuarioSelecionado = null;
let permissoesSelecionadas = {};
let departamentoSelecionado = null;
let departamentosMarkados = []; // Departamentos selecionados para o usuário
let filiaisMarkadas = []; // Filiais selecionadas para o usuário
let geralVisualizar = false; // Permissão para visualizar modo Geral
let geralEditar = false; // Permissão para editar modo Geral
let podeEditarFormulas = false; // Permissão para editar fórmulas do sistema
let termoBusca = '';
let todosGruposExpandidos = true; // Controlar expansão/colapso de grupos

// Departamentos e Filiais disponíveis no sistema
const ESTRUTURA_DEPARTAMENTOS = {
    'Geral': null,
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

const FILIAIS_SISTEMA = ['Campos Novos', 'Rio do Sul', 'Lages', 'São Miguel do Oeste', 'Pinhalzinho', 'Campo Erê'];

// ===== INICIALIZAR =====
document.addEventListener('DOMContentLoaded', async () => {
    try {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('✅ Usuário admin conectado:', user.email);
                await carregarGruposContas();
                await carregarUsuarios();
                renderListaUsuarios();
                
                registrarEventos();
            } else {
                Swal.fire('Erro', 'Faça login como administrador', 'error');
            }
        });
    } catch (error) {
        console.error('❌ Erro ao inicializar:', error);
    }
});

// ===== CARREGAR GRUPOS E CONTAS =====
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
            Swal.fire('Atenção', 'Configure a base de grupos e contas primeiro', 'warning');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar grupos e contas:', error);
    }
}

// ===== CARREGAR LISTA DE USUÁRIOS =====
async function carregarUsuarios() {
    try {
        // Buscar todos os gestores cadastrados
        const colecao = collection(db, 'gestores');
        const querySnapshot = await getDocs(colecao);
        
        usuariosLista = [];
        querySnapshot.forEach((doc) => {
            const dados = doc.data();
            // Extrair departamentos principais (sem subdepartamentos) da estrutura
            const departamentosPrincipais = Object.keys(ESTRUTURA_DEPARTAMENTOS);
            
            usuariosLista.push({
                uid: doc.id,
                nome: dados.nome || 'Gestor ' + doc.id.substring(0, 8),
                email: dados.email || 'sem-email@example.com',
                departamentos: dados.departamentos && dados.departamentos.length > 0 
                    ? dados.departamentos 
                    : departamentosPrincipais
            });
        });

        console.log('✅ Usuários carregados automaticamente:', usuariosLista);
    } catch (error) {
        console.error('❌ Erro ao carregar usuários:', error);
    }
}

// ===== RENDERIZAR LISTA DE USUÁRIOS =====
function renderListaUsuarios() {
    const listaUsuarios = document.getElementById('lista-usuarios');
    listaUsuarios.innerHTML = '';

    if (usuariosLista.length === 0) {
        listaUsuarios.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Nenhum usuário cadastrado</div>';
        return;
    }

    usuariosLista.forEach(usuario => {
        const div = document.createElement('div');
        div.className = `usuario-item ${usuarioSelecionado?.uid === usuario.uid ? 'ativo' : ''}`;
        div.innerHTML = `
            <div style="font-weight: 500;">${usuario.nome}</div>
            <div style="font-size: 0.85rem; opacity: 0.8;">${usuario.email}</div>
            <div style="font-size: 0.75rem; margin-top: 5px; opacity: 0.7;">
                ${usuario.departamentos.length > 0 ? `Depts: ${usuario.departamentos.join(', ')}` : 'Sem departamentos'}
            </div>
        `;
        div.onclick = () => selecionarUsuario(usuario);
        listaUsuarios.appendChild(div);
    });
}

// ===== SELECIONAR USUÁRIO =====
async function selecionarUsuario(usuario) {
    usuarioSelecionado = usuario;
    departamentoSelecionado = null;
    termoBusca = '';
    console.log('👤 Usuário selecionado:', usuario);

    // Carregar permissões do usuário
    await carregarPermissoesUsuario(usuario.uid);

    // Renderizar lista novamente (para destacar seleção)
    renderListaUsuarios();

    // Renderizar painel de permissões
    renderPainelPermissoes();
}

// ===== CARREGAR PERMISSÕES DO USUÁRIO =====
async function carregarPermissoesUsuario(uid) {
    try {
        const docRef = doc(db, 'permissoes_planejamento', uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const dados = docSnap.data();
            permissoesSelecionadas = dados.contas || {};
            departamentosMarkados = dados.departamentos || [];
            filiaisMarkadas = dados.filiais || [];
            geralVisualizar = dados.geral?.visualizar || false;
            geralEditar = dados.geral?.editar || false;
            podeEditarFormulas = dados.podeEditarFormulas || false;
        } else {
            permissoesSelecionadas = {};
            departamentosMarkados = [];
            filiaisMarkadas = [];
            geralVisualizar = false;
            geralEditar = false;
            podeEditarFormulas = false;
        }

        console.log('✅ Permissões carregadas:', {
            departamentos: departamentosMarkados,
            filiais: filiaisMarkadas,
            geral: { visualizar: geralVisualizar, editar: geralEditar },
            podeEditarFormulas,
            contas: permissoesSelecionadas
        });
    } catch (error) {
        console.error('❌ Erro ao carregar permissões:', error);
        permissoesSelecionadas = {};
        departamentosMarkados = [];
        filiaisMarkadas = [];
    }
}

// ===== RENDERIZAR DEPARTAMENTOS COM HIERARQUIA =====
function renderizarDepartamentosPermissoes() {
    let html = '';
    
    // Geral - simples
    html += `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 8px 0; font-weight: 500;">
            <input 
                type="checkbox" 
                ${departamentosMarkados.includes('Geral') ? 'checked' : ''}
                onchange="window.toggleDepartamento('Geral', this.checked)">
            <i class='bx bx-folder'></i> Geral
        </label>
    `;
    
    // Vendas com subdivisões
    const todosVendas = ['Vendas - Novos', 'Vendas - Usados', 'Vendas - Geral'].every(d => departamentosMarkados.includes(d));
    html += `
        <div style="margin: 12px 0; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 0; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 10px; background: #f8f9fa; cursor: pointer; border-bottom: 1px solid #ddd;" onclick="window.toggleGrupoDeptos('vendas-subdeps')">
                <input 
                    type="checkbox" 
                    ${todosVendas ? 'checked' : ''}
                    onchange="window.marcarTodosSubdeps('Vendas', this.checked)"
                    onclick="event.stopPropagation()"
                    style="cursor: pointer;">
                <i class='bx bx-folder-open'></i>
                <strong style="color: #0f3460;">Vendas</strong>
                <span style="font-size: 0.8rem; color: #999; margin-left: auto;">(3 opções)</span>
            </div>
            <div id="vendas-subdeps" style="padding: 10px 20px; background: #fafafa; display: block;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Vendas - Novos') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Vendas - Novos', this.checked)">
                    Novos
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Vendas - Usados') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Vendas - Usados', this.checked)">
                    Usados
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Vendas - Geral') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Vendas - Geral', this.checked)">
                    Geral
                </label>
            </div>
        </div>
    `;
    
    // Pós-vendas com subdivisões
    const todosPosVendas = ['Pós-vendas - Peças', 'Pós-vendas - Serviços', 'Pós-vendas - PLM', 'Pós-vendas - Geral'].every(d => departamentosMarkados.includes(d));
    html += `
        <div style="margin: 12px 0; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 0; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 10px; background: #f8f9fa; cursor: pointer; border-bottom: 1px solid #ddd;" onclick="window.toggleGrupoDeptos('posvendas-subdeps')">
                <input 
                    type="checkbox" 
                    ${todosPosVendas ? 'checked' : ''}
                    onchange="window.marcarTodosSubdeps('Pós-vendas', this.checked)"
                    onclick="event.stopPropagation()"
                    style="cursor: pointer;">
                <i class='bx bx-folder-open'></i>
                <strong style="color: #0f3460;">Pós-vendas</strong>
                <span style="font-size: 0.8rem; color: #999; margin-left: auto;">(4 opções)</span>
            </div>
            <div id="posvendas-subdeps" style="padding: 10px 20px; background: #fafafa; display: block;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Pós-vendas - Peças') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Pós-vendas - Peças', this.checked)">
                    Peças
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Pós-vendas - Serviços') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Pós-vendas - Serviços', this.checked)">
                    Serviços
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Pós-vendas - PLM') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Pós-vendas - PLM', this.checked)">
                    PLM
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('Pós-vendas - Geral') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('Pós-vendas - Geral', this.checked)">
                    Geral
                </label>
            </div>
        </div>
    `;
    
    // ADM com subdivisões
    const todosADM = ['ADM - IF', 'ADM - CTB CONTR', 'ADM - FINAN', 'ADM - MARKTING', 'ADM - COMPRAS', 'ADM - RH/DP', 'ADM - GERAL'].every(d => departamentosMarkados.includes(d));
    html += `
        <div style="margin: 12px 0; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 0; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 10px; background: #f8f9fa; cursor: pointer; border-bottom: 1px solid #ddd;" onclick="window.toggleGrupoDeptos('adm-subdeps')">
                <input 
                    type="checkbox" 
                    ${todosADM ? 'checked' : ''}
                    onchange="window.marcarTodosSubdeps('ADM', this.checked)"
                    onclick="event.stopPropagation()"
                    style="cursor: pointer;">
                <i class='bx bx-folder-open'></i>
                <strong style="color: #0f3460;">ADM</strong>
                <span style="font-size: 0.8rem; color: #999; margin-left: auto;">(7 opções)</span>
            </div>
            <div id="adm-subdeps" style="padding: 10px 20px; background: #fafafa; display: block;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - IF') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - IF', this.checked)">
                    IF
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - CTB CONTR') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - CTB CONTR', this.checked)">
                    CTB CONTR
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - FINAN') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - FINAN', this.checked)">
                    FINAN
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - MARKTING') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - MARKTING', this.checked)">
                    MARKTING
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - COMPRAS') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - COMPRAS', this.checked)">
                    COMPRAS
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - RH/DP') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - RH/DP', this.checked)">
                    RH/DP
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 6px 0;">
                    <input 
                        type="checkbox" 
                        ${departamentosMarkados.includes('ADM - GERAL') ? 'checked' : ''}
                        onchange="window.toggleDepartamento('ADM - GERAL', this.checked)">
                    GERAL
                </label>
            </div>
        </div>
    `;
    
    return html;
}

// ===== RENDERIZAR PAINEL DE PERMISSÕES =====
function renderPainelPermissoes() {
    const painelPermissoes = document.getElementById('painel-permissoes');

    if (!usuarioSelecionado) {
        painelPermissoes.innerHTML = '<div class="msg-selecione">Selecione um usuário para editar suas permissões</div>';
        return;
    }

    let html = `
        <div class="permissoes-tabela">
            <div class="permissoes-header">
                Permissões de ${usuarioSelecionado.nome}
            </div>
            
            <!-- FILTROS -->
            <div style="padding: 15px;">
                <!-- DEPARTAMENTOS COM HIERARQUIA -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #1a3263;">
                        <i class='bx bx-building'></i> Departamentos
                    </label>
                    <div style="background: #f9f9f9; padding: 10px; border-radius: 4px;">
                        ${renderizarDepartamentosPermissoes()}
                    </div>
                </div>

                <!-- FILIAIS CHECKBOX -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #1a3263;">
                        <i class='bx bx-map'></i> Filiais
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                        ${FILIAIS_SISTEMA.map(filial => `
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                                <input 
                                    type="checkbox" 
                                    ${filiaisMarkadas.includes(filial) ? 'checked' : ''}
                                    onchange="window.toggleFilial('${filial}', this.checked)">
                                <span>${filial}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <!-- PERMISSÕES GERAL -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #1a3263;">
                        <i class='bx bx-bar-chart'></i> Modo Geral (Consolidado)
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                            <input 
                                type="checkbox" 
                                ${geralVisualizar ? 'checked' : ''}
                                onchange="window.toggleGeralVisualizar(this.checked)">
                            <span>✓ Geral Visualizar</span>
                            <span style="font-size: 0.75rem; color: #999;">(Pode ver modo consolidado)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                            <input 
                                type="checkbox" 
                                ${geralEditar ? 'checked' : ''}
                                onchange="window.toggleGeralEditar(this.checked)">
                            <span>✏️ Geral Editar</span>
                            <span style="font-size: 0.75rem; color: #999;">(Pode editar no modo consolidado)</span>
                        </label>
                    </div>
                </div>

                <!-- PERMISSÃO EDITAR FÓRMULAS -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #1a3263;">
                        <i class='bx bx-math'></i> Permissões Avançadas
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; background: #f3e5ff; padding: 10px; border-radius: 4px; border-left: 3px solid #8b5cf6;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                            <input 
                                type="checkbox" 
                                ${podeEditarFormulas ? 'checked' : ''}
                                onchange="window.togglePodeEditarFormulas(this.checked)"
                                style="accent-color: #8b5cf6;">
                            <span style="color: #6b21a8; font-weight: 500;">📐 Editar Fórmulas</span>
                            <span style="font-size: 0.75rem; color: #7c3aed;">(Pode configurar fórmulas automáticas nas contas)</span>
                        </label>
                    </div>
                </div>

                <!-- BUSCA -->
                <div class="filtro-campo" style="margin-bottom: 15px;">
                    <label>Buscar (Grupo, ID, Descrição)</label>
                    <input 
                        type="text" 
                        id="input-busca-permissoes" 
                        placeholder="Digite para filtrar..."
                        value="${termoBusca}"
                        onkeyup="window.atualizarBusca(this.value)">
                </div>

                <!-- TOOLBAR -->
                <div class="toolbar-permissoes">
                    <button type="button" class="btn-toolbar" style="background: #6c757d; margin-right: auto;" onclick="window.voltarListaUsuarios()">
                        <i class='bx bx-arrow-back'></i> Voltar
                    </button>
                    <button type="button" class="btn-toolbar marcar" onclick="window.marcarTodos()">
                        <i class='bx bx-check-square'></i> Marcar Todos
                    </button>
                    <button type="button" class="btn-toolbar desmarcar" onclick="window.desmarcarTodos()">
                        <i class='bx bx-square'></i> Desmarcar Todos
                    </button>
                    <button type="button" class="btn-toolbar" style="background: #17a2b8;" onclick="window.expandirTodos()">
                        <i class='bx bx-expand'></i> Expandir Tudo
                    </button>
                    <button type="button" class="btn-toolbar" style="background: #6c757d;" onclick="window.fecharTodos()">
                        <i class='bx bx-collapse'></i> Fechar Tudo
                    </button>
                </div>
            </div>

            <!-- GRUPOS E CONTAS -->
            <div class="permissoes-body" style="padding: 15px; max-height: 600px; overflow-y: auto;">
    `;

    // Filtrar grupos baseado na busca
    const gruposFiltrados = gruposContas.filter(grupo => {
        const termoLower = termoBusca.toLowerCase();
        const grupoMatch = grupo.grupo.toLowerCase().includes(termoLower);
        const contasMatch = grupo.contas.some(conta =>
            conta.id.toString().toLowerCase().includes(termoLower) ||
            conta.descricao.toLowerCase().includes(termoLower)
        );
        return grupoMatch || contasMatch;
    });

    gruposFiltrados.forEach((grupo, grupoIdx) => {
        const grupoCheckado = grupo.contas.every(conta => {
            const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
            return permissoesSelecionadas[chaveArmazenamento] === true;
        });

        html += `
            <div class="grupo-container">
                <div class="grupo-header" onclick="window.toggleGrupo('grupo-${grupoIdx}')">
                    <input 
                        type="checkbox" 
                        class="checkbox-grupo"
                        ${grupoCheckado ? 'checked' : ''}
                        onchange="window.marcarGrupo('${grupo.grupo}', this.checked)"
                        onclick="event.stopPropagation()">
                    <div class="grupo-nome">${grupo.grupo}</div>
                    <span style="color: #666; font-size: 0.85rem;">(${grupo.contas.length} contas)</span>
                </div>
                <div class="contas-grupo" id="grupo-${grupoIdx}" style="display: ${todosGruposExpandidos ? 'block' : 'none'};">
        `;

        // Filtrar contas do grupo
        const contasFiltradas = grupo.contas.filter(conta => {
            const termoLower = termoBusca.toLowerCase();
            return conta.id.toString().toLowerCase().includes(termoLower) ||
                   conta.descricao.toLowerCase().includes(termoLower);
        });

        contasFiltradas.forEach(conta => {
            const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
            const temPermissao = permissoesSelecionadas[chaveArmazenamento] === true;

            html += `
                <div class="permissao-linha" style="margin-bottom: 8px;">
                    <input 
                        type="checkbox" 
                        class="toggle-checkbox"
                        ${temPermissao ? 'checked' : ''}
                        onchange="window.atualizarPermissao('${chaveArmazenamento}', this.checked)">
                    <div class="permissao-info">
                        <div class="permissao-info-grupo">${grupo.grupo}</div>
                        <div class="permissao-info-conta">${conta.id} - ${conta.descricao}</div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
        <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button class="btn-salvar-permissoes" onclick="window.salvarPermissoes()">
                <i class='bx bx-save'></i> Salvar Permissões
            </button>
        </div>
    `;

    painelPermissoes.innerHTML = html;
}

// ===== FUNÇÕES GLOBAIS =====
window.toggleDepartamento = function(depto, marcado) {
    if (marcado) {
        if (!departamentosMarkados.includes(depto)) {
            departamentosMarkados.push(depto);
        }
    } else {
        departamentosMarkados = departamentosMarkados.filter(d => d !== depto);
    }
    console.log('📋 Departamentos selecionados:', departamentosMarkados);
};

window.toggleFilial = function(filial, marcado) {
    if (marcado) {
        if (!filiaisMarkadas.includes(filial)) {
            filiaisMarkadas.push(filial);
        }
    } else {
        filiaisMarkadas = filiaisMarkadas.filter(f => f !== filial);
    }
    console.log('🏢 Filiais selecionadas:', filiaisMarkadas);
};

window.filtrarPorDepartamento = function(depto) {
    departamentoSelecionado = depto || null;
    renderPainelPermissoes();
};

window.atualizarBusca = function(termo) {
    termoBusca = termo;
    renderPainelPermissoes();
};

window.toggleGrupo = function(grupoId) {
    const elemento = document.getElementById(grupoId);
    if (elemento) {
        elemento.style.display = elemento.style.display === 'none' ? 'block' : 'none';
    }
};

window.expandirTodos = function() {
    todosGruposExpandidos = true;
    const todasContas = document.querySelectorAll('.contas-grupo');
    todasContas.forEach(element => {
        element.style.display = 'block';
    });
    console.log('📂 Todos os grupos expandidos');
};

window.fecharTodos = function() {
    todosGruposExpandidos = false;
    const todasContas = document.querySelectorAll('.contas-grupo');
    todasContas.forEach(element => {
        element.style.display = 'none';
    });
    console.log('📁 Todos os grupos fechados');
};

window.marcarGrupo = function(nomeGrupo, marcado) {
    const grupo = gruposContas.find(g => g.grupo === nomeGrupo);
    if (grupo) {
        grupo.contas.forEach(conta => {
            const chaveArmazenamento = `${nomeGrupo}_${conta.id}`;
            permissoesSelecionadas[chaveArmazenamento] = marcado;
        });
        renderPainelPermissoes();
    }
};

window.marcarTodos = function() {
    // Marcar TODOS os grupos e contas (não apenas os filtrados)
    gruposContas.forEach(grupo => {
        grupo.contas.forEach(conta => {
            const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
            permissoesSelecionadas[chaveArmazenamento] = true;
        });
    });
    console.log('✅ Todos marcados');
    renderPainelPermissoes();
};

window.desmarcarTodos = function() {
    // Desmarcar TODOS os grupos e contas (não apenas os filtrados)
    gruposContas.forEach(grupo => {
        grupo.contas.forEach(conta => {
            const chaveArmazenamento = `${grupo.grupo}_${conta.id}`;
            permissoesSelecionadas[chaveArmazenamento] = false;
        });
    });
    console.log('❌ Todos desmarcados');
    renderPainelPermissoes();
};

window.atualizarPermissao = function(chaveArmazenamento, temAcesso) {
    permissoesSelecionadas[chaveArmazenamento] = temAcesso;
    console.log(`✏️ Permissão atualizada: ${chaveArmazenamento} = ${temAcesso}`);
};

window.toggleGeralVisualizar = function(marcado) {
    geralVisualizar = marcado;
    console.log(`👁️ Geral Visualizar: ${marcado}`);
};

window.toggleGeralEditar = function(marcado) {
    geralEditar = marcado;
    console.log(`✏️ Geral Editar: ${marcado}`);
};

window.togglePodeEditarFormulas = function(marcado) {
    podeEditarFormulas = marcado;
    console.log(`📐 Pode Editar Fórmulas: ${marcado}`);
};

// ===== FUNÇÕES PARA HIERARQUIA DE DEPARTAMENTOS =====
window.toggleGrupoDeptos = function(grupoId) {
    const elemento = document.getElementById(grupoId);
    if (elemento) {
        elemento.style.display = elemento.style.display === 'none' ? 'block' : 'none';
    }
};

window.marcarTodosSubdeps = function(depPrincipal, marcado) {
    const subdeps = ESTRUTURA_DEPARTAMENTOS[depPrincipal];
    if (subdeps) {
        Object.keys(subdeps).forEach(subdep => {
            const nomeCombinado = `${depPrincipal} - ${subdep}`;
            if (marcado) {
                if (!departamentosMarkados.includes(nomeCombinado)) {
                    departamentosMarkados.push(nomeCombinado);
                }
            } else {
                departamentosMarkados = departamentosMarkados.filter(d => d !== nomeCombinado);
            }
        });
    }
    console.log(`🏢 Subdepartamentos de ${depPrincipal} ${marcado ? 'marcados' : 'desmarcados'}:`, departamentosMarkados);
    renderPainelPermissoes();
};

window.voltarListaUsuarios = function() {
    usuarioSelecionado = null;
    departamentosMarkados = [];
    filiaisMarkadas = [];
    geralVisualizar = false;
    geralEditar = false;
    podeEditarFormulas = false;
    
    const painelPermissoes = document.getElementById('painel-permissoes');
    if (painelPermissoes) {
        painelPermissoes.innerHTML = '<div class="msg-selecione">Selecione um usuário para editar suas permissões</div>';
    }
    
    renderListaUsuarios();
    console.log('⬅️ Voltou para a lista de usuários');
};

// ===== SALVAR PERMISSÕES =====
window.salvarPermissoes = async function() {
    if (!usuarioSelecionado) {
        Swal.fire('Erro', 'Selecione um usuário', 'error');
        return;
    }

    try {
        Swal.fire({
            title: 'Salvando...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        await setDoc(doc(db, 'permissoes_planejamento', usuarioSelecionado.uid), {
            nome: usuarioSelecionado.nome,
            email: usuarioSelecionado.email,
            departamentos: departamentosMarkados, // Apenas os SELECIONADOS
            filiais: filiaisMarkadas, // Apenas os SELECIONADOS
            contas: permissoesSelecionadas,
            geral: {
                visualizar: geralVisualizar,
                editar: geralEditar
            },
            podeEditarFormulas: podeEditarFormulas, // Nova permissão
            dataSalva: new Date(),
            timestamp: new Date().getTime()
        });

        Swal.fire('Sucesso!', 'Permissões salvas com sucesso!', 'success');
        console.log('✅ Permissões salvas para:', usuarioSelecionado.uid);
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        Swal.fire('Erro', 'Erro ao salvar permissões: ' + error.message, 'error');
    }
};

// ===== REGISTRAR EVENTOS =====
function registrarEventos() {
    // Eventos já estão inline nos elementos
}
