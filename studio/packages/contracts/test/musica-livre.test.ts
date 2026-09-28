// ============================================================
// Música e sons livres: a ordem das trilhas e o crédito.
// ============================================================

import { buscaDeAudioSchema, creditoDoAsset, creditoDoAudio, ordenarTrilhas } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const f = (id: string, instrumental: boolean, duracaoMs: number) => ({ id, instrumental, duracaoMs });
const ordem = ordenarTrilhas([f('vocal', false, 200_000), f('curta', true, 20_000), f('nao-cobre', true, 40_000), f('boa', true, 90_000)], 60_000).map((x) => x.id);
t('instrumental que cobre o vídeo vem primeiro', ordem[0] === 'boa');
t('com voz fica por último', ordem[ordem.length - 1] === 'vocal');
t('curta demais perde para a que só não cobre', ordem.indexOf('nao-cobre') < ordem.indexOf('curta'));

const credito = creditoDoAudio({ tipo: 'musica', titulo: 'Upbeat', autor: 'Fulano', origem: 'Jamendo (Openverse)', pagina: 'https://j/1', licenca: { nome: 'CC BY 3.0' } });
t('crédito com título, autor, licença, origem e link', credito === 'Música: "Upbeat" de Fulano (CC BY 3.0), via Jamendo (Openverse) -- https://j/1');

const asset = { kind: 'MUSIC', originalName: 'Upbeat -- Fulano.mp3', license: { holder: 'Fulano', url: 'https://j/1', notes: 'Jamendo (Openverse) · CC BY 3.0 · crédito ao autor obrigatório' } };
t('crédito refeito a partir da licença gravada no arquivo', creditoDoAsset(asset) === credito);
t('CC0 não pede crédito', creditoDoAsset({ ...asset, license: { holder: 'x', notes: 'Freesound · CC0' } }) === null);

t('busca pede palavra ou clima', !buscaDeAudioSchema.safeParse({ tipo: 'musica' }).success && buscaDeAudioSchema.safeParse({ tipo: 'musica', clima: 'calma' }).success);

console.log(`
${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
