// ============================================================
// Diagnóstico remoto de um aparelho (o iPhone de um cliente que a gente não
// tem na mão). Ligado só quando a pessoa abre o Studio com ?diagnostico=1
// (e desligado com ?diagnostico=0): fica lembrado no aparelho e mostra um
// código (DX-XXXX) para achar os registros depois.
//
// Registra o caminho até um defeito: os toques, a gaveta abrindo e
// fechando, o item escolhido, os erros, a página indo para o fundo, e a
// cada 5 s um pulso (iframes abertos, nós da página, memória quando o
// navegador conta). Vai em lotes para /api/health/rastro (log + Redis).
//
// A queda: o iPhone derruba a página que passa do limite de memória e a
// recarrega sozinho -- sem `pagehide`. Uma marca "viva" no armazenamento
// denuncia isso na abertura seguinte, e os últimos eventos de antes da
// queda (guardados no aparelho) vão junto.
// ============================================================

const LIGADO = 'studio:diagnostico';
const CODIGO = 'studio:diagnostico:codigo';
const VIVA = 'studio:diagnostico:viva';
const ULTIMOS = 'studio:diagnostico:ultimos';

interface Evento {
  t: number;
  e: string;
  d?: Record<string, unknown>;
  p: string;
}

let ligado = false;
let codigo = '';
let fila: Evento[] = [];
let ultimos: Evento[] = [];
let inicio = 0;

const ler = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k: string, v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    // Sem armazenamento: o diagnóstico vale só nesta visita.
  }
};

export function diagnosticoLigado(): boolean {
  return ligado;
}
export function codigoDoDiagnostico(): string {
  return codigo;
}

/** Um evento no rastro (não faz nada com o diagnóstico desligado). */
export function rastro(evento: string, dados?: Record<string, unknown>): void {
  if (!ligado) return;
  const ev: Evento = { t: Math.round(performance.now() - inicio), e: evento, p: location.pathname, ...(dados ? { d: dados } : {}) };
  fila.push(ev);
  ultimos.push(ev);
  if (ultimos.length > 60) ultimos = ultimos.slice(-60);
  gravar(ULTIMOS, JSON.stringify(ultimos));
}

function enviar(final = false): void {
  if (!fila.length) return;
  const lote = fila.splice(0, 40);
  const corpo = JSON.stringify({ codigo, eventos: lote.map((e) => ({ ...e, em: new Date().toISOString() })) });
  try {
    void fetch('/api/health/rastro', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: corpo }).catch(() => undefined);
  } catch {
    // O próximo lote tenta de novo.
  }
  if (fila.length && !final) window.setTimeout(() => enviar(), 300);
}

/** O que está debaixo do dedo, em poucas palavras. */
function descrever(alvo: EventTarget | null): string {
  const el = alvo instanceof Element ? (alvo.closest('button, a, [role=button], input, select, textarea, .palco__peca, iframe') ?? alvo) : null;
  if (!el) return '?';
  const classe = String(el.getAttribute('class') ?? '').split(' ')[0];
  const nome = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return `${el.tagName.toLowerCase()}${classe ? '.' + classe : ''}${nome ? ` "${nome}"` : ''}`;
}

function pulso(): Record<string, unknown> {
  const ed = document.querySelector('.editor');
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    iframes: document.querySelectorAll('iframe').length,
    miniaturas: document.querySelectorAll('.modelos-da-cena iframe').length,
    videos: document.querySelectorAll('video').length,
    nos: document.getElementsByTagName('*').length,
    gaveta: ed?.getAttribute('data-folha') ?? null,
    editando: ed?.hasAttribute('data-editando') ?? null,
    pecas: document.querySelectorAll('.palco__peca').length,
    ...(mem ? { heapMb: Math.round(mem.usedJSHeapSize / 1048576) } : {}),
  };
}

/** Liga (ou não) o diagnóstico na abertura da página. Chamado uma vez. */
export function iniciarDiagnostico(): void {
  const pedido = new URLSearchParams(location.search).get('diagnostico');
  if (pedido === '1') gravar(LIGADO, '1');
  if (pedido === '0') {
    gravar(LIGADO, null);
    gravar(VIVA, null);
  }
  if (ler(LIGADO) !== '1') return;
  ligado = true;
  inicio = performance.now();
  codigo = ler(CODIGO) ?? '';
  if (!/^DX-[A-Z0-9]{4}$/.test(codigo)) {
    codigo = 'DX-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
    gravar(CODIGO, codigo);
  }

  // A página anterior caiu sem se despedir?
  const viva = ler(VIVA);
  let antes: Evento[] = [];
  try {
    antes = JSON.parse(ler(ULTIMOS) ?? '[]') as Evento[];
  } catch {
    antes = [];
  }
  gravar(VIVA, String(Date.now()));
  rastro('abriu', {
    url: location.pathname + location.search,
    ua: navigator.userAgent,
    tela: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    app: window.matchMedia('(display-mode: standalone)').matches,
    memoriaGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    quedaAnterior: viva ? { haMs: Date.now() - Number(viva), ultimosEventos: antes.slice(-30) } : null,
  });
  ultimos = [];

  addEventListener('pointerdown', (e) => rastro('toque', { alvo: descrever(e.target), x: Math.round(e.clientX), y: Math.round(e.clientY), tipo: e.pointerType }), true);
  addEventListener('click', (e) => rastro('clique', { alvo: descrever(e.target) }), true);
  addEventListener('error', (e) => {
    if (e instanceof ErrorEvent) rastro('erro', { msg: String(e.message).slice(0, 300), onde: `${e.filename}:${e.lineno}:${e.colno}` });
  }, true);
  addEventListener('unhandledrejection', (e) => rastro('promessa', { msg: String((e.reason as Error)?.message ?? e.reason).slice(0, 300) }));
  addEventListener('webglcontextlost', () => rastro('webgl-perdido'), true);
  document.addEventListener('visibilitychange', () => {
    rastro('visibilidade', { estado: document.visibilityState, ...pulso() });
    if (document.visibilityState === 'hidden') enviar(true);
  });
  addEventListener('pagehide', (e) => {
    rastro('saiu', { cache: e.persisted });
    gravar(VIVA, null);
    enviar(true);
  });
  addEventListener('pageshow', (e) => {
    if (e.persisted) {
      gravar(VIVA, String(Date.now()));
      rastro('voltou-do-cache');
    }
  });

  window.setInterval(() => rastro('pulso', pulso()), 5000);
  window.setInterval(() => enviar(), 3000);
}
