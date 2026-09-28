// ============================================================
// As animações (HyperFrames) que a montagem cria a partir da fala.
//
// Não passa pelo agente: cada volta dele tem 2 minutos, e escrever uma
// animação inteira (html + css + script) não cabe. Aqui são chamadas
// próprias, com mais tempo e em paralelo:
//
//   1. planejar -- o storyboard da skill talking-head-recut do HyperFrames:
//      UM estilo para o vídeo (pelo tom da fala, entre os 10 da skill e o
//      "tecnologia" das referências) e os cartões pela densidade da fala,
//      com tipo, layout e conteúdo variados;
//   2. escrever -- uma chamada por cartão, em paralelo, com o cartão de
//      referência do estilo e a doutrina de movimento do HyperFrames;
//   3. conferir -- a checagem do Studio e o lint do HyperFrames; o que
//      falhar volta UMA vez para a IA corrigir.
//
// O resultado (ou o motivo de não ter animação) fica no projeto
// (`animationNote`), para o editor mostrar -- nada falha em silêncio.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  REGRAS_DA_ANIMACAO_HTML,
  agendaDoPlano,
  aplicarComando,
  composicaoHtmlSchema,
  problemasDaComposicao,
  type ComposicaoHtml,
  type EditPlanV1,
  type TimelineOperation,
} from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { AnimacoesService } from '../animacoes/animacoes.service';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AiService } from './ai.service';
import { ESTILOS_DE_CARTAO, type EstiloDeCartao } from './hyperframes/estilos';

// v2: o método da skill talking-head-recut do HyperFrames -- um estilo
// por vídeo escolhido pelo tom, cartões pela densidade da fala, tipos
// variados e a doutrina de movimento (revelar no ritmo das palavras).
const VERSAO = 'animar-fala-v2';
/** Uma animação é uma resposta longa: mais tempo que as outras chamadas. */
const TEMPO_PARA_ESCREVER_MS = 240_000;
/** Teto de cartões por montagem (cada um é uma chamada à IA, em paralelo). */
const MAX_ANIMACOES = 8;

type Layout = 'meio_a_meio' | 'cartao' | 'tela_cheia';

interface Momento {
  inicioS: number;
  fimS: number;
  layout: Layout;
  /** No meio a meio: onde fica o painel (cima = rosto embaixo; baixo = rosto em cima). */
  lado?: 'cima' | 'baixo';
  /** O tipo de cartão (número, lista, citação...), para variar. */
  tipo: string;
  ideia: string;
  /** kicker, título, detalhe, dado, citação, itens -- o que o cartão diz. */
  conteudo: string;
  /** Qual das cores de destaque do estilo (0 a 4). */
  acento: number;
  palavras: Array<{ s: number; texto: string }>;
}

/** O estilo "tecnologia" dos vídeos de referência (cartões escuros de interface). */
const TECNOLOGIA: EstiloDeCartao = {
  chave: 'tecnologia',
  nome: 'Tecnologia',
  carater: 'escuro, cartões de interface arredondados, pílulas com bolinha colorida, ondas de áudio em barras, cores do Google',
  quando: 'lançamento de tecnologia, IA, aplicativos, novidades digitais',
  escuro: true,
  fontes: ["'Inter ExtraBold'", "'Inter SemiBold'"],
  tokens: 'fundo #0B0E13 com brilho azul suave; cartão #1E2126, borda 2px rgba(255,255,255,.10), cantos 28-36px; texto #F1F3F4, apagado #9AA0A6; destaques #4285F4 #EA4335 #FBBC04 #34A853 #A142F4',
  referencia: '',
};

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

const TODOS_OS_ESTILOS: readonly EstiloDeCartao[] = [...ESTILOS_DE_CARTAO, TECNOLOGIA];

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

/** Quantos cartões, pela duração e a densidade (a regra da skill talking-head-recut). */
function faixaDeCartoes(duracaoS: number): { min: number; max: number; passo: number } {
  const passo = duracaoS < 60 ? 7 : duracaoS < 180 ? 10 : duracaoS < 600 ? 16 : 28;
  const min = Math.max(2, Math.min(MAX_ANIMACOES, Math.round(duracaoS / (passo * 1.5))));
  const max = Math.max(min, Math.min(MAX_ANIMACOES, Math.round(duracaoS / (passo * 0.7))));
  return { min, max, passo };
}

