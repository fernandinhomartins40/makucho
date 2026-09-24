// ============================================================
// Service worker do MAKUCHO Studio.
//
// O que ele faz, e só isso:
//   - arquivos estáticos do Next (/_next/static), fontes e ícones do app:
//     cache primeiro (têm hash ou versão na URL, nunca mudam);
//   - páginas: rede primeiro; sem rede, a última versão guardada, ou a
//     página /offline;
//   - /api/*: NUNCA passa pelo cache (sessão, vídeos, planos e envios
//     precisam ser sempre os do servidor), exceto os ícones e telas de
//     abertura do app.
//
// Sem biblioteca: o comportamento cabe aqui e fica fácil de auditar.
// ============================================================

const VERSAO = 'studio-v1';
const ESTATICOS = `${VERSAO}-estaticos`;
const PAGINAS = `${VERSAO}-paginas`;
const OFFLINE = '/offline';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(PAGINAS)
      .then((c) => c.addAll([OFFLINE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function ehEstatico(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/api/pwa/icone/') ||
    url.pathname.startsWith('/api/pwa/abertura/')
  );
}

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (ehEstatico(url)) {
    evento.respondWith(
      caches.open(ESTATICOS).then(async (cache) => {
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        const resposta = await fetch(req);
        if (resposta.ok) cache.put(req, resposta.clone());
        return resposta;
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(PAGINAS).then((c) => c.put(req, copia));
          }
          return resposta;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE)) || Response.error()),
    );
  }
});
