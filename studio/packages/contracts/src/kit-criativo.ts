// ============================================================
// MAKUCHO STUDIO - Kit criativo da marca: prompts prontos para copiar.
//
// O Studio não gera música nem vídeo de abertura; ferramentas de IA que
// fazem isso bem já existem (Suno, GPT Image, geradores de vídeo como
// Sora, Veo, Kling e Runway). O que faltava era o PEDIDO certo para cada
// uma, com a cara da marca: cores em hexadecimal, fontes, tom, qual logo
// anexar, duração. O kit é
// gerado junto do "Configurar com IA" (ai-marca.ts), fica salvo no Kit
// de marca, e a pessoa só copia, cola, gera e envia o arquivo de volta
// para a Biblioteca da marca.
// ============================================================

import { z } from 'zod';
import type { BrandColors } from './brand';

const texto = (n: number) => z.string().trim().max(n);

export const trilhaDoKitSchema = z
  .object({
    nome: texto(60),
    uso: texto(160),
    /** O campo "Style of Music" do Suno (modo Custom, instrumental). */
    estilo: texto(400),
  })
  .strict();

export const somDoKitSchema = z.object({ nome: texto(60), uso: texto(160), prompt: texto(400) }).strict();

export const vinhetaDoKitSchema = z
  .object({
    nome: texto(60),
    duracaoS: z.number().min(1).max(15),
    /** Qual versão da logo anexar como imagem de referência (as do Kit de marca). */
    logo: z.enum(['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT']),
    /**
     * O pedido para a IA que GERA o vídeo (Sora, Veo, Kling, Runway), em
     * inglês: formato, duração, cena, movimento, cores em hex, e o uso da
     * logo anexada sem redesenhá-la.
     */
    prompt: texto(1500).default(''),
    /** Legado: kits antigos traziam passos de editor. Só lidos, não gerados. */
    passos: z.array(texto(240)).max(8).optional(),
    /** O som da vinheta, para o Suno. */
    som: texto(400),
  })
  .strict();

export const imagemDoKitSchema = z
  .object({ nome: texto(60), uso: texto(160), prompt: texto(1500), formato: z.enum(['9:16', '1:1', '16:9']) })
  .strict();

export const videoDoKitSchema = z.object({ nome: texto(60), uso: texto(160), prompt: texto(1500) }).strict();

export const kitCriativoSchema = z
  .object({
    trilhas: z.array(trilhaDoKitSchema).max(4),
    sons: z.array(somDoKitSchema).max(6),
    abertura: vinhetaDoKitSchema.nullable(),
    encerramento: vinhetaDoKitSchema.nullable(),
    imagens: z.array(imagemDoKitSchema).max(6),
    videos: z.array(videoDoKitSchema).max(4),
  })
  .strict();

export type KitCriativo = z.infer<typeof kitCriativoSchema>;
export type VinhetaDoKit = z.infer<typeof vinhetaDoKitSchema>;

// ---------- Leitura tolerante ----------

const cortar = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const lista = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => ((v ?? {}) as Record<string, unknown>);

function vinheta(v: unknown): VinhetaDoKit | null {
  if (!v || typeof v !== 'object') return null;
  const o = obj(v);
  const prompt = cortar(o.prompt ?? o.promptDeVideo ?? o.videoPrompt, 1500);
  if (!prompt) return null;
  const logo = ['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT'].includes(String(o.logo)) ? (o.logo as VinhetaDoKit['logo']) : 'LOGO';
  const d = Number(o.duracaoS);
  return { nome: cortar(o.nome, 60) || 'Vinheta', duracaoS: Number.isFinite(d) ? Math.min(15, Math.max(1, d)) : 3, logo, prompt, som: cortar(o.som, 400) };
}

/** O que dizer sobre a logo a anexar, em inglês, dentro do prompt de vídeo. */
const LOGO_EM_INGLES: Record<VinhetaDoKit['logo'], string> = {
  LOGO: 'the attached brand logo (main version)',
  LOGO_NEGATIVE: 'the attached brand logo (light version for dark backgrounds)',
  LOGO_COMPACT: 'the attached brand symbol (icon only)',
};

