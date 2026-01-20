import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db, messaging } from "./firebase-config.js"; // Importa as instâncias já inicializadas

// ========================================================================
// IMPORTANTE: Substitua pela chave VAPID gerada no console do Firebase
// ========================================================================
const VAPID_KEY = "BDFDgFpktINbugBJ1xIaF0bsKic4zAD92yzhew1gOy2EdSdhk7Khsw3amwjcnYyW5hzAKZGUoW35o0ZXHlV7pZ0";

/**
 * Função principal para solicitar permissão de notificação e salvar o token.
 */
export async function setupNotifications( ) {
    try {
        // Pede permissão ao usuário
        const permission = await Notification.requestPermission();

        if (permission === "granted") {
            console.log("Permissão para notificações concedida.");

            // Obtém o token de registro do dispositivo
            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });

            if (currentToken) {
                console.log("Token do dispositivo obtido:", currentToken);
                
                // Salva o token no documento do gestor logado no Firestore
                const user = auth.currentUser;
                if (user) {
                    const userDocRef = doc(db, "gestores", user.uid);
                    // Usamos 'merge: true' para adicionar o campo sem apagar os dados existentes
                    await setDoc(userDocRef, { fcmToken: currentToken }, { merge: true });
                    console.log("Token FCM salvo no documento do gestor:", user.uid);
                }
            } else {
                console.log("Não foi possível obter o token de notificação. A permissão foi concedida?");
            }
        } else {
            console.log("Permissão para notificações foi negada.");
        }
    } catch (error) {
        console.error("Erro ao configurar as notificações:", error);
    }
}

/**
 * Handler para quando uma notificação é recebida e o site está
 * em primeiro plano (aba ativa).
 */
onMessage(messaging, (payload) => {
    console.log("Mensagem recebida em primeiro plano: ", payload);
    
    // Em vez de uma notificação do sistema, podemos mostrar um alerta customizado
    // ou um "toast" na tela para não interromper o usuário.
    // Por enquanto, vamos usar um alerta simples.
    alert(`🔔 ${payload.notification.title}\n\n${payload.notification.body}`);
});
