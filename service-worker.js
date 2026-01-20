// Service Worker para AgroDivel 360 PWA
// Versão do cache - INCREMENTE este número quando quiser forçar atualização
const CACHE_VERSION = 'agrodivel-v1.0.0';
const CACHE_NAME = `agrodivel-cache-${CACHE_VERSION}`;

// Arquivos essenciais para cache (offline-first)
const ESSENTIAL_FILES = [
  '/Pages/index.html',
  '/Pages/Menu.html',
  '/Pages/Login/Login.html',
  '/assets/css/style.css',
  '/assets/js/firebase-config.js',
  '/assets/js/auth.js',
  '/assets/js/main.js',
  '/manifest.json'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando versão:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cache aberto');
        return cache.addAll(ESSENTIAL_FILES.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => {
        console.log('[Service Worker] Instalação completa');
        // Força o novo Service Worker a se tornar ativo imediatamente
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Erro na instalação:', error);
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando versão:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Remove caches antigos automaticamente
            if (cacheName !== CACHE_NAME && cacheName.startsWith('agrodivel-cache-')) {
              console.log('[Service Worker] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Ativação completa');
        // Assume controle de todas as páginas imediatamente
        return self.clients.claim();
      })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições para outros domínios (Firebase, CDNs, etc)
  if (url.origin !== location.origin) {
    return;
  }

  // Estratégia: Network First com fallback para Cache
  // Ideal para conteúdo dinâmico que precisa estar atualizado
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Se a requisição foi bem-sucedida, atualiza o cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhar (offline), busca do cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Servindo do cache:', request.url);
            return cachedResponse;
          }
          
          // Se não houver no cache, retorna página offline genérica
          if (request.destination === 'document') {
            return caches.match('/Pages/index.html');
          }
        });
      })
  );
});

// Escuta mensagens do cliente para forçar atualização
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Forçando atualização...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[Service Worker] Limpando todo o cache...');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
