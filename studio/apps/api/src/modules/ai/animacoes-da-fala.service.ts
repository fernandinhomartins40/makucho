// ============================================================
// As animações (HyperFrames) que a montagem cria a partir da fala.
//
// Não passa pelo agente: cada volta dele tem 2 minutos, e escrever uma
// animação inteira (html + css + script) não cabe. Aqui são chamadas
// próprias, com mais tempo e em paralelo:
//
//   1. planejar -- uma resposta curta: os 2-4 momentos que ganham com uma
//      explicação visual, com as palavras e os instantes de cada um;
//   2. escrever -- uma chamada por momento, em paralelo, com um exemplo
//      completo no estilo dos vídeos de referência;
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

const VERSAO = 'animar-fala-v1';
/** Uma animação é uma resposta longa: mais tempo que as outras chamadas. */
const TEMPO_PARA_ESCREVER_MS = 240_000;
const MAX_ANIMACOES = 4;

interface Momento {
  inicioS: number;
  fimS: number;
  layout: 'meio_a_meio' | 'cartao' | 'tela_cheia';
  ideia: string;
  palavras: Array<{ s: number; texto: string }>;
}

const SISTEMA_PLANEJAR = `Você é diretor de motion design de vídeos curtos verticais (9:16) de pessoas falando, no estilo dos vídeos de tecnologia: cartões escuros de interface que se montam no ritmo da fala e EXPLICAM o que é dito.
Recebe a fala com o instante (em segundos, no vídeo final) de cada palavra. Escolha de 2 a ${MAX_ANIMACOES} momentos que ganham com uma explicação visual: um nome ou termo, uma lista, um número, uma comparação, um antes/depois, um passo a passo, a chamada final. Espalhe pelo vídeo, sem sobrepor, 4 a 10 s cada.
Para cada momento, escolha o layout: meio_a_meio (painel com a animação e o vídeo com o rosto na outra metade -- o melhor para explicar), cartao (cartão pequeno por cima do vídeo, fora do rosto, para um detalhe rápido) ou tela_cheia (no máximo UM no vídeo).
Responda SÓ com JSON: {"momentos":[{"inicioS":12.3,"fimS":19.8,"layout":"meio_a_meio","ideia":"o que a animação mostra, em uma frase","palavras":[{"s":12.4,"texto":"palavra dita que vira elemento na tela"}]}]}. Em "palavras", as 3 a 8 palavras-chave do trecho com o instante EXATO delas na fala.`;

/** Exemplo completo no estilo das referências (a cena "Gemini 3.8 Flash TTS"). */
const EXEMPLO = JSON.stringify({
  titulo: 'Gemini 3.8 Flash TTS',
  html: `<div class="painel"><div class="selo" id="selo"><i style="background:#4285F4"></i><i style="background:#EA4335"></i><i style="background:#FBBC04"></i><i style="background:#34A853"></i><span>Novo do Google</span></div><div class="titulo"><span class="p" id="p1">Gemini</span> <span class="p grad" id="p2">3.8</span></div><div class="titulo"><span class="p" id="p3">Flash</span> <span class="p caixa" id="p4">TTS</span></div><div class="player" id="player"><div class="play"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5v14l11-7z" fill="#12161C"/></svg></div><div class="barras" id="barras"></div></div><div class="escala" id="escala"><span>Robótica</span><div class="trilho"><div class="enche" id="enche"></div></div><span id="natural">Natural</span></div></div>`,
  css: `.painel { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
.selo { display: flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 40px; background: rgba(255,255,255,.06); border: 2px solid var(--borda); font-size: 30px; }
.selo i { width: 13px; height: 13px; border-radius: 50%; display: block; } .selo span { margin-left: 12px; }
.titulo { font-family: 'Inter ExtraBold'; font-size: 104px; line-height: 1.05; display: flex; gap: 26px; }
.p { display: inline-block; } .grad { color: #4285F4; }
.caixa { color: #AECBFA; border: 5px solid #7BAAF7; border-radius: 22px; padding: 0 18px; }
.player { width: 900px; height: 130px; margin-top: 26px; border-radius: 36px; background: rgba(255,255,255,.045); border: 2px solid var(--borda); display: flex; align-items: center; gap: 28px; padding: 0 32px; }
.play { width: 76px; height: 76px; border-radius: 50%; background: var(--azul); display: flex; align-items: center; justify-content: center; flex: none; }
.barras { flex: 1; height: 80px; display: flex; align-items: center; gap: 7px; } .barras b { display: block; width: 8px; border-radius: 4px; background: var(--azul); }
.escala { width: 900px; display: flex; align-items: center; gap: 22px; font-size: 30px; color: var(--apagado); }
.trilho { flex: 1; height: 12px; border-radius: 6px; background: rgba(255,255,255,.1); overflow: hidden; }
.enche { height: 100%; width: 100%; border-radius: 6px; background: linear-gradient(90deg, #EA4335, #FBBC04, #34A853); transform-origin: 0 50%; }`,
  script: `var barras = document.getElementById('barras');
[30,55,22,70,40,62,28,75,35,58,24,68,45,30,72,38,60,26,66,42,54,32,70,36,48].forEach(function (h) { var b = document.createElement('b'); b.style.height = h + 'px'; barras.appendChild(b); });
tl.fromTo('#selo', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0)
  .fromTo('#player', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' }, 0.1)
  .fromTo('#barras b', { scaleY: 0.2, opacity: 0.35 }, { scaleY: 1, opacity: 1, duration: 0.25, stagger: 0.03 }, 0.3)
  .fromTo('#p1', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0.5)
  .fromTo('#p2', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 1.0)
  .fromTo('#p3', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 1.45)
  .fromTo('#p4', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, 1.9)
  .fromTo('#escala', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.8)
  .fromTo('#enche', { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power2.inOut' }, 2.9)
  .to('#natural', { color: '#34A853', scale: 1.15, duration: 0.25 }, 4.2);`,
});

