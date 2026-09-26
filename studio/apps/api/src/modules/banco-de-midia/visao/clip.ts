// ============================================================
// CLIP (OpenAI, ViT-B/32, MIT) em ONNX quantizado: o que "enxerga" as
// mídias candidatas e diz o quanto cada uma combina com a cena.
//
// Só funções puras aqui -- o tokenizador BPE do CLIP, o preparo da
// imagem (224x224 normalizado) e a nota --, para o teste rodar sem o
// modelo. Quem carrega o modelo e roda é o visao.worker (uma thread que
// fecha quando fica parada e devolve a memória).
// ============================================================

/** Pesos quantizados (int8) do Xenova/clip-vit-base-patch32: ~150 MB no total. */
export const ARQUIVOS_DO_CLIP = {
  texto: 'text_model_quantized.onnx',
  imagem: 'vision_model_quantized.onnx',
  tokenizador: 'tokenizer.json',
} as const;
export const ORIGEM_DO_CLIP = 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main';
export const CAMINHO_NA_ORIGEM: Record<keyof typeof ARQUIVOS_DO_CLIP, string> = {
  texto: 'onnx/text_model_quantized.onnx',
  imagem: 'onnx/vision_model_quantized.onnx',
  tokenizador: 'tokenizer.json',
};

export const LADO_DA_IMAGEM = 224;
const MEDIA = [0.48145466, 0.4578275, 0.40821073];
const DESVIO = [0.26862954, 0.26130258, 0.27577711];
const INICIO = 49406;
const FIM = 49407;
const MAX_TOKENS = 77;

// ---------- Tokenizador (BPE em bytes, como o simple_tokenizer do CLIP) ----------

const PADRAO = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/gu;

/** Byte -> caractere unicode visível (a tabela do GPT-2/CLIP). */
function tabelaDeBytes(): string[] {
  const bs: number[] = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n++);
    }
  }
  const t: string[] = new Array(256);
  bs.forEach((b, i) => (t[b] = String.fromCharCode(cs[i]!)));
  return t;
}

export interface TokenizadorClip {
  (texto: string): number[];
}

/** Monta o tokenizador a partir do tokenizer.json do modelo. */
export function criarTokenizador(json: { model: { vocab: Record<string, number>; merges: (string | [string, string])[] } }): TokenizadorClip {
  const vocab = json.model.vocab;
  const ranks = new Map<string, number>();
  json.model.merges.forEach((m, i) => ranks.set(Array.isArray(m) ? m.join(' ') : m, i));
  const bytes = tabelaDeBytes();
  const cache = new Map<string, string[]>();
  const encoder = new TextEncoder();

  const bpe = (palavra: string): string[] => {
    const salvo = cache.get(palavra);
    if (salvo) return salvo;
    let partes = [...palavra];
    partes[partes.length - 1] += '</w>';
    for (;;) {
      let melhor = -1;
      let rank = Infinity;
      for (let i = 0; i < partes.length - 1; i++) {
        const r = ranks.get(`${partes[i]} ${partes[i + 1]}`);
        if (r !== undefined && r < rank) {
          rank = r;
          melhor = i;
        }
      }
      if (melhor < 0) break;
      const a = partes[melhor]!;
      const b = partes[melhor + 1]!;
      const novas: string[] = [];
      for (let i = 0; i < partes.length; i++) {
        if (i < partes.length - 1 && partes[i] === a && partes[i + 1] === b) {
          novas.push(a + b);
          i++;
        } else novas.push(partes[i]!);
      }
      partes = novas;
    }
    cache.set(palavra, partes);
    return partes;
  };

  return (texto: string) => {
    const limpo = texto.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    const ids = [INICIO];
    for (const m of limpo.matchAll(PADRAO)) {
      const palavra = [...encoder.encode(m[0])].map((b) => bytes[b]).join('');
      for (const p of bpe(palavra)) {
        const id = vocab[p];
        if (id !== undefined) ids.push(id);
      }
    }
    ids.length = Math.min(ids.length, MAX_TOKENS - 1);
    ids.push(FIM);
    return ids;
  };
}

// ---------- Imagem ----------

/**
 * RGB 224x224 (já redimensionado e recortado no centro) -> tensor
 * [3,224,224] normalizado, como o CLIPFeatureExtractor.
 */
export function pixelsParaTensor(rgb: Uint8Array | Buffer): Float32Array {
  const n = LADO_DA_IMAGEM * LADO_DA_IMAGEM;
  const t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) t[c * n + i] = (rgb[i * 3 + c]! / 255 - MEDIA[c]!) / DESVIO[c]!;
  }
  return t;
}

// ---------- Nota ----------

export function normalizar(v: Float32Array | number[]): Float32Array {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return Float32Array.from(v, (x) => x / n);
}

/** A média dos textos (cena + termos): "prompt ensembling" do CLIP. */
export function mediaDosTextos(embeds: Float32Array[]): Float32Array {
  const d = embeds[0]!.length;
  const soma = new Float32Array(d);
  for (const e of embeds) {
    const n = normalizar(e);
    for (let i = 0; i < d; i++) soma[i]! += n[i]!;
  }
  return normalizar(soma);
}

export function cosseno(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Cosseno do CLIP (~0,15 a ~0,35) em 0-100, para a tela: 0,18 ou menos
 * é "não tem nada a ver"; 0,32 ou mais, "é isso".
 */
export function afinidade(cos: number): number {
  return Math.round(Math.max(0, Math.min(1, (cos - 0.18) / 0.14)) * 100);
}
