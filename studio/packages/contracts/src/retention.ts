// ============================================================
// MAKUCHO STUDIO - Retencao e cota de disco
//
// O disco da VPS e compartilhado com outras cinco aplicacoes de
// clientes. O studio tem 10 GB, divididos em dois baldes com regras
// diferentes:
//
//   PERMANENTE  4 GB  materiais de apoio da marca -- logo, fonte,
//                     musica, intro, outro. Nao expiram: sao o
//                     insumo de TODO video, e apagar um deles
//                     quebraria projetos futuros.
//
//   EDICAO      6 GB  originais, proxies, audio e renders. Expiram,
//                     e os mais antigos cedem lugar aos novos.
//
// A separacao existe porque misturar os dois faria um upload de
// video de 500 MB apagar a trilha sonora da marca para caber.
// ============================================================

import { z } from 'zod';

const DIA_MS = 24 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;

// ---------- Cotas ----------
export const QUOTA_TOTAL_BYTES = 10 * GB;
export const QUOTA_PERMANENTE_BYTES = 4 * GB;
export const QUOTA_EDICAO_BYTES = 6 * GB;

/** A qual balde cada tipo de arquivo pertence. */
export const BALDE = {
  // Materiais de apoio: insumo de todo video.
  LOGO: 'permanente',
  LOGO_NEGATIVE: 'permanente',
  LOGO_COMPACT: 'permanente',
  WATERMARK: 'permanente',
  FONT: 'permanente',
  IMAGE: 'permanente',
  LOTTIE: 'permanente',
  MUSIC: 'permanente',
  SOUND_EFFECT: 'permanente',
  INTRO: 'permanente',
  OUTRO: 'permanente',
  TRANSITION: 'permanente',

  // Trabalho de um projeto especifico.
  ORIGINAL: 'edicao',
  PROXY: 'edicao',
  AUDIO: 'edicao',
  THUMBNAIL: 'edicao',
  KEYFRAME: 'edicao',
  RENDER: 'edicao',
} as const;

export type Balde = 'permanente' | 'edicao';
export type TipoArquivo = keyof typeof BALDE;

/**
 * Prazos do balde de edicao.
 *
 * O original vive mais que os derivados porque e o unico
 * insubstituivel: proxy, audio e thumbnail se reconstroem a partir
 * dele em minutos. O render dura mais ainda -- e o que o cliente
 * veio buscar.
 *
 * Materiais permanentes nao aparecem aqui: nao expiram por tempo.
 */
export const RETENCAO_DIAS = {
  ORIGINAL: 30,
  PROXY: 30,
  AUDIO: 15,
  THUMBNAIL: 30,
  KEYFRAME: 15,
  RENDER: 60,
} as const;

export type TipoComRetencao = keyof typeof RETENCAO_DIAS;

/**
 * Quando avisar, antes da exclusao.
 *
 * Tres avisos e nao um: quem abre o app uma vez por semana perderia
 * um aviso unico. O de 1 dia existe para quem so olha no fim.
 */
export const AVISOS_DIAS_ANTES = [7, 3, 1] as const;

export function baldeDe(tipo: TipoArquivo): Balde {
  return BALDE[tipo];
}

export function expiraPorTempo(tipo: TipoArquivo): tipo is TipoComRetencao {
  return baldeDe(tipo) === 'edicao';
}

// ---------- Estado de um arquivo ----------
export interface EstadoRetencao {
  expiresAt: Date | null;
  diasRestantes: number | null;
  deveAvisar: boolean;
  expirado: boolean;
  mensagem: string | null;
}

export function estadoDaRetencao(
  tipo: TipoArquivo,
  criadoEm: Date,
  pinned = false,
  agora: Date = new Date(),
): EstadoRetencao {
  // Material de apoio nao expira por tempo. Ele so sai se o usuario
  // apagar, ou se o balde permanente estourar -- e nesse caso o
  // proprio usuario escolhe o que remover.
  if (!expiraPorTempo(tipo) || pinned) {
    return {
      expiresAt: null,
      diasRestantes: null,
      deveAvisar: false,
      expirado: false,
      mensagem: null,
    };
  }

  const dias = RETENCAO_DIAS[tipo];
  const expiraEm = new Date(criadoEm.getTime() + dias * DIA_MS);
  const restanteMs = expiraEm.getTime() - agora.getTime();
  // Arredonda para cima: faltando 12 horas, ainda e "1 dia".
  const diasRestantes = Math.ceil(restanteMs / DIA_MS);

  if (restanteMs <= 0) {
    return {
      expiresAt: expiraEm,
      diasRestantes: 0,
      deveAvisar: true,
      expirado: true,
      mensagem: 'Este arquivo expirou e será removido na próxima limpeza.',
    };
  }

  const deveAvisar = AVISOS_DIAS_ANTES.includes(
    diasRestantes as (typeof AVISOS_DIAS_ANTES)[number],
  );

  return {
    expiresAt: expiraEm,
    diasRestantes,
    deveAvisar,
    expirado: false,
    mensagem: deveAvisar ? mensagemDeAviso(tipo, diasRestantes) : null,
  };
}

