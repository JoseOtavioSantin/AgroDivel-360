// Importa as funções necessárias do Firebase
import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Seleciona os elementos do formulário
const form = document.getElementById('form-cadastro-gestor' );
const statusMessage = document.getElementById('status-message');

// Adiciona um "ouvinte" para o evento de envio do formulário
form.addEventListener('submit', async (event) => {
    event.preventDefault(); // Impede o recarregamento da página

    // 1. Coleta os dados do formulário
    const nome = document.getElementById('nome').value;
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const grupo = document.getElementById('grupo').value;
    const filial = document.getElementById('filial').value;

    statusMessage.textContent = 'Cadastrando, por favor aguarde...';
    statusMessage.style.color = 'blue';

    try {
        // 2. Cria o usuário no Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        console.log('Usuário criado no Auth com sucesso! UID:', user.uid);

        // 3. Prepara os dados para salvar no Firestore
        // A estrutura dos dados corresponde exatamente à sua imagem do Firestore
        const gestorData = {
            nome: nome,
            email: email,
            grupo: grupo,
            filial: [filial], // Salva como um array, igual na sua estrutura
            dashboard: "Pages/Dashboard/DashboardGeral.html" // Valor padrão
        };

        // 4. Salva os dados na coleção 'gestores' usando o UID do usuário como ID do documento
        await setDoc(doc(db, "gestores", user.uid), gestorData);
        console.log('Documento do gestor salvo no Firestore!');

        // 5. Exibe mensagem de sucesso e limpa o formulário
        statusMessage.textContent = `Gestor "${nome}" cadastrado com sucesso!`;
        statusMessage.style.color = 'green';
        form.reset();

    } catch (error) {
        // 6. Trata possíveis erros
        console.error("Erro ao cadastrar gestor:", error);
        statusMessage.textContent = `Erro: ${error.message}`;
        statusMessage.style.color = 'red';
    }
});
