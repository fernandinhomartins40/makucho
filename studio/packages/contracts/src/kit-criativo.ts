// ============================================================
// MAKUCHO STUDIO - Kit criativo da marca: prompts prontos para copiar.
//
// O Studio não gera música nem vídeo de abertura; ferramentas que fazem
// isso bem já existem (Suno, GPT Image, geradores de vídeo, CapCut). O
// que faltava era o PEDIDO certo para cada uma, com a cara da marca:
// cores em hexadecimal, fontes, tom, qual logo usar, duração. O kit é
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
    /** Qual versão da logo usar (as do Kit de marca). */
    logo: z.enum(['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT']),
    /** O passo a passo no editor de vídeo (CapCut, Canva, Premiere...). */
    passos: z.array(texto(240)).max(8),
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
  const passos = lista(o.passos)
    .map((p) => cortar(p, 240))
    .filter(Boolean)
    .slice(0, 8);
  if (!passos.length) return null;
  const logo = ['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT'].includes(String(o.logo)) ? (o.logo as VinhetaDoKit['logo']) : 'LOGO';
  const d = Number(o.duracaoS);
  return { nome: cortar(o.nome, 60) || 'Vinheta', duracaoS: Number.isFinite(d) ? Math.min(15, Math.max(1, d)) : 3, logo, passos, som: cortar(o.som, 400) };
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
      passos: [
        'Crie um projeto vertical 1080x1920 (9:16), 30 fps, com 2,5 segundos.',
        `Fundo na cor ${e.cores.textDark}, com um brilho suave em ${e.cores.primary} no centro.`,
        'Coloque a logo PRINCIPAL no centro, com 60% da largura da tela.',
        'Animação: a logo entra crescendo de 80% para 100% em 0,6 s (ease-out), com leve desfoque saindo.',
        `Acrescente uma linha fina na cor ${e.cores.secondary} passando embaixo da logo aos 0,8 s.`,
        'Coloque a assinatura sonora (gerada no Suno) começando em 0 s.',
        'Exporte em MP4, 1080x1920, e envie em Biblioteca › Aberturas.',
      ],
      som: `short sonic logo intro, 2.5 seconds, ${e.tom}, rising synth swell ending in a clean chime, no vocals`,
    },
    encerramento: {
      nome: 'Encerramento com chamada',
      duracaoS: 3,
      logo: 'LOGO_NEGATIVE',
      passos: [
        'Projeto vertical 1080x1920 (9:16), 30 fps, com 3 segundos.',
        `Fundo em degradê de ${e.cores.textDark} para ${e.cores.accent}.`,
        'Logo PARA FUNDO ESCURO (versão clara) no terço de cima, com 50% da largura.',
        `Embaixo, o texto "Siga ${marca}" na fonte ${e.fonteTitulo}, cor ${e.cores.textLight}, entrando de baixo para cima aos 0,5 s.`,
        'Se tiver, acrescente o @ da rede ou o site em letra menor.',
        'Som: a assinatura sonora no começo, bem baixa.',
        'Exporte em MP4, 1080x1920, e envie em Biblioteca › Encerramentos.',
      ],
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
