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
  const fundo = document.createElement("div");
  fundo.style.position = "fixed";
  fundo.style.top = "0";
  fundo.style.left = "0";
  fundo.style.width = "100vw";
  fundo.style.height = "100vh";
  fundo.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
  fundo.style.display = "flex";
  fundo.style.alignItems = "center";
  fundo.style.justifyContent = "center";
  fundo.style.zIndex = "9999";

  const popup = document.createElement("div");
  popup.textContent = mensagem;
  popup.style.padding = "20px 30px";
  popup.style.borderRadius = "12px";
  popup.style.backgroundColor = sucesso ? "#00bbf9" : "#ff4d4d";
  popup.style.color = "white";
  popup.style.fontSize = "18px";
  popup.style.fontWeight = "bold";
  popup.style.boxShadow = "0 8px 20px rgba(0,0,0,0.4)";
  popup.style.textAlign = "center";
  popup.style.maxWidth = "90%";

  fundo.appendChild(popup);
  document.body.appendChild(fundo);

  setTimeout(() => {
    fundo.remove();
  }, 3000);
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
      mostrarPopup("✅ Dados enviados com sucesso!");
      form.reset();
    } else {
      mostrarPopup("❌ Erro ao enviar os dados.", false);
    }
  } else {
    // Salvar localmente
    const pendentes = JSON.parse(localStorage.getItem("checklistsPendentes")) || [];
    pendentes.push({ colecao, dados });
    localStorage.setItem("checklistsPendentes", JSON.stringify(pendentes));
    mostrarPopup("📴 Sem internet! dados salvos localmente.");
    form.reset();
  }
};

// Ao reconectar, enviar pendentes
window.addEventListener("online", async () => {
  const pendentes = JSON.parse(localStorage.getItem("checklistsPendentes")) || [];

  if (pendentes.length > 0) {
    mostrarPopup("🌐 Conectado! Enviando dados salvos...");

    for (const item of pendentes) {
      await enviarParaFirebase(item.dados, item.colecao);
    }

    localStorage.removeItem("checklistsPendentes");
    mostrarPopup("✅ Todos os dados pendentes foram enviados!");
  }
});

export { app, db };
