
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

// Função para exibir popup
function mostrarPopup(mensagem, sucesso = true) {
  const popup = document.createElement("div");
  popup.textContent = mensagem;
  popup.style.position = "fixed";
  popup.style.top = "20px";
  popup.style.left = "50%";
  popup.style.transform = "translateX(-50%)";
  popup.style.padding = "12px 24px";
  popup.style.borderRadius = "8px";
  popup.style.zIndex = "9999";
  popup.style.fontWeight = "bold";
  popup.style.fontSize = "16px";
  popup.style.boxShadow = "0 0 12px rgba(0,0,0,0.4)";
  popup.style.backgroundColor = sucesso ? "#00bbf9" : "#ff4d4d";
  popup.style.color = "white";

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 3000);
}

// Função genérica de envio
window.enviarChecklist = async function (event, colecao) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  const dados = {
    nomeCliente: formData.get("nomeCliente") || "",
    nomeFazenda: formData.get("nomeFazenda") || "",
    telefone: formData.get("telefone") || "",
    municipio: formData.get("municipio") || "",
    modelo: formData.get("modeloMaquina") || "",
    horimetro: formData.get("horimetro") || "",
    consultor: formData.get("nomeConsultor") || "",
    dataVisita: formData.get("dataVisita") || "",
    observacoes: formData.get("observacoes") || "",
    checklist: formData.getAll("checklist"),
    criadoEm: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, colecao), dados);
    mostrarPopup("✅ Checklist enviado com sucesso!");
    form.reset();
  } catch (e) {
    console.error("❌ Erro ao salvar:", e);
    mostrarPopup("❌ Erro ao salvar os dados.", false);
  }
  
};
