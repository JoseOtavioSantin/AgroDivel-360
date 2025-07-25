import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Configuração do Firebase
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

// Popup bonito
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
  setTimeout(() => popup.remove(), 3000);
}

// Envio pro Firebase
async function enviarParaFirebase(dados, colecao) {
  try {
    await addDoc(collection(db, colecao), dados);
    console.log("✅ Dados enviados ao Firebase:", dados);
    return true;
  } catch (e) {
    console.error("❌ Erro ao enviar:", e);
    return false;
  }
}

// Enviar formulário
window.enviarChecklist = async function (event, colecao) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  const dados = {
    nomeCliente: formData.get("nomeCliente") || "",
    nomeFazenda: formData.get("nomeFazenda") || "",
    telefone: formData.get("telefone") || "",
    filial: formData.get("filial") || "",
    municipio: formData.get("municipio") || "",
    modelo: formData.get("modeloMaquina") || "",
    horimetro: formData.get("horimetro") || "",
    consultor: formData.get("nomeConsultor") || "",
    dataVisita: formData.get("dataVisita") || "",
    observacoes: formData.get("observacoes") || "",
    checklist: formData.getAll("checklist"),
    criadoEm: new Date().toISOString()
  };

  if (navigator.onLine) {
    const sucesso = await enviarParaFirebase(dados, colecao);
    if (sucesso) {
      mostrarPopup("✅ Checklist enviado com sucesso!");
      form.reset();
    } else {
      mostrarPopup("❌ Erro ao enviar os dados.", false);
    }
  } else {
    // Salvar localmente
    const pendentes = JSON.parse(localStorage.getItem("checklistsPendentes")) || [];
    pendentes.push({ colecao, dados });
    localStorage.setItem("checklistsPendentes", JSON.stringify(pendentes));
    mostrarPopup("📴 Sem internet! Checklist salvo localmente.");
    form.reset();
  }
};

// Ao reconectar, enviar pendentes
window.addEventListener("online", async () => {
  const pendentes = JSON.parse(localStorage.getItem("checklistsPendentes")) || [];

  if (pendentes.length > 0) {
    mostrarPopup("🌐 Conectado! Enviando checklists salvos...");

    for (const item of pendentes) {
      await enviarParaFirebase(item.dados, item.colecao);
    }

    localStorage.removeItem("checklistsPendentes");
    mostrarPopup("✅ Todos os checklists pendentes foram enviados!");
  }
});

export { app, db };
