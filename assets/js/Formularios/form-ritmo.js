import { db, auth } from '../firebase-config.js'; 
import { collection, addDoc, doc, getDoc, writeBatch, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// --- REFERÊNCIAS AOS ELEMENTOS DO FORMULÁRIO ---
const form = document.getElementById('form-ritmo' );
const gestorInput = document.getElementById('gestor');
const tipoTarefaSelect = document.getElementById('tipo-tarefa');
const submitButton = form.querySelector('button[type="submit"]');

// Mapeia todos os containers de campos dinâmicos
const camposDinamicos = {
    deslocamento: document.getElementById('campos-deslocamento'),
    reuniao: document.getElementById('campos-reuniao'),
    atendimento: document.getElementById('campos-atendimento'),
    agendamento_reuniao: document.getElementById('campos-agendamento_reuniao'),
    agendamento_treinamento: document.getElementById('campos-agendamento_treinamento'),
    ferias: document.getElementById('campos-ferias'),
    outro: document.getElementById('campos-outro')
};

// --- LÓGICA DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        gestorInput.value = "Carregando nome...";
        const userDocRef = doc(db, "gestores", user.uid);
        try {
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                gestorInput.value = userDocSnap.data().nome || 'Usuário sem nome';
            } else {
                gestorInput.value = user.displayName || 'Nome não encontrado';
            }
        } catch (error) {
            console.error("Erro ao buscar nome do gestor:", error);
            gestorInput.value = "Erro ao carregar nome";
        }
    } else {
        window.location.href = '/pages/Login/index.html';
    }
});

// --- LÓGICA PARA MOSTRAR/ESCONDER CAMPOS DINÂMICOS ---
tipoTarefaSelect.addEventListener('change', (e) => {
    const tipoSelecionado = e.target.value;
    Object.values(camposDinamicos).forEach(campo => {
        if (campo) campo.classList.add('hidden');
    });
    if (camposDinamicos[tipoSelecionado]) {
        camposDinamicos[tipoSelecionado].classList.remove('hidden');
    }
});

// --- FUNÇÃO PARA VERIFICAR A DISPONIBILIDADE DA SALA ---
async function verificarDisponibilidade(tipoTarefa, dataInicio, dataFim) {
    const tarefasRef = collection(db, "tarefasRitmo");
    const q = query(
        tarefasRef,
        where("tipo", "==", tipoTarefa),
        where("data", ">=", dataInicio),
        where("data", "<=", dataFim),
        limit(1)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        const conflitoDoc = querySnapshot.docs[0].data();
        return { disponivel: false, conflito: conflitoDoc.data };
    }
    return { disponivel: true, conflito: null };
}

// --- LÓGICA DE ENVIO DO FORMULÁRIO (COM NOTIFICAÇÕES SWEETALERT2) ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    Swal.fire({
        title: 'Salvando...',
        text: 'Aguarde um momento.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");

        const tipoTarefa = tipoTarefaSelect.value;
        if (!tipoTarefa) throw new Error('Por favor, selecione um tipo de tarefa.');
        
        const tarefaBase = {
            gestor: gestorInput.value,
            tipo: tipoTarefa,
            descricao: document.getElementById('descricao').value,
            criadoEm: new Date(),
            criadorUid: user.uid 
        };

        const tiposDeIntervalo = ['deslocamento', 'agendamento_reuniao', 'agendamento_treinamento', 'ferias'];
        const tiposDeSala = ['agendamento_reuniao', 'agendamento_treinamento'];

        if (tiposDeIntervalo.includes(tipoTarefa)) {
            let dataInicio, dataFim;
            const tipoBaseId = tipoTarefa.replace('_', '-');

            if (tipoTarefa === 'deslocamento') {
                tarefaBase.filial = document.getElementById('deslocamento-filial').value;
                dataInicio = document.getElementById('deslocamento-ida').value;
                dataFim = document.getElementById('deslocamento-volta').value;
            } else if (tiposDeSala.includes(tipoTarefa)) {
                dataInicio = document.getElementById(`${tipoBaseId}-inicio`).value;
                dataFim = document.getElementById(`${tipoBaseId}-fim`).value;
            } else if (tipoTarefa === 'ferias') {
                dataInicio = document.getElementById('ferias-inicio').value;
                dataFim = document.getElementById('ferias-fim').value;
            }

            if (!dataInicio || !dataFim) throw new Error("As datas de início e fim são obrigatórias.");
            if (new Date(dataFim) < new Date(dataInicio)) throw new Error("A data final não pode ser anterior à data inicial.");

            if (tiposDeSala.includes(tipoTarefa)) {
                Swal.update({ text: 'Verificando agenda...' });
                const disponibilidade = await verificarDisponibilidade(tipoTarefa, dataInicio, dataFim);

                if (!disponibilidade.disponivel) {
                    const dataConflito = new Date(disponibilidade.conflito.replace(/-/g, '/')).toLocaleDateString('pt-BR');
                    const err = new Error(`Conflito de agendamento! A sala já está reservada no dia ${dataConflito}.`);
                    err.name = 'ConflictError';
                    throw err;
                }
            }

            Swal.update({ text: 'Salvando agendamento...' });
            const batch = writeBatch(db);
            const tarefasCollection = collection(db, "tarefasRitmo");
            const idGrupo = doc(tarefasCollection).id; 

            let dataCorrente = new Date(dataInicio + 'T00:00:00');
            const dataFinal = new Date(dataFim + 'T00:00:00');

            while (dataCorrente <= dataFinal) {
                const novaTarefaRef = doc(tarefasCollection);
                batch.set(novaTarefaRef, {
                    ...tarefaBase,
                    data: dataCorrente.toISOString().split('T')[0],
                    idGrupo: idGrupo
                });
                dataCorrente.setDate(dataCorrente.getDate() + 1);
            }
            await batch.commit();

        } else {
            // Lógica para eventos de dia único
            const tarefaData = { ...tarefaBase };

            if (tipoTarefa === 'reuniao') {
                tarefaData.data = document.getElementById('reuniao-data').value;
                tarefaData.horarioInicio = document.getElementById('reuniao-inicio').value;
                tarefaData.horarioFim = document.getElementById('reuniao-termino').value;
                if (!tarefaData.data) throw new Error("A Data da Reunião é obrigatória.");
            } else if (tipoTarefa === 'atendimento') {
                tarefaData.data = document.getElementById('atendimento-data').value;
                if (!tarefaData.data) throw new Error("A Data do Atendimento é obrigatória.");
            } else if (tipoTarefa === 'outro') {
                tarefaData.data = document.getElementById('outro-data').value;
                if (!tarefaData.data) throw new Error("A Data da Atividade é obrigatória.");
            }

            await addDoc(collection(db, "tarefasRitmo"), tarefaData);
        }

        await Swal.fire({
            icon: 'success',
            title: 'Sucesso!',
            text: 'Sua tarefa foi adicionada ao calendário.',
            timer: 2000,
            showConfirmButton: false
        });
        window.location.href = '/pages/Menu.html';

    } catch (error) {
        console.error("Erro ao adicionar tarefa: ", error);
        
        if (error.name === 'ConflictError') {
            Swal.fire({
                icon: 'warning',
                title: 'Oops... Sala Ocupada!',
                text: error.message,
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Erro ao Salvar',
                text: error.message,
            });
        }
    }
});
