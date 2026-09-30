// ============================================================
// O item da timeline como FOCO de um pedido à IA.
//
// "Pedir à IA" na etiqueta de um item leva ele junto: o nome que a
// pessoa vê (o chip no campo do pedido) e uma descrição para a IA --
// tipo, texto, instante, layout, estilo, o que a animação explica. Assim
// "deixa maior", "troca a cor", "muda o texto" são sobre ESTE item, sem
// a IA precisar adivinhar do que se fala.
// ============================================================

import { NOME_DO_LAYOUT_DA_ANIMACAO, agendaDoPlano, definicaoDoEfeitoDeTela, estiloDeAnimacao, type EditPlanV1 } from '@makucho/studio-contracts';
import type { ItemDaTimeline } from '../components/timeline/camadas';

export interface FocoDaIa {
  /** O tipo e o id, como o contexto do comando espera. */
  tipo: string;
  id: string;
  /** O que aparece no chip ("Animação · Cartão citação · 12 s"). */
  rotulo: string;
  /** Para a IA (até 600 caracteres). */
  descricao: string;
  /** Pedidos que fazem sentido para este tipo de item. */
  exemplos: string[];
}

const s = (ms: number) => `${(ms / 1000).toFixed(1).replace('.0', '')} s`;
const curto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const NOME_DO_TEXTO: Record<string, string> = {
  HookTitle: 'Título da abertura',
  CTA: 'Chamada do fim',
  Destaque: 'Texto de destaque',
  LowerThird: 'Nome na tela',
  QuoteCard: 'Citação',
  StatCard: 'Número em destaque',
  EmojiPop: 'Emoji',
  LogoBug: 'Logo',
  ProgressBar: 'Barra de progresso',
  AnimatedCaption: 'Legenda animada',
  ImageOverlay: 'Imagem',
};

