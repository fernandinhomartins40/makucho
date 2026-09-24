// ============================================================
// Upload em pedaços.
//
// Serve aos dois caminhos do ADR 0010 — arquivo escolhido e gravação
// do navegador —, porque o problema é o mesmo: mandar centenas de MB
// por uma conexão que pode cair.
//
// O que o torna resumível: o servidor sabe quais pedaços já chegaram,
// e ao retomar só o que falta é enviado.
// ============================================================

import { api, ErroDaApi } from './api';

export interface SessaoDeUpload {
  uploadId: string;
  tamanhoDoPedaco: number;
  totalDePedacos: number;
  recebidos: number[];
}

export interface ProgressoDoUpload {
  enviados: number;
  total: number;
  percentual: number;
  bytesEnviados: number;
  bytesTotais: number;
}

/** Formatos aceitos, iguais aos da API — a checagem local evita subir
    2 GB para descobrir que o tipo não serve. */
export const TIPOS_ACEITOS = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
];

/** Extensão → tipo. O Windows costuma entregar MKV e MOV com `type`
    vazio, e recusar um arquivo válido por isso é defeito nosso. */
const TIPO_POR_EXTENSAO: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

/** O tipo do arquivo, pelo navegador ou, na falta dele, pela extensão. */
export function tipoDoArquivo(arquivo: File): string {
  if (TIPOS_ACEITOS.includes(arquivo.type)) return arquivo.type;
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
  return TIPO_POR_EXTENSAO[extensao] ?? arquivo.type;
}

export const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024 * 1024;
export const DURACAO_MAXIMA_MS = 30 * 60 * 1000;

/**
 * Confere o arquivo ANTES de subir um byte.
 *
 * Descobrir que o arquivo era inválido depois de 2 GB enviados é o
 * pior momento possível para avisar.
 */
export async function validar(arquivo: File): Promise<string | null> {
  if (!TIPOS_ACEITOS.includes(tipoDoArquivo(arquivo))) {
    return 'formato não aceito. Envie MP4, MOV, WebM, MKV ou AVI.';
  }

  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return `o arquivo tem ${gb(arquivo.size)} GB e o limite é 2 GB.`;
  }

  const duracao = await duracaoDe(arquivo);
  if (duracao && duracao > DURACAO_MAXIMA_MS) {
    return `o vídeo tem ${Math.round(duracao / 60_000)} min e o limite é 30 min.`;
  }

  return null;
}

/** Lê a duração com um <video> temporário, sem decodificar o arquivo. */
export function duracaoDe(arquivo: Blob): Promise<number | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(arquivo);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const encerrar = (ms: number | null) => {
      URL.revokeObjectURL(url);
      resolver(ms);
    };

    video.onloadedmetadata = () => {
      // WebM gravado pelo MediaRecorder costuma vir sem duração no
      // cabeçalho: Infinity aqui é o normal, não um erro.
      const d = video.duration;
      encerrar(Number.isFinite(d) ? Math.round(d * 1000) : null);
    };
    video.onerror = () => encerrar(null);

    video.src = url;
  });
}

interface OpcoesDeEnvio {
  projectId: string;
  arquivo: Blob;
  nome: string;
  mimeType: string;
  duracaoMs?: number;
  onProgresso?: (p: ProgressoDoUpload) => void;
  sinal?: AbortSignal;
  /** Uma das várias partes do projeto: não dispara o processamento. */
  parte?: boolean;
}

/**
 * Envia um arquivo inteiro, retomando o que já foi.
 *
 * Cada pedaço tenta três vezes com espera crescente antes de desistir:
 * uma falha de rede no meio de um upload longo é esperada, e abortar
 * tudo por causa de um pedaço desperdiçaria o que já subiu.
 */
export async function enviar(opcoes: OpcoesDeEnvio): Promise<{ mediaSourceId: string }> {
  const { projectId, arquivo, nome, mimeType, duracaoMs, onProgresso, sinal, parte } = opcoes;

  const sessao = await api<SessaoDeUpload>(`/projects/${projectId}/uploads`, {
    metodo: 'POST',
    corpo: { nome, mimeType, tamanhoBytes: arquivo.size, duracaoMs },
  });

  const jaEnviados = new Set(sessao.recebidos);
  let enviados = jaEnviados.size;

  const avisar = () =>
    onProgresso?.({
      enviados,
      total: sessao.totalDePedacos,
      percentual: Math.round((enviados / sessao.totalDePedacos) * 100),
      bytesEnviados: Math.min(arquivo.size, enviados * sessao.tamanhoDoPedaco),
      bytesTotais: arquivo.size,
    });

  avisar();

  try {
    for (let i = 0; i < sessao.totalDePedacos; i += 1) {
      if (sinal?.aborted) throw new DOMException('envio cancelado', 'AbortError');
      if (jaEnviados.has(i)) continue;

      const inicio = i * sessao.tamanhoDoPedaco;
      const pedaco = arquivo.slice(inicio, inicio + sessao.tamanhoDoPedaco);

      await comRetentativa(() => enviarPedaco(sessao.uploadId, i, pedaco, sinal));

      enviados += 1;
      avisar();
    }
  } catch (e) {
    // Cancelado: os pedaços já gravados ocupam cota sem servir a nada.
    if (e instanceof DOMException && e.name === 'AbortError') {
      void api(`/uploads/${sessao.uploadId}`, { metodo: 'DELETE' }).catch(() => undefined);
    }
    throw e;
  }

  // `parte`: o vídeo entra na lista do projeto e espera o "Ir para a
  // edição"; sem ela, é processado na hora (um vídeo só).
  return api<{ mediaSourceId: string }>(`/uploads/${sessao.uploadId}/complete`, {
    metodo: 'POST',
    corpo: parte ? { parte: true } : {},
  });
}

async function enviarPedaco(
  uploadId: string,
  indice: number,
  pedaco: Blob,
  sinal?: AbortSignal,
): Promise<void> {
  const resposta = await fetch(`/api/uploads/${uploadId}/chunks`, {
    method: 'PUT',
    credentials: 'include',
    signal: sinal,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Chunk-Index': String(indice),
    },
    body: pedaco,
  });

  if (!resposta.ok) {
    throw new ErroDaApi(resposta.status, `falha ao enviar o pedaço ${indice + 1}`);
  }
}

async function comRetentativa<T>(acao: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimoErro: unknown;

  for (let i = 0; i < tentativas; i += 1) {
    try {
      return await acao();
    } catch (e) {
      // Cancelamento do usuário não é falha de rede: não insiste.
      if (e instanceof DOMException && e.name === 'AbortError') throw e;

      ultimoErro = e;
      if (i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** i));
      }
    }
  }

  throw ultimoErro;
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1).replace('.', ',');
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${gb(bytes)} GB`;
}
