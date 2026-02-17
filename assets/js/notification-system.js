/**
 * Sistema de Notificação Visual
 * Exibe notificações no canto superior direito com auto-dismiss após 5 segundos
 */

// Ícones SVG para cada tipo de notificação
const ICONS = {
    erro: `<svg class="icon-erro" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    </svg>`,
    sucesso: `<svg class="icon-sucesso" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
    </svg>`,
    aviso: `<svg class="icon-aviso" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
    </svg>`,
    info: `<svg class="icon-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`
};

const CLOSE_ICON = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
</svg>`;

export class NotificationSystem {
    constructor() {
        this.container = this.getOrCreateContainer();
        this.notifications = [];
    }

    /**
     * Obtém ou cria o container de notificações
     */
    getOrCreateContainer() {
        let container = document.getElementById('notification-container');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        return container;
    }

    /**
     * Exibe uma notificação de erro
     * @param {string} titulo - Título da notificação
     * @param {string} mensagem - Mensagem da notificação
     * @param {number} duracao - Duração em ms (padrão: 5000)
     */
    erro(titulo, mensagem, duracao = 5000) {
        this.show('erro', titulo, mensagem, duracao);
    }

    /**
     * Exibe uma notificação de sucesso
     * @param {string} titulo - Título da notificação
     * @param {string} mensagem - Mensagem da notificação
     * @param {number} duracao - Duração em ms (padrão: 5000)
     */
    sucesso(titulo, mensagem, duracao = 5000) {
        this.show('sucesso', titulo, mensagem, duracao);
    }

    /**
     * Exibe uma notificação de aviso
     * @param {string} titulo - Título da notificação
     * @param {string} mensagem - Mensagem da notificação
     * @param {number} duracao - Duração em ms (padrão: 5000)
     */
    aviso(titulo, mensagem, duracao = 5000) {
        this.show('aviso', titulo, mensagem, duracao);
    }

    /**
     * Exibe uma notificação de informação
     * @param {string} titulo - Título da notificação
     * @param {string} mensagem - Mensagem da notificação
     * @param {number} duracao - Duração em ms (padrão: 5000)
     */
    info(titulo, mensagem, duracao = 5000) {
        this.show('info', titulo, mensagem, duracao);
    }

    /**
     * Cria e exibe uma notificação
     * @private
     */
    show(tipo, titulo, mensagem, duracao) {
        const notification = document.createElement('div');
        notification.className = `notification-card ${tipo}`;

        notification.innerHTML = `
            <div class="notification-body">
                <div class="notification-icon-wrapper">
                    ${ICONS[tipo]}
                </div>
                <div class="notification-text">
                    <div class="notification-title">${this.escapeHtml(titulo)}</div>
                    <div class="notification-message">${this.escapeHtml(mensagem)}</div>
                </div>
            </div>
            <button class="notification-close-btn">${CLOSE_ICON}</button>
            <div class="notification-progress">
                <div class="notification-progress-bar" style="animation-duration: ${duracao}ms;"></div>
            </div>
        `;

        this.container.appendChild(notification);

        const closeBtn = notification.querySelector('.notification-close-btn');
        closeBtn.addEventListener('click', () => {
            this.remove(notification);
        });

        const timeoutId = setTimeout(() => {
            this.remove(notification);
        }, duracao);

        this.notifications.push({ element: notification, timeoutId });
    }

    /**
     * Remove uma notificação com animação
     * @private
     */
    remove(notification) {
        notification.classList.add('removing');

        setTimeout(() => {
            notification.remove();
            this.notifications = this.notifications.filter(n => n.element !== notification);
        }, 300);
    }

    /**
     * Escapa caracteres HTML para evitar XSS
     * @private
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Fecha todas as notificações ativas
     */
    fecharTodas() {
        this.notifications.forEach(({ element, timeoutId }) => {
            clearTimeout(timeoutId);
            this.remove(element);
        });
    }
}

// Cria uma instância global singleton
export const notificacao = new NotificationSystem();

// Exporta também como global para uso em console ou scripts inline
window.notificacao = notificacao;