/** O foco de um item (trecho, texto, animação, mídia, som, legenda...). Null se sumiu do plano. */
export function focoDoItem(plan: EditPlanV1, alvo: { tipo: 'clipe'; id: string } | { tipo: 'item'; item: ItemDaTimeline }): FocoDaIa | null {
  if (alvo.tipo === 'clipe') {
    const t = agendaDoPlano(plan).trechos.find((x) => x.clip.id === alvo.id);
    if (!t) return null;
    const n = agendaDoPlano(plan).trechos.indexOf(t) + 1;
    return {
      tipo: 'trecho',
      id: t.clip.id,
      rotulo: `Trecho ${n} · ${s(t.inicioMs)}`,
      descricao: `trecho ${n} do vídeo (${t.clip.role}), de ${s(t.inicioMs)} a ${s(t.inicioMs + t.duracaoMs)} na timeline${t.velocidade !== 1 ? `, velocidade ${t.velocidade}x` : ''}${t.clip.effect ? `, efeito ${t.clip.effect}` : ''}`,
      exemplos: ['Corta as pausas deste trecho', 'Dá um zoom aqui', 'Deixa este trecho mais rápido'],
    };
  }
  const i = alvo.item;
  switch (i.tipo) {
    case 'midia': {
      const m = (plan.mediaLayers ?? []).find((x) => x.id === i.id);
      if (!m) return null;
      const quando = `de ${s(m.timelineStartMs)} a ${s(m.timelineStartMs + m.durationMs)}`;
      if (m.kind === 'html' && m.composicao) {
        const c = m.composicao;
        const estilo = estiloDeAnimacao(c.estilo)?.nome;
        let explica = '';
        try {
          const b = JSON.parse(c.briefing ?? '{}') as { tipo?: string; ideia?: string; conteudo?: string };
          explica = [b.tipo && `cartão ${b.tipo}`, b.ideia && `explica "${curto(b.ideia, 120)}"`, b.conteudo && `conteúdo ${curto(b.conteudo, 160)}`].filter(Boolean).join('; ');
        } catch {
          // sem briefing: vale o título
        }
        return {
          tipo: 'midia',
          id: m.id,
          rotulo: `Animação · ${curto(c.titulo ?? 'sem título', 28)} · ${s(m.timelineStartMs)}`,
          descricao: `animação HyperFrames "${c.titulo ?? ''}" ${quando}, layout ${NOME_DO_LAYOUT_DA_ANIMACAO[c.layout] ?? c.layout}${c.lado ? ` (painel ${c.lado})` : ''}${c.canto ? ` (vídeo no canto ${c.canto})` : ''}${estilo ? `, estilo ${estilo}` : ''}${c.paleta ? `, paleta ${c.paleta}` : ''}${explica ? `; ${explica}` : ''}`,
          exemplos: ['Deixa o texto maior', 'Troca para outro estilo', 'Muda para tela cheia'],
        };
      }
      const tipo = m.kind === 'video' ? 'vídeo' : m.kind === 'html' ? 'animação' : 'imagem';
      return {
        tipo: 'midia',
        id: m.id,
        rotulo: `${tipo[0]!.toUpperCase()}${tipo.slice(1)} · ${s(m.timelineStartMs)}`,
        descricao: `${tipo} sobreposta ${quando}, composição ${m.layout}${m.cena ? `, cena ${m.cena.layout}` : ''}`,
        exemplos: ['Deixa em tela cheia', 'Mostra por menos tempo', 'Coloca uma moldura'],
      };
    }
    case 'elemento': {
      const o = plan.overlays.find((x) => x.id === i.id);
      if (!o) return null;
      const nome = NOME_DO_TEXTO[o.component] ?? o.component;
      return {
        tipo: 'elemento',
        id: o.id,
        rotulo: `${nome}${o.text ? ` · "${curto(o.text, 24)}"` : ''}`,
        descricao: `${nome} (${o.component})${o.text ? ` com o texto "${curto(o.text, 200)}"` : ''}, de ${s(o.timelineStartMs)} a ${s(o.timelineStartMs + o.durationMs)}${o.style ? `, estilo ${curto(JSON.stringify(o.style), 160)}` : ''}`,
        exemplos: ['Deixa mais chamativo', 'Reescreve mais curto', 'Muda a cor para amarelo'],
      };
    }
    case 'legenda':
      return {
        tipo: 'legenda',
        id: i.manualId ?? i.id,
        rotulo: `Legenda · "${curto(i.texto, 26)}"`,
        descricao: `bloco de legenda "${curto(i.texto, 200)}" de ${s(i.inicioMs)} a ${s(i.fimMs)}${i.manualId ? ' (escrita à mão)' : ` (palavras ${i.wordIds.slice(0, 12).join(',')})`}`,
        exemplos: ['Corrige o texto desta legenda', 'Sobe esta legenda', 'Destaca a palavra principal'],
      };
    case 'som': {
      const e = plan.soundEffects.find((x) => x.id === i.id);
      if (!e) return null;
      return { tipo: 'som', id: e.id, rotulo: `Som · ${s(e.timelineStartMs)}`, descricao: `efeito sonoro ${e.assetId} em ${s(e.timelineStartMs)}, volume ${e.gainDb ?? 0} dB`, exemplos: ['Troca por outro som', 'Mais baixo', 'Tira este som'] };
    }
    case 'efeito': {
      const e = (plan.screenEffects ?? []).find((x) => x.id === i.id);
      if (!e) return null;
      const nome = definicaoDoEfeitoDeTela(e.type)?.rotulo ?? e.type;
      return { tipo: 'efeito', id: e.id, rotulo: `Efeito · ${nome}`, descricao: `efeito de tela ${nome} (${e.type}) de ${s(e.timelineStartMs)} a ${s(e.timelineStartMs + e.durationMs)}, intensidade ${e.intensity ?? 1}`, exemplos: ['Mais suave', 'Troca por outro efeito', 'Dura mais'] };
    }
    case 'narracao': {
      const n = (plan.voiceovers ?? []).find((x) => x.id === i.id);
      if (!n) return null;
      return { tipo: 'narracao', id: n.id, rotulo: `Narração · ${s(n.timelineStartMs)}`, descricao: `narração de ${s(n.timelineStartMs)} a ${s(n.timelineStartMs + n.durationMs)}`, exemplos: ['Mais alto', 'Começa depois', 'Abaixa a música embaixo dela'] };
    }
    case 'corte':
      return { tipo: 'transicao', id: i.clipId, rotulo: `Transição · ${s(i.ms)}`, descricao: `a passagem entre trechos em ${s(i.ms)} (a transição mora no trecho ${i.clipId}, que entra)`, exemplos: ['Coloca uma transição suave', 'Deixa um corte seco', 'Transição mais rápida'] };
    case 'audio':
      return { tipo: 'audio', id: i.id, rotulo: 'Som do trecho', descricao: `o som do trecho ${i.id}`, exemplos: ['Tira o ruído', 'Mais alto', 'Deixa mudo'] };
    case 'trilha':
      return plan.music
        ? { tipo: 'trilha', id: 'trilha', rotulo: 'Música de fundo', descricao: `a música de fundo (${plan.music.assetId}), volume ${plan.music.gainDb ?? ''} dB`, exemplos: ['Música mais animada', 'Mais baixa', 'Abaixa quando falo'] }
        : null;
    default:
      return null;
  }
}
