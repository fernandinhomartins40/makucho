// ============================================================
// As skills da IA do Studio.
//
// Uma skill é um pacote de OFÍCIO: o que um profissional daquela área
// sabe e a IA passa a saber sempre que faz aquele trabalho -- técnicas,
// receitas que funcionam nas regras do Studio, os erros de amador e a
// conferência antes de entregar. É o mesmo formato das skills que a
// comunidade usa com agentes (HyperFrames, video-use, Remotion): texto
// em arquivo, carregado no começo do pedido.
//
// Diferença para um prompt: o prompt diz O QUE fazer nesta chamada; a
// skill diz COMO se faz bem, e serve a várias chamadas. Fica em arquivo
// próprio, com versão no nome, pelo mesmo motivo dos prompts: mudar a
// skill é criar a `-v2.md` e trocar aqui.
// ============================================================

import { Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERSAO_DA_SKILL = {
  // Motion graphics: batidas, tempo e curvas, vocabulário de movimento,
  // receitas de GSAP/SVG e arquétipos de cena (adaptado das skills
  // motion-graphics e hyperframes-animation do HyperFrames, Apache 2.0).
  // v2: executar o plano da direção (batidas com o segundo medido), os
  // números da casa e os sinais de design feito por IA.
  // v3: sem o esqueleto fixo de fundo (5 cenas saíam iguais), a série
  // diferente e os componentes do catálogo como ponto de partida.
  'motion-graphics': 'motion-graphics-v3',
} as const;

export type NomeDeSkill = keyof typeof VERSAO_DA_SKILL;

const log = new Logger('Skills');
const carregadas = new Map<string, string>();

/**
 * O texto de uma skill e a versão em uso. Lida uma vez e guardada.
 *
 * Skill ausente é erro de empacotamento, mas não derruba o vídeo: a IA
 * trabalha sem ela (pior, mas trabalha) e o erro fica no log.
 */
export function skill(nome: NomeDeSkill): { texto: string; versao: string } {
  const versao = VERSAO_DA_SKILL[nome];
  let texto = carregadas.get(versao);
  if (texto === undefined) {
    const caminho = join(__dirname, 'skills', `${versao}.md`);
    try {
      texto = readFileSync(caminho, 'utf8').trim();
    } catch {
      log.error(`skill ${versao} não encontrada em ${caminho}: a IA segue sem ela`);
      texto = '';
    }
    carregadas.set(versao, texto);
  }
  return { texto, versao };
}