/**
 * Prompt de vídeo montado por regra, para kits sem prompt (gerados antes
 * desta versão) ou sem IA.
 */
export function promptDeVinhetaPorRegra(
  tipo: 'abertura' | 'encerramento',
  e: { nome?: string; tom: string; cores: BrandColors; duracaoS: number; logo: VinhetaDoKit['logo'] },
): string {
  const logo = LOGO_EM_INGLES[e.logo];
  const s = String(e.duracaoS).replace(',', '.');
  if (tipo === 'abertura') {
    return [
      `Vertical 9:16 (1080x1920) animated brand intro, exactly ${s} seconds, ${e.tom} mood.`,
      `Background: deep ${e.cores.textDark} with a soft glowing light in ${e.cores.primary} at the center and subtle floating particles in ${e.cores.secondary}.`,
      `${logo[0]!.toUpperCase()}${logo.slice(1)} appears in the center, scaling up smoothly from 80% to 100% with a gentle light sweep across it, then holds still for the last second.`,
      'Use the logo exactly as provided: do not redraw, distort, recolor or add letters to it. Keep it inside the central safe area.',
      'Smooth slow camera push-in, clean modern motion design, no people, no extra text, no voiceover, no music.',
    ].join(' ');
  }
  return [
    `Vertical 9:16 (1080x1920) animated brand outro, exactly ${s} seconds, ${e.tom} mood.`,
    `Background: smooth gradient from ${e.cores.textDark} to ${e.cores.accent} with a soft light in ${e.cores.primary}.`,
    `${logo[0]!.toUpperCase()}${logo.slice(1)} fades in on the upper third and stays still; below it, leave clean empty space for a call-to-action text to be added later.`,
    'Use the logo exactly as provided: do not redraw, distort, recolor or add letters to it.',
    'Calm camera, elegant light movement, no people, no generated text, no voiceover, no music.',
  ].join(' ');
}

/** Lê o kit que a IA devolveu, consertando o que dá (campo faltando, texto longo). */
export function lerKitCriativo(v: unknown): KitCriativo | null {
  if (!v || typeof v !== 'object') return null;
  const o = obj(v);
  const kit: KitCriativo = {
    trilhas: lista(o.trilhas)
      .map((t) => ({ nome: cortar(obj(t).nome, 60), uso: cortar(obj(t).uso, 160), estilo: cortar(obj(t).estilo ?? obj(t).prompt, 400) }))
      .filter((t) => t.estilo)
      .slice(0, 4),
    sons: lista(o.sons)
      .map((t) => ({ nome: cortar(obj(t).nome, 60), uso: cortar(obj(t).uso, 160), prompt: cortar(obj(t).prompt, 400) }))
      .filter((t) => t.prompt)
      .slice(0, 6),
    abertura: vinheta(o.abertura),
    encerramento: vinheta(o.encerramento),
    imagens: lista(o.imagens)
      .map((t) => {
        const x = obj(t);
        const formato = ['9:16', '1:1', '16:9'].includes(String(x.formato)) ? (x.formato as '9:16') : '9:16';
        return { nome: cortar(x.nome, 60), uso: cortar(x.uso, 160), prompt: cortar(x.prompt, 1500), formato };
      })
      .filter((t) => t.prompt)
      .slice(0, 6),
    videos: lista(o.videos)
      .map((t) => ({ nome: cortar(obj(t).nome, 60), uso: cortar(obj(t).uso, 160), prompt: cortar(obj(t).prompt, 1500) }))
      .filter((t) => t.prompt)
      .slice(0, 4),
  };
  const vazio = !kit.trilhas.length && !kit.sons.length && !kit.abertura && !kit.encerramento && !kit.imagens.length && !kit.videos.length;
  return vazio ? null : kit;
}

// ---------- Kit por regra (sem IA) ----------

