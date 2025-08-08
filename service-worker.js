const CACHE_NAME = "agrodivel-cache-v0.2"; // <- aumentei o número pra forçar atualização

const urlsToCache = [
  "index.html",
  "form-pecas.html",
  "form-servicos.html",
  "form-comercial.html",
  "form-consorcio.html",
  "form-PLM.html",
  "firebase.js",
  "manifest.json",
  "assets/192.png",
  "assets/512.png",
  "assets/logo.png"
];

// Instala os arquivos no cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Ativa o novo cache e remove caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      )
    )
  );
});

// Serve do cache ou faz fetch online
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Suporte para skipWaiting (ativa nova versão ao clicar no aviso)
self.addEventListener("message", (event) => {
  if (event.data?.action === "skipWaiting") {
    self.skipWaiting();
  }
});



