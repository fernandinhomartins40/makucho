// ============================================================
// A montagem automática cria as animações (HyperFrames) pelo agente,
// antes de entregar o projeto. Se o agente falhar, o vídeo sai mesmo
// assim, sem animação.
// ============================================================

import type { EditPlanV1 } from '@makucho/studio-contracts';
import { PropostaService } from '../src/modules/ai/proposta.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano = {
  clips: [{ id: 'c1', origin: 'fala' }],
  mediaLayers: [] as unknown[],
} as unknown as EditPlanV1;

function montar(agente: unknown) {
  let atual: EditPlanV1 = JSON.parse(JSON.stringify(plano));
  const pedidos: string[] = [];
  const estados: string[] = [];
  const s = new PropostaService(
    { project: { findUnique: async () => ({ id: 'p1', state: 'ANALYZING' }), update: async (a: { data: { state?: string } }) => { if (a.data.state) estados.push(a.data.state); } } } as never,
    { analisar: async () => ({ ok: true, plano: atual, confianca: 0.9, avisos: [], problemas: [] }) } as never,
    { salvar: async (_t: unknown, _p: string, doc: EditPlanV1) => { atual = doc; }, atual: async () => ({ document: atual }) } as never,
    { publicarProgresso: async () => undefined } as never,
    { separarNaMontagem: async () => 0 } as never,
    agente
      ? ({
          executar: async (_t: unknown, _p: string, pedido: string) => {
            pedidos.push(pedido);
            await (agente as (p: EditPlanV1) => Promise<EditPlanV1>)(atual).then((p) => (atual = p));
          },
        } as never)
      : undefined,
  );
  return { s, pedidos, estados, atual: () => atual };
}

async function main() {
  const html = (id: string) => ({ id, kind: 'html', assetId: 'html', layout: 'tela_cheia', timelineStartMs: 0, durationMs: 4000, composicao: { layout: 'meio_a_meio', html: 'x', css: '', script: 'tl' } });

  const a = montar(async (p) => ({ ...p, mediaLayers: [html('a1'), html('a2')] }) as unknown as EditPlanV1);
  const r = await a.s.gerar('w', 'p1');
  t('a montagem pede SÓ animações ao agente, lendo a fala palavra a palavra', a.pedidos.length === 1 && a.pedidos[0]!.includes('criar_animacao') && a.pedidos[0]!.includes('palavras=true') && a.pedidos[0]!.includes('Não mexa em cortes'));
  t('as animações entram antes de entregar, e o aviso conta quantas', (a.atual().mediaLayers?.length ?? 0) === 2 && r.avisos.some((x) => x.includes('2 animações')) && a.estados.includes('PROPOSAL_READY'));

  const b = montar(async () => {
    throw new Error('IA fora do ar');
  });
  const rb = await b.s.gerar('w', 'p1');
  t('agente falhou: a montagem sai mesmo assim, sem animação', rb.ok && b.estados.includes('PROPOSAL_READY') && !rb.avisos.some((x) => x.includes('animaç')));

  process.env.STUDIO_ANIMAR_NA_MONTAGEM = 'off';
  const c = montar(async (p) => p);
  await c.s.gerar('w', 'p1');
  t('STUDIO_ANIMAR_NA_MONTAGEM=off desliga', c.pedidos.length === 0);
  delete process.env.STUDIO_ANIMAR_NA_MONTAGEM;

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
