/**
 * Sistema de Diálogo de Confirmação
 * Modal elegante para perguntas Sim/Não
 */

// Ícones SVG para cada tipo de confirmação
const CONFIRM_ICONS = {
    pergunta: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`,
    aviso: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
    </svg>`,
    perigo: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`,
    info: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`,
    sucesso: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`
};

// Cores por tipo
const CONFIRM_COLORS = {
    pergunta: { bg: '#eff6ff', icon: '#3b82f6', btnConfirm: '#3b82f6' },
    aviso: { bg: '#fffbeb', icon: '#f59e0b', btnConfirm: '#f59e0b' },
    perigo: { bg: '#fef2f2', icon: '#ef4444', btnConfirm: '#ef4444' },
    info: { bg: '#f0fdf4', icon: '#22c55e', btnConfirm: '#22c55e' },
    sucesso: { bg: '#f0fdf4', icon: '#22c55e', btnConfirm: '#22c55e' }
};

export class ConfirmDialog {
    constructor() {
        this.injectStyles();
    }

    /**
     * Injeta os estilos CSS necessários
     */
    injectStyles() {
        if (document.getElementById('confirm-dialog-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'confirm-dialog-styles';
        styles.textContent = `
            .confirm-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 0;
                animation: confirm-fadeIn 0.2s ease forwards;
                padding: 20px;
            }

            .confirm-overlay.closing {
                animation: confirm-fadeOut 0.2s ease forwards;
            }

            .confirm-dialog {
                background: #ffffff;
                border-radius: 20px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                max-width: 420px;
                width: 100%;
                overflow: hidden;
                transform: scale(0.9) translateY(20px);
                animation: confirm-slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }

            .confirm-overlay.closing .confirm-dialog {
                animation: confirm-slideOut 0.2s ease forwards;
            }

            .confirm-dialog__header {
                padding: 32px 32px 0;
                text-align: center;
            }

            .confirm-dialog__icon {
                width: 72px;
                height: 72px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
            }

            .confirm-dialog__icon svg {
                width: 36px;
                height: 36px;
            }

            .confirm-dialog__title {
                font-size: 20px;
                font-weight: 700;
                color: #1f2937;
                margin: 0 0 8px;
                line-height: 1.3;
            }

            .confirm-dialog__message {
                font-size: 15px;
                color: #6b7280;
                line-height: 1.6;
                margin: 0;
            }

            .confirm-dialog__body {
                padding: 24px 32px 32px;
            }

            .confirm-dialog__buttons {
                display: flex;
                gap: 12px;
            }

            .confirm-dialog__btn {
                flex: 1;
                padding: 14px 24px;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            .confirm-dialog__btn--cancel {
                background: #f3f4f6;
                color: #4b5563;
            }

            .confirm-dialog__btn--cancel:hover {
                background: #e5e7eb;
                color: #374151;
            }

            .confirm-dialog__btn--confirm {
                color: #ffffff;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
            }

            .confirm-dialog__btn--confirm:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
            }

            .confirm-dialog__btn--confirm:active {
                transform: translateY(0);
            }

            @keyframes confirm-fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes confirm-fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }

            @keyframes confirm-slideIn {
                from {
                    transform: scale(0.9) translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: scale(1) translateY(0);
                    opacity: 1;
                }
            }

            @keyframes confirm-slideOut {
                from {
                    transform: scale(1) translateY(0);
                    opacity: 1;
                }
                to {
                    transform: scale(0.9) translateY(20px);
                    opacity: 0;
                }
            }

            @media (max-width: 480px) {
                .confirm-dialog {
                    max-width: 100%;
                    border-radius: 16px;
                }

                .confirm-dialog__header {
                    padding: 24px 24px 0;
                }

                .confirm-dialog__body {
                    padding: 20px 24px 24px;
                }

                .confirm-dialog__icon {
                    width: 60px;
                    height: 60px;
                }

                .confirm-dialog__icon svg {
                    width: 30px;
                    height: 30px;
                }

                .confirm-dialog__title {
                    font-size: 18px;
                }

                .confirm-dialog__buttons {
                    flex-direction: column-reverse;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Exibe um diálogo de confirmação
     * @param {Object} options - Opções do diálogo
     * @param {string} options.titulo - Título do diálogo
     * @param {string} options.mensagem - Mensagem do diálogo
     * @param {string} options.tipo - Tipo: 'pergunta', 'aviso', 'perigo', 'info', 'sucesso'
     * @param {string} options.textoSim - Texto do botão confirmar (padrão: 'Sim')
     * @param {string} options.textoNao - Texto do botão cancelar (padrão: 'Não')
     * @returns {Promise<boolean>} - true se confirmou, false se cancelou
     */
    async confirmar({
        titulo = 'Confirmar ação?',
        mensagem = 'Deseja continuar com esta ação?',
        tipo = 'pergunta',
        textoSim = 'Sim',
        textoNao = 'Não'
    } = {}) {
        return new Promise((resolve) => {
            const colors = CONFIRM_COLORS[tipo] || CONFIRM_COLORS.pergunta;
            const icon = CONFIRM_ICONS[tipo] || CONFIRM_ICONS.pergunta;

            // Criar overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';

            overlay.innerHTML = `
                <div class="confirm-dialog">
                    <div class="confirm-dialog__header">
                        <div class="confirm-dialog__icon" style="background: ${colors.bg}; color: ${colors.icon};">
                            ${icon}
                        </div>
                        <h2 class="confirm-dialog__title">${this.escapeHtml(titulo)}</h2>
                        <p class="confirm-dialog__message">${this.escapeHtml(mensagem)}</p>
                    </div>
                    <div class="confirm-dialog__body">
                        <div class="confirm-dialog__buttons">
                            <button class="confirm-dialog__btn confirm-dialog__btn--cancel" data-action="cancel">
                                ${this.escapeHtml(textoNao)}
                            </button>
                            <button class="confirm-dialog__btn confirm-dialog__btn--confirm" style="background: ${colors.btnConfirm};" data-action="confirm">
                                ${this.escapeHtml(textoSim)}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Handlers
            const fechar = (resultado) => {
                overlay.classList.add('closing');
                setTimeout(() => {
                    overlay.remove();
                    resolve(resultado);
                }, 200);
            };

            // Botões
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => fechar(true));
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => fechar(false));

            // Fechar ao clicar fora
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) fechar(false);
            });

            // Fechar com ESC
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEsc);
                    fechar(false);
                }
            };
            document.addEventListener('keydown', handleEsc);

            // Focar no botão de confirmar
            setTimeout(() => {
                overlay.querySelector('[data-action="confirm"]').focus();
            }, 100);
        });
    }

    /**
     * Atalho para confirmação de exclusão (tipo perigo)
     */
    async excluir(titulo = 'Excluir item?', mensagem = 'Esta ação não pode ser desfeita.') {
        return this.confirmar({
            titulo,
            mensagem,
            tipo: 'perigo',
            textoSim: 'Sim, excluir',
            textoNao: 'Cancelar'
        });
    }

    /**
     * Atalho para confirmação de ação (tipo aviso)
     */
    async acao(titulo, mensagem) {
        return this.confirmar({
            titulo,
            mensagem,
            tipo: 'aviso',
            textoSim: 'Continuar',
            textoNao: 'Cancelar'
        });
    }

    /**
     * Escapa caracteres HTML
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
}

// Cria uma instância global singleton
export const confirmar = new ConfirmDialog();

// Exporta também como global para uso em scripts inline
window.confirmar = confirmar;
