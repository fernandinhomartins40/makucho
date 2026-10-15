// ============================================================
// A loudness de verdade, para a revisão final (EBU R128, o filtro ebur128
// do ffmpeg): cada trecho da fala no vídeo ORIGINAL e a trilha escolhida.
//
// O número do volume no plano não diz o que se ouve: uma trilha masterizada
// fica perto de -9 LUFS e a fala gravada no celular perto de -25 -- o mesmo
// "-14 dB" cobre a voz num vídeo e some no outro. Com a medida, a revisão
// acerta a trilha para ficar abaixo da voz e iguala os trechos de fala.
// ============================================================

import { execFile } from 'node:child_process';
import type { MedidasDoAudio } from '@makucho/studio-contracts';

/** A loudness integrada (LUFS) de um pedaço do arquivo; `null` quando não há som (silêncio, sem áudio). */
function loudness(arquivo: string, inicioS?: number, duracaoS?: number): Promise<number | null> {
  const args = ['-hide_banner', '-nostats'];
  if (inicioS !== undefined) args.push('-ss', inicioS.toFixed(3));
  if (duracaoS !== undefined) args.push('-t', duracaoS.toFixed(3));
  // Sem `framelog=quiet`: o ffmpeg 5.1 do worker não aceita (e o erro dele imprime um falso
  // "I: 0.0 LUFS"). O log por quadro vem junto; vale o resumo, a última linha "I:".
  args.push('-i', arquivo, '-vn', '-af', 'ebur128', '-f', 'null', '-');
  return new Promise((ok) => {
    execFile('ffmpeg', args, { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (erro, _saida, log) => {
      if (erro || !/Integrated loudness/.test(String(log))) return ok(null);
      // O resumo vem no fim: "Integrated loudness: ... I: -23.4 LUFS".
      const todas = [...String(log).matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)];
      const v = todas.length ? Number(todas[todas.length - 1]![1]) : NaN;
      ok(Number.isFinite(v) && v > -70 ? Math.round(v * 10) / 10 : null);
    });
  });
}

/**
 * A fala (cada trecho, no tempo do original) e a trilha. A voz do vídeo inteiro é a
 * média em energia dos trechos, pesada pela duração (como a loudness integrada faria).
 */
export async function medirAudio(original: string | null, trechos: ReadonlyArray<{ id: string; inicioMs: number; fimMs: number }>, musica: string | null): Promise<MedidasDoAudio> {
  const porTrecho: Record<string, number | null> = {};
  let energia = 0;
  let tempo = 0;
  if (original) {
    for (const t of trechos.slice(0, 40)) {
      const dur = Math.max(0.4, (t.fimMs - t.inicioMs) / 1000);
      const l = await loudness(original, t.inicioMs / 1000, dur);
      porTrecho[t.id] = l;
      if (l !== null) {
        energia += dur * 10 ** (l / 10);
        tempo += dur;
      }
    }
  }
  return {
    voz: tempo > 0 ? Math.round(10 * Math.log10(energia / tempo) * 10) / 10 : null,
    trechos: porTrecho,
    // A trilha: os dois primeiros minutos bastam para a loudness dela.
    musica: musica ? await loudness(musica, 0, 120) : null,
  };
}
