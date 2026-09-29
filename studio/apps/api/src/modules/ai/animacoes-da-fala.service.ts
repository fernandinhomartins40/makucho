// ============================================================
// As animações (HyperFrames) que a IA cria a partir da fala -- na
// montagem, no "Peça à IA" e no editor (refazer, trocar o estilo).
//
// Não passa pelas voltas do agente: escrever uma animação inteira
// (html + css + script) é uma resposta longa. Aqui são chamadas
// próprias, com mais tempo e em paralelo:
//
//   1. planejar -- o storyboard da skill talking-head-recut do HyperFrames:
//      UM estilo para o vídeo (pelo tom da fala, entre os do catálogo
//      ESTILOS_DE_ANIMACAO) e os cartões pela densidade da fala, com tipo,
//      layout e conteúdo variados;
//   2. escrever -- uma chamada por cartão, com a referência do estilo e a
//      doutrina de movimento do HyperFrames;
//   3. conferir -- a checagem do Studio e o lint do HyperFrames; o que
//      falhar volta UMA vez para a IA corrigir.
//
// Cada animação guarda o estilo e o briefing (tipo, ideia, conteúdo):
// é o que permite refazê-la em outro estilo ou lugar sem perder o que
// ela explica. O resultado (ou o motivo de não ter animação) fica no
// projeto (`animationNote`), para o editor mostrar.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  ESTILOS_DE_ANIMACAO,
  REGRAS_DA_ANIMACAO_HTML,
  agendaDoPlano,
  aplicarComando,
  composicaoHtmlSchema,
  coresDaPaleta,
  PALETAS_DE_ANIMACAO,
  REGRAS_DE_DESIGN,
  temaDaAnimacao,
  textoDoTema,
  estiloDeAnimacao,
  problemasDaComposicao,
  type CamadaDeMidia,
  type CantoDoPip,
  CANTOS_DO_PIP,
  textoDaGrade,
  type ComposicaoHtml,
  type EditPlanV1,
  type EstiloDeAnimacao,
  type TimelineOperation,
} from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { AnimacoesService } from '../animacoes/animacoes.service';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AiService } from './ai.service';
import { referenciaDoEstilo } from './hyperframes/estilos';

// v3: catálogo com as identidades visuais do HyperFrames, estilo e
// briefing guardados em cada animação, refazer/trocar estilo.
const VERSAO = 'animar-fala-v3';
/** Uma animação é uma resposta longa: mais tempo que as outras chamadas. */
const TEMPO_PARA_ESCREVER_MS = 240_000;
/** Teto de cartões por montagem (cada um é uma chamada à IA, em paralelo). */
const MAX_ANIMACOES = 8;
/** A nota enquanto a IA trabalha (termina em "…": a tela acompanha até mudar). */
export const NOTA_REFAZENDO = 'Refazendo as animações…';

export type LayoutDaAnimacao = 'meio_a_meio' | 'cartao' | 'tela_cheia' | 'pip';
const LAYOUTS: readonly LayoutDaAnimacao[] = ['meio_a_meio', 'cartao', 'tela_cheia', 'pip'];

interface Momento {
  inicioS: number;
  fimS: number;
  layout: LayoutDaAnimacao;
  /** No meio a meio: onde fica o painel (cima = rosto embaixo; baixo = rosto em cima). */
  lado?: 'cima' | 'baixo';
  divisao?: number;
  foco?: number;
  /** No pip: o canto da janela do vídeo. */
  canto?: CantoDoPip;
  /** O tipo de cartão (número, lista, citação...), para variar. */
  tipo: string;
  ideia: string;
  /** kicker, título, detalhe, dado, citação, itens -- o que o cartão diz. */
  conteudo: string;
  /** Qual das cores de destaque do estilo (0 a 4). */
  acento: number;
  palavras: Array<{ s: number; texto: string }>;
}

/** O que mudar ao refazer uma animação que já está no vídeo. */
export interface OpcoesDeRefazer {
  estilo?: string;
  /** "clima:indice" de PALETAS_DE_ANIMACAO; "" tira a paleta (volta às cores do estilo). */
  paleta?: string;
  layout?: LayoutDaAnimacao;
  lado?: 'cima' | 'baixo';
  canto?: CantoDoPip;
  /** O pedido da pessoa ("troca o azul pelo verde", "deixa o número maior"). */
  pedido?: string;
}

/** Um trecho para animar (o "Peça à IA" pede assim, sem escrever o HTML). */
export interface PedidoDeTrecho {
  inicioS: number;
  fimS: number;
  layout: LayoutDaAnimacao;
  lado?: 'cima' | 'baixo';
  canto?: CantoDoPip;
  tipo?: string;
  ideia: string;
  conteudo?: string;
  estilo?: string;
  paleta?: string;
}

const TECNOLOGIA = estiloDeAnimacao('tecnologia')!;

