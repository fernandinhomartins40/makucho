// ============================================================
// A olhada no vídeo sem IA: o modelo da pessoa roda na API sobre os
// quadros guardados, e a montagem das animações não paga chamada de
// visão. (A posição das cenas pela pessoa está em
// contracts/test/pessoa-no-quadro.test.ts.)
// ============================================================

import sharp from 'sharp';
import type { EditPlanV1, OlharDoVideo, PessoaNoQuadro } from '@makucho/studio-contracts';
import { AnimacoesDaFalaService } from '../src/modules/ai/animacoes-da-fala.service';
import { medirQuadro, olharLocal, pessoaNoInstante } from '../src/modules/ai/olhar-local';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const quadro = (cor: { r: number; g: number; b: number }) => sharp({ create: { width: 360, height: 640, channels: 3, background: cor } }).jpeg().toBuffer();

async function main() {
  // 1. A pessoa de cada trecho: a do último quadro guardado até ali; sem ela, a típica.
  const p = (x: number): PessoaNoQuadro => ({ cabeca: { x, topo: 300, base: 700, largura: 300 }, ombros: 700, corpo: { esq: 100, dir: 980 } });
  const olhar: OlharDoVideo = { rosto: 'no_centro', luz: 'media', cores: [], ambiente: '', pessoa: p(540), quadros: [{ ms: 0, pessoa: p(400) }, { ms: 10_000, pessoa: null }, { ms: 20_000, pessoa: p(700) }] };
  t('o quadro da cena de origem', pessoaNoInstante(olhar, 4_000)?.cabeca.x === 400 && pessoaNoInstante(olhar, 25_000)?.cabeca.x === 700);
  t('quadro sem pessoa: vale a típica do vídeo', pessoaNoInstante(olhar, 12_000)?.cabeca.x === 540);
  t('antes do primeiro quadro: o primeiro', pessoaNoInstante({ ...olhar, quadros: [{ ms: 5_000, pessoa: p(333) }] }, 1_000)?.cabeca.x === 333);
  t('sem olhar: sem pessoa', pessoaNoInstante(null, 0) === null);

  // 2. O modelo roda de verdade (um quadro liso: sem pessoa, mas com luz e cor).
  const escuro = await medirQuadro(await quadro({ r: 12, g: 10, b: 24 }));
  t('o modelo da pessoa carrega e mede um quadro', !!escuro && escuro.pessoa === null && escuro.luz === 'escura' && /^#[0-9a-f]{6}$/.test(escuro.cores[0] ?? ''));
  const local = await olharLocal([
    { ms: 0, ler: async () => quadro({ r: 240, g: 238, b: 230 }) },
    { ms: 8_000, ler: async () => null },
    { ms: 16_000, ler: async () => quadro({ r: 236, g: 240, b: 232 }) },
  ]);
  t('o olhar local: luz, cores e um registro por quadro lido', local?.luz === 'clara' && local.rosto === 'sem_rosto' && local.quadros?.length === 2 && local.ambiente === '');
  t('sem quadros: sem olhar', (await olharLocal([])) === null);

  // 3. A montagem não paga chamada de visão: a análise sai da medida local.
  const plano = {
    schemaVersion: '1.0',
    projectId: 'p1',
    sourceMediaId: 'm1',
    sourceDurationMs: 60_000,
    fps: 30,
    canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
    targetDurationMs: 30_000,
    framework: 'authority_education',
    clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 30_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x', origin: 'fala' }],
    captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true },
    overlays: [],
    soundEffects: [],
    transitions: [],
    render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
  } as unknown as EditPlanV1;
  const palavras = 'o google acabou de lançar o gemini três ponto oito flash tts'.split(' ').map((w, i) => ({ startMs: 500 + i * 700, word: w }));
  const chamadas: string[] = [];
  const lidos: string[] = [];
  const montar = (env?: string) => {
    if (env) process.env.STUDIO_OLHAR_O_VIDEO = env;
    else delete process.env.STUDIO_OLHAR_O_VIDEO;
    const prisma = {
      transcriptWord: { findMany: async () => palavras },
      transcription: { findUnique: async () => ({ regions: [{ startMs: 0, metadata: { quadro: 'q/0.jpg' } }, { startMs: 9_000, metadata: { quadro: 'q/1.jpg' } }, { startMs: 15_000, metadata: {} }] }) },
      aiAnalysis: { findFirst: async () => null },
      project: { findUnique: async () => ({ id: 'p1' }), update: async () => undefined },
    };
    const ai = {
      chamar: async (x: { chamada: string }) => {
        chamadas.push(x.chamada);
        return { texto: '{"rosto":"em_cima","luz":"clara","cores":[],"ambiente":"escritório"}' };
      },
    };
    const storage = {
      ler: async (chave: string) => {
        lidos.push(chave);
        return quadro({ r: 10, g: 10, b: 30 });
      },
    };
    return new AnimacoesDaFalaService(prisma as never, ai as never, { atual: async () => ({ document: plano }) } as never, { corDaMarca: async () => null } as never, storage as never);
  };

  const perfil = await montar().perfilDoProjeto('w', 'p1', plano);
  t('a análise da imagem sai sem chamada de IA', chamadas.length === 0 && lidos.length === 2);
  t('o perfil traz a luz medida e o registro dos quadros', perfil.olhar?.luz === 'escura' && perfil.olhar.quadros?.length === 2 && perfil.receita.fundo === 'escuro');

  chamadas.length = 0;
  const comIa = await montar('ia').perfilDoProjeto('w', 'p2', plano);
  t('STUDIO_OLHAR_O_VIDEO=ia: a IA com visão continua disponível', chamadas.join() === 'olhar_video' && comIa.olhar?.ambiente === 'escritório');

  chamadas.length = 0;
  const semOlhar = await montar('off').perfilDoProjeto('w', 'p3', plano);
  t('STUDIO_OLHAR_O_VIDEO=off: sem olhada nenhuma', chamadas.length === 0 && !semOlhar.olhar);
  delete process.env.STUDIO_OLHAR_O_VIDEO;

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
