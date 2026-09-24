// ============================================================
// Publica o progresso do preparo para a tela acompanhar ao vivo.
//
// No máximo uma escrita a cada 700 ms por projeto (o FFmpeg e o
// whisper avisam muito mais que isso), mas o começo e o fim de cada
// etapa sempre passam. Falha de Redis nunca derruba o job: progresso
// é conforto, não trabalho.
// ============================================================

import type Redis from 'ioredis';
import { VALIDADE_DO_PROGRESSO_S, chaveDoProgresso } from '@makucho/studio-contracts';
import type { EtapaDoPreparo } from '@makucho/studio-contracts';

const INTERVALO_MS = 700;
const ultimaEscrita = new Map<string, number>();

export async function publicarProgresso(
  redis: Redis,
  projectId: string,
  etapa: EtapaDoPreparo,
  pct: number,
  ouvidas?: string[],
): Promise<void> {
  const agora = Date.now();
  const valor = Math.max(0, Math.min(100, Math.round(pct)));
  const marco = valor <= 0 || valor >= 100;
  const chave = `${projectId}:${etapa}`;
  if (!marco && agora - (ultimaEscrita.get(chave) ?? 0) < INTERVALO_MS) return;
  ultimaEscrita.set(chave, agora);

  try {
    await redis.set(
      chaveDoProgresso(projectId),
      JSON.stringify({ etapa, pct: valor, ...(ouvidas?.length ? { ouvidas } : {}), em: agora }),
      'EX',
      VALIDADE_DO_PROGRESSO_S,
    );
  } catch {
    // Sem Redis, a tela cai no acompanhamento por etapa: continua certa.
  }
}
