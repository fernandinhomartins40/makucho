// ============================================================
// Efeitos sonoros embutidos: um catálogo, uma receita cada.
//
// Todos gerados pelo próprio FFmpeg (senoides com envelope, ruído
// filtrado): nenhuma licença a registrar, nada a baixar, nada ocupando o
// storage. O render usa a receita direto no filter_complex; a prévia toca
// o WAV que `apps/web/scripts/gerar-sons.mjs` gera com a MESMA receita.
// ============================================================

export const CATEGORIAS_DE_SOM = {
  transicao: 'Transição',
  impacto: 'Impacto',
  humor: 'Humor',
  suspense: 'Suspense',
  interface: 'Interface',
  reacao: 'Reação',
} as const;

export type CategoriaDeSom = keyof typeof CATEGORIAS_DE_SOM;

export interface DefinicaoDeSom {
  id: string;
  rotulo: string;
  categoria: CategoriaDeSom;
  descricao: string;
  quando: string;
  /** Fonte de áudio do FFmpeg (lavfi), a 48 kHz, com a duração nela. */
  receita: string;
}

export const SONS_EMBUTIDOS = [
  // ---------- Transição ----------
  {
    id: 'sfx-whoosh',
    rotulo: 'Whoosh',
    categoria: 'transicao',
    descricao: 'Passagem de ar.',
    quando: 'Transição, texto que entra de lado.',
    receita: 'anoisesrc=d=0.7:c=pink:r=48000:a=0.6,bandpass=f=1300:width_type=q:w=0.9,afade=t=in:d=0.35:curve=exp,afade=t=out:st=0.35:d=0.35',
  },
  {
    id: 'sfx-swipe',
    rotulo: 'Varrida',
    categoria: 'transicao',
    descricao: 'Varrida curta e aguda.',
    quando: 'Lista que passa, troca rápida.',
    receita: 'anoisesrc=d=0.32:c=white:r=48000:a=0.5,highpass=f=2500,afade=t=in:d=0.08,afade=t=out:st=0.1:d=0.22',
  },
  {
    id: 'sfx-zap',
    rotulo: 'Zap',
    categoria: 'transicao',
    descricao: 'Tom que cai rápido, elétrico.',
    quando: 'Corte seco com energia, virada de assunto.',
    receita: 'aevalsrc=exprs=0.5*sin(2*PI*(2000*t-3400*t*t))*exp(-9*t):s=48000:d=0.28',
  },
  {
    id: 'sfx-whoosh-grave',
    rotulo: 'Whoosh grave',
    categoria: 'transicao',
    descricao: 'Passagem pesada, lenta.',
    quando: 'Entrada de título grande, mudança de clima.',
    receita: 'anoisesrc=d=0.95:c=brown:r=48000:a=0.9,lowpass=f=700,afade=t=in:d=0.5:curve=exp,afade=t=out:st=0.5:d=0.45',
  },
  {
    id: 'sfx-reverso',
    rotulo: 'Sugada',
    categoria: 'transicao',
    descricao: 'Som que cresce e corta seco.',
    quando: 'Logo antes de um corte ou de uma revelação.',
    receita: 'anoisesrc=d=0.6:c=pink:r=48000:a=1,bandpass=f=1800:width_type=q:w=0.7,volume=3.5,afade=t=in:d=0.58:curve=cub',
  },
  // ---------- Impacto ----------
  {
    id: 'sfx-impacto',
    rotulo: 'Impacto',
    categoria: 'impacto',
    descricao: 'Grave seco com corpo.',
    quando: 'A frase mais forte, o número que importa.',
    receita: 'aevalsrc=exprs=0.95*sin(2*PI*(58+140*exp(-18*t))*t)*exp(-7*t):s=48000:d=0.6',
  },
  {
    id: 'sfx-boom',
    rotulo: 'Boom',
    categoria: 'impacto',
    descricao: 'Estrondo grave e longo.',
    quando: 'Revelação grande, abertura épica.',
    receita: 'aevalsrc=exprs=0.95*sin(2*PI*(38+90*exp(-10*t))*t)*exp(-2.6*t):s=48000:d=1.4',
  },
  {
    id: 'sfx-soco',
    rotulo: 'Soco',
    categoria: 'impacto',
    descricao: 'Pancada curta e abafada.',
    quando: 'Frase de efeito, "pá!".',
    receita: 'aevalsrc=exprs=0.9*sin(2*PI*(90+300*exp(-40*t))*t)*exp(-22*t):s=48000:d=0.25',
  },
  {
    id: 'sfx-tambor',
    rotulo: 'Tambor',
    categoria: 'impacto',
    descricao: 'Batida de tambor.',
    quando: 'Marcar o ritmo, contar itens.',
    receita: 'aevalsrc=exprs=0.8*sin(2*PI*(110+60*exp(-30*t))*t)*exp(-12*t):s=48000:d=0.4',
  },
  // ---------- Humor ----------
  {
    id: 'sfx-pop',
    rotulo: 'Pop',
    categoria: 'humor',
    descricao: 'Estalo curto e alegre.',
    quando: 'Texto ou emoji que aparece.',
    receita: 'aevalsrc=exprs=0.8*sin(2*PI*(420+2600*t)*t)*exp(-26*t):s=48000:d=0.2',
  },
  {
    id: 'sfx-boing',
    rotulo: 'Boing',
    categoria: 'humor',
    descricao: 'Mola que balança.',
    quando: 'Erro engraçado, pulo, algo inesperado.',
    receita: 'aevalsrc=exprs=0.6*sin(2*PI*(260*t+9*sin(2*PI*14*t)*exp(-4*t)))*exp(-3.5*t):s=48000:d=0.8',
  },
  {
    id: 'sfx-errado',
    rotulo: 'Wah-wah',
    categoria: 'humor',
    descricao: 'Duas notas que caem, de fracasso.',
    quando: '"Não deu certo", ironia.',
    receita: 'aevalsrc=exprs=0.4*sgn(sin(2*PI*if(lt(t\\,0.35)\\,392\\,330)*t))*exp(-2*mod(t\\,0.35)):s=48000:d=0.8,lowpass=f=1800',
  },
  {
    id: 'sfx-apito',
    rotulo: 'Apito',
    categoria: 'humor',
    descricao: 'Assobio que sobe.',
    quando: '"Olha isso", surpresa boa.',
    receita: 'aevalsrc=exprs=0.35*sin(2*PI*(1100*t+900*t*t))*(1-exp(-30*t))*exp(-2.5*t):s=48000:d=0.6',
  },
  // ---------- Suspense ----------
  {
    id: 'sfx-riser',
    rotulo: 'Subida',
    categoria: 'suspense',
    descricao: 'Tom que sobe e prepara.',
    quando: 'Logo antes da revelação.',
    receita: 'aevalsrc=exprs=0.35*sin(2*PI*(180*t+700*t*t)*1)*(t/1.2):s=48000:d=1.2,afade=t=out:st=1.1:d=0.1',
  },
  {
    id: 'sfx-drone',
    rotulo: 'Tensão',
    categoria: 'suspense',
    descricao: 'Grave contínuo que pulsa.',
    quando: 'Problema, "e aí veio o pior".',
    receita: 'aevalsrc=exprs=0.35*(sin(2*PI*55*t)+0.6*sin(2*PI*82.4*t))*(0.6+0.4*sin(2*PI*1.5*t)):s=48000:d=2.5,afade=t=in:d=0.4,afade=t=out:st=2:d=0.5',
  },
  {
    id: 'sfx-coracao',
    rotulo: 'Coração',
    categoria: 'suspense',
    descricao: 'Batimento duplo, tenso.',
    quando: 'Expectativa, momento de decisão.',
    receita: 'aevalsrc=exprs=0.9*sin(2*PI*60*t)*(exp(-30*t)+0.7*exp(-30*abs(t-0.22))*gte(t\\,0.22)):s=48000:d=0.7',
  },
  {
    id: 'sfx-tictac',
    rotulo: 'Relógio',
    categoria: 'suspense',
    descricao: 'Tique-taque.',
    quando: 'Prazo, "o tempo está acabando".',
    receita: 'aevalsrc=exprs=0.5*sin(2*PI*if(lt(mod(t\\,1)\\,0.5)\\,2600\\,2000)*t)*exp(-160*mod(t\\,0.5)):s=48000:d=2',
  },
  // ---------- Interface ----------
  {
    id: 'sfx-click',
    rotulo: 'Clique',
    categoria: 'interface',
    descricao: 'Toque seco.',
    quando: 'Detalhe, botão, escolha.',
    receita: 'aevalsrc=exprs=0.7*sin(2*PI*1800*t)*exp(-90*t):s=48000:d=0.07',
  },
  {
    id: 'sfx-ding',
    rotulo: 'Ding',
    categoria: 'interface',
    descricao: 'Sino curto.',
    quando: 'Dica, acerto, "anota isso".',
    receita: 'aevalsrc=exprs=0.45*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t))*exp(-6*t):s=48000:d=0.8',
  },
  {
    id: 'sfx-digitar',
    rotulo: 'Digitar',
    categoria: 'interface',
    descricao: 'Teclas em sequência.',
    quando: 'Texto sendo escrito, busca.',
    receita: 'aevalsrc=exprs=0.5*sin(2*PI*2400*t)*exp(-140*mod(t\\,0.09)):s=48000:d=0.54',
  },
  {
    id: 'sfx-camera',
    rotulo: 'Câmera',
    categoria: 'interface',
    descricao: 'Clique de foto.',
    quando: 'Print, foto, "registra".',
    receita: 'anoisesrc=d=0.18:c=white:r=48000:a=0.7,bandpass=f=3200:width_type=q:w=1.2,afade=t=in:d=0.005,afade=t=out:st=0.04:d=0.14',
  },
  {
    id: 'sfx-notificacao',
    rotulo: 'Notificação',
    categoria: 'interface',
    descricao: 'Duas notas de aviso.',
    quando: 'Mensagem, "chegou", lembrete.',
    receita: 'aevalsrc=exprs=0.4*sin(2*PI*if(lt(t\\,0.12)\\,880\\,1320)*t)*exp(-7*mod(t\\,0.12)):s=48000:d=0.5',
  },
  {
    id: 'sfx-sucesso',
    rotulo: 'Sucesso',
    categoria: 'interface',
    descricao: 'Três notas que sobem.',
    quando: 'Meta batida, resultado bom.',
    receita: 'aevalsrc=exprs=0.35*sin(2*PI*if(lt(t\\,0.1)\\,523\\,if(lt(t\\,0.2)\\,659\\,784))*t)*exp(-3*t):s=48000:d=0.8',
  },
  {
    id: 'sfx-erro',
    rotulo: 'Erro',
    categoria: 'interface',
    descricao: 'Zumbido de recusa.',
    quando: '"Isso está errado", mito derrubado.',
    receita: 'aevalsrc=exprs=0.35*sgn(sin(2*PI*140*t))*lt(mod(t\\,0.18)\\,0.13):s=48000:d=0.36,lowpass=f=2400',
  },
  // ---------- Reação ----------
  {
    id: 'sfx-glitch',
    rotulo: 'Glitch',
    categoria: 'reacao',
    descricao: 'Chiado digital.',
    quando: 'Erro, virada, "mas tem um problema".',
    receita: 'aevalsrc=exprs=0.5*sgn(sin(2*PI*(90+800*floor(mod(t*30\\,4)))*t)):s=48000:d=0.3,afade=t=out:st=0.2:d=0.1',
  },
  {
    id: 'sfx-tada',
    rotulo: 'Tchã-rã',
    categoria: 'reacao',
    descricao: 'Acorde de apresentação.',
    quando: 'Revelação do resultado, "olha só".',
    receita:
      'aevalsrc=exprs=0.22*(sin(2*PI*523*t)+sin(2*PI*659*t)+sin(2*PI*784*t)+0.6*sin(2*PI*1046*t))*if(lt(t\\,0.12)\\,1\\,1.2)*exp(-1.8*t):s=48000:d=1.2',
  },
] as const satisfies readonly DefinicaoDeSom[];

export type IdDeSomEmbutido = (typeof SONS_EMBUTIDOS)[number]['id'];

export function definicaoDoSom(id: string): DefinicaoDeSom | undefined {
  return (SONS_EMBUTIDOS as readonly DefinicaoDeSom[]).find((s) => s.id === id);
}