const SISTEMA_ESCREVER = `Você é motion designer. Escreve UMA animação em HTML/CSS/GSAP (HyperFrames) para um trecho de um vídeo vertical de alguém falando, no estilo dos vídeos de tecnologia de referência: escuro, cartões arredondados (fundo var(--cartao), borda 2px var(--borda), cantos 28-36px), ondas de áudio em barras, pílulas com bolinha colorida, seletores com check, barras que enchem, carimbo girado que "bate", título que entra palavra a palavra com leve pop (back.out), cores do Google (azul #4285F4/#7BAAF7, vermelho #EA4335, amarelo #FBBC04, verde #34A853).
Cada elemento entra NO SEGUNDO em que a palavra correspondente é dita: o instante no tl é (instante da palavra - início do trecho). Textos curtos, fiéis à fala, em português.
${REGRAS_DA_ANIMACAO_HTML}
Responda SÓ com JSON: {"titulo":"nome curto","html":"...","css":"...","script":"..."}.
Exemplo de resposta (painel meio_a_meio, 1080x960):
${EXEMPLO}`;

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

  private async planejar(workspaceId: string, projectId: string, palavras: Array<{ s: number; texto: string }>, duracaoS: number): Promise<Momento[]> {
    const fala = palavras.slice(0, 900).map((p) => `${p.s.toFixed(2)} ${p.texto}`).join('\n');
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'animar_fala',
      sistema: SISTEMA_PLANEJAR,
      usuario: `Duração do vídeo: ${duracaoS.toFixed(1)} s.\nFala (instante em s, palavra):\n${fala}`,
      maxTokens: 2000,
      promptVersion: VERSAO,
      semCache: true,
      tempoMaximoMs: 150_000,
    });
    const bruto = lerJson(r.texto) as { momentos?: unknown[] };
    const momentos: Momento[] = [];
    for (const m of bruto.momentos ?? []) {
      const x = m as Partial<Momento>;
      const inicio = Number(x.inicioS);
      const fim = Number(x.fimS);
      if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim - inicio < 2) continue;
      const layout = x.layout === 'cartao' || x.layout === 'tela_cheia' ? x.layout : 'meio_a_meio';
      const inicioOk = Math.max(0, Math.min(inicio, duracaoS - 2));
      const fimOk = Math.min(duracaoS, Math.max(inicioOk + 3, Math.min(fim, inicioOk + 12)));
      if (momentos.some((o) => inicioOk < o.fimS && fimOk > o.inicioS)) continue;
      momentos.push({
        inicioS: inicioOk,
        fimS: fimOk,
        layout: layout === 'tela_cheia' && momentos.some((o) => o.layout === 'tela_cheia') ? 'meio_a_meio' : layout,
        ideia: String(x.ideia ?? '').slice(0, 300),
        palavras: palavras.filter((p) => p.s >= inicioOk && p.s < fimOk),
      });
      if (momentos.length >= MAX_ANIMACOES) break;
    }
    return momentos;
  }

  /** Escreve e confere a animação de um momento (uma correção, se precisar). */
  private async escrever(workspaceId: string, projectId: string, m: Momento): Promise<{ composicao: ComposicaoHtml; duracaoMs: number }> {
    const duracaoMs = Math.round((m.fimS - m.inicioS) * 1000);
    const area = m.layout === 'meio_a_meio' ? 'o painel de cima, 1080x960 (o vídeo com o rosto fica na metade de baixo)' : m.layout === 'cartao' ? 'o quadro todo 1080x1920, mas o cartão fica no topo (top 140-320px), fora do rosto; fundo transparente fora dele' : 'o quadro todo 1080x1920';
    const fala = m.palavras.map((p) => `${(p.s - m.inicioS).toFixed(2)} ${p.texto}`).join('\n');
    const pedido = `Layout: ${m.layout} -- #area é ${area}.\nDuração: ${(duracaoMs / 1000).toFixed(1)} s.\nIdeia: ${m.ideia}\nFala do trecho (segundo DENTRO da animação, palavra):\n${fala}`;
    const tentar = async (usuario: string) => {
      const r = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'animar_fala',
        sistema: SISTEMA_ESCREVER,
        usuario,
        maxTokens: 7000,
        promptVersion: VERSAO,
        semCache: true,
        tempoMaximoMs: TEMPO_PARA_ESCREVER_MS,
      });
      const j = lerJson(r.texto) as Record<string, unknown>;
      const c = composicaoHtmlSchema.safeParse({ html: j.html, css: j.css ?? '', script: j.script ?? '', layout: m.layout, titulo: String(j.titulo ?? m.ideia).slice(0, 60) });
      if (!c.success) return { erro: c.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`), resposta: r.texto };
      const locais = problemasDaComposicao(c.data);
      const problemas = locais.length ? locais : await this.animacoes.problemas(c.data, duracaoMs);
      return problemas.length ? { erro: problemas, resposta: r.texto } : { composicao: c.data };
    };
    let r = await tentar(pedido);
    if ('erro' in r) {
      this.log.warn(`animação (${m.ideia.slice(0, 40)}): corrigindo -- ${r.erro!.join('; ').slice(0, 300)}`);
      r = await tentar(`${pedido}\n\nSua resposta anterior:\n${(r.resposta ?? "").slice(0, 12_000)}\n\nEla tem estes problemas; corrija e responda o JSON inteiro de novo:\n- ${r.erro!.join('\n- ')}`);
    }
    if ('erro' in r) throw new Error(r.erro!.slice(0, 3).join('; '));
    return { composicao: r.composicao!, duracaoMs };
  }

  /**
   * Cria as animações da montagem e salva uma versão do plano com elas.
   * Devolve quantas entraram e a nota (também gravada no projeto).
   */
  async criarNaMontagem(sistema: TenantContext, projectId: string): Promise<{ criadas: number; nota: string }> {
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
      const momentos = await this.planejar(sistema.workspaceId, projectId, palavras, duracaoS);
      if (!momentos.length) return { criadas: 0, nota: await registrar('Sem animações: a IA não achou momentos que pedissem explicação visual.') };

      const feitas = await Promise.allSettled(momentos.map((m) => this.escrever(sistema.workspaceId, projectId, m)));
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
      for (const o of ops) {
        if (o.op !== 'adicionar_midia' || !o.composicao) continue;
        void this.animacoes.preparar(sistema, projectId, o.composicao, o.durationMs).catch((e) => this.log.warn(`vídeo da animação não pedido: ${e instanceof Error ? e.message : e}`));
      }
      const quando = ops.map((o) => (o.op === 'adicionar_midia' ? `${Math.round(o.timelineStartMs / 1000)}s` : '')).join(', ');
      const nota = `A IA criou ${res.aplicadas} ${res.aplicadas === 1 ? 'animação' : 'animações'} (em ${quando})${falhas.length ? `; ${falhas.length} ficou de fora` : ''}.`;
      return { criadas: res.aplicadas, nota: await registrar(nota) };
    } catch (e) {
      const motivo = e && typeof e === 'object' && 'publico' in e ? String((e as { publico: unknown }).publico) : e instanceof Error ? e.message : String(e);
      return { criadas: 0, nota: await registrar(`Sem animações: ${motivo.slice(0, 400)}`) };
    }
  }
}