/** Exemplo completo (já no formato html/css/script) do estilo tecnologia. */
const EXEMPLO_TECNOLOGIA = JSON.stringify({
  titulo: 'Gemini 3.8 Flash TTS',
  html: `<div class="painel"><div class="selo" id="selo"><i style="background:#4285F4"></i><i style="background:#EA4335"></i><i style="background:#FBBC04"></i><i style="background:#34A853"></i><span>Novo do Google</span></div><div class="titulo"><span class="p" id="p1">Gemini</span> <span class="p grad" id="p2">3.8</span></div><div class="player" id="player"><div class="barras" id="barras"></div></div><div class="escala" id="escala"><span>Robótica</span><div class="trilho"><div class="enche" id="enche"></div></div><span id="natural">Natural</span></div></div>`,
  css: `.painel { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 45% at 50% 0%, rgba(66,133,244,.22), transparent 70%), #0B0E13; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
.selo { display: flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 40px; background: rgba(255,255,255,.06); border: 2px solid rgba(255,255,255,.10); font-size: 30px; color: #F1F3F4; }
.selo i { width: 13px; height: 13px; border-radius: 50%; display: block; } .selo span { margin-left: 12px; }
.titulo { font-family: 'Inter ExtraBold'; font-size: 112px; line-height: 1.05; display: flex; gap: 26px; color: #F1F3F4; } .p { display: inline-block; } .grad { color: #4285F4; }
.player { width: 900px; height: 130px; border-radius: 36px; background: #1E2126; border: 2px solid rgba(255,255,255,.10); display: flex; align-items: center; padding: 0 32px; }
.barras { flex: 1; height: 80px; display: flex; align-items: center; gap: 7px; } .barras b { display: block; width: 8px; border-radius: 4px; background: #7BAAF7; }
.escala { width: 900px; display: flex; align-items: center; gap: 22px; font-size: 32px; color: #9AA0A6; }
.trilho { flex: 1; height: 12px; border-radius: 6px; background: rgba(255,255,255,.1); overflow: hidden; }
.enche { height: 100%; width: 100%; background: linear-gradient(90deg, #EA4335, #FBBC04, #34A853); transform-origin: 0 50%; }`,
  script: `var barras = document.getElementById('barras');
[30,55,22,70,40,62,28,75,35,58,24,68,45,30,72,38,60,26,66,42].forEach(function (h) { var b = document.createElement('b'); b.style.height = h + 'px'; barras.appendChild(b); });
tl.fromTo('.painel', { scale: 1 }, { scale: 1.05, duration: 6, ease: 'none' }, 0)
  .fromTo('#selo', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0)
  .fromTo('#p1', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0.5)
  .fromTo('#p2', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 1.0)
  .fromTo('#player', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 1.6)
  .fromTo('#barras b', { scaleY: 0.2, opacity: 0.35 }, { scaleY: 1, opacity: 1, duration: 0.25, stagger: 0.02 }, 1.8)
  .fromTo('#escala', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.8)
  .fromTo('#enche', { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power2.inOut' }, 2.9)
  .to('#natural', { color: '#34A853', scale: 1.15, duration: 0.25, ease: 'back.out(1.5)' }, 4.6)
  .to('.painel', { opacity: 0, y: -30, duration: 0.3, ease: 'power2.in' }, 5.7);`,
});

const TIPOS_DE_CARTAO = [
  'numero (estatística que conta até o valor)',
  'lista (itens que entram um a um, com check)',
  'comparacao (A x B, antes x depois, errado x certo)',
  'citacao (a frase mais forte, em destaque tipográfico)',
  'passos (passo a passo / linha do tempo que se desenha)',
  'grafico (barras ou linha que crescem com a fala)',
  'termo (definição de um nome ou conceito)',
  'pergunta (a pergunta que a fala responde)',
  'destaque (uma palavra-chave enorme, tipografia cinética)',
] as const;

/** A lista de estilos, para a IA escolher (montagem e "Peça à IA"). */
export function listaDeEstilos(): string {
  const grupo = (f: EstiloDeAnimacao['familia'], titulo: string) =>
    `${titulo}:\n` + ESTILOS_DE_ANIMACAO.filter((e) => e.familia === f).map((e) => `- ${e.chave} (${e.nome}): ${e.carater}. Para: ${e.quando}.`).join('\n');
  return [
    grupo('cartao', 'Cartões (skill talking-head-recut)'),
    grupo('identidade', 'Identidades visuais (com o caráter do movimento)'),
    grupo('preset', 'Presets de quadro (sistemas de design completos)'),
    grupo('referencia', 'Referência do Studio'),
  ].join('\n');
}

/** As paletas (climas de cor), para recolorir um estilo. */
export function listaDePaletas(): string {
  return PALETAS_DE_ANIMACAO.map((p) => `- ${p.chave} (${p.nome}): ${p.clima}. Conjuntos 0-${p.conjuntos.length - 1}, ex.: ${p.conjuntos[0]!.join(' ')}`).join('\n');
}

/** Quantos cartões, pela duração e a densidade (a regra da skill talking-head-recut). */
function faixaDeCartoes(duracaoS: number): { min: number; max: number; passo: number } {
  const passo = duracaoS < 60 ? 7 : duracaoS < 180 ? 10 : duracaoS < 600 ? 16 : 28;
  const min = Math.max(2, Math.min(MAX_ANIMACOES, Math.round(duracaoS / (passo * 1.5))));
  const max = Math.max(min, Math.min(MAX_ANIMACOES, Math.round(duracaoS / (passo * 0.7))));
  return { min, max, passo };
}

