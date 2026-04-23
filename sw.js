const CACHE_NAME = 'krypta-v4'; // Incrementamos versión por los cambios de estructura

// Recursos críticos para que la bóveda funcione offline
const assets = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'auth.js',
  'crypto.js',
  'store.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  // Fuentes e Iconos
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  // Librerías de Firebase (Necesarias para que el código no rompa offline)
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
];

// 1. Instalación: Cacheo inicial
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Krypta SW: Cacheando integridad de la bóveda...');
      // Usamos un bucle para cachear uno a uno y evitar que un solo error detenga todo
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
  self.clients.claim(); // Toma el control de las pestañas abiertas inmediatamente
});

// 3. Estrategia de carga: Cache First, Network Fallback
self.addEventListener('fetch', e => {
  // Solo interceptamos peticiones GET (estándar para assets)
  if (e.request.method !== 'GET') return;

  // No cacheamos peticiones de autenticación activa o base de datos en tiempo real
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
        // Opcional: Podrías cachear nuevos recursos aquí si quisieras (Stale-while-revalidate)
        return networkResponse;
      }).catch(() => {
        // Si no hay red ni caché para una página, podrías devolver un offline.html (opcional)
        console.error('Krypta SW: Recurso no disponible offline.');
      });
    })
  );
});