/**
 * Um kit coerente sem IA: modelos com o nome, o segmento, as cores e as
 * fontes da marca preenchidos. Menos específico que o da IA, mas já
 * serve para copiar e colar.
 */
export function kitPorRegra(e: { nome?: string; segmento?: string; tom: string; cores: BrandColors; fonteTitulo: string }): KitCriativo {
  const marca = e.nome?.trim() || 'a marca';
  const area = e.segmento?.trim() || 'o negócio';
  const cores = `${e.cores.primary} (principal), ${e.cores.secondary} (secundária) e ${e.cores.textDark} (fundo)`;
  return {
    trilhas: [
      {
        nome: 'Trilha principal',
        uso: 'Fundo de todos os vídeos; abaixa sozinha quando alguém fala',
        estilo: `instrumental, modern corporate pop, ${e.tom}, clean synths, soft drums, 100 bpm, uplifting, no vocals, loopable background for talking videos`,
      },
      {
        nome: 'Trilha de oferta',
        uso: 'Vídeos de venda e promoção, mais energia',
        estilo: 'instrumental, upbeat electronic pop, energetic, punchy drums, bright synth hooks, 120 bpm, no vocals, short-form social video background',
      },
      {
        nome: 'Trilha calma',
        uso: 'Vídeos explicativos, bastidores e depoimentos',
        estilo: 'instrumental, lo-fi chill, warm piano, soft beat, 85 bpm, relaxed and confident, no vocals, background music',
      },
    ],
    sons: [
      { nome: 'Assinatura sonora', uso: 'Quando a logo aparece', prompt: `short sonic logo, 2 seconds, ${e.tom}, bright synth chime rising, clean ending, no vocals` },
      { nome: 'Plim da dica', uso: 'Quando aparece uma dica ou um número', prompt: 'short notification ding, 1 second, bright and friendly, no vocals' },
      { nome: 'Passagem', uso: 'Nas transições entre cortes', prompt: 'quick whoosh transition sound effect, 1 second, airy, no vocals' },
    ],
    abertura: {
      nome: 'Abertura curta',
      duracaoS: 2.5,
      logo: 'LOGO',
      prompt: promptDeVinhetaPorRegra('abertura', { nome: marca, tom: e.tom, cores: e.cores, duracaoS: 2.5, logo: 'LOGO' }),
      som: `short sonic logo intro, 2.5 seconds, ${e.tom}, rising synth swell ending in a clean chime, no vocals`,
    },
    encerramento: {
      nome: 'Encerramento com chamada',
      duracaoS: 3,
      logo: 'LOGO_NEGATIVE',
      prompt: promptDeVinhetaPorRegra('encerramento', { nome: marca, tom: e.tom, cores: e.cores, duracaoS: 3, logo: 'LOGO_NEGATIVE' }),
      som: `short outro sting, 3 seconds, ${e.tom}, gentle synth resolve, no vocals`,
    },
    imagens: [
      {
        nome: 'Fundo da marca',
        uso: 'Fundo de cartões e textos',
        formato: '9:16',
        prompt: `Vertical 9:16 abstract background for ${area}, brand colors ${cores}, soft gradients and subtle geometric shapes, modern and clean, lots of empty space in the center for text, no text, no logos, high quality`,
      },
      {
        nome: 'Capa dos vídeos',
        uso: 'Capa (thumbnail) do Reels',
        formato: '9:16',
        prompt: `Vertical 9:16 social media cover background for ${marca}, ${area}, brand colors ${cores}, bold and eye-catching, clear area on the top third for a title, no text, no logos, photographic lighting`,
      },
    ],
    videos: [
      {
        nome: 'B-roll do dia a dia',
        uso: 'Cobrir a fala quando falar de rotina e atendimento',
        prompt: `Vertical 9:16 short video, 5 seconds, realistic footage of a professional in ${area} working, natural light, shallow depth of field, subtle accents in ${e.cores.primary}, smooth slow camera movement, no text`,
      },
    ],
  };
}
