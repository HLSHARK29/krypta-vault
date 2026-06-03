const CACHE_NAME = 'krypta-v6'; // Incrementamos a v6 para forzar el ciclo de vida

// Recursos críticos con parámetros de versión
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

// 1. Instalación: Cacheo inicial y SKIP WAITING
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Krypta SW: Instalando nueva versión...');
      return Promise.all(
        assets.map(url => {
          return cache.add(url).catch(err => console.warn(`Error cacheando: ${url}`, err));
        })
      );
    })
  );
  // FORZAR ACTIVACIÓN: No permite que el SW viejo se quede esperando
  self.skipWaiting();
});

// 2. Activación: Limpieza y CLAIM
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  // Reclamar el control de todas las pestañas abiertas de inmediato
  self.clients.claim();
});

// 3. Estrategia de carga: Network First (Red primero, si falla, Cache)
// Cambiamos de "Cache First" a "Network First" para evitar que el usuario 
// vea versiones viejas si tiene conexión a internet.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Excluir llamadas de Firebase y Auth para que funcionen siempre online
  if (
    e.request.url.includes('firestore.googleapis.com') || 
    e.request.url.includes('identitytoolkit') ||
    e.request.url.includes('google.com/recaptcha')
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(networkResponse => {
        // Si la red responde, actualizamos el caché dinámicamente
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Si no hay internet, servimos desde el caché
        return caches.match(e.request);
      })
  );
});