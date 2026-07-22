// Service worker mínimo — só existe pra habilitar "instalar como app" no celular e permitir abrir
// a tela já visitada quando a internet cair por um instante. NÃO cacheia nada do Firebase/Firestore
// (dados sempre precisam vir da rede, ao vivo) — só arquivos próprios do app (HTML/CSS/JS/ícones),
// e só os do MESMO domínio. Tudo o mais passa direto, sem interceptar.
const CACHE_NAME = 'descomplicou-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Só GET, só do mesmo site — qualquer chamada pro Firebase/Firestore/Auth (outro domínio) ou
  // qualquer POST/PUT (gravações) passa direto, sem passar pelo cache.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
