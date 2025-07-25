const CACHE_NAME = "agrodivel-cache-v2";

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

// Instala o cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Ativa e limpa caches antigos
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

// Intercepta requisições e tenta servir do cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