function sistemaDoPlano(duracaoS: number): string {
  const f = faixaDeCartoes(duracaoS);
  return `Você é diretor de motion design (método HyperFrames / talking-head-recut): empacota um vídeo vertical 9:16 de alguém falando com CARTÕES GRÁFICOS animados, sincronizados com a fala, que EXPLICAM o que é dito. O vídeo em si não muda; os cartões entram por cima ou dividem a tela com ele.
1. Leia a fala inteira e decida o TOM ("o que quem assiste deve SENTIR?"). Escolha UM estilo visual para o vídeo todo, pelo tom (não pelo assunto):
${listaDeEstilos()}
2. Escolha de ${f.min} a ${f.max} cartões (cerca de 1 a cada ${f.passo} s; mais se a fala é densa -- números, listas, afirmações em sequência; menos se é uma história só). Cada cartão cobre um trecho de 3 a 10 s que ganha com explicação visual, sem sobrepor outro e com respiro de 1 s ou mais entre eles.
3. VARIE o tipo de cartão (não repita o mesmo tipo em seguida): ${TIPOS_DE_CARTAO.join('; ')}.
4. Layout de cada cartão: meio_a_meio (o cartão ocupa metade da tela e o rosto a outra; lado "cima" = cartão em cima, rosto embaixo; "baixo" = rosto em cima, cartão embaixo -- o melhor para explicar dados e listas), cartao (cartão menor por cima do vídeo, fora do rosto -- para um termo, um número rápido, uma citação curta) tela_cheia (só para o ponto alto: no máximo um) ou pip (o cartão ocupa a tela e o rosto vai para uma janela num canto -- "canto": sup-esq|sup-dir|inf-esq|inf-dir; para conteúdo denso: gráfico, lista longa, passo a passo, comparação). Alterne layouts para dar ritmo.
5. Conteúdo: textos curtos e fiéis à fala, em português (kicker de 1-3 palavras, título de até 6 palavras, detalhe de até 12, os números exatos ditos, os itens da lista).
Responda SÓ com JSON: {"estilo":"chave","tom":"uma frase","cartoes":[{"inicioS":12.3,"fimS":19.8,"layout":"meio_a_meio","lado":"cima","canto":null,"tipo":"numero","intencao":"o que o cartão explica","conteudo":{"kicker":"...","titulo":"...","detalhe":"...","dado":"...","itens":["..."]},"acento":0}]}. Instantes em segundos do vídeo final, iguais aos da fala.`;
}

/** A doutrina de movimento do HyperFrames (motion-doctrine + "Motion that reads premium"), resumida. */
const DOUTRINA_DE_MOVIMENTO = `MOVIMENTO (doutrina do HyperFrames -- é o que separa um cartão premium de um slide):
1. Todo movimento diz algo: chama o olho para o que a fala diz AGORA, mostra uma mudança (número que conta, barra que enche, linha que se desenha, item que é riscado) ou liga um momento ao outro. Movimento decorativo sai.
2. Revelação em etapas, no ritmo das palavras: o cartão vai GANHANDO informação a cada palavra-chave. Pause em qualquer segundo: algo significativo está acontecendo. Nunca monte tudo no primeiro segundo e congele.
3. Ação sobreposta: dois elementos nunca começam no mesmo instante; o próximo começa enquanto o anterior assenta; stagger total até 0.5 s.
4. Entrada até 0.8 s com ease de saída (power3.out, expo.out ou back.out(1.4-1.7) para objetos com "peso"); nunca bounce/elastic. Saída com ease de entrada (power2.in), ~75% da duração da entrada. Impacto (carimbo que bate) com ease .in.
5. Uma história por movimento: subir + aparecer, sim; subir + girar + escalar + desfocar ao mesmo tempo, não.
6. Overshoot só em transformações. Número conta até o valor dito e para nele -- nunca passa e volta.
7. Pausa dramática de 0.3-0.75 s antes do ponto alto (o número final, o carimbo, a palavra de destaque).
8. Nada de balanço infinito (pulsar/flutuar à toa). A "câmera" pode agir: um push-in lento de 3-6% no cartão inteiro ao longo da duração (ease none), para o quadro nunca congelar.
9. Nos últimos 0.3-0.4 s o cartão sai (opacity + y ou clipPath) e a animação termina limpa.`;

/** A referência do estilo, no formato que ele tem (cartão, identidade ou exemplo pronto). */
function referenciaParaEscrita(estilo: EstiloDeAnimacao): string {
  if (estilo.familia === 'referencia') {
    return `Exemplo completo neste estilo (já no formato da resposta; painel meio_a_meio 1080x960):\n${EXEMPLO_TECNOLOGIA}`;
  }
  const r = referenciaDoEstilo(estilo.chave);
  if (!r) return '';
  if (estilo.familia === 'preset') {
    return `SISTEMA DE DESIGN do estilo (frame-preset do HyperFrames: frontmatter = valores exatos; texto = intenção e regras). Siga os tokens (hex exatos), os componentes e as regras de composição -- os "átomos" são sagrados, a composição é livre. Troque as fontes pelas NOSSAS acima (mesmo papel: display, corpo, rótulo). Ele é pensado em 1920x1080: use o que ele diz para 9:16 e aumente a tipografia para o celular.\n${r.referencia}`;
  }
  if (estilo.familia === 'identidade') {
    return `IDENTIDADE do estilo (skill hyperframes-creative do HyperFrames): siga as cores (hex exatos), a tipografia (com as NOSSAS fontes acima no lugar das citadas), o espaçamento, a atmosfera e o caráter do movimento (energia, eases e durações). Onde ela pedir bounce/elastic ou texto que embaralha ao acaso, a doutrina acima prevalece.\n${r.referencia}`;
  }
  return `Cartão de REFERÊNCIA deste estilo (skill talking-head-recut; feito para 1920x1080 -- aumente ~1.3x para o vertical). Copie o visual: fundo, cores, ornamentos, hierarquia e composição. As animações dele estão declaradas em data-anim-* (at = segundo, duration, stagger): traduza para tl no seu script. O texto de exemplo é chinês: troque pelo conteúdo real em português. Troque as fontes pelas nossas, listadas acima.\nCores e tipografia:\n${r.tokens}\n${r.referencia}`;
}

