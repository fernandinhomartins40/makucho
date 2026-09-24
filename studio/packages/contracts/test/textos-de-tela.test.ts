// ============================================================
// Títulos e textos de tela: estilo, fundo, animações e estilos prontos.
// ============================================================

import {
  PRESETS_DE_TEXTO,
  aplicarOperacao,
  caixaDoTexto,
  editPlanV1Schema,
  eventosDoTextoDeTela,
  gerarAss,
  larguraDoTexto,
  FONTES_DE_VIDEO,
  resolverEstiloDoTexto,
  resolverEstiloDaLegenda,
  CORES_PADRAO_DA_MARCA,
} from '../src';
import type { EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const base: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p',
  sourceMediaId: 'm',
  sourceDurationMs: 10_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 10_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 10_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x' }],
  captions: { enabled: false, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [{ id: 'o1', component: 'HookTitle', text: 'Pare de perder vendas', timelineStartMs: 0, durationMs: 3000 }],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as EditPlanV1;

const marca = { cores: { ...CORES_PADRAO_DA_MARCA, primary: '#FF0000' } };

// ---------- Medida ----------
const inter = FONTES_DE_VIDEO.inter;
t('texto maior mede mais', larguraDoTexto('WWW', inter, 80) > larguraDoTexto('iii', inter, 80));
t('medida escala com o tamanho', Math.abs(larguraDoTexto('Oi', inter, 160) - 2 * larguraDoTexto('Oi', inter, 80)) < 0.01);
t('fonte estreita mede menos que larga', larguraDoTexto('VENDAS', FONTES_DE_VIDEO.bebas, 80) < larguraDoTexto('VENDAS', FONTES_DE_VIDEO['archivo-black'], 80));

// ---------- Título sem estilo: continua o desenho antigo ----------
const antigo = gerarAss({ plano: base, estilo: resolverEstiloDaLegenda('padrao'), palavras: [], marca });
t('título sem estilo usa o estilo Titulo de sempre', antigo.includes(',Titulo,'));

// ---------- Título com estilo ----------
const estilizado = aplicarOperacao(base, {
  op: 'editar_overlay',
  overlayId: 'o1',
  style: { bgShape: 'pilula', bgColor: '#00FF00', entrada: 'deslizar_esquerda', saida: 'sumir', durante: 'pulsar', x: 0.5, y: 0.2, sizeScale: 1.5 },
});
t('o plano aceita o estilo completo', estilizado.ok && editPlanV1Schema.safeParse(estilizado.plan).success);
const ass = gerarAss({ plano: estilizado.plan!, estilo: resolverEstiloDaLegenda('padrao'), palavras: [], marca });
const linhas = ass.split('\n').filter((l) => l.includes('TextoDeTela') && l.startsWith('Dialogue'));
t('título com estilo passa ao desenho novo', !ass.includes(',Titulo,') && linhas.length === 4);
t('fundo em pílula: forma vetorial na cor escolhida', linhas.some((l) => l.includes(String.raw`\p1`) && l.includes(String.raw`\c&H00FF00&`) && / b /.test(l)));
t('entrada deslizando da esquerda (\\move)', linhas.some((l) => l.includes(String.raw`\move(280,384,540,384`)));
t('pulsar durante a exibição', linhas.some((l) => l.includes(String.raw`\fscx106`)));
t('saída em evento próprio, no fim', linhas.some((l) => l.includes('0:00:02.70,0:00:03.00') && l.includes(String.raw`\fad(0,300)`)));
t('fundo embaixo (camada 5), texto em cima (camada 6)', linhas.filter((l) => l.startsWith('Dialogue: 5')).length === 2 && linhas.filter((l) => l.startsWith('Dialogue: 6')).length === 2);
t('tamanho escalado (86 × 1,5)', linhas.some((l) => l.includes(String.raw`\fs129`)));

// ---------- Caixa (alças da prévia) ----------
const o = estilizado.plan!.overlays[0]!;
const caixa = caixaDoTexto(estilizado.plan!, o, marca);
t('caixa centrada na posição', caixa.cx === 540 && caixa.cy === 384);
t('caixa cobre o texto com a margem', caixa.largura > larguraDoTexto('Pare de perder vendas', FONTES_DE_VIDEO.montserrat, 129) * 0.5 && caixa.altura > 129);
const faixa = caixaDoTexto(base, { ...o, style: { bgShape: 'faixa' } }, marca);
t('faixa ocupa a largura toda', faixa.largura === 1080);

// ---------- Quebra de linha ----------
const longo = { ...o, text: 'Este título é longo demais para caber numa linha só do vídeo vertical', style: { sizeScale: 1.4 } };
const evLongo = eventosDoTextoDeTela(base, longo, 0, 3000, marca);
t('título longo quebra em linhas (\\N)', evLongo.some((l) => l.includes(String.raw`\N`)));
t('e nunca passa da largura do quadro', caixaDoTexto(base, longo, marca).largura <= 1080);

// ---------- Digitar ----------
const dig = eventosDoTextoDeTela(base, { ...o, text: 'Oi', style: { entrada: 'digitar' } }, 0, 3000, marca);
t('digitar: cada letra acende no seu tempo', dig.some((l) => (l.match(/\\alpha&HFF&/g) ?? []).length === 2));

// ---------- Legado ----------
const legado = resolverEstiloDoTexto('Destaque', { decoration: 'marca_texto', animation: 'deslizar' });
t('decoração antiga vira fundo', legado.fundo?.forma === 'retangulo' && legado.cor === '#111111');
t('animação antiga vira entrada', legado.entrada === 'deslizar_esquerda');
const titulo = resolverEstiloDoTexto('HookTitle', {}, marca);
t('título sem fundo escolhido tem a caixa da marca', titulo.fundo?.cor === '#FF0000');

// ---------- Estilos prontos ----------
t('há estilos prontos variados', PRESETS_DE_TEXTO.length >= 10 && new Set(PRESETS_DE_TEXTO.map((p) => p.id)).size === PRESETS_DE_TEXTO.length);
const comLegado = aplicarOperacao(base, { op: 'editar_overlay', overlayId: 'o1', style: { decoration: 'marca_texto', x: 0.3, y: 0.7 } });
const trocado = aplicarOperacao(comLegado.plan!, { op: 'editar_overlay', overlayId: 'o1', style: PRESETS_DE_TEXTO[0]!.estilo, replaceStyle: true });
const st = trocado.plan!.overlays[0]!.style!;
t('aplicar estilo pronto troca tudo (nada do anterior vaza)', st.decoration === undefined && st.preset === PRESETS_DE_TEXTO[0]!.id);
t('aplicar estilo pronto guarda a posição', st.x === 0.3 && st.y === 0.7);
for (const p of PRESETS_DE_TEXTO) {
  const r = aplicarOperacao(base, { op: 'editar_overlay', overlayId: 'o1', style: p.estilo, replaceStyle: true });
  const valido = r.ok && editPlanV1Schema.safeParse(r.plan).success;
  const evs = valido ? eventosDoTextoDeTela(r.plan!, r.plan!.overlays[0]!, 0, 3000, marca) : [];
  t(`estilo pronto "${p.rotulo}" é válido e desenha`, valido && evs.length > 0);
}
t('estilo pronto não mexe na posição', PRESETS_DE_TEXTO.every((p) => p.estilo.x === undefined && p.estilo.y === undefined));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
