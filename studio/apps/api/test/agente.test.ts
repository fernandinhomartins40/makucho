// ============================================================
// O agente de edição (o "Peça à IA" com ferramentas).
//
// A IA é um dublê roteirizado: lê o projeto, edita (uma operação boa e
// uma inválida), confere e responde. O que está sob teste é o ciclo:
//
//   - cada chamada de ferramenta roda e o resultado volta para a IA;
//   - operação inválida é pulada com o motivo, a boa entra;
//   - tudo vira UMA versão do plano, salva no fim;
//   - o progresso registra os passos para a tela;
//   - sem mudança, nada é salvo;
//   - o teto de passos encerra um agente que não para.
// ============================================================

import type { EditPlanV1 } from '@makucho/studio-contracts';
import { AgenteService } from '../src/modules/ai/agente.service';
import { PromptsService } from '../src/modules/ai/prompts.service';
import type { ChamadaDeFerramenta, MensagemDoAgente } from '../src/modules/ai/provedor';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 20_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 8000,
  framework: 'authority_education',
  clips: [
    { id: 'c1', sourceStartMs: 0, sourceEndMs: 4000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x' },
    { id: 'c2', sourceStartMs: 6000, sourceEndMs: 10_000, timelineStartMs: 4000, role: 'cta', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'y' },
  ],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as EditPlanV1;

type Roteiro = Array<{ texto?: string; chamadas?: Array<{ nome: string; args: unknown }> }>;

function montar(roteiro: Roteiro, banco: unknown = {}) {
  const vistas: MensagemDoAgente[][] = [];
  const salvos: EditPlanV1[] = [];
  let volta = 0;
  const ai = {
    chamarComFerramentas: async (p: { mensagens: MensagemDoAgente[] }) => {
      vistas.push(JSON.parse(JSON.stringify(p.mensagens)));
      const passo = roteiro[Math.min(volta, roteiro.length - 1)]!;
      volta += 1;
      const chamadas: ChamadaDeFerramenta[] = (passo.chamadas ?? []).map((c, i) => ({ id: `v${volta}-${i}`, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.args ?? {}) } }));
      return { texto: passo.texto ?? '', chamadas, custoCentavos: 0.01 };
    },
  };
  const planos = {
    atual: async () => ({ id: 'v1', version: 1, document: plano }),
    salvar: async (_t: unknown, _p: string, doc: EditPlanV1) => {
      salvos.push(doc);
      return { id: 'v2', version: 2, document: doc };
    },
  };
  const acabamento = {
    contexto: async () => ({ preferencias: {} }),
    biblioteca: async () => [],
    falasDosTrechos: async () => ({ c1: 'olha isso', c2: 'segue a gente' }),
    coresDaMarca: async () => ({ primary: '#2F66FF' }),
    falaNaTimeline: async () => [],
  };
  const prisma = {
    project: { findUnique: async () => ({ title: 'Teste', videoKind: null, contentBrief: null, audioProfile: { tipo: 'fala', coberturaDeFala: 0.8, fracaoDeSilencio: 0.1, descartados: 0 }, workspace: { businessType: 'comercio' } }) },
    transcriptSegment: { findMany: async () => [{ id: 's1', startMs: 0, endMs: 4000, text: 'olha isso.' }, { id: 's2', startMs: 6000, endMs: 10_000, text: 'segue a gente.' }] },
  };
  const agente = new AgenteService(
    prisma as never,
    planos as never,
    ai as never,
    new PromptsService(),
    acabamento as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    banco as never,
  );
  return { agente, vistas, salvos };
}

const tenant = { userId: 'u', workspaceId: 'w', role: 'OWNER' } as const;

