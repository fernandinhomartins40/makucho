// ============================================================
// Biblioteca do editor: o que cada recurso É e PARA QUE serve.
//
// Um lugar só para o nome, a descrição e o "quando usar" de cada
// transição, efeito de trecho, som e elemento -- a timeline, o painel de
// propriedades e a biblioteca mostram os mesmos textos. Quem edita
// escolhe pelo efeito que quer causar, não pelo nome técnico.
// ============================================================

import type { CategoriaDeTransicao, EfeitoSonoroEmbutido, TipoDeTransicao } from '@makucho/studio-contracts';
import { TRANSICOES_DO_CATALOGO } from '@makucho/studio-contracts';

export interface ItemDaBiblioteca<T extends string = string> {
  id: T;
  rotulo: string;
  descricao: string;
  /** Quando usar, em uma frase. */
  quando: string;
}

/** As transições vêm do catálogo único (contracts/transicoes.ts). */
export const TRANSICOES: ReadonlyArray<ItemDaBiblioteca<TipoDeTransicao> & { categoria: CategoriaDeTransicao; somSugerido?: string; pesada?: boolean }> =
  TRANSICOES_DO_CATALOGO.map((t) => ({
    id: t.id as TipoDeTransicao,
    rotulo: t.rotulo,
    descricao: t.descricao,
    quando: t.quando,
    categoria: t.categoria,
    somSugerido: t.somSugerido,
    pesada: t.pesada,
  }));

export const NOME_DA_TRANSICAO: Record<string, string> = Object.fromEntries(TRANSICOES.map((t) => [t.id, t.rotulo]));

export const EFEITOS_DE_TRECHO: ReadonlyArray<ItemDaBiblioteca<'nenhum' | 'punch_in' | 'zoom_lento'>> = [
  { id: 'nenhum', rotulo: 'Sem efeito', descricao: 'O enquadramento original.', quando: 'Trechos calmos, explicação longa.' },
  { id: 'punch_in', rotulo: 'Zoom rápido', descricao: 'Aproxima 12% de uma vez no trecho inteiro.', quando: 'Frase forte, ou disfarçar o pulo entre dois cortes do mesmo plano.' },
  { id: 'zoom_lento', rotulo: 'Zoom lento', descricao: 'Aproxima devagar ao longo do trecho.', quando: 'Abertura parada, história, suspense.' },
];

export const NOME_DO_EFEITO: Record<string, string> = Object.fromEntries(EFEITOS_DE_TRECHO.map((e) => [e.id, e.rotulo]));

export const SONS: ReadonlyArray<ItemDaBiblioteca<EfeitoSonoroEmbutido>> = [
  { id: 'sfx-whoosh', rotulo: 'Whoosh', descricao: 'Passagem de ar.', quando: 'Transição, texto que entra de lado.' },
  { id: 'sfx-swipe', rotulo: 'Varrida', descricao: 'Varrida curta e aguda.', quando: 'Lista que passa, troca rápida.' },
  { id: 'sfx-pop', rotulo: 'Pop', descricao: 'Estalo curto e alegre.', quando: 'Texto ou emoji que aparece.' },
  { id: 'sfx-click', rotulo: 'Clique', descricao: 'Toque seco.', quando: 'Detalhe, botão, escolha.' },
  { id: 'sfx-riser', rotulo: 'Subida', descricao: 'Tom que sobe e prepara.', quando: 'Logo antes da revelação.' },
  { id: 'sfx-impacto', rotulo: 'Impacto', descricao: 'Grave seco com corpo.', quando: 'A frase mais forte, o número que importa.' },
  { id: 'sfx-ding', rotulo: 'Ding', descricao: 'Sino curto.', quando: 'Dica, acerto, "anota isso".' },
  { id: 'sfx-digitar', rotulo: 'Digitar', descricao: 'Teclas em sequência.', quando: 'Texto sendo escrito, busca.' },
  { id: 'sfx-camera', rotulo: 'Câmera', descricao: 'Clique de foto.', quando: 'Print, foto, "registra".' },
  { id: 'sfx-glitch', rotulo: 'Glitch', descricao: 'Chiado digital.', quando: 'Erro, virada, "mas tem um problema".' },
];

export const NOME_DO_SOM: Record<string, string> = Object.fromEntries(SONS.map((s) => [s.id, s.rotulo]));

export const ELEMENTOS: ReadonlyArray<ItemDaBiblioteca & { exemplo: string; duracaoMs: number }> = [
  { id: 'HookTitle', rotulo: 'Título', descricao: 'A promessa do vídeo, no topo.', quando: 'Nos primeiros 3 segundos.', exemplo: 'Pare de perder vendas', duracaoMs: 3000 },
  { id: 'Destaque', rotulo: 'Destaque', descricao: 'Palavra-chave ou frase forte, livre na tela.', quando: 'No momento mais importante da fala.', exemplo: 'RESPONDA RÁPIDO', duracaoMs: 2500 },
  { id: 'CTA', rotulo: 'Chamada', descricao: 'O que a pessoa deve fazer agora.', quando: 'No fim: seguir, comentar, salvar.', exemplo: 'Siga para mais dicas', duracaoMs: 3000 },
  { id: 'LowerThird', rotulo: 'Rodapé', descricao: 'Nome e cargo de quem fala ("Nome | cargo").', quando: 'Na primeira aparição de alguém.', exemplo: 'Ana Souza | Consultora', duracaoMs: 3500 },
  { id: 'QuoteCard', rotulo: 'Citação', descricao: 'Uma frase em destaque, entre aspas.', quando: 'Depoimento, frase que vale print.', exemplo: 'Cliente que espera, compra do outro', duracaoMs: 3500 },
  { id: 'StatCard', rotulo: 'Número', descricao: 'Um número grande com legenda ("87% | dos clientes").', quando: 'Dado que prova o que você diz.', exemplo: '87% | dos clientes voltam', duracaoMs: 3000 },
];