function sistemaDoPlano(duracaoS: number): string {
  const f = faixaDeCartoes(duracaoS);
  const estilos = TODOS_OS_ESTILOS.map((e) => `- ${e.chave}: ${e.carater}. Para: ${e.quando}.`).join('\n');
  return `Você é diretor de motion design (método HyperFrames / talking-head-recut): empacota um vídeo vertical 9:16 de alguém falando com CARTÕES GRÁFICOS animados, sincronizados com a fala, que EXPLICAM o que é dito. O vídeo em si não muda; os cartões entram por cima ou dividem a tela com ele.
1. Leia a fala inteira e decida o TOM. Escolha UM estilo visual para o vídeo todo, pelo tom (não pelo assunto):
${estilos}
2. Escolha de ${f.min} a ${f.max} cartões (cerca de 1 a cada ${f.passo} s; mais se a fala é densa -- números, listas, afirmações em sequência; menos se é uma história só). Cada cartão cobre um trecho de 3 a 10 s que ganha com explicação visual, sem sobrepor outro e com respiro de 1 s ou mais entre eles.
3. VARIE o tipo de cartão (não repita o mesmo tipo em seguida): ${TIPOS_DE_CARTAO.join('; ')}.
4. Layout de cada cartão: meio_a_meio (o cartão ocupa metade da tela e o rosto a outra; lado "cima" = cartão em cima, rosto embaixo; "baixo" = rosto em cima, cartão embaixo -- o melhor para explicar dados e listas), cartao (cartão menor por cima do vídeo, fora do rosto -- para um termo, um número rápido, uma citação curta) ou tela_cheia (só para o ponto alto: no máximo um). Alterne layouts para dar ritmo.
5. Conteúdo: textos curtos e fiéis à fala, em português (kicker de 1-3 palavras, título de até 6 palavras, detalhe de até 12, os números exatos ditos, os itens da lista).
Responda SÓ com JSON: {"estilo":"chave","tom":"uma frase","cartoes":[{"inicioS":12.3,"fimS":19.8,"layout":"meio_a_meio","lado":"cima","tipo":"numero","intencao":"o que o cartão explica","conteudo":{"kicker":"...","titulo":"...","detalhe":"...","dado":"...","itens":["..."]},"acento":0}]}. Instantes em segundos do vídeo final, iguais aos da fala.`;
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

function sistemaDaEscrita(estilo: EstiloDeCartao): string {
  const referencia =
    estilo.chave === 'tecnologia'
      ? `Exemplo completo neste estilo (já no formato da resposta; painel meio_a_meio 1080x960):\n${EXEMPLO_TECNOLOGIA}`
      : `Cartão de REFERÊNCIA deste estilo (skill talking-head-recut; feito para 1920x1080 -- aumente ~1.3x para o vertical). Copie o visual: fundo, cores, ornamentos, hierarquia e composição. As animações dele estão declaradas em data-anim-* (at = segundo, duration, stagger): traduza para tl no seu script. O texto de exemplo é chinês: troque pelo conteúdo real em português. Troque as fontes pelas nossas, listadas acima.\n${estilo.referencia}`;
  return `Você é motion designer do HyperFrames. Desenha UM cartão animado (HTML/CSS/GSAP) que explica um trecho de um vídeo vertical de alguém falando. É um cartão de uma série: todos seguem o mesmo estilo, mas cada um tem estrutura própria para o que explica -- não é um modelo com o texto trocado.
ESTILO DO VÍDEO: ${estilo.nome} -- ${estilo.carater}.
Cores e tipografia do estilo:
${estilo.tokens}
Fontes a usar neste estilo (as nossas): ${estilo.fontes.join(', ')}.
Pinte o fundo do estilo em #area inteira no meio_a_meio e na tela_cheia (o painel é do cartão); no cartao, só o cartão tem fundo (o resto transparente, o vídeo aparece).
${DOUTRINA_DE_MOVIMENTO}
${REGRAS_DA_ANIMACAO_HTML}
Responda SÓ com JSON: {"titulo":"nome curto","html":"...","css":"...","script":"..."}.
${referencia}`;
}

/** O primeiro objeto JSON de uma resposta (a IA às vezes cerca com ```). */
function lerJson(texto: string): unknown {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i < 0 || f <= i) throw new Error('a resposta não trouxe JSON');
  return JSON.parse(limpo.slice(i, f + 1));
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
  ): Promise<{ estilo: EstiloDeCartao; momentos: Momento[] }> {
    const fala = palavras.slice(0, 1500).map((p) => `${p.s.toFixed(2)} ${p.texto}`).join('\n');
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'animar_fala',
      sistema: sistemaDoPlano(duracaoS),
      usuario: `Duração do vídeo: ${duracaoS.toFixed(1)} s.\nFala (instante em s, palavra):\n${fala}`,
      maxTokens: 3000,
      promptVersion: VERSAO,
      semCache: true,
      tempoMaximoMs: 150_000,
    });
    const bruto = lerJson(r.texto) as { estilo?: unknown; cartoes?: unknown[]; momentos?: unknown[] };
    const estilo = TODOS_OS_ESTILOS.find((e) => e.chave === bruto.estilo) ?? TECNOLOGIA;
    const momentos: Momento[] = [];
    for (const m of bruto.cartoes ?? bruto.momentos ?? []) {
      const x = m as Record<string, unknown>;
      const inicio = Number(x.inicioS);
      const fim = Number(x.fimS);
      if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim - inicio < 2) continue;
      const layout: Layout = x.layout === 'cartao' || x.layout === 'tela_cheia' ? x.layout : 'meio_a_meio';
      const inicioOk = Math.max(0, Math.min(inicio, duracaoS - 2));
      const fimOk = Math.min(duracaoS, Math.max(inicioOk + 3, Math.min(fim, inicioOk + 12)));
      if (momentos.some((o) => inicioOk < o.fimS && fimOk > o.inicioS)) continue;
      const conteudo = typeof x.conteudo === 'string' ? x.conteudo : x.conteudo ? JSON.stringify(x.conteudo) : '';
      momentos.push({
        inicioS: inicioOk,
        fimS: fimOk,
        layout: layout === 'tela_cheia' && momentos.some((o) => o.layout === 'tela_cheia') ? 'meio_a_meio' : layout,
        ...(layout === 'meio_a_meio' ? { lado: x.lado === 'baixo' ? ('baixo' as const) : ('cima' as const) } : {}),
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

  /** Escreve e confere o cartão de um momento (uma correção, se precisar). */
  private async escrever(
    workspaceId: string,
    projectId: string,
    m: Momento,
    estilo: EstiloDeCartao,
    serie: Momento[],
  ): Promise<{ composicao: ComposicaoHtml; duracaoMs: number }> {
    const duracaoMs = Math.round((m.fimS - m.inicioS) * 1000);
    const area =
      m.layout === 'meio_a_meio'
        ? m.lado === 'baixo'
          ? 'o painel de BAIXO, 1080x960 (o rosto fica na metade de cima)'
          : 'o painel de CIMA, 1080x960 (o rosto fica na metade de baixo)'
        : m.layout === 'cartao'
          ? 'o quadro todo 1080x1920, mas o cartão fica no topo (top 140-360px) ou na faixa de baixo (bottom 380-700px), fora do rosto; transparente fora dele'
          : 'o quadro todo 1080x1920 (o ponto alto do vídeo)';
    const fala = m.palavras.map((p) => `${(p.s - m.inicioS).toFixed(2)} ${p.texto}`).join('\n');
    const outros = serie
      .filter((o) => o !== m)
      .map((o) => `${o.inicioS.toFixed(0)}s ${o.tipo || '?'} (${o.layout})`)
      .join('; ');
    const pedido = `Cartão ${serie.indexOf(m) + 1} de ${serie.length}. Tipo: ${m.tipo || 'o que melhor explicar'}. Layout: ${m.layout} -- #area é ${area}.
Duração: ${(duracaoMs / 1000).toFixed(1)} s. Cor de destaque: a ${m.acento + 1}ª do estilo.
O que explica: ${m.ideia}
Conteúdo: ${m.conteudo || '(tire da fala)'}
Os outros cartões da série (não repita a estrutura deles): ${outros || 'nenhum'}.
Fala do trecho (segundo DENTRO da animação, palavra) -- cada elemento entra no segundo da palavra que ele representa:
${fala}`;
    const tentar = async (usuario: string) => {
      const r = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'animar_fala',
        sistema: sistemaDaEscrita(estilo),
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
        // O estilo pinta o próprio fundo (o painel escuro padrão é do modelo "tecnologia").
        semFundo: true,
        titulo: String(j.titulo ?? m.ideia).slice(0, 60),
      });
      if (!c.success) return { erro: c.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`), resposta: r.texto };
      const locais = problemasDaComposicao(c.data);
      const problemas = locais.length ? locais : await this.animacoes.problemas(c.data, duracaoMs);
      return problemas.length ? { erro: problemas, resposta: r.texto } : { composicao: c.data };
    };
    let r = await tentar(pedido);
    if ('erro' in r) {
      this.log.warn(`animação (${m.ideia.slice(0, 40)}): corrigindo -- ${r.erro!.join('; ').slice(0, 300)}`);
      r = await tentar(`${pedido}\n\nSua resposta anterior:\n${(r.resposta ?? '').slice(0, 14_000)}\n\nEla tem estes problemas; corrija e responda o JSON inteiro de novo:\n- ${r.erro!.join('\n- ')}`);
    }
    if ('erro' in r) throw new Error(r.erro!.slice(0, 3).join('; '));
    return { composicao: r.composicao!, duracaoMs };
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
      const { estilo, momentos } = await this.planejar(sistema.workspaceId, projectId, palavras, duracaoS);
      aoAvancar(20);
      if (!momentos.length) return { criadas: 0, nota: await registrar('Sem animações: a IA não achou momentos que pedissem explicação visual.') };

      let prontas = 0;
      const feitas = await Promise.allSettled(
        momentos.map((m) =>
          this.escrever(sistema.workspaceId, projectId, m, estilo, momentos).finally(() => {
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
      const res = aplicarComando(agora, ops, {});
      if (!res.aplicadas) return { criadas: 0, nota: await registrar(`Sem animações: ${res.ignoradas.join('; ').slice(0, 380)}`) };
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