async function main() {
  // ---------- Caminho feliz ----------
  const a = montar([
    { chamadas: [{ nome: 'ver_projeto', args: {} }] },
    {
      chamadas: [
        {
          nome: 'editar',
          args: {
            operacoes: [
              { op: 'trocar_estilo_legenda', styleId: 'hormozi' },
              { op: 'definir_velocidade', clipId: 'c1', speed: 99 },
            ],
          },
        },
      ],
    },
    { chamadas: [{ nome: 'conferir_plano', args: {} }] },
    { texto: 'Troquei a legenda para o estilo Hormozi.' },
  ]);
  const r = await a.agente.executar(tenant as never, 'p1', 'deixa a legenda mais forte');
  t('responde com o texto final da IA', r.resposta === 'Troquei a legenda para o estilo Hormozi.');
  t('a operação válida entrou', a.salvos[0]?.captions.styleId === 'hormozi');
  t('a inválida voltou com o motivo', r.ignoradas.some((i) => i.includes('definir_velocidade')));
  t('salvou UMA versão', a.salvos.length === 1);
  const resultadoDoVer = a.vistas[1]!.find((m) => m.role === 'tool');
  t('o resultado de ver_projeto voltou para a IA (com o ramo)', Boolean(resultadoDoVer && resultadoDoVer.content.includes('Comércio')));
  t('o sistema traz a direção de arte, os conceitos e a referência das operações', a.vistas[0]![0]!.content.includes('Direção de arte completa') && a.vistas[0]![0]!.content.includes('roteiro viral') && a.vistas[0]![0]!.content.includes('trocar_estilo_legenda'));
  const passos = (a.agente as unknown as { andamento: Map<string, { passos: string[]; ativo: boolean }> }).andamento.get('p1')!;
  t('o progresso registra os passos', passos.passos.includes('Olhando o projeto') && passos.passos.includes('Editando o vídeo') && !passos.ativo);

  // ---------- Sem mudança, nada é salvo ----------
  const b = montar([{ chamadas: [{ nome: 'ver_projeto', args: {} }] }, { texto: 'Já está ótimo.' }]);
  const rb = await b.agente.executar(tenant as never, 'p1', 'como está o vídeo?');
  t('sem mudança: não salva', b.salvos.length === 0 && rb.aplicadas === 0);

  // ---------- Ferramenta que não existe ----------
  const c = montar([{ chamadas: [{ nome: 'apagar_tudo', args: {} }] }, { texto: 'Não consegui.' }]);
  await c.agente.executar(tenant as never, 'p1', 'x');
  const erro = c.vistas[1]!.find((m) => m.role === 'tool');
  t('ferramenta desconhecida volta como erro para a IA', Boolean(erro && erro.content.includes('não existe')));

  // ---------- Desfazer tudo ----------
  const d = montar([
    { chamadas: [{ nome: 'editar', args: { operacoes: [{ op: 'trocar_estilo_legenda', styleId: 'hormozi' }] } }] },
    { chamadas: [{ nome: 'desfazer_tudo', args: {} }] },
    { texto: 'Voltei como estava.' },
  ]);
  await d.agente.executar(tenant as never, 'p1', 'x');
  t('desfazer_tudo: nada salvo', d.salvos.length === 0);

  // ---------- Sobreposição do banco (o arquivo importado é aceito) ----------
  const banco = {
    buscar: async (_t: unknown, q: { q: string }) => ({
      avisos: [],
      resultados: [{ fonte: 'pexels', id: '77', tipo: 'video', titulo: `luz ${q.q}`, tags: [], largura: 1080, altura: 1920, duracaoMs: 8000, miniatura: '', transparente: false, autor: '', pagina: '', licenca: { nome: 'Pexels', exigeCredito: false } }],
    }),
    importar: async () => ({ id: 'asset-luz', largura: 1080, altura: 1920, transparente: false }),
  };
  const s = montar([{ chamadas: [{ nome: 'adicionar_sobreposicao', args: { tipo: 'luz_vazando', inicioS: 1, fimS: 3 } }] }, { texto: 'Pus uma luz.' }], banco);
  await s.agente.executar(tenant as never, 'p1', 'x');
  const camada = s.salvos[0]?.mediaLayers?.[0];
  t('sobreposição: entra em tela cheia, modo tela, no tempo pedido', camada?.assetId === 'asset-luz' && camada.blend === 'tela' && camada.layout === 'tela_cheia' && camada.timelineStartMs === 1000 && camada.durationMs === 2000);

  // ---------- Trilha grátis pelo clima ----------
  const faixa = (id: string, instrumental: boolean, duracaoMs: number) => ({ fonte: 'openverse', id, tipo: 'musica', titulo: `faixa ${id}`, autor: 'Autor', duracaoMs, previa: 'https://x/a.mp3', pagina: 'https://jamendo.com/t', origem: 'Jamendo (Openverse)', generos: [], tags: [], instrumental, licenca: { tipo: 'cc-by', nome: 'CC BY 3.0', exigeCredito: true } });
  const bancoDeAudio = {
    buscarAudio: async () => [faixa('vocal', false, 200_000), faixa('justa', true, 35_000), faixa('longa', true, 400_000)],
    importarAudio: async (_t: unknown, p: { id: string }) => ({ id: `asset-${p.id}` }),
  };
  const m = montar([{ chamadas: [{ nome: 'escolher_trilha', args: { clima: 'corporativa' } }] }, { texto: 'Pus uma trilha.' }], bancoDeAudio);
  await m.agente.executar(tenant as never, 'p1', 'x');
  const retorno = m.vistas[1]!.find((x) => x.role === 'tool');
  t('trilha: a instrumental mais curta que cobre o vídeo, com o crédito', m.salvos[0]?.music?.assetId === 'asset-justa' && Boolean(retorno?.content.includes('CC BY 3.0')));

  // ---------- Teto de passos ----------
  const e = montar([{ chamadas: [{ nome: 'conferir_plano', args: {} }] }]);
  const re = await e.agente.executar(tenant as never, 'p1', 'x');
  t('o teto de passos encerra', /passos/.test(re.resposta));

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