function sistemaDaEscrita(estilo: EstiloDeAnimacao, paleta?: string): string {
  const p = coresDaPaleta(paleta);
  const cores = p
    ? `PALETA ESCOLHIDA (${p.paleta.nome}): ${p.cores.join(' ')} -- use ESTAS cores no lugar das do estilo (fundo, texto, destaques), mantendo o contraste de leitura; o resto do estilo (tipografia, formas, movimento) continua.\n`
    : '';
  return `${cores}Você é motion designer do HyperFrames. Desenha UM cartão animado (HTML/CSS/GSAP) que explica um trecho de um vídeo vertical de alguém falando. É um cartão de uma série: todos seguem o mesmo estilo, mas cada um tem estrutura própria para o que explica -- não é um modelo com o texto trocado.
ESTILO DO VÍDEO: ${estilo.nome} -- ${estilo.carater}.
Fontes deste estilo (as nossas): ${estilo.fontes.join(', ')}. Cores-base: ${estilo.cores.join(' ')}.
Pinte o fundo do estilo em #area inteira no meio_a_meio e na tela_cheia (o painel é do cartão); no cartao, só o cartão tem fundo (o resto transparente, o vídeo aparece).
${textoDoTema({ estilo: estilo.chave, ...(paleta ? { paleta } : {}) })}
${REGRAS_DE_DESIGN}
${DOUTRINA_DE_MOVIMENTO}
${REGRAS_DA_ANIMACAO_HTML}
Responda SÓ com JSON: {"titulo":"nome curto","html":"...","css":"...","script":"..."}.
${referenciaParaEscrita(estilo)}`;
}

/** O primeiro objeto JSON de uma resposta (a IA às vezes cerca com ```). */
function lerJson(texto: string): unknown {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i < 0 || f <= i) throw new Error('a resposta não trouxe JSON');
  return JSON.parse(limpo.slice(i, f + 1));
}

function briefingDe(m: Pick<Momento, 'tipo' | 'ideia' | 'conteudo'>): string {
  return JSON.stringify({ tipo: m.tipo, ideia: m.ideia, conteudo: m.conteudo }).slice(0, 2000);
}

function lerBriefing(c: ComposicaoHtml): { tipo: string; ideia: string; conteudo: string } {
  try {
    const b = JSON.parse(c.briefing ?? '') as Record<string, unknown>;
    return { tipo: String(b.tipo ?? ''), ideia: String(b.ideia ?? c.titulo ?? ''), conteudo: String(b.conteudo ?? '') };
  } catch {
    return { tipo: '', ideia: c.titulo ?? '', conteudo: '' };
  }
}

