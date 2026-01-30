import { garantirAutenticacao } from '/assets/js/auth-guard.js';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
  authDomain: "agro-divel.firebaseapp.com",
  projectId: "agro-divel",
  storageBucket: "agro-divel.firebasestorage.app",
  messagingSenderId: "583977436505",
  appId: "1:583977436505:web:3754ec029aebb3d9d67848"
};

let app, db, storage, userData;
let todasFerramentas = [], todosTecnicos = [], todasAlocacoes = [];
let tomSelectFerramentas, tomSelectOS;

// ==================================================================
// VERSÃO FINALÍSSIMA DA FUNÇÃO DE CARREGAR IMAGEM
// Lê o array 'fotosURLs' e exibe todas as imagens encontradas.
// ==================================================================
function carregarImagensFerramenta(ferramenta) {
    const imagensContainer = document.getElementById('ferramenta-imagens');
    const containerPrincipal = document.getElementById('ferramenta-imagens-container');
    
    imagensContainer.innerHTML = '';
    containerPrincipal.style.display = 'block';

    // LÓGICA CORRETA: Verifica se o campo 'fotosURLs' (plural) existe e é um array com itens
    if (ferramenta && Array.isArray(ferramenta.fotosURLs) && ferramenta.fotosURLs.length > 0) {
        // Itera sobre cada URL no array e cria uma imagem para cada uma
        ferramenta.fotosURLs.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.alt = "Imagem da ferramenta";
            img.style.width = '100px'; // Adiciona um estilo para as imagens não ficarem gigantes
            img.style.height = '100px';
            img.style.objectFit = 'cover';
            img.style.margin = '5px';
            img.style.cursor = 'pointer';
            img.onclick = () => Swal.fire({ imageUrl: url, imageAlt: 'Imagem ampliada' });
            imagensContainer.appendChild(img);
        });
    } else {
        // Se não houver URLs, exibe a mensagem
        imagensContainer.innerHTML = '<div class="no-image">Nenhuma imagem encontrada.</div>';
    }
}

// ==================================================================
// FUNÇÃO PARA EXIBIR A LOCALIZAÇÃO DA FERRAMENTA
// ==================================================================
function exibirLocalizacao(ferramenta) {
    const infoLocalizacao = document.getElementById('info-localizacao');
    const localizacaoTexto = document.getElementById('localizacao-texto');
    
    if (ferramenta.localizacao && ferramenta.localizacao.trim() !== '') {
        localizacaoTexto.textContent = ferramenta.localizacao;
        infoLocalizacao.style.display = 'block';
    } else {
        localizacaoTexto.textContent = 'Não informada';
        infoLocalizacao.style.display = 'block';
    }
}

