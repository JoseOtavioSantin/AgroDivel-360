// Gerenciador de PWA - Registro e Atualização do Service Worker
class PWAManager {
  constructor() {
    this.registration = null;
    this.updateAvailable = false;
  }

  // Registra o Service Worker
  async register() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker não é suportado neste navegador');
      return;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      console.log('[PWA] Service Worker registrado com sucesso');

      // Verifica atualizações a cada 30 segundos
      setInterval(() => {
        this.registration.update();
      }, 30000);

      // Escuta por atualizações
      this.registration.addEventListener('updatefound', () => {
        this.handleUpdateFound(this.registration.installing);
      });

      // Verifica se há um Service Worker esperando para ser ativado
      if (this.registration.waiting) {
        this.showUpdateNotification();
      }

      // Escuta mudanças no estado do controller
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Controller alterado, recarregando página...');
        window.location.reload();
      });

    } catch (error) {
      console.error('[PWA] Erro ao registrar Service Worker:', error);
    }
  }

  // Manipula quando uma atualização é encontrada
  handleUpdateFound(installingWorker) {
    console.log('[PWA] Nova versão encontrada, instalando...');

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          // Nova versão disponível
          console.log('[PWA] Nova versão instalada e pronta');
          this.showUpdateNotification();
        } else {
          // Primeira instalação
          console.log('[PWA] Conteúdo em cache para uso offline');
          this.showOfflineNotification();
        }
      }
    });
  }

  // Mostra notificação de atualização disponível
  showUpdateNotification() {
    this.updateAvailable = true;
    
    const notification = document.createElement('div');
    notification.id = 'pwa-update-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 15px;
        font-family: Arial, sans-serif;
        max-width: 350px;
      ">
        <i class="fas fa-sync-alt" style="font-size: 24px;"></i>
        <div style="flex: 1;">
          <strong>Nova versão disponível!</strong>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Clique para atualizar o sistema.</p>
        </div>
        <button onclick="pwaManager.applyUpdate()" style="
          background: white;
          color: #4CAF50;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        ">
          Atualizar
        </button>
        <button onclick="this.closest('div').remove()" style="
          background: transparent;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 20px;
        ">
          ×
        </button>
      </div>
    `;
    
    document.body.appendChild(notification);
  }

  // Mostra notificação de instalação para uso offline
  showOfflineNotification() {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2196F3;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: Arial, sans-serif;
        max-width: 350px;
      ">
        <i class="fas fa-check-circle"></i>
        <strong>App instalado!</strong>
        <p style="margin: 5px 0 0 0; font-size: 14px;">Agora você pode usar offline.</p>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  // Aplica a atualização imediatamente
  applyUpdate() {
    if (this.registration && this.registration.waiting) {
      // Envia mensagem para o Service Worker pular a espera
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Limpa todo o cache manualmente
  async clearCache() {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      console.log('[PWA] Cache limpo com sucesso');
      
      if (this.registration && this.registration.active) {
        this.registration.active.postMessage({ type: 'CLEAR_CACHE' });
      }
      
      alert('Cache limpo! A página será recarregada.');
      window.location.reload();
    }
  }

  // Verifica o status do PWA
  getStatus() {
    return {
      isSupported: 'serviceWorker' in navigator,
      isRegistered: !!this.registration,
      updateAvailable: this.updateAvailable,
      isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    };
  }
}

// Instância global
const pwaManager = new PWAManager();

// Registra automaticamente quando a página carregar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => pwaManager.register());
} else {
  pwaManager.register();
}

// Exporta para uso global
window.pwaManager = pwaManager;
