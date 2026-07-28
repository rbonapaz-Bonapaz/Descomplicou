// Service worker mínimo — só existe pra habilitar "instalar como app" no celular e permitir abrir
// a tela já visitada quando a internet cair por um instante. NÃO cacheia nada do Firebase/Firestore
// (dados sempre precisam vir da rede, ao vivo) — só arquivos próprios do app (HTML/CSS/JS/ícones),
// e só os do MESMO domínio. Tudo o mais passa direto, sem interceptar.
// Trocar esse nome (ex: v1 -> v2) força o app instalado a jogar fora TUDO que tinha em cache e
// buscar os arquivos frescos de novo na próxima vez que abrir — use isso sempre que suspeitar que
// um app instalado ficou preso numa versão antiga do CSS/JS (o ativo comum e correto do service
// worker; nada de errado em precisar disso de vez em quando).
const CACHE_NAME = 'descomplicou-v4';

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