/** A paleta mais usada nas animações do vídeo (se alguma usa). */
export function paletaDoPlano(plano: EditPlanV1): string | undefined {
  const conta = new Map<string, number>();
  for (const m of plano.mediaLayers ?? []) {
    const p = m.kind === 'html' ? m.composicao?.paleta : undefined;
    if (p) conta.set(p, (conta.get(p) ?? 0) + 1);
  }
  return [...conta.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
}

/** O estilo mais usado nas animações do vídeo (o "estilo do vídeo"). */
export function estiloDoPlano(plano: EditPlanV1): EstiloDeAnimacao | undefined {
  const conta = new Map<string, number>();
  for (const m of plano.mediaLayers ?? []) {
    const e = m.kind === 'html' ? m.composicao?.estilo : undefined;
    if (e) conta.set(e, (conta.get(e) ?? 0) + 1);
  }
  const [chave] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return estiloDeAnimacao(chave);
}

@Injectable()
export class AnimacoesDaFalaService {
  private readonly log = new Logger(AnimacoesDaFalaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly planos: EditPlansService,
    private readonly animacoes: AnimacoesService,
  ) {}

  /** As palavras no tempo do vídeo final (o plano corta, reordena e acelera). */
  private async palavrasNoVideo(projectId: string, plano: EditPlanV1): Promise<Array<{ s: number; texto: string }>> {
    const ps = await this.prisma.transcriptWord.findMany({
      where: { segment: { transcription: { projectId } } },
      select: { startMs: true, word: true },
      orderBy: { startMs: 'asc' },
    });
    const saida: Array<{ s: number; texto: string }> = [];
    for (const t of agendaDoPlano(plano).trechos) {
      for (const p of ps) {
        if (p.startMs < t.clip.sourceStartMs || p.startMs >= t.clip.sourceEndMs) continue;
        saida.push({ s: (t.inicioMs + (p.startMs - t.clip.sourceStartMs) / t.velocidade) / 1000, texto: p.word });
      }
    }
    return saida.sort((a, b) => a.s - b.s);
  }

  /** O storyboard: o estilo do vídeo e os cartões (instante, layout, tipo, conteúdo). */
  private async planejar(
    workspaceId: string,
    projectId: string,
    palavras: Array<{ s: number; texto: string }>,
    duracaoS: number,
    /** O estilo que a pessoa escolheu para o projeto (a IA não escolhe outro). */
    fixo?: EstiloDeAnimacao,
  ): Promise<{ estilo: EstiloDeAnimacao; momentos: Momento[] }> {
    const fala = palavras.slice(0, 1500).map((p) => `${p.s.toFixed(2)} ${p.texto}`).join('\n');
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'animar_fala',
      sistema: sistemaDoPlano(duracaoS) + (fixo ? `\nESTILO JÁ ESCOLHIDO PELA PESSOA: ${fixo.chave} (${fixo.nome}). Use este em "estilo"; escolha o resto (cartões, tipos, layouts) como sempre.` : ''),
      usuario: `Duração do vídeo: ${duracaoS.toFixed(1)} s.\nFala (instante em s, palavra):\n${fala}`,
      maxTokens: 3000,
      promptVersion: VERSAO,
      semCache: true,
      tempoMaximoMs: 150_000,
    });
    const bruto = lerJson(r.texto) as { estilo?: unknown; cartoes?: unknown[]; momentos?: unknown[] };
    const estilo = fixo ?? estiloDeAnimacao(typeof bruto.estilo === 'string' ? bruto.estilo : undefined) ?? TECNOLOGIA;
    const momentos: Momento[] = [];
    for (const m of bruto.cartoes ?? bruto.momentos ?? []) {
      const x = m as Record<string, unknown>;
      const inicio = Number(x.inicioS);
      const fim = Number(x.fimS);
      if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim - inicio < 2) continue;
      const layout: LayoutDaAnimacao = LAYOUTS.includes(x.layout as LayoutDaAnimacao) ? (x.layout as LayoutDaAnimacao) : 'meio_a_meio';
      const inicioOk = Math.max(0, Math.min(inicio, duracaoS - 2));
      const fimOk = Math.min(duracaoS, Math.max(inicioOk + 3, Math.min(fim, inicioOk + 12)));
      if (momentos.some((o) => inicioOk < o.fimS && fimOk > o.inicioS)) continue;
      const conteudo = typeof x.conteudo === 'string' ? x.conteudo : x.conteudo ? JSON.stringify(x.conteudo) : '';
      momentos.push({
        inicioS: inicioOk,
        fimS: fimOk,
        layout: layout === 'tela_cheia' && momentos.some((o) => o.layout === 'tela_cheia') ? 'meio_a_meio' : layout,
        ...(layout === 'meio_a_meio' ? { lado: x.lado === 'baixo' ? ('baixo' as const) : ('cima' as const) } : {}),
        ...(layout === 'pip' ? { canto: CANTOS_DO_PIP.includes(x.canto as CantoDoPip) ? (x.canto as CantoDoPip) : ('inf-dir' as const) } : {}),
        tipo: String(x.tipo ?? '').slice(0, 40),
        ideia: String(x.intencao ?? x.ideia ?? '').slice(0, 300),
        conteudo: conteudo.slice(0, 800),
        acento: Math.max(0, Math.min(4, Math.round(Number(x.acento) || 0))),
        palavras: palavras.filter((p) => p.s >= inicioOk && p.s < fimOk),
      });
      if (momentos.length >= MAX_ANIMACOES) break;
    }
    return { estilo, momentos };
  }

  /**
   * Escreve e confere o cartão de um momento (uma correção, se precisar).
   * `base`: a animação atual, quando é uma edição em cima dela.
   */
  private async escrever(
    workspaceId: string,
    projectId: string,
    m: Momento,
    estilo: EstiloDeAnimacao,
    serie: Momento[],
    extra: { base?: ComposicaoHtml; pedido?: string; soOsTextos?: boolean; paleta?: string } = {},
  ): Promise<{ composicao: ComposicaoHtml; duracaoMs: number }> {
    const duracaoMs = Math.round((m.fimS - m.inicioS) * 1000);
    const area =
      m.layout === 'meio_a_meio'
        ? m.lado === 'baixo'
          ? 'o painel de BAIXO (o rosto fica na metade de cima)'
          : 'o painel de CIMA (o rosto fica na metade de baixo)'
        : m.layout === 'cartao'
          ? 'o quadro todo, mas só o cartão tem fundo (o vídeo aparece em volta)'
          : m.layout === 'pip'
            ? 'o quadro todo, com fundo pintado; o vídeo com o rosto aparece numa janela arredondada (o Studio recorta e emoldura)'
            : 'o quadro todo (o ponto alto do vídeo)';
    // A grade de segurança do layout, com números: onde o conteúdo vai e
    // o que ele não pode cobrir (app, logo, legenda, vídeo).
    const grade = textoDaGrade({ layout: m.layout, ...(m.lado ? { lado: m.lado } : {}), ...(m.divisao !== undefined ? { divisao: m.divisao } : {}), ...(m.canto ? { canto: m.canto } : {}) });
    const fala = m.palavras.map((p) => `${(p.s - m.inicioS).toFixed(2)} ${p.texto}`).join('\n');
    const outros = serie
      .filter((o) => o !== m)
      .map((o) => `${o.inicioS.toFixed(0)}s ${o.tipo || '?'} (${o.layout})`)
      .join('; ');
    const atual = extra.base ? JSON.stringify({ titulo: extra.base.titulo, html: extra.base.html, css: extra.base.css, script: extra.base.script }).slice(0, 14_000) : '';
    const pedido = `Cartão ${Math.max(1, serie.indexOf(m) + 1)} de ${Math.max(1, serie.length)}. Tipo: ${m.tipo || 'o que melhor explicar'}. Layout: ${m.layout} -- #area é ${area}.
${grade}
Duração: ${(duracaoMs / 1000).toFixed(1)} s. Cor de destaque: a ${m.acento + 1}ª do estilo.
O que explica: ${m.ideia}
Conteúdo: ${m.conteudo || '(tire da fala)'}
Os outros cartões da série (não repita a estrutura deles): ${outros || 'nenhum'}.
Fala do trecho (segundo DENTRO da animação, palavra) -- cada elemento entra no segundo da palavra que ele representa:
${fala}${
      extra.pedido
        ? `\n\nPEDIDO DA PESSOA (faça exatamente isto; mantenha o resto como está):\n${extra.pedido}\nAnimação atual (edite em cima dela):\n${atual}`
        : atual && extra.soOsTextos
          ? `\n\nA animação anterior deste trecho (reaproveite SÓ os textos e a ideia; o desenho é novo, no estilo e no lugar acima):\n${atual}`
          : ''
    }`;
    const tentar = async (usuario: string) => {
      const r = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'animar_fala',
        sistema: sistemaDaEscrita(estilo, extra.paleta),
        usuario,
        maxTokens: 8000,
        promptVersion: VERSAO,
        semCache: true,
        tempoMaximoMs: TEMPO_PARA_ESCREVER_MS,
      });
      const j = lerJson(r.texto) as Record<string, unknown>;
      const c = composicaoHtmlSchema.safeParse({
        html: j.html,
        css: j.css ?? '',
        script: j.script ?? '',
        layout: m.layout,
        ...(m.lado ? { lado: m.lado } : {}),
        ...(m.divisao !== undefined ? { divisao: m.divisao } : {}),
        ...(m.foco !== undefined ? { foco: m.foco } : {}),
        ...(m.layout === 'pip' ? { canto: m.canto ?? 'inf-dir' } : {}),
        // O estilo pinta o próprio fundo (o painel escuro padrão é dos modelos prontos).
        semFundo: true,
        titulo: String(j.titulo ?? m.ideia).slice(0, 60),
        estilo: estilo.chave,
        ...(coresDaPaleta(extra.paleta) ? { paleta: extra.paleta } : {}),
        briefing: briefingDe(m),
      });
      if (!c.success) return { erro: c.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`), resposta: r.texto };
      const locais = problemasDaComposicao(c.data);
      const problemas = locais.length ? locais : await this.animacoes.problemas(c.data, duracaoMs);
      if (problemas.length) return { erro: problemas, resposta: r.texto };
      // A conferência de sobreposição (no Chrome do worker): texto sobre a
      // legenda, o cabeçalho do app, a janela do vídeo ou outro texto.
      const layout = (await this.animacoes.problemasDeLayout(c.data, duracaoMs)) ?? [];
      return layout.length ? { erro: layout, soLayout: true, resposta: r.texto, composicao: c.data } : { composicao: c.data };
    };
    let r = await tentar(pedido);
    if ('erro' in r) {
      this.log.warn(`animação (${m.ideia.slice(0, 40)}): corrigindo -- ${r.erro!.join('; ').slice(0, 300)}`);
      const anterior = r;
      r = await tentar(`${pedido}\n\nSua resposta anterior:\n${(r.resposta ?? '').slice(0, 14_000)}\n\nEla tem estes problemas; corrija e responda o JSON inteiro de novo:\n- ${r.erro!.join('\n- ')}`);
      // A correção quebrou algo técnico mas a anterior só tinha layout: fica a anterior.
      if ('erro' in r && !('soLayout' in r) && 'soLayout' in anterior) r = anterior;
    }
    // Só sobraram problemas de layout: a animação entra (melhor que perdê-la).
    if ('erro' in r && 'soLayout' in r && r.composicao) {
      this.log.warn(`animação (${m.ideia.slice(0, 40)}) entrou com avisos de layout: ${r.erro!.join('; ').slice(0, 300)}`);
      return { composicao: r.composicao, duracaoMs };
    }
    if ('erro' in r) throw new Error(r.erro!.slice(0, 3).join('; '));
    return { composicao: r.composicao!, duracaoMs };
  }

  /** As animações do plano como momentos (para a série e para refazer). */
  private momentosDoPlano(plano: EditPlanV1, palavras: Array<{ s: number; texto: string }>): Array<{ camada: CamadaDeMidia; momento: Momento }> {
    return (plano.mediaLayers ?? [])
      .filter((c) => c.kind === 'html' && c.composicao)
      .map((camada) => {
        const c = camada.composicao!;
        const b = lerBriefing(c);
        const inicioS = camada.timelineStartMs / 1000;
        const fimS = (camada.timelineStartMs + camada.durationMs) / 1000;
        const momento: Momento = {
          inicioS,
          fimS,
          layout: c.layout,
          ...(c.lado ? { lado: c.lado } : {}),
          ...(c.divisao !== undefined ? { divisao: c.divisao } : {}),
          ...(c.foco !== undefined ? { foco: c.foco } : {}),
          ...(c.canto ? { canto: c.canto } : {}),
          tipo: b.tipo,
          ideia: b.ideia,
          conteudo: b.conteudo,
          acento: 0,
          palavras: palavras.filter((p) => p.s >= inicioS && p.s < fimS),
        };
        return { camada, momento };
      });
  }

  /**
   * Uma animação nova para um trecho, pelo método da montagem (o "Peça à
   * IA" usa isto em vez de escrever o HTML). Não salva: devolve a
   * composição para quem chamou pôr no plano.
   */
  async animarTrecho(workspaceId: string, projectId: string, plano: EditPlanV1, p: PedidoDeTrecho): Promise<{ composicao: ComposicaoHtml; duracaoMs: number; estilo: EstiloDeAnimacao }> {
    const palavras = await this.palavrasNoVideo(projectId, plano);
    const total = agendaDoPlano(plano).duracaoMs / 1000;
    const inicioS = Math.max(0, Math.min(p.inicioS, total - 1));
    const fimS = Math.min(total, Math.max(inicioS + 2, Math.min(p.fimS, inicioS + 15)));
    const estilo = estiloDeAnimacao(p.estilo) ?? estiloDoPlano(plano) ?? TECNOLOGIA;
    const m: Momento = {
      inicioS,
      fimS,
      layout: p.layout,
      ...(p.layout === 'meio_a_meio' ? { lado: p.lado ?? 'cima' } : {}),
      ...(p.layout === 'pip' ? { canto: p.canto ?? 'inf-dir' } : {}),
      tipo: (p.tipo ?? '').slice(0, 40),
      ideia: p.ideia.slice(0, 300),
      conteudo: (p.conteudo ?? '').slice(0, 800),
      acento: 0,
      palavras: palavras.filter((x) => x.s >= inicioS && x.s < fimS),
    };
    const serie = [...this.momentosDoPlano(plano, palavras).map((x) => x.momento), m];
    const paleta = p.paleta ?? paletaDoPlano(plano);
    const r = await this.escrever(workspaceId, projectId, m, estilo, serie, paleta ? { paleta } : {});
    return { ...r, estilo };
  }

  /**
   * Redesenha uma animação que já está no vídeo: outro estilo, outro
   * lugar (layout/lado) ou um pedido da pessoa. Mantém o que ela explica
   * (o briefing) e o tempo. Não salva: devolve a composição nova.
   */
  async redesenhar(workspaceId: string, projectId: string, plano: EditPlanV1, camadaId: string, o: OpcoesDeRefazer): Promise<{ composicao: ComposicaoHtml; duracaoMs: number; estilo: EstiloDeAnimacao }> {
    const palavras = await this.palavrasNoVideo(projectId, plano);
    const todos = this.momentosDoPlano(plano, palavras);
    const achado = todos.find((x) => x.camada.id === camadaId);
    if (!achado) throw new Error('animação não encontrada');
    const atual = achado.camada.composicao!;
    const m: Momento = { ...achado.momento };
    if (o.layout && o.layout !== m.layout) {
      m.layout = o.layout;
      delete m.divisao;
      delete m.foco;
      if (o.layout !== 'meio_a_meio') delete m.lado;
      else m.lado = o.lado ?? 'cima';
      if (o.layout !== 'pip') delete m.canto;
      else m.canto = o.canto ?? 'inf-dir';
    }
    if (o.canto && m.layout === 'pip') m.canto = o.canto;
    if (o.lado && m.layout === 'meio_a_meio') m.lado = o.lado;
    const estilo = estiloDeAnimacao(o.estilo) ?? estiloDeAnimacao(atual.estilo) ?? estiloDoPlano(plano) ?? TECNOLOGIA;
    // Trocar o canto do pip muda onde há espaço livre: também é outro desenho.
    const mudouODesenho = estilo.chave !== atual.estilo || m.layout !== atual.layout || (m.layout === 'pip' && (m.canto ?? 'inf-dir') !== (atual.canto ?? 'inf-dir'));
    const semBriefing = !atual.briefing;
    const serie = todos.map((x) => (x.camada.id === camadaId ? m : x.momento));
    // Paleta: "" tira; ausente mantém a da animação.
    const paleta = o.paleta === '' ? undefined : (o.paleta ?? atual.paleta);
    const soRecolorir = !mudouODesenho && !o.pedido && o.paleta !== undefined && o.paleta !== (atual.paleta ?? '');
    const r = await this.escrever(workspaceId, projectId, m, estilo, serie, {
      ...(paleta ? { paleta } : {}),
      ...(soRecolorir ? { pedido: paleta ? 'Troque as cores pela PALETA ESCOLHIDA, mantendo o desenho, os textos e os movimentos.' : 'Volte às cores originais do estilo, mantendo o desenho, os textos e os movimentos.' } : {}),
      base: atual,
      ...(o.pedido && !mudouODesenho ? { pedido: o.pedido } : {}),
      // Estilo ou lugar novo: o desenho é outro; os textos são os mesmos.
      soOsTextos: mudouODesenho || semBriefing,
      ...(o.pedido && mudouODesenho ? { pedido: `${o.pedido} (redesenhe no estilo e no lugar novos)` } : {}),
    });
    return { ...r, estilo };
  }

  /**
   * Refaz animações do projeto (uma, várias ou todas) e salva uma versão
   * do plano com elas. Usado pelo editor (trocar o estilo, o lugar, pedir
   * uma mudança) -- em segundo plano, com a nota do projeto.
   */
  async refazerNoProjeto(sistema: TenantContext, projectId: string, camadas: string[] | 'todas', o: OpcoesDeRefazer): Promise<{ feitas: number; nota: string }> {
    const registrar = async (nota: string) => {
      await this.prisma.project.update({ where: { id: projectId }, data: { animationNote: nota.slice(0, 500) } }).catch(() => undefined);
      this.log.log(`animações do projeto ${projectId}: ${nota}`);
      return nota;
    };
    try {
      const plano = (await this.planos.atual(sistema, projectId)).document;
      const ids = (plano.mediaLayers ?? []).filter((m) => m.kind === 'html' && m.composicao && (camadas === 'todas' || camadas.includes(m.id))).map((m) => m.id);
      if (!ids.length) return { feitas: 0, nota: await registrar('Nenhuma animação para refazer.') };
      const feitas = await Promise.allSettled(ids.map((id) => this.redesenhar(sistema.workspaceId, projectId, plano, id, o)));
      const ops: TimelineOperation[] = [];
      const falhas: string[] = [];
      let estilo: EstiloDeAnimacao | undefined;
      feitas.forEach((f, i) => {
        if (f.status === 'rejected') {
          falhas.push(f.reason instanceof Error ? f.reason.message : String(f.reason));
          return;
        }
        estilo = f.value.estilo;
        ops.push({ op: 'editar_midia', mediaId: ids[i]!, composicao: f.value.composicao });
      });
      if (!ops.length) return { feitas: 0, nota: await registrar(`Não deu para refazer: ${falhas.join(' | ').slice(0, 400)}`) };
      // O plano pode ter mudado enquanto a IA escrevia: aplica sobre o atual.
      const agora = (await this.planos.atual(sistema, projectId)).document;
      const res = aplicarComando(agora, ops, {});
      if (!res.aplicadas) return { feitas: 0, nota: await registrar(`Não deu para refazer: ${res.ignoradas.join('; ').slice(0, 400)}`) };
      await this.planos.salvar(sistema, projectId, res.plan, 'ai');
      // "Aplicar em todas": o estilo passa a ser o do projeto (as próximas animações seguem).
      if (camadas === 'todas' && (o.estilo || o.paleta !== undefined))
        await this.prisma.project
          .update({ where: { id: projectId }, data: { ...(o.estilo ? { animationStyle: o.estilo } : {}), ...(o.paleta !== undefined ? { animationPalette: o.paleta || null } : {}) } })
          .catch(() => undefined);
      for (const op of ops) {
        if (op.op !== 'editar_midia' || !op.composicao) continue;
        const camada = res.plan.mediaLayers?.find((m) => m.id === op.mediaId);
        if (camada) void this.animacoes.preparar(sistema, projectId, op.composicao, camada.durationMs).catch(() => undefined);
      }
      const n = res.aplicadas;
      const nota = `A IA refez ${n} ${n === 1 ? 'animação' : 'animações'}${estilo ? ` no estilo ${estilo.nome}` : ''} (${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})${falhas.length ? `; ${falhas.length} ficou como estava` : ''}.`;
      return { feitas: n, nota: await registrar(nota) };
    } catch (e) {
      const motivo = e && typeof e === 'object' && 'publico' in e ? String((e as { publico: unknown }).publico) : e instanceof Error ? e.message : String(e);
      return { feitas: 0, nota: await registrar(`Não deu para refazer: ${motivo.slice(0, 400)}`) };
    }
  }

  /**
   * Cria as animações da montagem e salva uma versão do plano com elas.
   * Devolve quantas entraram e a nota (também gravada no projeto).
   */
  async criarNaMontagem(
    sistema: TenantContext,
    projectId: string,
    /** Avisa a tela de preparo onde está (0 a 100). */
    aoAvancar: (pct: number) => void = () => undefined,
  ): Promise<{ criadas: number; nota: string }> {
    const registrar = async (nota: string) => {
      await this.prisma.project.update({ where: { id: projectId }, data: { animationNote: nota.slice(0, 500) } }).catch(() => undefined);
      this.log.log(`animações do projeto ${projectId}: ${nota}`);
      return nota;
    };
    try {
      const atual = await this.planos.atual(sistema, projectId);
      const plano = atual.document;
      const palavras = await this.palavrasNoVideo(projectId, plano);
      if (palavras.length < 8) return { criadas: 0, nota: await registrar('Sem animações: o vídeo não tem fala suficiente para a IA explicar.') };
      const duracaoS = agendaDoPlano(plano).duracaoMs / 1000;
      aoAvancar(5);
      const projeto = await this.prisma.project.findUnique({ where: { id: projectId }, select: { animationStyle: true, animationPalette: true } }).catch(() => null);
      const paletaFixa = coresDaPaleta(projeto?.animationPalette) ? projeto!.animationPalette! : undefined;
      const fixo = estiloDeAnimacao(projeto?.animationStyle);
      const { estilo, momentos } = await this.planejar(sistema.workspaceId, projectId, palavras, duracaoS, fixo);
      aoAvancar(20);
      if (!momentos.length) return { criadas: 0, nota: await registrar('Sem animações: a IA não achou momentos que pedissem explicação visual.') };

      let prontas = 0;
      const feitas = await Promise.allSettled(
        momentos.map((m) =>
          this.escrever(sistema.workspaceId, projectId, m, estilo, momentos, paletaFixa ? { paleta: paletaFixa } : {}).finally(() => {
            prontas += 1;
            aoAvancar(20 + (75 * prontas) / momentos.length);
          }),
        ),
      );
      const ops: TimelineOperation[] = [];
      const falhas: string[] = [];
      feitas.forEach((f, i) => {
        const m = momentos[i]!;
        if (f.status === 'rejected') {
          falhas.push(`${m.inicioS.toFixed(0)}s: ${f.reason instanceof Error ? f.reason.message : f.reason}`);
          return;
        }
        ops.push({ op: 'adicionar_midia', assetId: 'html', kind: 'html', layout: 'tela_cheia', composicao: f.value.composicao, timelineStartMs: Math.round(m.inicioS * 1000), durationMs: f.value.duracaoMs });
      });
      if (!ops.length) return { criadas: 0, nota: await registrar(`Sem animações: nenhuma passou na conferência (${falhas.join(' | ').slice(0, 380)}).`) };

      // O plano pode ter mudado enquanto a IA escrevia (a montagem salva
      // antes): aplica sobre o atual.
      const agora = (await this.planos.atual(sistema, projectId)).document;
      // A legenda acompanha o tema: a palavra falada na cor de destaque dele
      // (só se a pessoa não escolheu uma cor).
      const tema = temaDaAnimacao(estilo.chave, paletaFixa);
      const res = aplicarComando(agora, ops, {});
      if (!res.aplicadas) return { criadas: 0, nota: await registrar(`Sem animações: ${res.ignoradas.join('; ').slice(0, 380)}`) };
      if (tema && !res.plan.captions.highlightColor && /^#[0-9a-fA-F]{6}$/.test(tema.destaque)) {
        const comLegenda = aplicarComando(res.plan, [{ op: 'configurar_legenda', highlightColor: tema.destaque }], {});
        if (comLegenda.aplicadas) res.plan = comLegenda.plan;
      }
      await this.planos.salvar(sistema, projectId, res.plan, 'ai');
      aoAvancar(100);
      for (const o of ops) {
        if (o.op !== 'adicionar_midia' || !o.composicao) continue;
        void this.animacoes.preparar(sistema, projectId, o.composicao, o.durationMs).catch((e) => this.log.warn(`vídeo da animação não pedido: ${e instanceof Error ? e.message : e}`));
      }
      const quando = ops.map((o) => (o.op === 'adicionar_midia' ? `${Math.round(o.timelineStartMs / 1000)}s` : '')).join(', ');
      const nota = `A IA criou ${res.aplicadas} ${res.aplicadas === 1 ? 'animação' : 'animações'} no estilo ${estilo.nome} (em ${quando})${falhas.length ? `; ${falhas.length} ficou de fora` : ''}.`;
      return { criadas: res.aplicadas, nota: await registrar(nota) };
    } catch (e) {
      const motivo = e && typeof e === 'object' && 'publico' in e ? String((e as { publico: unknown }).publico) : e instanceof Error ? e.message : String(e);
      return { criadas: 0, nota: await registrar(`Sem animações: ${motivo.slice(0, 400)}`) };
    }
  }
}
