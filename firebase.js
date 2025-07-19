// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Configuração do seu Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
  authDomain: "agro-divel.firebaseapp.com",
  projectId: "agro-divel",
  storageBucket: "agro-divel.firebasestorage.app",
  messagingSenderId: "583977436505",
  appId: "1:583977436505:web:3754ec029aebb3d9d67848"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Função genérica para qualquer formulário
window.enviarChecklist = async function (event, colecao) {
  event.preventDefault();

  const dados = {
    nomeCliente: document.querySelector('[placeholder="Digite o nome"]')?.value || '',
    nomeFazenda: document.querySelector('[placeholder="Digite o nome da fazenda"]')?.value || '',
    telefone: document.querySelector('[type="tel"]')?.value || '',
    municipio: document.querySelector('[placeholder="Digite o município"]')?.value || '',
    modelo: document.querySelector('[placeholder="Digite o modelo da máquina"]')?.value || '',
    horimetro: document.querySelectorAll('input')[5]?.value || '',
    consultor: document.querySelector('[placeholder="Digite o nome do consultor"]')?.value || '',
    dataVisita: document.getElementById('dataVisita')?.value || '',
    observacoes: document.querySelector('textarea')?.value || '',
    checklist: Array.from(document.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
    criadoEm: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, colecao), dados);
    alert("✅ Checklist enviado com sucesso!");
    document.querySelector("form").reset();
  } catch (e) {
    console.error("❌ Erro ao salvar:", e);
    alert("Erro ao salvar os dados.");
  }
};