// ==================================================================
// FUNÇÃO PARA PREENCHER TÉCNICO AUTOMATICAMENTE POR OS
// ==================================================================
function preencherTecnicoPorOS(os) {
    if (!os) return;
    
    // Busca alocações com esta OS, ordenando pela mais recente
    const alocacoesDaOS = todasAlocacoes
        .filter(a => a.ordemServico === os)
        .sort((a, b) => {
            const dataA = a.dataAlocacao?.toDate?.() || new Date(0);
            const dataB = b.dataAlocacao?.toDate?.() || new Date(0);
            return dataB - dataA; // Mais recente primeiro
        });

    if (alocacoesDaOS.length > 0) {
        const ultimaAlocacao = alocacoesDaOS[0];
        const tecnicoSelect = document.getElementById('tecnico-select');
        
        if (ultimaAlocacao.funcionario) {
            // Define o valor do técnico
            tecnicoSelect.value = ultimaAlocacao.funcionario;
            
            // Feedback visual para o usuário
            Swal.fire({
                title: 'Técnico preenchido!',
                text: `Técnico definido como: ${ultimaAlocacao.funcionario}`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
        }
    }
}

// ==================================================================
// FUNÇÃO DE INICIALIZAÇÃO - COM AUTO-COMPLETE PARA OS
// ==================================================================
async function iniciarPagina() {
    try {
        userData = await garantirAutenticacao();

        if (!getApps().length) { app = initializeApp(firebaseConfig); } 
        else { app = getApp(); }
        db = getFirestore(app);
        storage = getStorage(app);

        // Configura Tom Select para ferramentas
        tomSelectFerramentas = new TomSelect('#ferramenta-select', {
            create: false,
            sortField: { field: "text", direction: "asc" },
            dropdownParent: 'body',
            onChange: function(value) {
                if (value) {
                    const ferramentaSelecionada = todasFerramentas.find(f => f.id === value);
                    if (ferramentaSelecionada) {
                        carregarImagensFerramenta(ferramentaSelecionada);
                        exibirLocalizacao(ferramentaSelecionada);
                    }
                } else {
                    document.getElementById('ferramenta-imagens-container').style.display = 'none';
                    document.getElementById('info-localizacao').style.display = 'none';
                }
            }
        });

        // Configura Tom Select para Ordem de Serviço com histórico
        // Primeiro obtém as OSs únicas das alocações existentes
        const osUnicas = [...new Set(todasAlocacoes
            .map(a => a.ordemServico)
            .filter(os => os && os.trim() !== '')
        )];

        const opcoesOS = osUnicas.map(os => ({
            value: os,
            text: `OS: ${os}`
        }));

        tomSelectOS = new TomSelect('#ordem-servico', {
            options: opcoesOS,
            create: true,
            createFilter: function(input) {
                return input.length >= 2; // Permite criar nova OS apenas com 2+ caracteres
            },
            searchField: ['text'],
            sortField: { field: 'text', direction: 'asc' },
            onChange: function(os) {
                // Quando seleciona uma OS, preenche automaticamente o técnico
                preencherTecnicoPorOS(os);
            }
        });

        if (userData && userData.nome) {
            document.getElementById('responsavel-lancamento').value = userData.nome.toUpperCase();
        }
        document.getElementById('data-alocacao').valueAsDate = new Date();

        const [ferramentasSnap, tecnicosSnap, alocacoesSnap] = await Promise.all([
            getDocs(collection(db, "ferramentas")),
            getDocs(collection(db, "tecnicos")),
            getDocs(collection(db, "alocacoes"))
        ]);

        todasFerramentas = ferramentasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        todosTecnicos = tecnicosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        todasAlocacoes = alocacoesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Atualiza as opções do Tom Select OS com os dados carregados
        const osUnicasAtualizadas = [...new Set(todasAlocacoes
            .map(a => a.ordemServico)
            .filter(os => os && os.trim() !== '')
        )];

        const opcoesOSAtualizadas = osUnicasAtualizadas.map(os => ({
            value: os,
            text: `OS: ${os}`
        }));

        tomSelectOS.clear();
        tomSelectOS.clearOptions();
        tomSelectOS.addOptions(opcoesOSAtualizadas);

        atualizarOpcoesFerramentas();
        atualizarSelectTecnicos();

        document.getElementById('form-alocacao').addEventListener('submit', salvarAlocacao);
        document.getElementById('filtro-filial').addEventListener('change', () => {
            atualizarOpcoesFerramentas();
            atualizarSelectTecnicos();
        });

    } catch (error) {
        console.error("Falha na inicialização da página:", error);
        Swal.fire('Erro Crítico', 'Não foi possível carregar os dados da página. Verifique o console para mais detalhes.', 'error');
    }
}

// As funções abaixo não precisam de alteração (mantidas do seu código original)
function atualizarOpcoesFerramentas() {
    const filialFiltro = document.getElementById('filtro-filial').value.toUpperCase();
    let ferramentasFiltradas = todasFerramentas;
    if (filialFiltro) {
        ferramentasFiltradas = ferramentasFiltradas.filter(f => f.filial.toUpperCase() === filialFiltro);
    }
    const ferramentasDisponiveis = ferramentasFiltradas.filter(f => {
        const alocadas = todasAlocacoes.filter(a => a.ferramentaId === f.id).length;
        // Excluir ferramentas que estão em reparo OU marcadas como inativas
        return f.quantidade > alocadas && !f.reparo && !f.inativa;
    });
    const opcoes = ferramentasDisponiveis.map(f => {
        const alocadas = todasAlocacoes.filter(a => a.ferramentaId === f.id).length;
        const disponiveis = f.quantidade - alocadas;
        const localizacao = f.localizacao && f.localizacao.trim() !== '' ? ` --- ${f.localizacao}` : '';
        return {
            value: f.id,
            text: `${f.codigo} ${localizacao}  --- ${f.descricao} --- ${disponiveis} DISP.`
        };
    });
    tomSelectFerramentas.clear();
    tomSelectFerramentas.clearOptions();
    tomSelectFerramentas.addOptions(opcoes);
    tomSelectFerramentas.refreshOptions(false);
}

function atualizarSelectTecnicos() {
    const select = document.getElementById('tecnico-select');
    const filialFiltro = document.getElementById('filtro-filial').value.toUpperCase();
    select.innerHTML = '<option value="">Selecione um técnico...</option>';
    let tecnicosFiltrados = todosTecnicos;
    if (filialFiltro) {
        tecnicosFiltrados = todosTecnicos.filter(t => t.filial.toUpperCase() === filialFiltro);
    }
    tecnicosFiltrados.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(t => {
        select.innerHTML += `<option value="${t.nome}">${t.nome}</option>`;
    });
}

async function salvarAlocacao(event) {
    event.preventDefault();
    const ferramentaId = tomSelectFerramentas.getValue();
    if (!ferramentaId) {
        return Swal.fire("Atenção", "Nenhuma ferramenta foi selecionada.", "warning");
    }
    const os = tomSelectOS.getValue(); // Agora pega do Tom Select
    if (!os) {
        return Swal.fire("Atenção", "O campo Ordem de Serviço é obrigatório.", "warning");
    }

    const dadosAlocacao = {
        ordemServico: os,
        ferramentaId: ferramentaId,
        funcionario: document.getElementById("tecnico-select").value,
        dataAlocacao: new Date(),
        responsavelLancamento: document.getElementById("responsavel-lancamento").value,
    };
    if (!dadosAlocacao.funcionario || !document.getElementById("data-alocacao").value) {
        return Swal.fire("Atenção", "O técnico e a data são obrigatórios.", "warning");
    }

    Swal.fire({ title: 'Salvando...', text: 'Aguarde um momento.', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        await addDoc(collection(db, "alocacoes"), dadosAlocacao);
        const ferramenta = todasFerramentas.find(f => f.id === ferramentaId);
        if (ferramenta) {
            const historico = {
                tipo: 'alocacao',
                ferramentaId: ferramentaId,
                ferramentaCodigo: ferramenta.codigo,
                ferramentaDescricao: ferramenta.descricao,
                filial: ferramenta.filial,
                timestamp: new Date(),
                detalhes: { funcionario: dadosAlocacao.funcionario, ordemServico: dadosAlocacao.ordemServico }
            };
            await addDoc(collection(db, "historico"), historico);
        }
        await Swal.fire('Sucesso!', 'Ferramenta alocada com sucesso!', 'success');
        window.location.href = '/Pages/Ferramentas/ControleFerramentas-Alocacao.html';
    } catch (error) {
        Swal.fire('Erro!', `Falha ao salvar a alocação: ${error.message}`, 'error');
    }
}

document.addEventListener('DOMContentLoaded', iniciarPagina);

