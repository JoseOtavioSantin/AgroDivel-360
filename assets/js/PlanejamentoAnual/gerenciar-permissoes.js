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
let termoBusca = '';
let todosGruposExpandidos = true; // Controlar expansão/colapso de grupos

// Departamentos e Filiais disponíveis no sistema
const DEPARTAMENTOS_SISTEMA = ['Peças', 'Serviços', 'Pós-vendas', 'PLM'];
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
            usuariosLista.push({
                uid: doc.id,
                nome: dados.nome || 'Gestor ' + doc.id.substring(0, 8),
                email: dados.email || 'sem-email@example.com',
                departamentos: dados.departamentos && dados.departamentos.length > 0 
                    ? dados.departamentos 
                    : DEPARTAMENTOS_SISTEMA, // Se não tiver, usa os do sistema
                filiais: dados.filiais && dados.filiais.length > 0 
                    ? dados.filiais 
                    : FILIAIS_SISTEMA // Se não tiver, usa os do sistema
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
        } else {
            permissoesSelecionadas = {};
            departamentosMarkados = [];
            filiaisMarkadas = [];
            geralVisualizar = false;
            geralEditar = false;
        }

        console.log('✅ Permissões carregadas:', {
            departamentos: departamentosMarkados,
            filiais: filiaisMarkadas,
            geral: { visualizar: geralVisualizar, editar: geralEditar },
            contas: permissoesSelecionadas
        });
    } catch (error) {
        console.error('❌ Erro ao carregar permissões:', error);
        permissoesSelecionadas = {};
        departamentosMarkados = [];
        filiaisMarkadas = [];
    }
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
                <!-- DEPARTAMENTOS CHECKBOX -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #1a3263;">
                        <i class='bx bx-building'></i> Departamentos
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                        ${usuarioSelecionado.departamentos.map(dept => `
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                                <input 
                                    type="checkbox" 
                                    ${departamentosMarkados.includes(dept) ? 'checked' : ''}
                                    onchange="window.toggleDepartamento('${dept}', this.checked)">
                                <span>${dept}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <!-- FILIAIS CHECKBOX -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #1a3263;">
                        <i class='bx bx-map'></i> Filiais
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                        ${usuarioSelecionado.filiais.map(filial => `
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