function mensagemDeAviso(tipo: TipoComRetencao, dias: number): string {
  const quando = dias === 1 ? 'amanhã' : `em ${dias} dias`;

  // O texto diz o que FAZER, e nao so o que vai acontecer: um aviso
  // sem saida deixa o usuario sem acao.
  if (tipo === 'ORIGINAL') {
    return `O vídeo original será removido ${quando} para liberar espaço. ` +
      'Baixe uma cópia ou fixe o projeto para mantê-lo.';
  }

  if (tipo === 'RENDER') {
    return `O vídeo finalizado será removido ${quando}. Baixe antes, se ainda não baixou.`;
  }

  return `Os arquivos de trabalho serão removidos ${quando}. ` +
    'O vídeo original e o resultado final não são afetados.';
}

// ---------- Uso por balde ----------
export interface UsoDeArmazenamento {
  permanenteBytes: number;
  edicaoBytes: number;
  /** Fixado pelo usuario dentro do balde de edicao: nao cede lugar. */
  fixadoBytes: number;
}

export interface AvisoDeBalde {
  balde: Balde;
  nivel: 'ok' | 'atencao' | 'critico' | 'cheio';
  usadoBytes: number;
  quotaBytes: number;
  percentual: number;
  mensagem: string | null;
}

function formatarGb(bytes: number): string {
  const gb = bytes / GB;
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1).replace('.', ',')} GB`;
}

/**
 * Avalia o balde permanente.
 *
 * Aqui nao ha limpeza automatica: material de apoio e escolha do
 * cliente, e o sistema nao decide qual logo ou trilha descartar. Ao
 * encher, o upload e recusado com a explicacao.
 */
export function avaliarPermanente(usadoBytes: number): AvisoDeBalde {
  const percentual = Math.round((usadoBytes / QUOTA_PERMANENTE_BYTES) * 100);
  const base = {
    balde: 'permanente' as const,
    usadoBytes,
    quotaBytes: QUOTA_PERMANENTE_BYTES,
    percentual,
  };

  if (usadoBytes >= QUOTA_PERMANENTE_BYTES) {
    return {
      ...base,
      nivel: 'cheio',
      mensagem:
        `Os materiais de apoio ocuparam os ${formatarGb(QUOTA_PERMANENTE_BYTES)} disponíveis. ` +
        'Remova algum material antes de enviar outro — estes arquivos não são apagados automaticamente.',
    };
  }

  if (percentual >= 90) {
    return {
      ...base,
      nivel: 'critico',
      mensagem:
        `Materiais de apoio em ${percentual}% do espaço ` +
        `(${formatarGb(usadoBytes)} de ${formatarGb(QUOTA_PERMANENTE_BYTES)}).`,
    };
  }

  if (percentual >= 75) {
    return {
      ...base,
      nivel: 'atencao',
      mensagem: `Materiais de apoio em ${percentual}% do espaço.`,
    };
  }

  return { ...base, nivel: 'ok', mensagem: null };
}

/**
 * Avalia o balde de edicao.
 *
 * A diferenca central: aqui o espaco NAO acaba. Quando falta, os
 * arquivos mais antigos cedem lugar ao novo. O aviso existe para que
 * o usuario entenda isso ANTES de perder algo -- e possa baixar ou
 * fixar o que quer manter.
 */
export function avaliarEdicao(
  usadoBytes: number,
  fixadoBytes = 0,
): AvisoDeBalde {
  const percentual = Math.round((usadoBytes / QUOTA_EDICAO_BYTES) * 100);
  const base = {
    balde: 'edicao' as const,
    usadoBytes,
    quotaBytes: QUOTA_EDICAO_BYTES,
    percentual,
  };

  // Fixado demais e o unico jeito de o balde de edicao travar de
  // verdade: arquivo fixado nao cede lugar.
  if (fixadoBytes >= QUOTA_EDICAO_BYTES * 0.9) {
    return {
      ...base,
      nivel: 'cheio',
      mensagem:
        `Quase todo o espaço de edição está em projetos fixados ` +
        `(${formatarGb(fixadoBytes)}). Desafixe algum para liberar espaço aos novos vídeos.`,
    };
  }

  if (percentual >= 90) {
    return {
      ...base,
      nivel: 'critico',
      mensagem:
        `Espaço de edição em ${percentual}% ` +
        `(${formatarGb(usadoBytes)} de ${formatarGb(QUOTA_EDICAO_BYTES)}). ` +
        'Os vídeos mais antigos serão removidos para abrir espaço aos próximos. ' +
        'Baixe o que quiser guardar ou fixe os projetos importantes.',
    };
  }

  if (percentual >= 75) {
    return {
      ...base,
      nivel: 'atencao',
      mensagem:
        `Espaço de edição em ${percentual}%. ` +
        'Quando encher, os vídeos mais antigos darão lugar aos novos.',
    };
  }

  return { ...base, nivel: 'ok', mensagem: null };
}

// ---------- Liberar espaço ----------
export interface ArquivoCandidato {
  id: string;
  tipo: TipoArquivo;
  sizeBytes: number;
  createdAt: Date;
  pinned: boolean;
}

export interface PlanoDeLiberacao {
  /** Ha espaco, com ou sem remover nada? */
  viavel: boolean;
  remover: ArquivoCandidato[];
  bytesLiberados: number;
  /** Explicacao para o usuario ANTES de confirmar o upload. */
  aviso: string | null;
}

/**
 * Decide o que remover para caber um upload novo.
 *
 * Ordem: o mais antigo primeiro, e nunca um arquivo fixado. Remove
 * apenas o necessario -- liberar mais do que precisa apagaria
 * trabalho que ainda caberia.
 *
 * NADA e removido aqui. A funcao devolve o plano para a interface
 * mostrar; quem apaga e o chamador, depois da confirmacao.
 */
export function planejarLiberacao(
  bytesNecessarios: number,
  usadoBytes: number,
  candidatos: readonly ArquivoCandidato[],
): PlanoDeLiberacao {
  const livre = QUOTA_EDICAO_BYTES - usadoBytes;

  if (livre >= bytesNecessarios) {
    return { viavel: true, remover: [], bytesLiberados: 0, aviso: null };
  }

  const faltam = bytesNecessarios - livre;

  const removiveis = candidatos
    .filter((a) => !a.pinned && baldeDe(a.tipo) === 'edicao')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const remover: ArquivoCandidato[] = [];
  let liberados = 0;

  for (const arquivo of removiveis) {
    if (liberados >= faltam) break;
    remover.push(arquivo);
    liberados += arquivo.sizeBytes;
  }

  if (liberados < faltam) {
    return {
      viavel: false,
      remover: [],
      bytesLiberados: liberados,
      aviso:
        `Não há espaço para este vídeo (${formatarGb(bytesNecessarios)}) e ` +
        'não há arquivos antigos suficientes para remover. ' +
        'Desafixe ou apague projetos para liberar espaço.',
    };
  }

  const quantos = remover.length;
  const maisAntigo = remover[0];
  const desde = maisAntigo
    ? maisAntigo.createdAt.toLocaleDateString('pt-BR')
    : '';

  return {
    viavel: true,
    remover,
    bytesLiberados: liberados,
    aviso:
      `Para abrir espaço, ${quantos} ${quantos === 1 ? 'arquivo' : 'arquivos'} ` +
      `${quantos === 1 ? 'antigo será removido' : 'antigos serão removidos'} ` +
      `(${formatarGb(liberados)}, a partir de ${desde}). ` +
      'Projetos fixados não são afetados.',
  };
}

/** O upload cabe no balde, considerando a liberacao possivel? */
export function cabeNaEdicao(
  usadoBytes: number,
  novoArquivoBytes: number,
  candidatos: readonly ArquivoCandidato[] = [],
): boolean {
  return planejarLiberacao(novoArquivoBytes, usadoBytes, candidatos).viavel;
}

export function cabeNoPermanente(usadoBytes: number, novoArquivoBytes: number): boolean {
  return usadoBytes + novoArquivoBytes <= QUOTA_PERMANENTE_BYTES;
}

// ---------- Visão geral ----------
export interface ResumoDeArmazenamento {
  permanente: AvisoDeBalde;
  edicao: AvisoDeBalde;
  totalBytes: number;
  totalQuotaBytes: number;
}

export function resumoDeArmazenamento(uso: UsoDeArmazenamento): ResumoDeArmazenamento {
  return {
    permanente: avaliarPermanente(uso.permanenteBytes),
    edicao: avaliarEdicao(uso.edicaoBytes, uso.fixadoBytes),
    totalBytes: uso.permanenteBytes + uso.edicaoBytes,
    totalQuotaBytes: QUOTA_TOTAL_BYTES,
  };
}
