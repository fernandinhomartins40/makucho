import DOMPurify from 'isomorphic-dompurify';

/**
 * Conversao e sanitizacao do conteudo do editor (secoes 11 e 39).
 *
 * O TipTap guarda o texto como JSON. Renderizamos no servidor e passamos
 * pelo DOMPurify: o autor do artigo e usuario autenticado, mas nada impede
 * que uma conta de AUTHOR seja comprometida, e o HTML resultante vai para
 * todo visitante do portal.
 */

/** Nó do documento do TipTap. */
export interface NoTipTap {
  type?: string;
  text?: string;
  content?: NoTipTap[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

const TAGS_PERMITIDAS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'hr',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div', 'iframe',
];

const ATRIBUTOS_PERMITIDOS = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height', 'loading',
  'class', 'colspan', 'rowspan',
  'allow', 'allowfullscreen', 'frameborder',
  'data-platform', 'data-embed-id',
];

/** Só estes domínios podem ser embutidos em iframe. */
const DOMINIOS_EMBED = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.instagram.com',
  'instagram.com',
  'www.tiktok.com',
];

export function sanitizarHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TAGS_PERMITIDAS,
    ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
    // Bloqueia javascript:, data: e vbscript: em href e src.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'form', 'input', 'button', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
  });
}

/** Aceita o iframe apenas se a origem estiver na lista de plataformas. */
export function embedPermitido(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && DOMINIOS_EMBED.includes(url.hostname);
  } catch {
    return false;
  }
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Aplica negrito, itálico, link etc. sobre um trecho de texto. */
function aplicarMarcas(texto: string, marks?: NoTipTap['marks']): string {
  if (!marks || marks.length === 0) return texto;

  let resultado = texto;
  for (const marca of marks) {
    switch (marca.type) {
      case 'bold':
        resultado = `<strong>${resultado}</strong>`;
        break;
      case 'italic':
        resultado = `<em>${resultado}</em>`;
        break;
      case 'underline':
        resultado = `<u>${resultado}</u>`;
        break;
      case 'strike':
        resultado = `<s>${resultado}</s>`;
        break;
      case 'code':
        resultado = `<code>${resultado}</code>`;
        break;
      case 'link': {
        const href = String(marca.attrs?.href ?? '');
        if (!/^https?:\/\//i.test(href) && !href.startsWith('/')) break;
        const externo = /^https?:\/\//i.test(href);
        // noopener em link externo: sem ele a pagina aberta pode manipular
        // a nossa via window.opener.
        const extras = externo ? ' target="_blank" rel="noopener noreferrer"' : '';
        resultado = `<a href="${escapar(href)}"${extras}>${resultado}</a>`;
        break;
      }
    }
  }
  return resultado;
}

/** Converte o documento do TipTap em HTML. */
export function tipTapParaHtml(documento: unknown): string {
  if (!documento || typeof documento !== 'object') return '';

  const raiz = documento as NoTipTap;
  const html = (raiz.content ?? []).map((no) => renderizarNo(no)).join('');
  return sanitizarHtml(html);
}

function renderizarNo(no: NoTipTap): string {
  const filhos = (no.content ?? []).map((f) => renderizarNo(f)).join('');

  switch (no.type) {
    case 'text':
      return aplicarMarcas(escapar(no.text ?? ''), no.marks);

    case 'paragraph':
      return filhos ? `<p>${filhos}</p>` : '<p><br></p>';

    case 'heading': {
      // Limita a h2-h4: o h1 pertence ao titulo do artigo, e mais de um
      // h1 na pagina atrapalha SEO e leitores de tela.
      const nivel = Math.min(Math.max(Number(no.attrs?.level ?? 2), 2), 4);
      return `<h${nivel}>${filhos}</h${nivel}>`;
    }

    case 'bulletList':
      return `<ul>${filhos}</ul>`;
    case 'orderedList':
      return `<ol>${filhos}</ol>`;
    case 'listItem':
      return `<li>${filhos}</li>`;

    case 'blockquote':
      return `<blockquote>${filhos}</blockquote>`;

    case 'codeBlock':
      return `<pre><code>${escapar(no.content?.[0]?.text ?? '')}</code></pre>`;

    case 'horizontalRule':
      return '<hr>';

    case 'hardBreak':
      return '<br>';

    case 'image': {
      const src = String(no.attrs?.src ?? '');
      if (!src) return '';
      const alt = escapar(String(no.attrs?.alt ?? ''));
      const legenda = String(no.attrs?.caption ?? '');
      const img = `<img src="${escapar(src)}" alt="${alt}" loading="lazy">`;
      return legenda
        ? `<figure>${img}<figcaption>${escapar(legenda)}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    }

    case 'youtube':
    case 'embed': {
      const src = String(no.attrs?.src ?? '');
      if (!embedPermitido(src)) return '';
      return (
        `<figure class="embed"><iframe src="${escapar(src)}" ` +
        `loading="lazy" allowfullscreen ` +
        `allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"></iframe></figure>`
      );
    }

    default:
      return filhos;
  }
}

/** Texto puro do documento, usado na busca e na contagem de palavras. */
export function tipTapParaTexto(documento: unknown): string {
  if (!documento || typeof documento !== 'object') return '';

  const partes: string[] = [];
  const percorrer = (no: NoTipTap): void => {
    if (no.text) partes.push(no.text);
    for (const filho of no.content ?? []) percorrer(filho);
  };
  percorrer(documento as NoTipTap);

  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tempo de leitura. 200 palavras por minuto e a media adotada por
 * publicacoes em portugues; sempre ao menos 1 minuto.
 */
export function calcularTempoLeitura(texto: string): { minutos: number; palavras: number } {
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  return { minutos: Math.max(1, Math.ceil(palavras / 200)), palavras };
}

/** Resumo automático quando o autor não escreve um. */
export function gerarResumo(texto: string, limite = 200): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return `${corte.slice(0, ultimoEspaco > 0 ? ultimoEspaco : limite)}...`;
}

/** Extrai o identificador do vídeo para montar o embed. */
export function extrairIdVideo(
  url: string,
  plataforma: string,
): string | null {
  try {
    const u = new URL(url);
    switch (plataforma) {
      case 'YOUTUBE': {
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null;
        if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] ?? null;
        return u.searchParams.get('v');
      }
      case 'INSTAGRAM': {
        // /p/CODIGO/ ou /reel/CODIGO/
        const partes = u.pathname.split('/').filter(Boolean);
        const i = partes.findIndex((p) => p === 'p' || p === 'reel' || p === 'tv');
        return i >= 0 ? (partes[i + 1] ?? null) : null;
      }
      case 'TIKTOK': {
        const partes = u.pathname.split('/').filter(Boolean);
        const i = partes.indexOf('video');
        return i >= 0 ? (partes[i + 1] ?? null) : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
