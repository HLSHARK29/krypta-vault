const CACHE_NAME = 'krypta-v5'; // Versión actualizada para controles de búsqueda y A-Z

// Recursos críticos con parámetros de versión para coincidir con index.html
const assets = [
  './',
  'index.html',
  'style.css?v=1.0.1',
  'app.js?v=1.0.1',
  'auth.js',
  'crypto.js',
  'store.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  // Fuentes e Iconos
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  // Librerías de Firebase
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
];

// 1. Instalación: Cacheo inicial
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Krypta SW: Asegurando integridad de la bóveda v5...');
      return Promise.all(
        assets.map(url => {
          return cache.add(url).catch(err => console.warn(`Error cacheando: ${url}`, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// 2. Activación: Limpieza de versiones viejas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Estrategia de carga: Cache First, Network Fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (
    e.request.url.includes('firestore.googleapis.com') || 
    e.request.url.includes('identitytoolkit') ||
    e.request.url.includes('google.com/recaptcha')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;

      return fetch(e.request).then(networkResponse => {
        return networkResponse;
      }).catch(() => {
        console.error('Krypta SW: Recurso no disponible offline.');
      });
    })
  );
});