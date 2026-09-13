import {
  calcularTempoLeitura,
  embedPermitido,
  extrairIdVideo,
  gerarResumo,
  sanitizarHtml,
  tipTapParaHtml,
  tipTapParaTexto,
} from '../src/common/utils/content.util';

/**
 * Sanitizacao do conteudo do editor. Rodar com: pnpm test
 *
 * O HTML aqui chega de uma conta autenticada do CMS, mas vai para todo
 * visitante do portal: uma conta de AUTHOR comprometida nao pode conseguir
 * injetar script em nenhuma pagina.
 */
let ok = 0;
let fail = 0;

function teste(nome: string, condicao: boolean, detalhe?: string): void {
  if (condicao) {
    ok += 1;
    console.log(`ok    ${nome}`);
  } else {
    fail += 1;
    console.error(`FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`);
  }
}

const doc = (conteudo: unknown[]) => ({ type: 'doc', content: conteudo });

// ---------- sanitizarHtml ----------
teste('remove a tag script', sanitizarHtml('<p>ok</p><script>alert(1)</script>') === '<p>ok</p>');
teste(
  'remove handlers inline',
  !sanitizarHtml('<img src="x.png" onerror="alert(1)">').includes('onerror'),
);
teste(
  'remove href javascript:',
  !sanitizarHtml('<a href="javascript:alert(1)">x</a>').includes('javascript:'),
);
teste('remove atributo style', !sanitizarHtml('<p style="position:fixed">x</p>').includes('style'));
teste(
  'preserva formatação legítima',
  sanitizarHtml('<p><strong>forte</strong> e <em>ênfase</em></p>') ===
    '<p><strong>forte</strong> e <em>ênfase</em></p>',
);

// ---------- embedPermitido ----------
for (const url of [
  'https://www.youtube.com/embed/abc',
  'https://player.vimeo.com/video/1',
  'https://www.instagram.com/p/abc/embed',
]) {
  teste(`aceita embed ${url}`, embedPermitido(url));
}
for (const url of [
  'https://evil.example.com/iframe',
  'http://www.youtube.com/embed/abc', // sem TLS
  'javascript:alert(1)',
  'nao-e-url',
]) {
  teste(`rejeita embed ${url}`, !embedPermitido(url));
}

// ---------- tipTapParaHtml ----------
{
  const html = tipTapParaHtml(
    doc([{ type: 'paragraph', content: [{ type: 'text', text: '<script>x</script>' }] }]),
  );
  teste('escapa texto do autor', html.includes('&lt;script&gt;') && !html.includes('<script>'), html);
}

// O h1 pertence ao titulo do artigo; dois h1 na pagina prejudicam SEO.
teste(
  'rebaixa h1 para h2',
  tipTapParaHtml(
    doc([{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }]),
  ) === '<h2>T</h2>',
);
teste(
  'limita headings a h4',
  tipTapParaHtml(
    doc([{ type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: 'T' }] }]),
  ) === '<h4>T</h4>',
);

{
  const html = tipTapParaHtml(
    doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'clique',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ]),
  );
  teste('descarta link com protocolo perigoso', !html.includes('javascript:') && !html.includes('<a '), html);
}

{
  const html = tipTapParaHtml(
    doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'site',
            marks: [{ type: 'link', attrs: { href: 'https://exemplo.com' } }],
          },
        ],
      },
    ]),
  );
  // Sem noopener a pagina aberta pode manipular a nossa via window.opener.
  teste('adiciona noopener em link externo', html.includes('rel="noopener noreferrer"'), html);
}

teste(
  'descarta embed de domínio não autorizado',
  tipTapParaHtml(doc([{ type: 'embed', attrs: { src: 'https://evil.com/x' } }])) === '',
);
teste(
  'mantém embed do YouTube',
  tipTapParaHtml(
    doc([{ type: 'embed', attrs: { src: 'https://www.youtube.com/embed/abc' } }]),
  ).includes('youtube.com/embed/abc'),
);

// ---------- texto, leitura e resumo ----------
teste(
  'extrai apenas o texto',
  tipTapParaTexto(
    doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'Primeira' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Segunda' }] },
    ]),
  ) === 'Primeira Segunda',
);

teste('nunca devolve menos de 1 minuto', calcularTempoLeitura('duas palavras').minutos === 1);
{
  const r = calcularTempoLeitura('palavra '.repeat(600));
  teste('usa 200 palavras por minuto', r.palavras === 600 && r.minutos === 3, JSON.stringify(r));
}

{
  const resumo = gerarResumo(`${'a'.repeat(100)} final`, 50);
  teste('corta na última palavra inteira', resumo.endsWith('...') && resumo.length <= 53, resumo);
}
teste('devolve o texto quando cabe no limite', gerarResumo('curto', 50) === 'curto');

// ---------- extrairIdVideo ----------
const videos: Array<[string, string, string]> = [
  ['https://www.youtube.com/watch?v=abc123', 'YOUTUBE', 'abc123'],
  ['https://youtu.be/abc123', 'YOUTUBE', 'abc123'],
  ['https://www.youtube.com/shorts/abc123', 'YOUTUBE', 'abc123'],
  ['https://www.instagram.com/reel/XYZ/', 'INSTAGRAM', 'XYZ'],
  ['https://www.tiktok.com/@user/video/999', 'TIKTOK', '999'],
];
for (const [url, plataforma, esperado] of videos) {
  const obtido = extrairIdVideo(url, plataforma);
  teste(`extrai id de ${url}`, obtido === esperado, String(obtido));
}
teste('devolve null para URL inválida', extrairIdVideo('nao-e-url', 'YOUTUBE') === null);

console.log(`\n${ok} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
