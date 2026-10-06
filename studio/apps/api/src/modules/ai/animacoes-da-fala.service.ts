// ============================================================
// As animações (HyperFrames) que a IA cria a partir da fala -- na
// montagem, no "Peça à IA" e no editor (refazer, trocar o estilo).
//
// Não passa pelas voltas do agente: escrever uma animação inteira
// (html + css + script) é uma resposta longa. Aqui são chamadas
// próprias, com mais tempo e em paralelo:
//
//   1. planejar -- o storyboard da skill talking-head-recut do HyperFrames:
//      UM estilo para o vídeo (pelo tom da fala, entre os do catálogo
//      ESTILOS_DE_ANIMACAO) e os cartões pela densidade da fala, com tipo,
//      layout e conteúdo variados;
//   2. escrever -- uma chamada por cartão, com a referência do estilo e a
//      doutrina de movimento do HyperFrames;
//   3. conferir -- a checagem do Studio e o lint do HyperFrames; o que
//      falhar volta UMA vez para a IA corrigir.
//
// Cada animação guarda o estilo e o briefing (tipo, ideia, conteúdo):
// é o que permite refazê-la em outro estilo ou lugar sem perder o que
// ela explica. O resultado (ou o motivo de não ter animação) fica no
// projeto (`animationNote`), para o editor mostrar.
// ============================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import sharp from 'sharp';
import {
  ESTILOS_DE_ANIMACAO,
  REGRAS_DA_ANIMACAO_HTML,
  agendaDoPlano,
  aplicarComando,
  composicaoHtmlSchema,
  coresDaPaleta,
  PALETAS_DE_ANIMACAO,
  REGRAS_DE_DESIGN,
  textoDosComponentes,
  temaDaAnimacao,
  textoDoTema,
  estiloDeAnimacao,
  problemasDaComposicao,
  type CamadaDeMidia,
  type CantoDoPip,
  CANTOS_DO_PIP,
  textoDaGrade,
  type ComposicaoHtml,
  type EditPlanV1,
  type EstiloDeAnimacao,
  type TimelineOperation,
  analiseDaIaSchema,
  conferirCartoes,
  janelasReservadasDoPlano,
  lerDirecao,
  numerosInventados,
  papeisNoTempo,
  tetoDeCartoes,
  textoVisivelDoHtml,
  zoomsEscondidos,
  ehLiquidGlass,
  REGRAS_DO_LIQUID_GLASS,
  type AnaliseDaIa,
  type CartaoDescartado,
  type JanelaReservada,
  type RelatorioDasAnimacoes,
  CORES_PADRAO_DA_MARCA,
  areaDaComposicao,
  janelaDaComposicao,
  INSTANTES_DAS_FOTOS,
  NOTA_MINIMA_DA_CENA,
  type CartaoDirigido,
  REGRAS_LIVRES,
  VERBOS_DE_MOVIMENTO,
  indiceDasEsteticas,
  indiceDasTecnicas,
  lerOlhar,
  moduloDaTecnica,
  perfilDoVideo,
  resumoDoPerfil,
  tecnicaDeCena,
  textoDoPerfil,
  textoDoPlano,
  type OlharDoVideo,
  type PerfilDoVideo,
  designDoVideo,
  lerCritica,
  listaDeFontes,
  temaLivreSchema,
  textoDoDesign,
  type CriticaDaCena,
  type DesignDoVideo,
  type ModeloDeIa,
  type Raciocinio,
  VISUAIS_DE_MOTION,
  cenaDaComposicao,
  cenaIncompleta,
  composicaoDoPreset,
  layoutDoPreset,
  lerTextosDaCena,
  presetDeMotion,
  textoDaCena,
  textoDosAssets,
  textoDosIcones,
  usarIconesDuotone,
  textoDosPresets,
  textoDosVisuais,
  visualDeMotion,
  NOME_DO_FORMATO,
  type CenaDeMotion,
  type FormatoDeConteudo,
  type VisualDeMotion,
  type RegrasDaDirecao,
} from '@makucho/studio-contracts';
import { CATEGORIAS_DOS_ICONES, ICONES_PHOSPHOR } from '@makucho/studio-contracts/dist/icones-phosphor';
import { Prisma } from '@makucho/studio-database';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import type { TenantContext } from '../../common/tenant';
import { AnimacoesService } from '../animacoes/animacoes.service';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AiService } from './ai.service';
import { referenciaDoEstilo } from './hyperframes/estilos';
import { EXEMPLO_LIQUID_GLASS } from './hyperframes/liquid-glass-exemplo';
import { skill } from './skills';

// v4: a DIREÇÃO no lugar da cota -- cada cartão com gatilho na fala,
// fidelidade conferida, espaço reservado e respiro (direcao-visual.ts).
// v5: a escrita carrega a skill de motion graphics (skills.ts).
const VERSAO = 'animar-fala-v5';
/** Uma animação é uma resposta longa: mais tempo que as outras chamadas. */
const TEMPO_PARA_ESCREVER_MS = 240_000;
/** Quantas animações a IA escreve ao mesmo tempo (o provedor limita as simultâneas). */
const ESCRITAS_SIMULTANEAS = 3;
/** Teto da resposta da direção: com 8 cartões e o conteúdo de cada um, 3 mil cortava o JSON. */
const MAX_TOKENS_DA_DIRECAO = 8000;
/** A nota enquanto a IA trabalha (termina em "…": a tela acompanha até mudar). */
export const NOTA_REFAZENDO = 'Refazendo as animações…';

export type LayoutDaAnimacao = 'meio_a_meio' | 'cartao' | 'tela_cheia' | 'pip';
const LAYOUTS: readonly LayoutDaAnimacao[] = ['meio_a_meio', 'cartao', 'tela_cheia', 'pip'];

interface Momento {
  inicioS: number;
  fimS: number;
  layout: LayoutDaAnimacao;
  /** No meio a meio: onde fica o painel (cima = rosto embaixo; baixo = rosto em cima). */
  lado?: 'cima' | 'baixo';
  divisao?: number;
  foco?: number;
  /** No pip: o canto da janela do vídeo. */
  canto?: CantoDoPip;
  /** O tipo de cartão (número, lista, citação...), para variar. */
  tipo: string;
  ideia: string;
  /** kicker, título, detalhe, dado, citação, itens -- o que o cartão diz. */
  conteudo: string;
  /** Qual das cores de destaque do estilo (0 a 4). */
  acento: number;
  /** Direção livre: a encenação da cena (o que aparece, em que ordem, o que se move). */
  conceito?: string;
  /** Direção livre: a técnica da cena (chave de TECNICAS_DE_CENA). */
  tecnica?: string;
  palavras: Array<{ s: number; texto: string }>;
}

/** O que mudar ao refazer uma animação que já está no vídeo. */
export interface OpcoesDeRefazer {
  estilo?: string;
  /** "clima:indice" de PALETAS_DE_ANIMACAO; "" tira a paleta (volta às cores do estilo). */
  paleta?: string;
  layout?: LayoutDaAnimacao;
  lado?: 'cima' | 'baixo';
  canto?: CantoDoPip;
  /** O pedido da pessoa ("troca o azul pelo verde", "deixa o número maior"). */
  pedido?: string;
}

/** Um trecho para animar (o "Peça à IA" pede assim, sem escrever o HTML). */
export interface PedidoDeTrecho {
  inicioS: number;
  fimS: number;
  layout: LayoutDaAnimacao;
  lado?: 'cima' | 'baixo';
  canto?: CantoDoPip;
  tipo?: string;
  ideia: string;
  /** A encenação da cena (o que aparece, em que ordem, o que se move). */
  conceito?: string;
  /** A técnica (chave de TECNICAS_DE_CENA). */
  tecnica?: string;
  conteudo?: string;
  estilo?: string;
  paleta?: string;
  /** A cena pronta escolhida por quem pediu (o agente): com os textos, monta sem chamar a IA. */
  preset?: string;
  textos?: unknown;
}

const TECNOLOGIA = estiloDeAnimacao('tecnologia')!;

/** Exemplo completo (já no formato html/css/script) do estilo tecnologia. */
const EXEMPLO_TECNOLOGIA = JSON.stringify({
  titulo: 'Gemini 3.8 Flash TTS',
  html: `<div class="painel"><div class="selo" id="selo"><i style="background:#4285F4"></i><i style="background:#EA4335"></i><i style="background:#FBBC04"></i><i style="background:#34A853"></i><span>Novo do Google</span></div><div class="titulo"><span class="p" id="p1">Gemini</span> <span class="p grad" id="p2">3.8</span></div><div class="player" id="player"><div class="barras" id="barras"></div></div><div class="escala" id="escala"><span>Robótica</span><div class="trilho"><div class="enche" id="enche"></div></div><span id="natural">Natural</span></div></div>`,
  css: `.painel { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 45% at 50% 0%, rgba(66,133,244,.22), transparent 70%), #0B0E13; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
.selo { display: flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 40px; background: rgba(255,255,255,.06); border: 2px solid rgba(255,255,255,.10); font-size: 30px; color: #F1F3F4; }
.selo i { width: 13px; height: 13px; border-radius: 50%; display: block; } .selo span { margin-left: 12px; }
.titulo { font-family: 'Inter ExtraBold'; font-size: 112px; line-height: 1.05; display: flex; gap: 26px; color: #F1F3F4; } .p { display: inline-block; } .grad { color: #4285F4; }
.player { width: 900px; height: 130px; border-radius: 36px; background: #1E2126; border: 2px solid rgba(255,255,255,.10); display: flex; align-items: center; padding: 0 32px; }
.barras { flex: 1; height: 80px; display: flex; align-items: center; gap: 7px; } .barras b { display: block; width: 8px; border-radius: 4px; background: #7BAAF7; }
.escala { width: 900px; display: flex; align-items: center; gap: 22px; font-size: 32px; color: #9AA0A6; }
.trilho { flex: 1; height: 12px; border-radius: 6px; background: rgba(255,255,255,.1); overflow: hidden; }
.enche { height: 100%; width: 100%; background: linear-gradient(90deg, #EA4335, #FBBC04, #34A853); transform-origin: 0 50%; }`,
  script: `var barras = document.getElementById('barras');
[30,55,22,70,40,62,28,75,35,58,24,68,45,30,72,38,60,26,66,42].forEach(function (h) { var b = document.createElement('b'); b.style.height = h + 'px'; barras.appendChild(b); });
tl.fromTo('.painel', { scale: 1 }, { scale: 1.05, duration: 6, ease: 'none' }, 0)
  .fromTo('#selo', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0)
  .fromTo('#p1', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0.5)
  .fromTo('#p2', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 1.0)
  .fromTo('#player', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 1.6)
  .fromTo('#barras b', { scaleY: 0.2, opacity: 0.35 }, { scaleY: 1, opacity: 1, duration: 0.25, stagger: 0.02 }, 1.8)
  .fromTo('#escala', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.8)
  .fromTo('#enche', { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power2.inOut' }, 2.9)
  .to('#natural', { color: '#34A853', scale: 1.15, duration: 0.25, ease: 'back.out(1.5)' }, 4.6)
  .to('.painel', { opacity: 0, y: -30, duration: 0.3, ease: 'power2.in' }, 5.7);`,
});

const TIPOS_DE_CARTAO = [
  'numero (estatística que conta até o valor)',
  'lista (itens que entram um a um, com check)',
  'comparacao (A x B, antes x depois, errado x certo)',
  'citacao (a frase mais forte, em destaque tipográfico)',
  'passos (passo a passo / linha do tempo que se desenha)',
  'grafico (barras ou linha que crescem com a fala)',
  'termo (definição de um nome ou conceito)',
  'pergunta (a pergunta que a fala responde)',
  'destaque (uma palavra-chave enorme, tipografia cinética)',
] as const;

/** A lista de estilos, para a IA escolher (montagem e "Peça à IA"). */
export function listaDeEstilos(): string {
  const grupo = (f: EstiloDeAnimacao['familia'], titulo: string) =>
    `${titulo}:\n` + ESTILOS_DE_ANIMACAO.filter((e) => e.familia === f).map((e) => `- ${e.chave} (${e.nome}): ${e.carater}. Para: ${e.quando}.`).join('\n');
  return [
    grupo('motion', 'Motion -- cenas prontas (o padrão: montadas na hora, trocar o visual não chama a IA)'),
    grupo('cartao', 'Cartões (skill talking-head-recut)'),
    grupo('identidade', 'Identidades visuais (com o caráter do movimento)'),
    grupo('preset', 'Presets de quadro (sistemas de design completos)'),
    grupo('referencia', 'Referência do Studio'),
    grupo('exclusivo', 'Exclusivos do Studio (Liquid Glass: o vidro da Apple -- o visual mais moderno do catálogo)'),
  ].join('\n');
}

/** As paletas (climas de cor), para recolorir um estilo. */
export function listaDePaletas(): string {
  return PALETAS_DE_ANIMACAO.map((p) => `- ${p.chave} (${p.nome}): ${p.clima}. Conjuntos 0-${p.conjuntos.length - 1}, ex.: ${p.conjuntos[0]!.join(' ')}`).join('\n');
}

/**
 * A direção visual: decide ONDE um cartão ajuda -- e onde não entra nada.
 * Não há cota: cada cartão precisa de um gatilho na fala, e zero vale.
 */
function sistemaDaDirecao(duracaoS: number): string {
  return `Você é o DIRETOR VISUAL de um vídeo vertical 9:16 de alguém falando (método HyperFrames / talking-head-recut). Decide ONDE um cartão gráfico animado ajuda quem assiste a entender -- e onde NÃO entra nada.
PRINCÍPIO: o rosto e a fala contam a história. O cartão só entra quando MOSTRA algo que a fala sozinha não mostra bem. Cartão para "enfeitar" ou para "ter algo na tela" é um erro. ZERO cartões é uma resposta válida (desabafo, história pessoal, vídeo curto sem dado nenhum).

1. Leia a fala inteira e o que a IA já entendeu do vídeo (assunto, promessa, papel de cada trecho). Decida o TOM ("o que quem assiste deve SENTIR?") e escolha UM estilo para o vídeo todo, pelo tom (não pelo assunto):
${listaDeEstilos()}

2. GATILHOS -- só estes pedem cartão (o tipo entre parênteses):
- um número, porcentagem, valor ou prazo DITO (numero): conta até o valor dito;
- dois ou mais números relacionados ditos (grafico);
- três ou mais itens enumerados ("primeiro... segundo...", "são três coisas") (lista);
- uma sequência de ações ("abre, clica, confirma") (passos);
- dois lados ditos: antes x depois, errado x certo, A x B (comparacao);
- um nome técnico ou conceito que quem assiste pode não conhecer (termo);
- a frase-tese do vídeo, na conclusão (citacao) -- no máximo uma;
- uma pergunta retórica dita que o vídeo responde (pergunta);
- a palavra-chave da virada (destaque) -- no máximo uma.
Sem um desses gatilhos, não há cartão.

3. REGRAS (o servidor confere e DESCARTA o cartão que não cumpre):
- "gatilho": copie LITERALMENTE as palavras da fala que pedem o cartão. Gatilho que não está na fala do trecho = cartão descartado.
- Conteúdo 100% fiel: só números, nomes e itens DITOS. Número que não foi dito = cartão descartado. Não arredonde, não complete, não invente estatística.
- Nunca entre nos ESPAÇOS RESERVADOS da entrada (título da abertura, chamada do fim, mídias já no vídeo).
- Respiro: no máximo METADE do vídeo com cartão; 1 s ou mais entre dois cartões; nunca dois do mesmo tipo seguidos; no máximo ${tetoDeCartoes(duracaoS)} cartões -- é um TETO, não uma meta.
- Prefira os trechos de prova, solução, insight e conclusão; o gancho já tem o título da abertura.
- "prioridade": 1 = sem o cartão o ponto se perde; 2 = ajuda de verdade; 3 = só enfeita (não mande).
- Cada cartão começa na palavra do gatilho (até 0,3 s antes) e dura o raciocínio que mostra (3 a 10 s).

4. Layout de cada cartão: meio_a_meio (o cartão ocupa metade da tela e o rosto a outra; lado "cima" = cartão em cima, rosto embaixo; "baixo" = rosto em cima, cartão embaixo -- o melhor para dados e listas), cartao (cartão menor por cima do vídeo, fora do rosto -- um termo, um número rápido, uma citação curta), tela_cheia (só o ponto alto: no máximo um) ou pip (o cartão ocupa a tela e o rosto vai para uma janela num canto -- "canto": sup-esq|sup-dir|inf-esq|inf-dir; para conteúdo denso: gráfico, lista longa, passo a passo). Alterne para dar ritmo.

5. Conteúdo: textos curtos em português (kicker de 1-3 palavras, título de até 6 palavras, detalhe de até 12, os números EXATOS ditos, os itens da lista como foram ditos).

Responda SÓ com JSON, sem texto fora dele: {"estilo":"chave","tom":"uma frase","cartoes":[{"inicioS":12.3,"fimS":19.8,"layout":"meio_a_meio","lado":"cima","canto":null,"tipo":"numero","gatilho":"palavras exatas da fala","intencao":"o que o cartão explica","conteudo":{"kicker":"...","titulo":"...","detalhe":"...","dado":"...","itens":["..."]},"prioridade":1,"acento":0}]}. Instantes em segundos do vídeo final, iguais aos da fala. Sem cartão: "cartoes": [].`;
}

/** A doutrina de movimento do HyperFrames (motion-doctrine + "Motion that reads premium"), resumida. */
const DOUTRINA_DE_MOVIMENTO = `MOVIMENTO (doutrina do HyperFrames -- é o que separa um cartão premium de um slide):
1. Todo movimento diz algo: chama o olho para o que a fala diz AGORA, mostra uma mudança (número que conta, barra que enche, linha que se desenha, item que é riscado) ou liga um momento ao outro. Movimento decorativo sai.
2. Revelação em etapas, no ritmo das palavras: o cartão vai GANHANDO informação a cada palavra-chave. Pause em qualquer segundo: algo significativo está acontecendo. Nunca monte tudo no primeiro segundo e congele.
3. Ação sobreposta: dois elementos nunca começam no mesmo instante; o próximo começa enquanto o anterior assenta; stagger total até 0.5 s.
4. Entrada até 0.8 s com ease de saída (power3.out, expo.out ou back.out(1.4-1.7) para objetos com "peso"); nunca bounce/elastic. Saída com ease de entrada (power2.in), ~75% da duração da entrada. Impacto (carimbo que bate) com ease .in.
5. Uma história por movimento: subir + aparecer, sim; subir + girar + escalar + desfocar ao mesmo tempo, não.
6. Overshoot só em transformações. Número conta até o valor dito e para nele -- nunca passa e volta.
7. Pausa dramática de 0.3-0.75 s antes do ponto alto (o número final, o carimbo, a palavra de destaque).
8. Nada de balanço infinito (pulsar/flutuar à toa). A "câmera" pode agir: um push-in lento de 3-6% no cartão inteiro ao longo da duração (ease none), para o quadro nunca congelar.
9. Nos últimos 0.3-0.4 s o cartão sai (opacity + y ou clipPath) e a animação termina limpa.`;

/** A referência do estilo, no formato que ele tem (cartão, identidade ou exemplo pronto). */
function referenciaParaEscrita(estilo: EstiloDeAnimacao): string {
  if (estilo.familia === 'exclusivo' && ehLiquidGlass(estilo.chave)) {
    return `${REGRAS_DO_LIQUID_GLASS}\nExemplo completo neste estilo (já no formato da resposta; painel meio_a_meio -- use as classes do kit do mesmo jeito):\n${EXEMPLO_LIQUID_GLASS}`;
  }
  if (estilo.familia === 'referencia') {
    return `Exemplo completo neste estilo (já no formato da resposta; painel meio_a_meio 1080x960):\n${EXEMPLO_TECNOLOGIA}`;
  }
  const r = referenciaDoEstilo(estilo.chave);
  if (!r) return '';
  if (estilo.familia === 'preset') {
    return `SISTEMA DE DESIGN do estilo (frame-preset do HyperFrames: frontmatter = valores exatos; texto = intenção e regras). Siga os tokens (hex exatos), os componentes e as regras de composição -- os "átomos" são sagrados, a composição é livre. Troque as fontes pelas NOSSAS acima (mesmo papel: display, corpo, rótulo). Ele é pensado em 1920x1080: use o que ele diz para 9:16 e aumente a tipografia para o celular.\n${r.referencia}`;
  }
  if (estilo.familia === 'identidade') {
    return `IDENTIDADE do estilo (skill hyperframes-creative do HyperFrames): siga as cores (hex exatos), a tipografia (com as NOSSAS fontes acima no lugar das citadas), o espaçamento, a atmosfera e o caráter do movimento (energia, eases e durações). Onde ela pedir bounce/elastic ou texto que embaralha ao acaso, a doutrina acima prevalece.\n${r.referencia}`;
  }
  return `Cartão de REFERÊNCIA deste estilo (skill talking-head-recut; feito para 1920x1080 -- aumente ~1.3x para o vertical). Copie o visual: fundo, cores, ornamentos, hierarquia e composição. As animações dele estão declaradas em data-anim-* (at = segundo, duration, stagger): traduza para tl no seu script. O texto de exemplo é chinês: troque pelo conteúdo real em português. Troque as fontes pelas nossas, listadas acima.\nCores e tipografia:\n${r.tokens}\n${r.referencia}`;
}

function sistemaDaEscrita(estilo: EstiloDeAnimacao, paleta?: string): string {
  const p = coresDaPaleta(paleta);
  const cores = p
    ? `PALETA ESCOLHIDA (${p.paleta.nome}): ${p.cores.join(' ')} -- use ESTAS cores no lugar das do estilo (fundo, texto, destaques), mantendo o contraste de leitura; o resto do estilo (tipografia, formas, movimento) continua.\n`
    : '';
  return `${cores}Você é motion designer do HyperFrames. Desenha UM cartão animado (HTML/CSS/GSAP) que explica um trecho de um vídeo vertical de alguém falando. É um cartão de uma série: todos seguem o mesmo estilo, mas cada um tem estrutura própria para o que explica -- não é um modelo com o texto trocado.
ESTILO DO VÍDEO: ${estilo.nome} -- ${estilo.carater}.
Fontes deste estilo (as nossas): ${estilo.fontes.join(', ')}. Cores-base: ${estilo.cores.join(' ')}.
Pinte o fundo do estilo em #area inteira no meio_a_meio e na tela_cheia (o painel é do cartão); no cartao, só o cartão tem fundo (o resto transparente, o vídeo aparece).
${textoDoTema({ estilo: estilo.chave, ...(paleta ? { paleta } : {}) })}
${REGRAS_DE_DESIGN}
${textoDosComponentes()}
${skill('motion-graphics').texto}
${DOUTRINA_DE_MOVIMENTO}
${REGRAS_DA_ANIMACAO_HTML}
Responda SÓ com JSON: {"titulo":"nome curto","html":"...","css":"...","script":"..."}.
${referenciaParaEscrita(estilo)}`;
}

// ============================================================
// A DIREÇÃO LIVRE (animar-livre-v1).
//
// O método das skills que a comunidade usa com agentes (video-use,
// HyperFrames): poucas regras duras, um design escrito para o vídeo e um
// ciclo de olhar e corrigir. No lugar de escolher um estilo do catálogo e
// preencher um de nove tipos de cartão, a IA:
//   1. dirige  -- escreve o DESIGN deste vídeo (conceito, paleta, fontes,
//      linguagem visual, movimento) e as cenas, com a encenação de cada uma
//      em texto livre;
//   2. desenha -- uma chamada por cena, todas com o mesmo design no começo
//      do pedido (é o que as faz parecer do mesmo vídeo, e o prefixo igual
//      entra no cache de contexto);
//   3. critica -- o worker fotografa a cena no Chrome e o modelo com visão
//      olha os quadros; cena fraca volta para ser refeita com o parecer.
// O que NÃO muda: nada de fala, número ou oferta inventados, as zonas
// seguras do quadro, animação determinística e sem rede.
// ============================================================

const VERSAO_LIVRE = 'animar-livre-v1';
/** Com raciocínio, o pensamento conta no teto: a resposta precisa de folga (20 mil acabou inteiro no pensamento, em produção). */
const MAX_TOKENS_DA_DIRECAO_LIVRE = 48_000;
const MAX_TOKENS_DO_DESENHO = 40_000;
const TEMPO_DA_DIRECAO_LIVRE_MS = 300_000;
const TEMPO_DO_DESENHO_MS = 300_000;
/** Quantas cenas a IA desenha ao mesmo tempo no modo livre. */
const DESENHOS_SIMULTANEOS = 4;

/** Abaixo desta nota a cena está quebrada e volta para ser refeita. */
const NOTA_PARA_REFAZER = 5;

/** Quantas vezes uma cena pode ser refeita pela crítica (0 desliga; no máximo 3). */
function rodadasDeCritica(): number {
  // Uma: medido em produção, refazer duas vezes deixava a nota igual (3 a 5)
  // e só multiplicava o custo e o tempo.
  const n = Number(process.env.STUDIO_RODADAS_DE_CRITICA ?? 1);
  return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 1;
}

/**
 * `presets` (o padrão: cenas prontas, a IA escolhe e preenche), `livre` (a
 * IA desenha cada cena em código) ou `classico` (estilo do catálogo e
 * cartões por gatilho).
 */
export type ModoDasAnimacoes = 'presets' | 'livre' | 'classico';
export function modoDasAnimacoes(): ModoDasAnimacoes {
  const m = process.env.STUDIO_ANIMACOES_MODO;
  return m === 'classico' || m === 'livre' ? m : 'presets';
}

// ============================================================
// AS ANIMAÇÕES POR PRESETS (motion-presets-v1).
//
// O jeito que a comunidade usa para sair rápido e bonito (Remotion e
// HyperFrames com agentes): "template the primitives, data-drive the
// content". As cenas já existem (motion-presets.ts, 22 cenas em 18
// visuais); a IA faz UMA chamada pequena por vídeo, sem raciocínio, que
// escolhe o visual, o preset de cada momento e os textos. O servidor monta
// cada cena na hora, com cada elemento no segundo da sua palavra.
//
// Medido em produção (2026-10), o desenho por código custava ~30 mil
// tokens e um minuto POR CENA (US$ 0,06). Aqui: ~5 mil tokens por VÍDEO.
// Trocar o visual, a paleta ou o lugar de uma cena pronta é remontar --
// sem IA, na hora.
// ============================================================

const VERSAO_MOTION = 'motion-presets-v1';

// Os ícones duotone (Phosphor, MIT) só no servidor: as cenas saem com o SVG pronto.
usarIconesDuotone(ICONES_PHOSPHOR, CATEGORIAS_DOS_ICONES);
const MAX_TOKENS_DO_MOTION = 5000;
const TEMPO_DO_MOTION_MS = 120_000;

/** Os limites de ritmo das cenas prontas: curtas (o tempo de ler) e com o rosto em boa parte do vídeo. */
const REGRAS_DOS_PRESETS: RegrasDaDirecao = { teto: (s) => Math.max(2, Math.min(12, Math.floor(s / 6))), fracaoComGrafico: 0.6, umaTelaCheia: false, duracaoMaximaS: 9 };

/** Que presets cada sinal da fala pede (vai na análise, para a IA partir dela). */
const PRESETS_DO_SINAL: Record<string, string> = {
  numero: 'contador, anel, preco, barras, linha',
  lista: 'lista, ranking',
  passos: 'passos',
  comparacao: 'versus, antes_depois',
  pergunta: 'pergunta',
  termo: 'termo',
  enfase: 'impacto, frase, citacao, selo',
};

/** Os visuais que combinam com o tipo de conteúdo e a luz da imagem (o primeiro é o padrão). */
const VISUAIS_DO_FORMATO: Record<FormatoDeConteudo, { claro: string[]; escuro: string[] }> = {
  dica_rapida: { claro: ['mg-pop', 'mg-brutal', 'mg-adesivo', 'mg-caderno', 'mg-minimal'], escuro: ['mg-soco', 'mg-y2k', 'mg-neon', 'mg-podcast', 'mg-grafite'] },
  tutorial: { claro: ['mg-produto', 'mg-vidro-claro', 'mg-caderno', 'mg-suico'], escuro: ['mg-keynote', 'mg-terminal', 'mg-blueprint', 'mg-quadro-negro'] },
  explicacao: { claro: ['mg-caderno', 'mg-suico', 'mg-vidro-claro', 'mg-jornal', 'mg-saude'], escuro: ['mg-keynote', 'mg-quadro-negro', 'mg-blueprint', 'mg-mercado', 'mg-analogico'] },
  historia: { claro: ['mg-revista', 'mg-colagem', 'mg-retro70', 'mg-pastel'], escuro: ['mg-cinema', 'mg-analogico', 'mg-oceano', 'mg-luxo'] },
  opiniao: { claro: ['mg-revista', 'mg-jornal', 'mg-brutal', 'mg-minimal'], escuro: ['mg-soco', 'mg-cinema', 'mg-grafite', 'mg-luxo'] },
  oferta: { claro: ['mg-brutal', 'mg-pop', 'mg-adesivo', 'mg-pastel', 'mg-imovel'], escuro: ['mg-soco', 'mg-esporte', 'mg-neon', 'mg-cripto', 'mg-gourmet'] },
  depoimento: { claro: ['mg-pastel', 'mg-beleza', 'mg-revista', 'mg-saude'], escuro: ['mg-luxo', 'mg-analogico', 'mg-cinema', 'mg-oceano'] },
};

function visuaisSugeridos(p: PerfilDoVideo): string[] {
  const doFormato = VISUAIS_DO_FORMATO[p.formato] ?? VISUAIS_DO_FORMATO.explicacao;
  return p.receita.fundo === 'claro' ? doFormato.claro : doFormato.escuro;
}

/** O prefixo fixo do pedido (igual em todo vídeo: entra no cache de contexto do provedor). */
function sistemaDoMotion(): string {
  return `Você é editor de motion graphics de vídeos verticais (Reels, TikTok, Shorts) de alguém falando para a câmera. As cenas animadas JÁ EXISTEM, prontas e testadas: você escolhe o VISUAL do vídeo e, para cada momento que pede, o PRESET e os TEXTOS. Você não escreve código nem descreve animação -- cada elemento já entra sozinho no segundo em que a palavra dele é dita.

VISUAIS (um para o vídeo inteiro, pelo tom da fala e pela luz da imagem):
${textoDosVisuais()}

PRESETS (chave [layouts em que funciona]: quando usar. Campos; * = obrigatório):
${textoDosPresets()}

ASSETS ANIMADOS (o que dá vida às cenas: use quando o objeto ou o gesto CONTA o que a fala diz):
${textoDosAssets()}
${textoDosIcones()}
- "icone" no preset icone e na notificação; "icones" (um por item) na lista e no ranking.
- "objeto" é o herói do preset objeto (e pode trocar o ícone do preset icone).
- "rabisco" em qualquer cena acrescenta a anotação à mão; cada visual já tem os enfeites dele nas cenas de destaque ("rabisco": "nenhum" tira).

COMO ESCOLHER:
- Cena só onde a fala tem o que o preset pede (número dito, enumeração, passos, dois lados, pergunta, termo, oferta, frase de peso). Fala corrida sem nada disso: poucas cenas de impacto ou frase, ou nenhuma. Zero cenas é resposta válida.
- Ritmo: comece cedo (a primeira cena nos primeiros 3 a 6 s, se a fala tiver o que mostrar); varie o preset (nunca o mesmo duas vezes seguidas) e o layout. tela_cheia só nos picos.
- layout: cartao = sobre o vídeo, fora do rosto (leve, rápido); meio_a_meio = a cena ocupa metade da tela ("lado": "cima" = cena em cima e rosto embaixo, ou "baixo"); pip = a cena toma a tela e o rosto vai para uma janela num canto ("canto": sup-esq|sup-dir|inf-esq|inf-dir) -- para lista, gráfico, passos e conversa; tela_cheia = a cena toma o quadro.
- Duração de 3 a 7 s (o tempo de ler o que aparece); 1 s livre entre duas cenas; não entre nos ESPAÇOS RESERVADOS.

REGRAS DURAS (o servidor confere e descarta a cena que não cumprir):
- "ancora": de 3 a 8 palavras SEGUIDAS, copiadas da fala, onde a cena começa.
- Fidelidade: só números, nomes, preços e itens DITOS. Números em algarismos, exatos como foram ditos ("1.500", "87", "2,5"), sem arredondar nem completar. Nada inventado.
- Textos curtos em português: titulo até 6 palavras (frase e citação até 12), detalhe até 10, cada item até 4, kicker de 1 a 3.
- "enfase": 1 ou 2 palavras do título que carregam o sentido (ficam marcadas).
- "prioridade": 1 = sem a cena o ponto se perde; 2 = ajuda de verdade; 3 = só enfeita (não mande).

Responda SÓ com JSON, sem texto fora dele:
{"visual":"mg-...","tom":"o que quem assiste deve sentir","cenas":[{"preset":"contador","ancora":"palavras exatas da fala","inicioS":12.3,"fimS":17.0,"layout":"meio_a_meio","lado":"cima","textos":{"numero":"87","unidade":"%","titulo":"...","enfase":"..."},"ideia":"o que a cena mostra","prioridade":1}]}
Instantes em segundos do vídeo final, iguais aos da fala.`;
}

/** A fala em frases com o instante (uma linha por frase: metade dos tokens da lista palavra a palavra). */
function falaEmFrases(palavras: ReadonlyArray<{ s: number; texto: string }>): string {
  const linhas: string[] = [];
  let atual: Array<{ s: number; texto: string }> = [];
  palavras.slice(0, 2000).forEach((p, i) => {
    const anterior = palavras[i - 1];
    if (atual.length && (atual.length >= 10 || (anterior && p.s - anterior.s > 0.9))) {
      linhas.push(`${atual[0]!.s.toFixed(1)} ${atual.map((x) => x.texto).join(' ')}`);
      atual = [];
    }
    atual.push(p);
  });
  if (atual.length) linhas.push(`${atual[0]!.s.toFixed(1)} ${atual.map((x) => x.texto).join(' ')}`);
  return linhas.join('\n');
}

/** A análise do vídeo, no vocabulário dos presets (curta: o que a fala tem e quando). */
export function perfilParaMotion(p: PerfilDoVideo): string {
  const rosto = p.olhar ? { em_cima: 'rosto em cima', no_centro: 'rosto no centro', embaixo: 'rosto embaixo', sem_rosto: 'sem rosto' }[p.olhar.rosto] : '';
  return [
    `ANÁLISE DO VÍDEO: ${p.duracaoS.toFixed(1)} s; ${NOME_DO_FORMATO[p.formato]}; fala ${p.ritmo}; energia ${p.energia}; imagem ${p.receita.fundo === 'claro' ? 'clara' : 'escura'}${rosto ? `, ${rosto}` : ''}${p.olhar?.ambiente ? ` (${p.olhar.ambiente})` : ''}.`,
    p.sinais.length
      ? `O que a fala tem de mostrável (segundo, sinal: presets que servem):\n${p.sinais
          .slice(0, 20)
          .map((s) => `${s.s.toFixed(1)} ${s.tipo} "${s.trecho}": ${PRESETS_DO_SINAL[s.tipo] ?? ''}`)
          .join('\n')}`
      : 'A fala não tem número, lista, passos nem comparação: poucas cenas (impacto, frase, citação) ou nenhuma.',
    `Por volta de ${p.receita.cenasSugeridas} ${p.receita.cenasSugeridas === 1 ? 'cena' : 'cenas'} (ponto de partida).${p.receita.ladoDaCena ? ` No meio_a_meio, "lado": "${p.receita.ladoDaCena}" (fora do rosto).` : ''}`,
    `Visuais que combinam: ${visuaisSugeridos(p).join(', ')}.`,
  ].join('\n');
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * O segundo em que a âncora é dita: a sequência das primeiras palavras dela
 * na fala, a ocorrência mais perto do instante que a IA estimou. `null`
 * quando não está na fala (a conferência descarta depois).
 */
function instanteDaAncora(ancora: string, palavras: ReadonlyArray<{ s: number; texto: string }>, dica: number): number | null {
  const alvo = ancora.split(/\s+/).map(semAcento).filter(Boolean).slice(0, 3);
  if (!alvo.length) return null;
  const igual = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
  let melhor: number | null = null;
  for (let i = 0; i + alvo.length <= palavras.length; i += 1) {
    if (!alvo.every((w, k) => igual(semAcento(palavras[i + k]!.texto), w))) continue;
    const s = palavras[i]!.s;
    if (melhor === null || Math.abs(s - dica) < Math.abs(melhor - dica)) melhor = s;
  }
  return melhor === null ? null : Math.max(0, Math.round((melhor - 0.15) * 100) / 100);
}

/** Uma cena pronta para entrar no vídeo. */
interface CenaPronta {
  inicioS: number;
  fimS: number;
  cena: CenaDeMotion;
  ideia: string;
}

/** Como criar as animações (a bancada de comparação roda o mesmo vídeo em várias). */
export interface OpcoesDasAnimacoes {
  modo?: ModoDasAnimacoes;
  /** Rodadas de crítica por cena (padrão: STUDIO_RODADAS_DE_CRITICA, 2). */
  rodadas?: number;
  /** Troca o modelo e o raciocínio da direção e do desenho (só no modo livre). */
  direcao?: { modelo?: ModeloDeIa; raciocinio?: Raciocinio };
  desenho?: { modelo?: ModeloDeIa; raciocinio?: Raciocinio };
}

/** O que a direção decidiu (nos dois modos): as cenas que entram e as que saíram, com o motivo. */
interface Direcao {
  momentos: Momento[];
  tom?: string;
  cortada: boolean;
  pedidos: number;
  descartados: CartaoDescartado[];
  reservadas: JanelaReservada[];
}

/** O que dá o visual a uma cena: um estilo do catálogo ou o design que a IA escreveu. */
type Visual = { estilo: EstiloDeAnimacao; design?: undefined } | { design: DesignDoVideo; estilo?: undefined };

/** Os estilos do catálogo que o perfil apontou, como referência de nível (não para copiar). */
function estilosDeReferencia(perfil: PerfilDoVideo): string {
  return perfil.receita.estilos
    .map((chave) => estiloDeAnimacao(chave))
    .filter((e): e is EstiloDeAnimacao => !!e)
    .map((e) => `- ${e.nome}: ${e.carater}. Cores ${e.cores.join(' ')}; fontes ${e.fontes.join(', ')}.`)
    .join('\n');
}

/**
 * A direção, no formato das skills que a comunidade usa (motion-graphics e
 * hyperframes-creative do HyperFrames): um plano em CAMPOS, com repertório
 * nomeado e números, em vez de prosa. A análise do vídeo e os estilos de
 * referência vão no pedido (mudam a cada vídeo); isto é o prefixo fixo.
 */
function sistemaDaDirecaoLivre(duracaoS: number): string {
  const r = REGRAS_LIVRES;
  return `Você é o DIRETOR DE CRIAÇÃO de um vídeo vertical 9:16 de alguém falando para a câmera. Você entrega um PLANO DE DIREÇÃO em JSON: o design deste vídeo e, para cada cena de motion graphics, a técnica e as batidas presas às palavras da fala. Um motion designer executa cada cena a partir do seu plano, e um revisor olha os quadros renderizados. Plano vago vira cena genérica: cada campo abaixo existe para você ser específico.

Você recebe a ANÁLISE DO VÍDEO ENVIADO (medida pelo Studio: ritmo da fala, o que ela tem de mostrável e em que segundo, o que a imagem mostra) e uma RECEITA de partida. Use-as como evidência: a técnica de cada cena sai do que a fala TEM naquele instante.

## Passo 1 -- A ideia
Leia a fala inteira. O que quem assiste deve SENTIR? Escreva:
- "conceito": a ideia visual que amarra o vídeo, específica deste conteúdo (uma metáfora, um material, um sistema gráfico). Teste: se servir para qualquer vídeo ("moderno e limpo", "dinâmico e profissional"), está vago -- refaça.
- "referencia": de onde vem o visual, com nome ("cartaz suíço dos anos 60, grade rígida e um vermelho só"; "caderno de engenheiro, papel milimetrado e caneta azul"; "abertura de documentário, preto, serifa e grão"). Referência cultural, não adjetivos.
- "motivo": UM elemento gráfico que aparece em TODA cena, transformado (a linha que vira onda, depois gráfico, depois sublinhado; o círculo que vira anel de progresso, depois ponto de lista). É o que faz as cenas serem do mesmo vídeo.

## Passo 2 -- O design (fichas)
- "paleta": fundo, texto, apagado, destaque (+ destaque2 e destaque3 só se o conteúdo pedir), em hex de 6 dígitos. UMA cor de destaque manda no vídeo inteiro. Neutros tingidos na direção do destaque (nada de preto #000000 ou branco #ffffff puros). Fundo claro ou escuro conforme a análise da imagem.
- "fonteTitulo" e "fonteTexto": pelo caráter da referência, SÓ entre estas (nome exato):
  ${listaDeFontes()}
- "fundo": de 0 a 3 peças de fundo que a estética e a referência PEDEM (textura de papel, grão, uma cor chapada, a imagem do motivo). Nada de kit fixo: "brilho radial + grade + palavra fantasma + rótulo com filete" em toda cena é a marca do template -- se usar, é numa cena só. Lista vazia é uma resposta boa.
- "movimento": {"energia": "baixa|media|alta", "entrada": a curva das entradas (ex.: "expo.out"), "saida": a das saídas (ex.: "power2.in"), "duracaoBase": segundos de uma entrada típica (0.3 a 0.7), "stagger": segundos entre itens (0.04 a 0.15), "assinatura": o gesto que se repete e identifica o vídeo, em uma frase}.
- "ritmo": o padrão das cenas, do começo ao fim, em palavras ("rápida, rápida, LENTA, rápida, IMPACTO, respiro") -- onde está o pico e onde o vídeo respira.
- "linguagem": de 2 a 4 frases com o que falta (como a composição se organiza, o acabamento: filetes, rótulos, numeração, marcas de registro).
Sinais de design feito por IA, proibidos a não ser que o conteúdo peça: texto em degradê; ciano sobre fundo escuro ou degradê roxo-azul neon; faixa colorida na borda esquerda de cartões; grade de cartões idênticos; tudo centralizado com o mesmo peso.

- "estetica": UMA das estéticas abaixo para o vídeo inteiro (a análise sugere uma; troque se o conteúdo pedir outra). Ela decide quanto gráfico, de que tipo, com que frequência e onde fica a pessoa -- siga a gramática dela:
${indiceDasEsteticas()}

## Passo 3 -- As cenas
Cada cena MOSTRA o que a fala sozinha não mostra. Para cada uma:
- "ancora": de 3 a 8 palavras SEGUIDAS, copiadas da fala, em que a cena começa (uma palavra solta como "é" ou "eu" não identifica o instante).
- "tecnica": uma do REPERTÓRIO abaixo, escolhida pela evidência na fala. Varie: duas cenas seguidas não usam a mesma técnica.
- "papel": gancho | construcao | impacto | resolucao (o lugar da cena no arco do vídeo).
- "foco": o elemento que domina o quadro (um só).
- "componente": o componente pronto do catálogo de que a cena parte (o módulo da técnica lista os que servem), ou "" para desenho próprio. Varie: o mesmo componente em duas cenas seguidas, não.
- "enfase": 1 ou 2 palavras da fala que carregam o sentido.
- "batidas": de 3 a 8 acontecimentos, EM ORDEM. Cada um: {"palavra": UMA palavra copiada da fala do trecho, na qual o acontecimento dispara ("" só na primeira batida, a abertura do palco), "acao": ELEMENTO + VERBO + como}. O servidor mede o segundo exato de cada palavra na transcrição e entrega ao designer: você não estima tempos, você escolhe as palavras certas. Todo elemento tem um verbo de movimento:
  ${VERBOS_DE_MOVIMENTO}
  Exemplo de batida boa: {"palavra":"oitenta","acao":"O NÚMERO CONTA de 0 a 87% em 1,2 s e TRAVA com um pulso; o anel ENCHE junto"}. Ruim: {"palavra":"","acao":"o número aparece"}.
- "saida": como a cena sai (verbo + direção).
- "conteudo": os textos EXATOS que aparecem (curtos, em português, só o que foi dito).
- "conceito": 1 ou 2 frases com a composição: o que fica onde, o que é grande e o que é pequeno.
Regras de ritmo: a primeira cena do vídeo arma o quadro em até 0,5 s; dentro de uma cena, algo novo acontece a cada 2,5 a 4 s (se não há batida para isso, a cena está longa demais); o quadro cheio fica legível por 0,8 s ou mais antes de sair. Trecho de emoção, história pessoal ou olho no olho fica com o rosto: vídeo de fala corrida pode ter uma ou duas cenas de tipografia, ou nenhuma.

REPERTÓRIO DE TÉCNICAS (o que cada uma pede de você):
${indiceDasTecnicas()}

Onde a cena passa ("layout": os quatro enquadramentos que o compositor sabe fazer):
- meio_a_meio: a cena ocupa metade da tela e o rosto a outra ("lado": "cima" = cena em cima, rosto embaixo; "baixo" = o contrário). Bom para explicar sem perder o rosto.
- cartao (SOBRE O VÍDEO): elementos por cima da imagem da pessoa, fora do rosto -- palavras soltas que batem, um número, uma notificação, um selo, uma anotação. Não precisa de caixa nem de fundo. É o enquadramento das estéticas de legenda cinética, cartões sociais e documental.
- pip: a cena ocupa a tela e o rosto vai para uma janela num canto ("canto": sup-esq|sup-dir|inf-esq|inf-dir). Bom para conteúdo denso.
- tela_cheia: a cena toma o quadro. Para os momentos de impacto.

REGRAS DURAS (o servidor confere e descarta a cena que não cumprir):
- "ancora": copie LITERALMENTE de 3 a 8 palavras seguidas da fala em que a cena começa. Âncora que não está na fala do trecho = cena descartada.
- Fidelidade: só números, nomes, preços e itens DITOS. Número que não foi dito = cena descartada. Não arredonde nem complete.
- Não entre nos ESPAÇOS RESERVADOS da entrada (título da abertura, chamada do fim, mídias já no vídeo).
- 1 s livre entre duas cenas; no máximo ${Math.round(r.fracaoComGrafico * 100)}% do vídeo com gráfico; no máximo ${r.teto(duracaoS)} cenas (é teto, não meta); cada cena dura de 2,5 a ${r.duracaoMaximaS} s e começa na palavra da âncora (até 0,3 s antes).
- "conteudo": os textos EXATOS que aparecem na cena, curtos, em português.
- "prioridade": 1 = sem a cena o ponto se perde; 2 = ajuda de verdade; 3 = só enfeita (não mande).

Responda SÓ com JSON, nesta ordem de chaves, sem texto fora dele:
{"conceito":"...","tom":"o que quem assiste deve sentir","estetica":"chave","design":{"referencia":"...","motivo":"...","paleta":{"fundo":"#RRGGBB","texto":"#RRGGBB","apagado":"#RRGGBB","destaque":"#RRGGBB"},"fonteTitulo":"nome exato","fonteTexto":"nome exato","fundo":["...","..."],"movimento":{"energia":"media","entrada":"expo.out","saida":"power2.in","duracaoBase":0.45,"stagger":0.08,"assinatura":"..."},"ritmo":"...","linguagem":"..."},"cenas":[{"inicioS":12.3,"fimS":19.8,"layout":"meio_a_meio","lado":"cima","canto":null,"nome":"rótulo curto seu","tecnica":"dado_em_destaque","componente":"count-up","papel":"impacto","ancora":"palavras exatas da fala em que a cena começa","intencao":"o que quem assiste entende ou sente","foco":"...","enfase":["..."],"batidas":[{"palavra":"","acao":"..."},{"palavra":"...","acao":"..."}],"saida":"...","conteudo":{"textos":["..."]},"conceito":"...","prioridade":1}]}
Instantes em segundos do vídeo final, iguais aos da fala. Sem cena: "cenas": [].`;
}

/**
 * O pedido de desenho. A parte igual em todo vídeo vem primeiro e o design
 * por último: o prefixo comum entra no cache de contexto entre vídeos, e o
 * sistema inteiro entre as cenas do mesmo vídeo.
 */
function sistemaDoDesenho(design: DesignDoVideo, paleta?: string): string {
  const p = coresDaPaleta(paleta);
  return `Você é motion designer sênior. Escreve UMA cena de motion graphics (HTML/CSS/GSAP) de um vídeo vertical 9:16 de alguém falando. A direção já escreveu o DESIGN do vídeo (no fim deste texto) e a encenação desta cena: siga o design à risca e execute a encenação com o seu melhor ofício -- a composição, os detalhes e a coreografia são SEUS. Um crítico vai olhar os quadros renderizados: cena com cara de slide, de template ou de página da web volta para ser refeita.

O QUE SEPARA O PROFISSIONAL DO AMADOR:
- Uma ideia por cena, com UM foco dominante; o resto apoia.
- Composição com tensão: escala contrastada (algo muito grande contra algo pequeno), alinhamento a uma grade, conteúdo ancorado nas bordas da área útil, assimetria quando ajuda. Título e texto empilhados no centro é slide.
- Profundidade que vem do ASSUNTO (o objeto, o gráfico, a interface, a palavra enorme), não de um fundo-padrão. Sobre o vídeo, a cena é leve e solta.
- Tudo desenhado em código: SVG para ícones, pictogramas, diagramas, gráficos e formas (traço que se desenha com strokeDashoffset, máscaras, clipPath). Nada de emoji nem de imagem de fora.
- A cena EVOLUI do primeiro ao último segundo, no ritmo das palavras: pause em qualquer instante e algo está acontecendo.
- Você é livre para qualquer técnica que as regras técnicas abaixo permitam. Se a encenação pedir algo que não está em exemplo nenhum, faça.
${skill('motion-graphics').texto}
${REGRAS_DE_DESIGN}
${DOUTRINA_DE_MOVIMENTO}
${REGRAS_DA_ANIMACAO_HTML}
Pinte o fundo do design em #area inteira no meio_a_meio, no pip e na tela_cheia (o painel é da cena); no cartao, nada de fundo (o vídeo aparece): só os elementos da cena, com sombra ou contorno para ler sobre a imagem.
COMPONENTES PRONTOS (o catálogo do HyperFrames): o módulo da técnica diz quais servem a esta cena. PARTA de um deles quando servir -- são testados e de nível profissional -- e construa em volta; desenhar do zero é para o que nenhum faz. Variar entre eles é o que impede as cenas de saírem iguais.
${textoDosComponentes()}
Responda SÓ com JSON: {"titulo":"nome curto","html":"...","css":"...","script":"..."}.

${textoDoDesign(design)}${p ? `\nPALETA ESCOLHIDA PELA PESSOA (${p.paleta.nome}): ${p.cores.join(' ')} -- as variáveis de cor já estão com ela; use as variáveis, não os hex do design.` : ''}`;
}

const SISTEMA_DA_CRITICA = `Você é diretor de arte e revisa UMA cena de motion graphics de um vídeo vertical 9:16, antes de ela ir ao ar. Você recebe três quadros renderizados da cena (começo, meio e fim), o design do vídeo e o que a cena devia mostrar. O cinza liso é onde aparece o vídeo da pessoa falando: não é defeito, e a cena não deve cobrir o que não é dela.
Julgue como quem reprova trabalho amador. Não elogie.
1. Hierarquia: o olho sabe para onde ir? Há um foco dominante ou tudo tem o mesmo peso?
2. Leitura no celular: tamanho e contraste dos textos.
3. Composição: alinhamento, respiro e ancoragem. Algo cortado, sobreposto, vazando da área, colado na borda? Grandes vazios mortos?
4. Acabamento: parece produzido (camadas, detalhes, textura) ou um slide, um template genérico, uma página da web?
5. Fidelidade ao design do vídeo: cores, fontes e linguagem visual.
6. Progressão: os três quadros mostram a cena evoluindo? Quadro vazio, ou os três iguais, é defeito. (O primeiro quadro pega a entrada em curso: estar incompleto é normal; estar vazio não.)
Nota de 0 a 10: 9-10 nível de produtora; 7-8 bom, vai ao ar; 5-6 amador; abaixo de 5, quebrado.
Problemas: cada um concreto e acionável -- o que está errado, em qual quadro, e como corrigir. No máximo 5, do mais grave para o menos. Sem problema real, lista vazia.
Responda SÓ com JSON: {"nota": 0, "problemas": ["..."]}.`;

/** O primeiro objeto JSON de uma resposta (a IA às vezes cerca com ```). */
function lerJson(texto: string): unknown {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i < 0 || f <= i) throw new Error('a resposta não trouxe JSON');
  return JSON.parse(limpo.slice(i, f + 1));
}

function briefingDe(m: Pick<Momento, 'tipo' | 'ideia' | 'conteudo' | 'conceito' | 'tecnica'>): string {
  // O briefing cabe em 2000 caracteres e tem de continuar JSON: o que
  // encolhe é a encenação, nunca o texto final cortado no meio.
  const base = { tipo: m.tipo, ideia: m.ideia, conteudo: m.conteudo.slice(0, 500), ...(m.tecnica ? { tecnica: m.tecnica } : {}) };
  const sobra = 1900 - JSON.stringify(base).length;
  return JSON.stringify({ ...base, ...(m.conceito && sobra > 40 ? { conceito: m.conceito.slice(0, sobra - 20) } : {}) });
}

function lerBriefing(c: ComposicaoHtml): { tipo: string; ideia: string; conteudo: string; conceito?: string; tecnica?: string } {
  try {
    const b = JSON.parse(c.briefing ?? '') as Record<string, unknown>;
    return {
      tipo: String(b.tipo ?? ''),
      ideia: String(b.ideia ?? c.titulo ?? ''),
      conteudo: String(b.conteudo ?? ''),
      ...(typeof b.conceito === 'string' ? { conceito: b.conceito } : {}),
      ...(typeof b.tecnica === 'string' ? { tecnica: b.tecnica } : {}),
    };
  } catch {
    return { tipo: '', ideia: c.titulo ?? '', conteudo: '' };
  }
}

/** A paleta mais usada nas animações do vídeo (se alguma usa). */
export function paletaDoPlano(plano: EditPlanV1): string | undefined {
  const conta = new Map<string, number>();
  for (const m of plano.mediaLayers ?? []) {
    const p = m.kind === 'html' ? m.composicao?.paleta : undefined;
    if (p) conta.set(p, (conta.get(p) ?? 0) + 1);
  }
  return [...conta.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
}

/** O estilo mais usado nas animações do vídeo (o "estilo do vídeo"). */
export function estiloDoPlano(plano: EditPlanV1): EstiloDeAnimacao | undefined {
  const conta = new Map<string, number>();
  for (const m of plano.mediaLayers ?? []) {
    const e = m.kind === 'html' ? m.composicao?.estilo : undefined;
    if (e) conta.set(e, (conta.get(e) ?? 0) + 1);
  }
  const [chave] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return estiloDeAnimacao(chave);
}

@Injectable()
export class AnimacoesDaFalaService {
  private readonly log = new Logger(AnimacoesDaFalaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly planos: EditPlansService,
    private readonly animacoes: AnimacoesService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  /** O que a IA viu nos quadros de cada projeto (a olhada custa uma chamada: vale por seis horas). */
  private readonly olhares = new Map<string, { em: number; olhar: OlharDoVideo | null }>();

  /**
   * A IA com visão olha até três quadros do vídeo ENVIADO (os que o preparo
   * já guardou, um por cena) e diz onde está o rosto, como é a luz, que
   * cores dominam e que ambiente é. `null` quando não deu (sem quadros,
   * sem visão): o perfil sai só da fala.
   */
  private async olharOVideo(workspaceId: string, projectId: string): Promise<OlharDoVideo | null> {
    const guardado = this.olhares.get(projectId);
    if (guardado && Date.now() - guardado.em < 6 * 60 * 60_000) return guardado.olhar;
    let olhar: OlharDoVideo | null = null;
    try {
      if (!this.storage || process.env.STUDIO_OLHAR_O_VIDEO === 'off') return null;
      const transcricao = await this.prisma.transcription.findUnique({ where: { projectId }, include: { regions: { where: { kind: 'scene' }, orderBy: { startMs: 'asc' } } } });
      const quadros = (transcricao?.regions ?? []).map((r) => (r.metadata as { quadro?: string } | null)?.quadro).filter((q): q is string => !!q);
      if (!quadros.length) return null;
      const escolhidos = [...new Set([quadros[0]!, quadros[Math.floor(quadros.length / 2)]!, quadros[quadros.length - 1]!])];
      const imagens: string[] = [];
      for (const q of escolhidos) {
        const arquivo = await this.storage.ler(q).catch(() => null);
        if (!arquivo) continue;
        imagens.push((await sharp(arquivo).resize({ width: 432, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer()).toString('base64'));
      }
      if (!imagens.length) return null;
      const r = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'olhar_video',
        sistema:
          'Você analisa quadros de um vídeo gravado para redes sociais, para um diretor de arte decidir o design dos gráficos que vão por cima. Olhe todos os quadros e responda o que vale para o vídeo. Responda SÓ com JSON: {"rosto": "em_cima" | "no_centro" | "embaixo" | "sem_rosto" (em que terço da ALTURA do quadro está o rosto de quem fala), "luz": "clara" | "media" | "escura" (a imagem como um todo), "cores": ["#RRGGBB", ...] (até 3 cores que dominam a imagem, da que ocupa mais área para a que ocupa menos), "ambiente": "onde a pessoa está, em até 6 palavras"}.',
        usuario: `${imagens.length} ${imagens.length === 1 ? 'quadro' : 'quadros'} do vídeo, do começo ao fim.`,
        imagens,
        maxTokens: 200,
        promptVersion: VERSAO_LIVRE,
        semCache: true,
        tempoMaximoMs: 60_000,
      });
      olhar = lerOlhar(r.texto);
      return olhar;
    } catch (e) {
      this.log.warn(`olhada no vídeo do projeto ${projectId} indisponível: ${e instanceof Error ? e.message : e}`);
      return null;
    } finally {
      this.olhares.set(projectId, { em: Date.now(), olhar });
      if (this.olhares.size > 200) this.olhares.delete(this.olhares.keys().next().value!);
    }
  }

  /**
   * O perfil do vídeo enviado: a fala medida (ritmo, sinais com o instante)
   * e a imagem olhada. É a mesma análise para a direção das animações, para
   * o diretor do vídeo e para o relatório no editor.
   */
  async perfilDoProjeto(workspaceId: string, projectId: string, plano: EditPlanV1, palavrasJaLidas?: Array<{ s: number; texto: string }>): Promise<PerfilDoVideo> {
    const palavras = palavrasJaLidas ?? (await this.palavrasNoVideo(projectId, plano));
    const [entendimento, projeto, olhar] = await Promise.all([
      this.entendimento(projectId),
      Promise.resolve()
        .then(() => this.prisma.project.findUnique({ where: { id: projectId }, select: { videoKind: true } }))
        .catch(() => null),
      this.olharOVideo(workspaceId, projectId),
    ]);
    return perfilDoVideo({ palavras, duracaoS: agendaDoPlano(plano).duracaoMs / 1000, estrutura: entendimento?.structure ?? null, tipoDeVideo: projeto?.videoKind ?? null, olhar });
  }

  /** As palavras no tempo do vídeo final (o plano corta, reordena e acelera). */
  private async palavrasNoVideo(projectId: string, plano: EditPlanV1): Promise<Array<{ s: number; texto: string }>> {
    const ps = await this.prisma.transcriptWord.findMany({
      where: { segment: { transcription: { projectId } } },
      select: { startMs: true, word: true },
      orderBy: { startMs: 'asc' },
    });
    const saida: Array<{ s: number; texto: string }> = [];
    for (const t of agendaDoPlano(plano).trechos) {
      for (const p of ps) {
        if (p.startMs < t.clip.sourceStartMs || p.startMs >= t.clip.sourceEndMs) continue;
        saida.push({ s: (t.inicioMs + (p.startMs - t.clip.sourceStartMs) / t.velocidade) / 1000, texto: p.word });
      }
    }
    return saida.sort((a, b) => a.s - b.s);
  }

  /** O que a IA entendeu do vídeo na última seleção (assunto, promessa, estrutura). */
  private async entendimento(projectId: string): Promise<AnaliseDaIa | null> {
    // Sem o entendimento, a direção lê só a fala (não é motivo para falhar).
    const ultima = await Promise.resolve()
      .then(() => this.prisma.aiAnalysis.findFirst({ where: { projectId, parsedOk: true, promptVersion: { startsWith: 'selecao' } }, orderBy: { createdAt: 'desc' }, select: { rawOutput: true } }))
      .catch(() => null);
    const texto = (ultima?.rawOutput as { texto?: string } | null)?.texto;
    if (!texto) return null;
    try {
      const lido = analiseDaIaSchema.safeParse(JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1))?.analysis);
      return lido.success ? lido.data : null;
    } catch {
      return null;
    }
  }

  /** O que a direção lê: a fala no tempo, o que a seleção entendeu, os papéis e os espaços reservados. */
  private async entradaDaDirecao(projectId: string, plano: EditPlanV1, palavras: Array<{ s: number; texto: string }>, duracaoS: number): Promise<{ usuario: string; reservadas: JanelaReservada[] }> {
    const reservadas = janelasReservadasDoPlano(plano);
    const entendimento = await this.entendimento(projectId);
    const papeis = papeisNoTempo(plano);
    const fala = palavras.slice(0, 1500).map((p) => `${p.s.toFixed(2)} ${p.texto}`).join('\n');
    const usuario = [
      `Duração do vídeo: ${duracaoS.toFixed(1)} s.`,
      entendimento
        ? `O que a IA entendeu: assunto "${entendimento.topic}"; para ${entendimento.audience}; promessa "${entendimento.promise}"; estrutura ${entendimento.structure}; gancho do tipo ${entendimento.hookType}.`
        : '',
      `Trechos do vídeo (papel de cada um): ${papeis.map((p) => `${p.inicioS.toFixed(1)}-${p.fimS.toFixed(1)}s ${p.papel || '?'}`).join('; ')}.`,
      `ESPAÇOS RESERVADOS (não entre): ${reservadas.length ? reservadas.map((r) => `${r.inicioS.toFixed(1)}-${r.fimS.toFixed(1)}s ${r.motivo}`).join('; ') : 'nenhum'}.`,
      `Fala (instante em s, palavra):\n${fala}`,
    ]
      .filter(Boolean)
      .join('\n');
    return { usuario, reservadas };
  }

  /**
   * A direção LIVRE: a IA escreve o design deste vídeo e as cenas, com a
   * encenação de cada uma. A conferência é a mesma da direção por cartões
   * (âncora na fala, fidelidade, espaço reservado), com os limites de
   * ritmo da direção livre.
   */
  private async dirigirLivre(
    workspaceId: string,
    projectId: string,
    plano: EditPlanV1,
    palavras: Array<{ s: number; texto: string }>,
    duracaoS: number,
    opcoes: OpcoesDasAnimacoes,
    perfil: PerfilDoVideo,
  ): Promise<Direcao & { design: DesignDoVideo }> {
    const entrada = await this.entradaDaDirecao(projectId, plano, palavras, duracaoS);
    const { reservadas } = entrada;
    const referencias = estilosDeReferencia(perfil);
    // A análise e as referências mudam a cada vídeo: vão no pedido, depois
    // do sistema fixo (que entra no cache de contexto).
    const usuario = `${textoDoPerfil(perfil)}${referencias ? `\nESTILOS DE REFERÊNCIA para este tom (o NÍVEL de especificidade esperado; parta de um deles ou crie o seu, mas não copie):\n${referencias}` : ''}\n\n${entrada.usuario}`;
    // A cor da marca entra como informação, não como ordem (a padrão do
    // Studio não é a marca de ninguém: não vai).
    const cor = await Promise.resolve()
      .then(() => this.animacoes.corDaMarca(workspaceId))
      .catch(() => null);
    const marca = cor && cor.toLowerCase() !== CORES_PADRAO_DA_MARCA.primary.toLowerCase() ? cor : null;
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'dirigir_animacoes',
      sistema: sistemaDaDirecaoLivre(duracaoS),
      usuario: marca ? `Cor principal da marca: ${marca} (pode ser um dos destaques, se combinar com o conceito).\n${usuario}` : usuario,
      maxTokens: MAX_TOKENS_DA_DIRECAO_LIVRE,
      promptVersion: VERSAO_LIVRE,
      semCache: true,
      tempoMaximoMs: TEMPO_DA_DIRECAO_LIVRE_MS,
      ...(opcoes.direcao?.modelo ? { modelo: opcoes.direcao.modelo } : {}),
      ...(opcoes.direcao?.raciocinio ? { raciocinio: opcoes.direcao.raciocinio } : {}),
    });
    const lida = lerDirecao(r.texto);
    const design = designDoVideo(lida);
    const { aceitos, descartados } = conferirCartoes(lida.cartoes, { duracaoS, palavras, reservadas, regras: REGRAS_LIVRES });
    return { design, momentos: this.momentosDaDirecao(aceitos, palavras), ...(lida.tom ? { tom: lida.tom } : {}), cortada: lida.cortada, pedidos: lida.cartoes.length, descartados, reservadas };
  }

  private momentosDaDirecao(aceitos: readonly CartaoDirigido[], palavras: Array<{ s: number; texto: string }>): Momento[] {
    return aceitos.map((c) => ({
      inicioS: c.inicioS,
      fimS: c.fimS,
      layout: c.layout,
      ...(c.lado ? { lado: c.lado } : {}),
      ...(c.canto ? { canto: c.canto } : {}),
      tipo: c.tipo,
      ideia: c.intencao,
      conteudo: c.conteudo,
      acento: c.acento,
      // O plano (técnica + batidas com o instante medido) segue com a
      // encenação: é o que fica guardado para refazer a cena depois.
      ...(c.conceito || c.plano ? { conceito: [c.conceito, c.plano ? textoDoPlano(c.plano) : ''].filter(Boolean).join('\n') } : {}),
      ...(c.plano ? { tecnica: c.plano.tecnica } : {}),
      palavras: palavras.filter((p) => p.s >= c.inicioS && p.s < c.fimS),
    }));
  }

  /**
   * A direção visual: o estilo do vídeo e os cartões que a fala PEDE --
   * lidos mesmo de uma resposta cortada e conferidos (gatilho, fidelidade,
   * espaço reservado, respiro). Devolve também o que saiu e por quê.
   */
  private async dirigir(
    workspaceId: string,
    projectId: string,
    plano: EditPlanV1,
    palavras: Array<{ s: number; texto: string }>,
    duracaoS: number,
    /** O estilo que a pessoa escolheu para o projeto (a IA não escolhe outro). */
    fixo?: EstiloDeAnimacao,
  ): Promise<Direcao & { estilo: EstiloDeAnimacao }> {
    const { usuario, reservadas } = await this.entradaDaDirecao(projectId, plano, palavras, duracaoS);
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'animar_fala',
      sistema: sistemaDaDirecao(duracaoS) + (fixo ? `\nESTILO JÁ ESCOLHIDO PELA PESSOA: ${fixo.chave} (${fixo.nome}). Use este em "estilo"; decida o resto como sempre.` : ''),
      usuario,
      maxTokens: MAX_TOKENS_DA_DIRECAO,
      promptVersion: VERSAO,
      semCache: true,
      tempoMaximoMs: 150_000,
    });
    const lida = lerDirecao(r.texto);
    const estilo = fixo ?? estiloDeAnimacao(lida.estilo) ?? TECNOLOGIA;
    const { aceitos, descartados } = conferirCartoes(lida.cartoes, { duracaoS, palavras, reservadas });
    const momentos = this.momentosDaDirecao(aceitos, palavras);
    return { estilo, momentos, ...(lida.tom ? { tom: lida.tom } : {}), cortada: lida.cortada, pedidos: lida.cartoes.length, descartados, reservadas };
  }

  /**
   * As animações por presets: UMA chamada pequena escolhe o visual, as
   * cenas prontas e os textos. A conferência é a mesma das outras direções
   * (âncora na fala, números ditos, espaço reservado, respiro, teto).
   */
  private async dirigirPresets(
    workspaceId: string,
    projectId: string,
    plano: EditPlanV1,
    palavras: Array<{ s: number; texto: string }>,
    duracaoS: number,
    perfil: PerfilDoVideo,
    /** O visual que a pessoa escolheu para o projeto (a IA não escolhe outro). */
    fixo?: string,
  ): Promise<{ visual: string; tom?: string; cenas: CenaPronta[]; pedidos: number; cortada: boolean; descartados: CartaoDescartado[] }> {
    const reservadas = janelasReservadasDoPlano(plano);
    const entendimento = await this.entendimento(projectId);
    const cor = await Promise.resolve()
      .then(() => this.animacoes.corDaMarca(workspaceId))
      .catch(() => null);
    const marca = cor && cor.toLowerCase() !== CORES_PADRAO_DA_MARCA.primary.toLowerCase() ? cor : null;
    const usuario = [
      perfilParaMotion(perfil),
      fixo ? `VISUAL JÁ ESCOLHIDO PELA PESSOA: ${fixo} (use este em "visual").` : '',
      marca ? `Cor da marca: ${marca} (pese na escolha do visual).` : '',
      entendimento ? `Assunto: "${entendimento.topic}"; para ${entendimento.audience}; promessa: "${entendimento.promise}".` : '',
      `No máximo ${REGRAS_DOS_PRESETS.teto(duracaoS)} cenas.`,
      `ESPAÇOS RESERVADOS (não entre): ${reservadas.length ? reservadas.map((r) => `${r.inicioS.toFixed(1)}-${r.fimS.toFixed(1)}s ${r.motivo}`).join('; ') : 'nenhum'}.`,
      `FALA (segundo em que a frase começa, frase):\n${falaEmFrases(palavras)}`,
    ]
      .filter(Boolean)
      .join('\n');
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'montar_motion',
      sistema: sistemaDoMotion(),
      usuario,
      maxTokens: MAX_TOKENS_DO_MOTION,
      promptVersion: VERSAO_MOTION,
      semCache: true,
      tempoMaximoMs: TEMPO_DO_MOTION_MS,
    });
    const lida = lerDirecao(r.texto);
    const pedido = /"visual"\s*:\s*"([^"]+)"/.exec(r.texto)?.[1];
    const visual = fixo ?? (visualDeMotion(pedido) ? pedido! : visuaisSugeridos(perfil)[0]!);
    const descartados: CartaoDescartado[] = [];
    // A cena vai à conferência com o tipo "preset#índice": o que volta aceito
    // reencontra os textos e o lugar que a IA pediu.
    const brutos = lida.cartoes.flatMap((x, i) => {
      const preset = presetDeMotion(String(x.preset ?? x.tipo ?? ''))?.chave;
      const textos = lerTextosDaCena(x.textos ?? x.conteudo);
      const dica = Number(x.inicioS);
      const falta = cenaIncompleta(preset ?? String(x.preset ?? ''), textos);
      if (!preset || falta) {
        descartados.push({ inicioS: Number.isFinite(dica) ? dica : 0, tipo: String(x.preset ?? '?').slice(0, 40), motivo: falta ?? 'preset desconhecido' });
        return [];
      }
      const inicio = instanteDaAncora(String(x.ancora ?? ''), palavras, Number.isFinite(dica) ? dica : 0) ?? dica;
      const pedida = Number(x.fimS) - dica;
      const dur = Number.isFinite(pedida) && pedida >= 2.5 ? Math.min(REGRAS_DOS_PRESETS.duracaoMaximaS, pedida) : 4.5;
      return [{ ...x, tipo: `${preset}#${i}`, inicioS: inicio, fimS: inicio + dur, conteudo: textoDaCena(textos), gatilho: x.ancora, intencao: x.ideia }];
    });
    const conferidos = conferirCartoes(brutos, { duracaoS, palavras, reservadas, regras: REGRAS_DOS_PRESETS });
    const cenas = conferidos.aceitos.map((a): CenaPronta => {
      const [preset, i] = a.tipo.split('#');
      const x = lida.cartoes[Number(i)] ?? {};
      const layout = layoutDoPreset(preset!, a.layout);
      return {
        inicioS: a.inicioS,
        fimS: a.fimS,
        ideia: a.intencao,
        cena: {
          preset: preset!,
          textos: lerTextosDaCena(x.textos ?? x.conteudo),
          layout,
          ...(layout === 'meio_a_meio' ? { lado: x.lado === 'baixo' || x.lado === 'cima' ? x.lado : (perfil.receita.ladoDaCena ?? 'cima') } : {}),
          ...(layout === 'pip' ? { canto: a.canto ?? 'inf-dir' } : {}),
        },
      };
    });
    return {
      visual,
      ...(lida.tom ? { tom: lida.tom } : {}),
      cenas,
      pedidos: lida.cartoes.length,
      cortada: lida.cortada,
      descartados: [...descartados, ...conferidos.descartados.map((d) => ({ ...d, tipo: d.tipo.split('#')[0]! }))],
    };
  }

  /** A animação de uma cena pronta: o preset montado no visual, no tempo da fala do trecho. */
  private montarCena(c: CenaPronta, visual: string, palavras: ReadonlyArray<{ s: number; texto: string }>, paleta?: string): { composicao: ComposicaoHtml; duracaoMs: number } {
    const duracaoMs = Math.round((c.fimS - c.inicioS) * 1000);
    const doTrecho = palavras.filter((p) => p.s >= c.inicioS - 0.05 && p.s < c.fimS).map((p) => ({ s: Math.max(0, p.s - c.inicioS), texto: p.texto }));
    const composicao = composicaoDoPreset(c.cena, visual, duracaoMs / 1000, doTrecho, { ...(paleta && coresDaPaleta(paleta) ? { paleta } : {}), ideia: c.ideia });
    const problemas = problemasDaComposicao(composicao);
    if (problemas.length) throw new Error(problemas.slice(0, 3).join('; '));
    return { composicao, duracaoMs };
  }

  /**
   * A cena que quem pediu já escolheu (preset e textos), se estiver completa
   * e fiel à fala do trecho; `null` manda para a IA escolher.
   */
  private cenaDireta(p: PedidoDeTrecho, m: { inicioS: number; fimS: number; layout: LayoutDaAnimacao; lado?: 'cima' | 'baixo'; canto?: CantoDoPip }, palavras: ReadonlyArray<{ s: number; texto: string }>): CenaDeMotion | null {
    const preset = presetDeMotion(p.preset)?.chave;
    if (!preset || !p.textos) return null;
    const textos = lerTextosDaCena(p.textos);
    if (cenaIncompleta(preset, textos)) return null;
    const fala = palavras.filter((x) => x.s >= m.inicioS - 4 && x.s < m.fimS + 2).map((x) => x.texto).join(' ');
    if (numerosInventados(textoDaCena(textos), fala).length) return null;
    const layout = layoutDoPreset(preset, m.layout);
    return { preset, textos, layout, ...(layout === 'meio_a_meio' ? { lado: m.lado ?? 'cima' } : {}), ...(layout === 'pip' ? { canto: m.canto ?? 'inf-dir' } : {}) };
  }

  /**
   * Uma cena pronta para um pedido ("Peça à IA" ou "muda o texto"): uma
   * chamada pequena escolhe o preset e os textos do trecho. `atual` é a cena
   * que já está lá, quando é uma edição em cima dela.
   */
  private async cenaPorPedido(
    workspaceId: string,
    projectId: string,
    palavras: ReadonlyArray<{ s: number; texto: string }>,
    m: { inicioS: number; fimS: number; layout: LayoutDaAnimacao; lado?: 'cima' | 'baixo'; canto?: CantoDoPip },
    pedido: string,
    atual?: CenaDeMotion,
  ): Promise<CenaDeMotion> {
    const fala = palavras.filter((p) => p.s >= m.inicioS - 1 && p.s < m.fimS + 1).map((p) => p.texto).join(' ');
    const r = await this.ai.chamar({
      workspaceId,
      projectId,
      chamada: 'montar_motion',
      sistema: `Você escolhe UMA cena de motion graphics pronta (um preset) e os textos dela, para um trecho de um vídeo vertical de alguém falando. Não escreve código.
PRESETS (chave [layouts]: quando usar. Campos; * = obrigatório):
${textoDosPresets()}
${textoDosAssets()}
${textoDosIcones()}
Textos curtos em português e fiéis à fala: só números, nomes e itens DITOS (números em algarismos, exatos). titulo até 6 palavras (frase/citação até 12), detalhe até 10, itens até 4 palavras cada.
Responda SÓ com JSON: {"preset":"chave","textos":{...}}`,
      usuario: `${atual ? `CENA ATUAL (edite em cima dela; mude só o que o pedido pede): ${JSON.stringify({ preset: atual.preset, textos: atual.textos })}\n` : ''}PEDIDO: ${pedido}\nFala do trecho: "${fala.slice(0, 1500)}"`,
      maxTokens: 1200,
      promptVersion: VERSAO_MOTION,
      semCache: true,
      tempoMaximoMs: 60_000,
    });
    const j = lerJson(r.texto) as Record<string, unknown>;
    const preset = presetDeMotion(String(j.preset ?? ''))?.chave ?? atual?.preset;
    const textos = lerTextosDaCena(j.textos);
    if (!preset) throw new Error('a IA não escolheu uma cena do catálogo');
    const falta = cenaIncompleta(preset, textos);
    if (falta) throw new Error(falta);
    const inventados = numerosInventados(textoDaCena(textos), `${fala} ${atual ? textoDaCena(atual.textos) : ''} ${pedido}`);
    if (inventados.length) throw new Error(`a cena mostraria ${inventados.slice(0, 3).join(', ')}, que não foi dito`);
    const layout = layoutDoPreset(preset, m.layout);
    return { preset, textos, layout, ...(layout === 'meio_a_meio' ? { lado: m.lado ?? 'cima' } : {}), ...(layout === 'pip' ? { canto: m.canto ?? 'inf-dir' } : {}) };
  }

  /**
   * Escreve e confere o cartão de um momento (uma correção, se precisar).
   * `base`: a animação atual, quando é uma edição em cima dela.
   */
  private async escrever(
    workspaceId: string,
    projectId: string,
    m: Momento,
    visual: Visual,
    serie: Momento[],
    extra: { base?: ComposicaoHtml; pedido?: string; soOsTextos?: boolean; paleta?: string; rodadas?: number; desenho?: OpcoesDasAnimacoes['desenho'] } = {},
  ): Promise<{ composicao: ComposicaoHtml; duracaoMs: number; critica?: CriticaDaCena }> {
    const { estilo, design } = visual;
    const duracaoMs = Math.round((m.fimS - m.inicioS) * 1000);
    const area =
      m.layout === 'meio_a_meio'
        ? m.lado === 'baixo'
          ? 'o painel de BAIXO (o rosto fica na metade de cima)'
          : 'o painel de CIMA (o rosto fica na metade de baixo)'
        : m.layout === 'cartao'
          ? 'o quadro todo SOBRE O VÍDEO: tudo transparente, e os elementos flutuam soltos por cima da imagem da pessoa, fora do rosto (caixa só se a técnica pedir)'
          : m.layout === 'pip'
            ? 'o quadro todo, com fundo pintado; o vídeo com o rosto aparece numa janela arredondada (o Studio recorta e emoldura)'
            : 'o quadro todo (o ponto alto do vídeo)';
    // A grade de segurança do layout, com números: onde o conteúdo vai e
    // o que ele não pode cobrir (app, logo, legenda, vídeo).
    const grade = textoDaGrade({ layout: m.layout, ...(m.lado ? { lado: m.lado } : {}), ...(m.divisao !== undefined ? { divisao: m.divisao } : {}), ...(m.canto ? { canto: m.canto } : {}) });
    const fala = m.palavras.map((p) => `${(p.s - m.inicioS).toFixed(2)} ${p.texto}`).join('\n');
    const outros = serie
      .filter((o) => o !== m)
      .map((o) => `${o.inicioS.toFixed(0)}s ${o.tipo || '?'} (${o.layout})`)
      .join('; ');
    const atual = extra.base ? JSON.stringify({ titulo: extra.base.titulo, html: extra.base.html, css: extra.base.css, script: extra.base.script }).slice(0, 14_000) : '';
    const cabecalho = design
      ? `Cena ${Math.max(1, serie.indexOf(m) + 1)} de ${Math.max(1, serie.length)}${m.tipo ? `: "${m.tipo}"` : ''}. Layout: ${m.layout} -- #area é ${area}.
${grade}
Duração: ${(duracaoMs / 1000).toFixed(1)} s.
O que quem assiste entende ou sente: ${m.ideia}
${moduloDaTecnica(m.tecnica)}
PLANO DA DIREÇÃO para esta cena (execute; a composição fina e os detalhes são seus):
${m.conceito || 'a encenação que melhor mostrar a ideia, dentro do design do vídeo'}
Textos exatos da cena: ${m.conteudo || '(tire da fala, sem inventar)'}
As outras cenas do vídeo (mesma família visual; varie a encenação e a composição): ${outros || 'nenhuma'}.`
      : `Cartão ${Math.max(1, serie.indexOf(m) + 1)} de ${Math.max(1, serie.length)}. Tipo: ${m.tipo || 'o que melhor explicar'}. Layout: ${m.layout} -- #area é ${area}.
${grade}
Duração: ${(duracaoMs / 1000).toFixed(1)} s. Cor de destaque: a ${m.acento + 1}ª do estilo.
O que explica: ${m.ideia}
Conteúdo: ${m.conteudo || '(tire da fala)'}
Os outros cartões da série (não repita a estrutura deles): ${outros || 'nenhum'}.`;
    const pedido = `${cabecalho}
Fala do trecho (segundo DENTRO da animação, palavra) -- cada elemento entra no segundo da palavra que ele representa:
${fala}${
      extra.pedido
        ? `\n\nPEDIDO DA PESSOA (faça exatamente isto; mantenha o resto como está):\n${extra.pedido}\nAnimação atual (edite em cima dela):\n${atual}`
        : atual && extra.soOsTextos
          ? `\n\nA animação anterior deste trecho (reaproveite SÓ os textos e a ideia; o desenho é novo, no estilo e no lugar acima):\n${atual}`
          : ''
    }`;
    const tentar = async (usuario: string) => {
      const r = await this.ai.chamar(
        design
          ? {
              workspaceId,
              projectId,
              chamada: 'desenhar_animacao',
              sistema: sistemaDoDesenho(design, extra.paleta),
              usuario,
              maxTokens: MAX_TOKENS_DO_DESENHO,
              promptVersion: VERSAO_LIVRE,
              semCache: true,
              tempoMaximoMs: TEMPO_DO_DESENHO_MS,
              ...(extra.desenho?.modelo ? { modelo: extra.desenho.modelo } : {}),
              ...(extra.desenho?.raciocinio ? { raciocinio: extra.desenho.raciocinio } : {}),
            }
          : {
              workspaceId,
              projectId,
              chamada: 'animar_fala',
              sistema: sistemaDaEscrita(estilo!, extra.paleta),
              usuario,
              maxTokens: 8000,
              promptVersion: VERSAO,
              semCache: true,
              tempoMaximoMs: TEMPO_PARA_ESCREVER_MS,
            },
      );
      const j = lerJson(r.texto) as Record<string, unknown>;
      const c = composicaoHtmlSchema.safeParse({
        html: j.html,
        css: j.css ?? '',
        script: j.script ?? '',
        layout: m.layout,
        ...(m.lado ? { lado: m.lado } : {}),
        ...(m.divisao !== undefined ? { divisao: m.divisao } : {}),
        ...(m.foco !== undefined ? { foco: m.foco } : {}),
        ...(m.layout === 'pip' ? { canto: m.canto ?? 'inf-dir' } : {}),
        // O estilo pinta o próprio fundo (o painel escuro padrão é dos modelos prontos).
        semFundo: true,
        titulo: String(j.titulo ?? m.ideia).slice(0, 60),
        // O estilo do catálogo ou, na direção livre, o tema deste vídeo.
        ...(design ? { tema: design.tema } : { estilo: estilo!.chave }),
        ...(coresDaPaleta(extra.paleta) ? { paleta: extra.paleta } : {}),
        briefing: briefingDe(m),
      });
      if (!c.success) return { erro: c.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`), resposta: r.texto };
      // Fidelidade: o cartão não mostra número que não foi dito.
      const falaDoTrecho = `${m.palavras.map((p) => p.texto).join(' ')} ${m.conteudo}`;
      const inventados = numerosInventados(textoVisivelDoHtml(c.data.html), falaDoTrecho);
      if (inventados.length) return { erro: [`o cartão mostra ${inventados.slice(0, 3).join(', ')}, que não foi dito na fala: use só os números ditos`], resposta: r.texto };
      const locais = problemasDaComposicao(c.data);
      const problemas = locais.length ? locais : await this.animacoes.problemas(c.data, duracaoMs);
      if (problemas.length) return { erro: problemas, resposta: r.texto };
      // A conferência de sobreposição (no Chrome do worker): texto sobre a
      // legenda, o cabeçalho do app, a janela do vídeo ou outro texto.
      const layout = (await this.animacoes.problemasDeLayout(c.data, duracaoMs)) ?? [];
      return layout.length ? { erro: layout, soLayout: true, resposta: r.texto, composicao: c.data } : { composicao: c.data };
    };
    let r = await tentar(pedido);
    if ('erro' in r) {
      this.log.warn(`animação (${m.ideia.slice(0, 40)}): corrigindo -- ${r.erro!.join('; ').slice(0, 300)}`);
      const anterior = r;
      r = await tentar(`${pedido}\n\nSua resposta anterior:\n${(r.resposta ?? '').slice(0, 14_000)}\n\nEla tem estes problemas; corrija e responda o JSON inteiro de novo:\n- ${r.erro!.join('\n- ')}`);
      // A correção quebrou algo técnico mas a anterior só tinha layout: fica a anterior.
      if ('erro' in r && !('soLayout' in r) && 'soLayout' in anterior) r = anterior;
    }
    // Só sobraram problemas de layout: a animação entra (melhor que perdê-la).
    if ('erro' in r && 'soLayout' in r && r.composicao) {
      this.log.warn(`animação (${m.ideia.slice(0, 40)}) entrou com avisos de layout: ${r.erro!.join('; ').slice(0, 300)}`);
    } else if ('erro' in r) throw new Error(r.erro!.slice(0, 3).join('; '));
    const primeira = r.composicao!;
    const rodadas = extra.rodadas ?? rodadasDeCritica();
    if (!design || rodadas <= 0) return { composicao: primeira, duracaoMs };

    // A crítica OLHA os quadros. Cena abaixo da nota volta para a IA com o
    // parecer; fica a versão de melhor nota (refazer pode piorar).
    let versaoAtual = primeira;
    let melhor: { composicao: ComposicaoHtml; nota: number; problemas: string[] } | null = null;
    let refeita = 0;
    for (let rodada = 0; rodada <= rodadas; rodada += 1) {
      const parecer = await this.criticar(workspaceId, projectId, versaoAtual, duracaoMs, m, design);
      if (!parecer) break;
      if (!melhor || parecer.nota > melhor.nota) melhor = { composicao: versaoAtual, ...parecer };
      // Refaz só a cena QUEBRADA (texto cortado, quadro vazio): cena mediana
      // refeita não melhorava, e cada volta é um desenho a mais.
      if (parecer.nota >= NOTA_PARA_REFAZER || !parecer.problemas.length || rodada === rodadas) break;
      const versao = JSON.stringify({ titulo: versaoAtual.titulo, html: versaoAtual.html, css: versaoAtual.css, script: versaoAtual.script }).slice(0, 16_000);
      const nova = await tentar(
        `${pedido}\n\nSua versão anterior:\n${versao}\n\nUM DIRETOR DE ARTE OLHOU OS QUADROS RENDERIZADOS dela e deu nota ${parecer.nota} de 10. Refaça a cena resolvendo cada ponto (pode mudar a composição inteira se for preciso; mantenha os textos e a sincronia com a fala) e responda o JSON inteiro de novo:\n- ${parecer.problemas.join('\n- ')}`,
      ).catch((e: unknown) => {
        this.log.warn(`animação (${m.ideia.slice(0, 40)}): refazer pela crítica falhou -- ${e instanceof Error ? e.message : e}`);
        return null;
      });
      // A versão nova quebrou algo técnico: fica a melhor que já existe.
      if (!nova || ('erro' in nova && !nova.composicao)) break;
      versaoAtual = nova.composicao!;
      refeita += 1;
    }
    if (!melhor) return { composicao: primeira, duracaoMs };
    this.log.log(`animação (${m.ideia.slice(0, 40)}): crítica ${melhor.nota}/10${refeita ? `, refeita ${refeita}x` : ''}`);
    return { composicao: melhor.composicao, duracaoMs, critica: { nota: melhor.nota, problemas: melhor.problemas, refeita } };
  }

  /**
   * A crítica de uma cena: o worker a fotografa no Chrome e o modelo com
   * visão julga os quadros contra o design do vídeo. `null` quando não deu
   * (worker fora, IA fora, parecer ilegível): a cena entra sem crítica.
   */
  private async criticar(workspaceId: string, projectId: string, c: ComposicaoHtml, duracaoMs: number, m: Momento, design: DesignDoVideo): Promise<{ nota: number; problemas: string[] } | null> {
    try {
      const fotos = await this.animacoes.fotografar(c, duracaoMs);
      if (!fotos?.length) return null;
      const instantes = INSTANTES_DAS_FOTOS.slice(0, fotos.length).map((f, i) => `quadro ${i + 1} aos ${((duracaoMs / 1000) * f).toFixed(1)} s`);
      // Onde fica o vídeo NESTE layout, nas coordenadas das fotos (metade do
      // quadro). Sem isso a crítica chamava a metade do rosto de "vazio morto".
      const metade = (r: { x: number; y: number; w: number; h: number }) => `x ${Math.round(r.x / 2)}-${Math.round((r.x + r.w) / 2)}, y ${Math.round(r.y / 2)}-${Math.round((r.y + r.h) / 2)}`;
      const area = areaDaComposicao(c);
      const janela = janelaDaComposicao(c);
      const ondeEstaOVideo =
        c.layout === 'meio_a_meio'
          ? `A CENA ocupa só ${metade(area)} (px da foto de 540x960); o resto é o VÍDEO (cinza): não julgue nem peça para preencher.`
          : c.layout === 'pip' && janela
            ? `O VÍDEO aparece numa janela em ${metade({ x: janela.x * 1080, y: janela.y * 1920, w: janela.w * 1080, h: janela.h * 1920 })} (px da foto de 540x960): não é vazio.`
            : c.layout === 'cartao'
              ? 'Só a peça do cartão é da cena; todo o cinza em volta é o VÍDEO: não julgue nem peça para preencher.'
              : 'A cena toma o quadro inteiro: vazio grande aqui é defeito.';
      const r = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'criticar_animacao',
        sistema: SISTEMA_DA_CRITICA,
        usuario: `${textoDoDesign(design)}\n\nA CENA (${m.layout}, ${(duracaoMs / 1000).toFixed(1)} s${m.tecnica ? `, técnica: ${tecnicaDeCena(m.tecnica)?.nome ?? m.tecnica}` : ''}): ${m.ideia}\nPlano da direção (confira se os quadros o cumprem):\n${m.conceito || '(livre)'}\nTextos da cena: ${m.conteudo || '(da fala)'}\nOnde está o vídeo: ${ondeEstaOVideo}\nImagens, na ordem: ${instantes.join('; ')}.`,
        imagens: fotos,
        maxTokens: 900,
        promptVersion: VERSAO_LIVRE,
        semCache: true,
        tempoMaximoMs: 90_000,
      });
      return lerCritica(r.texto);
    } catch (e) {
      this.log.warn(`crítica indisponível (${m.ideia.slice(0, 40)}): ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** As animações do plano como momentos (para a série e para refazer). */
  private momentosDoPlano(plano: EditPlanV1, palavras: Array<{ s: number; texto: string }>): Array<{ camada: CamadaDeMidia; momento: Momento }> {
    return (plano.mediaLayers ?? [])
      .filter((c) => c.kind === 'html' && c.composicao)
      .map((camada) => {
        const c = camada.composicao!;
        const b = lerBriefing(c);
        const inicioS = camada.timelineStartMs / 1000;
        const fimS = (camada.timelineStartMs + camada.durationMs) / 1000;
        const momento: Momento = {
          inicioS,
          fimS,
          layout: c.layout,
          ...(c.lado ? { lado: c.lado } : {}),
          ...(c.divisao !== undefined ? { divisao: c.divisao } : {}),
          ...(c.foco !== undefined ? { foco: c.foco } : {}),
          ...(c.canto ? { canto: c.canto } : {}),
          tipo: b.tipo,
          ideia: b.ideia,
          conteudo: b.conteudo,
          acento: 0,
          ...(b.conceito ? { conceito: b.conceito } : {}),
          // A técnica da cena fica no tipo (o rótulo é da direção) ou no plano guardado.
          ...(tecnicaDeCena(b.tecnica) ? { tecnica: tecnicaDeCena(b.tecnica)!.chave } : {}),
          palavras: palavras.filter((p) => p.s >= inicioS && p.s < fimS),
        };
        return { camada, momento };
      });
  }

  /**
   * O design que a direção livre escreveu para o projeto (fica no relatório
   * das animações). Sem ele, o tema guardado numa animação livre do vídeo
   * ainda dá as cores e as fontes -- o bastante para a cena nova combinar.
   */
  private async designDoProjeto(projectId: string, plano: EditPlanV1): Promise<DesignDoVideo | null> {
    const projeto = await Promise.resolve()
      .then(() => this.prisma.project.findUnique({ where: { id: projectId }, select: { animationReport: true } }))
      .catch(() => null);
    const guardado = (projeto?.animationReport as RelatorioDasAnimacoes | null | undefined)?.design;
    const tema = temaLivreSchema.safeParse(guardado?.tema);
    if (guardado && tema.success) return { conceito: String(guardado.conceito ?? ''), linguagem: String(guardado.linguagem ?? ''), movimento: String(guardado.movimento ?? ''), tema: tema.data };
    const doPlano = (plano.mediaLayers ?? []).find((c) => c.kind === 'html' && c.composicao?.tema && !c.composicao.estilo)?.composicao?.tema;
    return doPlano ? { conceito: '', linguagem: '', movimento: '', tema: doPlano } : null;
  }

  /**
   * Uma animação nova para um trecho, pelo método da montagem (o "Peça à
   * IA" usa isto em vez de escrever o HTML). Não salva: devolve a
   * composição para quem chamou pôr no plano.
   */
  async animarTrecho(workspaceId: string, projectId: string, plano: EditPlanV1, p: PedidoDeTrecho): Promise<{ composicao: ComposicaoHtml; duracaoMs: number; estilo?: EstiloDeAnimacao }> {
    const palavras = await this.palavrasNoVideo(projectId, plano);
    const total = agendaDoPlano(plano).duracaoMs / 1000;
    const inicioS = Math.max(0, Math.min(p.inicioS, total - 1));
    const fimS = Math.min(total, Math.max(inicioS + 2, Math.min(p.fimS, inicioS + 15)));
    // Sem estilo pedido nem estilo do catálogo no vídeo, a cena nova segue
    // o design que a direção livre escreveu para o projeto (se houver).
    const doCatalogo = estiloDeAnimacao(p.estilo) ?? estiloDoPlano(plano);
    const design = doCatalogo ? null : await this.designDoProjeto(projectId, plano);
    const visual: Visual = design ? { design } : { estilo: doCatalogo ?? TECNOLOGIA };
    const m: Momento = {
      inicioS,
      fimS,
      layout: p.layout,
      ...(p.layout === 'meio_a_meio' ? { lado: p.lado ?? 'cima' } : {}),
      ...(p.layout === 'pip' ? { canto: p.canto ?? 'inf-dir' } : {}),
      tipo: (p.tipo ?? '').slice(0, 40),
      ideia: p.ideia.slice(0, 300),
      conteudo: (p.conteudo ?? '').slice(0, 800),
      acento: 0,
      ...(p.conceito ? { conceito: p.conceito.slice(0, 700) } : {}),
      ...(tecnicaDeCena(p.tecnica) ? { tecnica: tecnicaDeCena(p.tecnica)!.chave } : {}),
      palavras: palavras.filter((x) => x.s >= inicioS && x.s < fimS),
    };
    const paleta = p.paleta ?? paletaDoPlano(plano);
    // Cenas prontas: o visual pedido, o do vídeo ou (no modo presets, sem
    // estilo de catálogo nem design próprio no vídeo) o do projeto.
    const doVideo = estiloDoPlano(plano);
    const visualMotion =
      visualDeMotion(p.estilo)?.chave ??
      (!p.estilo && doVideo?.familia === 'motion' ? doVideo.chave : undefined) ??
      (!p.estilo && !doVideo && !design && modoDasAnimacoes() === 'presets'
        ? (visualDeMotion((await this.prisma.project.findUnique({ where: { id: projectId }, select: { animationStyle: true } }).catch(() => null))?.animationStyle)?.chave ?? 'mg-keynote')
        : undefined);
    if (visualMotion) {
      // O agente já escolheu a cena e os textos: confere e monta, sem IA.
      const direta = this.cenaDireta(p, m, palavras);
      const pedido = [p.tipo, p.ideia, p.conteudo, p.conceito].filter(Boolean).join('. ');
      const cena = direta ?? (await this.cenaPorPedido(workspaceId, projectId, palavras, m, pedido));
      const r = this.montarCena({ inicioS, fimS, cena, ideia: m.ideia }, visualMotion, palavras, paleta);
      return { ...r, ...(estiloDeAnimacao(visualMotion) ? { estilo: estiloDeAnimacao(visualMotion)! } : {}) };
    }
    const serie = [...this.momentosDoPlano(plano, palavras).map((x) => x.momento), m];
    // Quem pediu está esperando na tela: uma rodada de crítica, não duas.
    const r = await this.escrever(workspaceId, projectId, m, visual, serie, { ...(paleta ? { paleta } : {}), rodadas: Math.min(1, rodadasDeCritica()) });
    return { composicao: r.composicao, duracaoMs: r.duracaoMs, ...(visual.estilo ? { estilo: visual.estilo } : {}) };
  }

  /**
   * Redesenha uma animação que já está no vídeo: outro estilo, outro
   * lugar (layout/lado) ou um pedido da pessoa. Mantém o que ela explica
   * (o briefing) e o tempo. Não salva: devolve a composição nova.
   */
  async redesenhar(workspaceId: string, projectId: string, plano: EditPlanV1, camadaId: string, o: OpcoesDeRefazer): Promise<{ composicao: ComposicaoHtml; duracaoMs: number; estilo?: EstiloDeAnimacao }> {
    const palavras = await this.palavrasNoVideo(projectId, plano);
    const todos = this.momentosDoPlano(plano, palavras);
    const achado = todos.find((x) => x.camada.id === camadaId);
    if (!achado) throw new Error('animação não encontrada');
    const atual = achado.camada.composicao!;
    const m: Momento = { ...achado.momento };
    if (o.layout && o.layout !== m.layout) {
      m.layout = o.layout;
      delete m.divisao;
      delete m.foco;
      if (o.layout !== 'meio_a_meio') delete m.lado;
      else m.lado = o.lado ?? 'cima';
      if (o.layout !== 'pip') delete m.canto;
      else m.canto = o.canto ?? 'inf-dir';
    }
    if (o.canto && m.layout === 'pip') m.canto = o.canto;
    if (o.lado && m.layout === 'meio_a_meio') m.lado = o.lado;

    // Cena pronta (ou pedido de um visual de motion): remonta. Outro visual,
    // paleta ou lugar sai na hora, sem IA; um pedido em texto custa uma
    // chamada pequena que troca só o preset ou os textos.
    const cenaAtual = cenaDaComposicao(atual);
    const visualPedido = visualDeMotion(o.estilo);
    if (visualPedido || (cenaAtual && !o.estilo)) {
      const visual = visualPedido?.chave ?? visualDeMotion(atual.estilo)?.chave ?? 'mg-keynote';
      const paleta = o.paleta === '' ? undefined : (o.paleta ?? atual.paleta);
      const pedido = o.pedido ?? (cenaAtual ? '' : `Mostre: ${m.ideia}. ${m.conteudo}`);
      const cena = pedido ? await this.cenaPorPedido(workspaceId, projectId, palavras, m, pedido, cenaAtual ?? undefined) : cenaAtual!;
      const layout = layoutDoPreset(cena.preset, m.layout);
      const lugar: CenaDeMotion = {
        preset: cena.preset,
        textos: cena.textos,
        layout,
        ...(layout === 'meio_a_meio' ? { lado: m.lado ?? cena.lado ?? 'cima' } : {}),
        ...(layout === 'pip' ? { canto: m.canto ?? cena.canto ?? 'inf-dir' } : {}),
      };
      const r = this.montarCena({ inicioS: m.inicioS, fimS: m.fimS, cena: lugar, ideia: m.ideia }, visual, palavras, paleta);
      return { ...r, ...(estiloDeAnimacao(visual) ? { estilo: estiloDeAnimacao(visual)! } : {}) };
    }
    // Uma animação da direção livre (tem tema, não tem estilo) continua no
    // design do vídeo -- a não ser que a pessoa peça um estilo do catálogo.
    const doCatalogo = estiloDeAnimacao(o.estilo) ?? estiloDeAnimacao(atual.estilo);
    const design = !doCatalogo && atual.tema ? ((await this.designDoProjeto(projectId, plano)) ?? { conceito: '', linguagem: '', movimento: '', tema: atual.tema }) : null;
    const visual: Visual = design ? { design } : { estilo: doCatalogo ?? estiloDoPlano(plano) ?? TECNOLOGIA };
    // Trocar o canto do pip muda onde há espaço livre: também é outro desenho.
    const mudouODesenho = (visual.estilo ? visual.estilo.chave !== atual.estilo : false) || m.layout !== atual.layout || (m.layout === 'pip' && (m.canto ?? 'inf-dir') !== (atual.canto ?? 'inf-dir'));
    const semBriefing = !atual.briefing;
    const serie = todos.map((x) => (x.camada.id === camadaId ? m : x.momento));
    // Paleta: "" tira; ausente mantém a da animação.
    const paleta = o.paleta === '' ? undefined : (o.paleta ?? atual.paleta);
    const soRecolorir = !mudouODesenho && !o.pedido && o.paleta !== undefined && o.paleta !== (atual.paleta ?? '');
    const r = await this.escrever(workspaceId, projectId, m, visual, serie, {
      ...(paleta ? { paleta } : {}),
      ...(soRecolorir ? { pedido: paleta ? 'Troque as cores pela PALETA ESCOLHIDA, mantendo o desenho, os textos e os movimentos.' : 'Volte às cores originais do estilo, mantendo o desenho, os textos e os movimentos.' } : {}),
      base: atual,
      ...(o.pedido && !mudouODesenho ? { pedido: o.pedido } : {}),
      // Estilo ou lugar novo: o desenho é outro; os textos são os mesmos.
      soOsTextos: mudouODesenho || semBriefing,
      ...(o.pedido && mudouODesenho ? { pedido: `${o.pedido} (redesenhe no estilo e no lugar novos)` } : {}),
      // Só recolorir não muda o desenho: não há o que criticar de novo.
      rodadas: soRecolorir ? 0 : Math.min(1, rodadasDeCritica()),
    });
    return { composicao: r.composicao, duracaoMs: r.duracaoMs, ...(visual.estilo ? { estilo: visual.estilo } : {}) };
  }

  /**
   * Refaz animações do projeto (uma, várias ou todas) e salva uma versão
   * do plano com elas. Usado pelo editor (trocar o estilo, o lugar, pedir
   * uma mudança) -- em segundo plano, com a nota do projeto.
   */
  async refazerNoProjeto(sistema: TenantContext, projectId: string, camadas: string[] | 'todas', o: OpcoesDeRefazer): Promise<{ feitas: number; nota: string }> {
    const registrar = async (nota: string) => {
      await this.prisma.project.update({ where: { id: projectId }, data: { animationNote: nota.slice(0, 500) } }).catch(() => undefined);
      this.log.log(`animações do projeto ${projectId}: ${nota}`);
      return nota;
    };
    try {
      const plano = (await this.planos.atual(sistema, projectId)).document;
      const ids = (plano.mediaLayers ?? []).filter((m) => m.kind === 'html' && m.composicao && (camadas === 'todas' || camadas.includes(m.id))).map((m) => m.id);
      if (!ids.length) return { feitas: 0, nota: await registrar('Nenhuma animação para refazer.') };
      const feitas = await Promise.allSettled(ids.map((id) => this.redesenhar(sistema.workspaceId, projectId, plano, id, o)));
      const ops: TimelineOperation[] = [];
      const falhas: string[] = [];
      let estilo: EstiloDeAnimacao | undefined;
      feitas.forEach((f, i) => {
        if (f.status === 'rejected') {
          falhas.push(f.reason instanceof Error ? f.reason.message : String(f.reason));
          return;
        }
        estilo = f.value.estilo;
        ops.push({ op: 'editar_midia', mediaId: ids[i]!, composicao: f.value.composicao });
      });
      if (!ops.length) return { feitas: 0, nota: await registrar(`Não deu para refazer: ${falhas.join(' | ').slice(0, 400)}`) };
      // O plano pode ter mudado enquanto a IA escrevia: aplica sobre o atual.
      const agora = (await this.planos.atual(sistema, projectId)).document;
      const res = aplicarComando(agora, ops, {});
      if (!res.aplicadas) return { feitas: 0, nota: await registrar(`Não deu para refazer: ${res.ignoradas.join('; ').slice(0, 400)}`) };
      await this.planos.salvar(sistema, projectId, res.plan, 'ai');
      // "Aplicar em todas": o estilo passa a ser o do projeto (as próximas animações seguem).
      if (camadas === 'todas' && (o.estilo || o.paleta !== undefined))
        await this.prisma.project
          .update({ where: { id: projectId }, data: { ...(o.estilo ? { animationStyle: o.estilo } : {}), ...(o.paleta !== undefined ? { animationPalette: o.paleta || null } : {}) } })
          .catch(() => undefined);
      for (const op of ops) {
        if (op.op !== 'editar_midia' || !op.composicao) continue;
        const camada = res.plan.mediaLayers?.find((m) => m.id === op.mediaId);
        if (camada) void this.animacoes.preparar(sistema, projectId, op.composicao, camada.durationMs).catch(() => undefined);
      }
      const n = res.aplicadas;
      const nota = `A IA refez ${n} ${n === 1 ? 'animação' : 'animações'}${estilo ? ` no estilo ${estilo.nome}` : ''} (${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})${falhas.length ? `; ${falhas.length} ficou como estava` : ''}.`;
      return { feitas: n, nota: await registrar(nota) };
    } catch (e) {
      const motivo = e && typeof e === 'object' && 'publico' in e ? String((e as { publico: unknown }).publico) : e instanceof Error ? e.message : String(e);
      return { feitas: 0, nota: await registrar(`Não deu para refazer: ${motivo.slice(0, 400)}`) };
    }
  }

  /**
   * Cria as animações da montagem e salva uma versão do plano com elas.
   * Devolve quantas entraram e a nota (também gravada no projeto).
   */
  async criarNaMontagem(
    sistema: TenantContext,
    projectId: string,
    /** Avisa a tela de preparo onde está (0 a 100). */
    aoAvancar: (pct: number) => void = () => undefined,
    /** Chamado com as janelas das animações assim que a direção decide (as mídias evitam esses instantes). */
    aoDirigir: (ocupados: Array<{ inicioMs: number; fimMs: number }>) => void = () => undefined,
    opcoes: OpcoesDasAnimacoes = {},
  ): Promise<{ criadas: number; nota: string }> {
    const relatorio: RelatorioDasAnimacoes = { em: new Date().toISOString(), pedidos: 0, aceitos: [], descartados: [], escrita: [] };
    const registrar = async (nota: string) => {
      await this.prisma.project
        .update({ where: { id: projectId }, data: { animationNote: nota.slice(0, 500), animationReport: relatorio as unknown as Prisma.InputJsonValue } })
        .catch((e: unknown) => this.log.error(`nota das animações não gravada no projeto ${projectId}: ${e instanceof Error ? e.message : e}`));
      this.log.log(`animações do projeto ${projectId}: ${nota}`);
      return nota;
    };
    // Marca o começo: se o processo cair no meio, a nota mostra onde parou.
    await registrar('Criando as animações…');
    try {
      const atual = await this.planos.atual(sistema, projectId);
      const plano = atual.document;
      const palavras = await this.palavrasNoVideo(projectId, plano);
      if (palavras.length < 8) {
        aoDirigir([]);
        relatorio.erro = 'fala insuficiente';
        return { criadas: 0, nota: await registrar('Sem animações: o vídeo não tem fala suficiente para a IA explicar.') };
      }
      const duracaoS = agendaDoPlano(plano).duracaoMs / 1000;
      aoAvancar(5);
      const projeto = await this.prisma.project.findUnique({ where: { id: projectId }, select: { animationStyle: true, animationPalette: true } }).catch(() => null);
      const paletaFixa = coresDaPaleta(projeto?.animationPalette) ? projeto!.animationPalette! : undefined;
      const fixo = estiloDeAnimacao(projeto?.animationStyle);

      // Presets por padrão (ou quando a pessoa escolheu um visual de motion):
      // uma chamada pequena e as cenas prontas.
      if (fixo?.familia === 'motion' || ((opcoes.modo ?? modoDasAnimacoes()) === 'presets' && !fixo)) {
        return await this.criarComPresets(sistema, projectId, plano, palavras, duracaoS, relatorio, registrar, aoAvancar, aoDirigir, fixo?.chave, paletaFixa);
      }

      // Direção livre por padrão. O estilo que a pessoa escolheu para o
      // projeto vale sobre ela: aí é o estilo do catálogo, por cartões.
      const livre = (opcoes.modo ?? modoDasAnimacoes()) === 'livre' && !fixo;
      // A análise do vídeo enviado: a fala medida e a imagem olhada. É a
      // evidência de que a direção parte (e o que a pessoa lê no relatório).
      const perfil = livre ? await this.perfilDoProjeto(sistema.workspaceId, projectId, plano, palavras) : null;
      if (perfil) relatorio.analise = resumoDoPerfil(perfil);
      let direcao: Direcao & { estilo?: EstiloDeAnimacao; design?: DesignDoVideo };
      try {
        direcao = perfil
          ? await this.dirigirLivre(sistema.workspaceId, projectId, plano, palavras, duracaoS, opcoes, perfil).catch(async (e: unknown) => {
              // A direção livre não respondeu (modelo fora, resposta ilegível):
              // o vídeo não fica sem animação por isso.
              this.log.warn(`direção livre falhou no projeto ${projectId}; seguindo pelos cartões: ${e instanceof Error ? e.message : e}`);
              return this.dirigir(sistema.workspaceId, projectId, plano, palavras, duracaoS, fixo);
            })
          : await this.dirigir(sistema.workspaceId, projectId, plano, palavras, duracaoS, fixo);
      } catch (e) {
        aoDirigir([]);
        throw e;
      }
      const { momentos } = direcao;
      const visual: Visual = direcao.design ? { design: direcao.design } : { estilo: direcao.estilo! };
      const { estilo, design } = visual;
      const nomeDoVisual = estilo ? `no estilo ${estilo.nome}` : 'com direção própria';
      Object.assign(relatorio, {
        estilo: estilo?.nome ?? 'Direção livre',
        ...(design ? { design } : {}),
        ...(direcao.tom ? { tom: direcao.tom } : {}),
        ...(direcao.cortada ? { cortada: true } : {}),
        pedidos: direcao.pedidos,
        aceitos: momentos.map((m) => ({ inicioS: m.inicioS, fimS: m.fimS, tipo: m.tipo, layout: m.layout, gatilho: m.palavras.map((p) => p.texto).join(' ').slice(0, 80) })),
        descartados: direcao.descartados,
      });
      aoDirigir(momentos.map((m) => ({ inicioMs: Math.round(m.inicioS * 1000), fimMs: Math.round(m.fimS * 1000) })));
      aoAvancar(20);
      if (!momentos.length) {
        const nota = direcao.pedidos
          ? `Sem animações: a IA sugeriu ${direcao.pedidos}, mas nenhuma passou na conferência (toque para ver os motivos).`
          : design
            ? 'Sem animações: a direção achou que este vídeo fica melhor só com o rosto e a fala.'
            : 'Sem animações: a fala não tem números, listas, comparações ou passos que peçam um cartão.';
        return { criadas: 0, nota: await registrar(nota) };
      }

      // Escreve poucas ao mesmo tempo (o provedor limita as simultâneas);
      // a que falhar por tempo ou rede ganha uma segunda chance no fim.
      let prontas = 0;
      const escrever = (m: Momento) =>
        this.escrever(sistema.workspaceId, projectId, m, visual, momentos, {
          ...(paletaFixa ? { paleta: paletaFixa } : {}),
          ...(opcoes.rodadas !== undefined ? { rodadas: opcoes.rodadas } : {}),
          ...(opcoes.desenho ? { desenho: opcoes.desenho } : {}),
        });
      const feitas = await emLotes(momentos, design ? DESENHOS_SIMULTANEOS : ESCRITAS_SIMULTANEAS, (m) =>
        escrever(m).finally(() => {
          prontas += 1;
          aoAvancar(20 + (70 * prontas) / momentos.length);
        }),
      );
      const passageira = (e: unknown) => /tempo|timeout|abort|429|50\d|rede|network|ECONN|socket/i.test(e instanceof Error ? e.message : String(e));
      const segundas = feitas.map((f, i) => (f.status === 'rejected' && passageira(f.reason) ? i : -1)).filter((i) => i >= 0);
      if (segundas.length) {
        this.log.warn(`animações do projeto ${projectId}: segunda chance para ${segundas.length}`);
        const refeitas = await emLotes(segundas, 2, (i) => escrever(momentos[i]!));
        segundas.forEach((i, k) => {
          feitas[i] = refeitas[k]!;
        });
      }
      aoAvancar(92);

      const ops: TimelineOperation[] = [];
      const falhas: string[] = [];
      const escritos: Momento[] = [];
      feitas.forEach((f, i) => {
        const m = momentos[i]!;
        if (f.status === 'rejected') {
          const motivo = f.reason instanceof Error ? f.reason.message : String(f.reason);
          falhas.push(`${m.inicioS.toFixed(0)}s: ${motivo}`);
          relatorio.escrita.push({ inicioS: m.inicioS, tipo: m.tipo, ok: false, detalhe: motivo.slice(0, 200) });
          return;
        }
        relatorio.escrita.push({ inicioS: m.inicioS, tipo: m.tipo, ok: true, ...(f.value.critica ? { critica: f.value.critica } : {}) });
        escritos.push(m);
        ops.push({ op: 'adicionar_midia', assetId: 'html', kind: 'html', layout: 'tela_cheia', composicao: f.value.composicao, timelineStartMs: Math.round(m.inicioS * 1000), durationMs: f.value.duracaoMs });
      });
      if (!ops.length) return { criadas: 0, nota: await registrar(`Sem animações: nenhuma passou na conferência (${falhas.join(' | ').slice(0, 380)}).`) };

      const salvo = await this.salvarAnimacoes(sistema, projectId, ops, escritos, temaDaAnimacao(estilo?.chave, paletaFixa, design?.tema), relatorio);
      if (salvo) return { criadas: 0, nota: await registrar(`Sem animações: ${salvo.slice(0, 380)}`) };
      aoAvancar(100);
      const criadas = ops.length;
      const quando = ops.map((o) => (o.op === 'adicionar_midia' ? `${Math.round(o.timelineStartMs / 1000)}s` : '')).join(', ');
      const saiu = direcao.descartados.length + falhas.length;
      const nota = `A IA criou ${criadas} ${criadas === 1 ? 'animação' : 'animações'} ${nomeDoVisual} (em ${quando})${saiu ? `; ${saiu} ${saiu === 1 ? 'ficou' : 'ficaram'} de fora (toque para ver por quê)` : ''}.`;
      return { criadas, nota: await registrar(nota) };
    } catch (e) {
      const motivo = e && typeof e === 'object' && 'publico' in e ? String((e as { publico: unknown }).publico) : e instanceof Error ? e.message : String(e);
      relatorio.erro = motivo.slice(0, 400);
      return { criadas: 0, nota: await registrar(`Sem animações: ${motivo.slice(0, 400)}`) };
    }
  }

  /**
   * Põe as animações no plano ATUAL (ele pode ter mudado enquanto a IA
   * trabalhava), tira o zoom que ficaria escondido sob elas, pinta a
   * palavra da legenda na cor do tema, salva e pede o vídeo de cada uma.
   * Devolve o motivo, se nada entrou.
   */
  private async salvarAnimacoes(
    sistema: TenantContext,
    projectId: string,
    ops: TimelineOperation[],
    cobrem: ReadonlyArray<Pick<Momento, 'inicioS' | 'fimS' | 'layout'>>,
    tema: ReturnType<typeof temaDaAnimacao>,
    relatorio: RelatorioDasAnimacoes,
  ): Promise<string | null> {
    const agora = (await this.planos.atual(sistema, projectId)).document;
    // O zoom de um trecho coberto pela animação (tela cheia, pip) não
    // aparece -- ou sai recortado na janela: tira.
    const semZoom = zoomsEscondidos(agora, cobrem).map((clipId): TimelineOperation => ({ op: 'definir_efeito', clipId, effect: 'nenhum' }));
    relatorio.zoomsTirados = semZoom.length;
    const res = aplicarComando(agora, [...ops, ...semZoom], {});
    if (!res.aplicadas) return res.ignoradas.join('; ');
    // A legenda acompanha o tema: a palavra falada na cor de destaque dele
    // (só se a pessoa não escolheu uma cor).
    if (tema && !res.plan.captions.highlightColor && /^#[0-9a-fA-F]{6}$/.test(tema.destaque)) {
      const comLegenda = aplicarComando(res.plan, [{ op: 'configurar_legenda', highlightColor: tema.destaque }], {});
      if (comLegenda.aplicadas) res.plan = comLegenda.plan;
    }
    await this.planos.salvar(sistema, projectId, res.plan, 'ai');
    for (const o of ops) {
      if (o.op !== 'adicionar_midia' || !o.composicao) continue;
      void this.animacoes.preparar(sistema, projectId, o.composicao, o.durationMs).catch((e) => this.log.warn(`vídeo da animação não pedido: ${e instanceof Error ? e.message : e}`));
    }
    return null;
  }

  /** A montagem por presets: perfil, UMA chamada de IA, cenas montadas na hora. */
  private async criarComPresets(
    sistema: TenantContext,
    projectId: string,
    plano: EditPlanV1,
    palavras: Array<{ s: number; texto: string }>,
    duracaoS: number,
    relatorio: RelatorioDasAnimacoes,
    registrar: (nota: string) => Promise<string>,
    aoAvancar: (pct: number) => void,
    aoDirigir: (ocupados: Array<{ inicioMs: number; fimMs: number }>) => void,
    fixo?: string,
    paleta?: string,
  ): Promise<{ criadas: number; nota: string }> {
    let direcao: Awaited<ReturnType<AnimacoesDaFalaService['dirigirPresets']>>;
    let perfil: PerfilDoVideo | null = null;
    try {
      perfil = await this.perfilDoProjeto(sistema.workspaceId, projectId, plano, palavras);
      relatorio.analise = resumoDoPerfil(perfil);
      aoAvancar(10);
      direcao = await this.dirigirPresets(sistema.workspaceId, projectId, plano, palavras, duracaoS, perfil, fixo);
    } catch (e) {
      aoDirigir([]);
      throw e;
    }
    const visual = visualDeMotion(direcao.visual)!;
    Object.assign(relatorio, {
      estilo: `Motion: ${visual.nome}`,
      ...(direcao.tom ? { tom: direcao.tom } : {}),
      ...(direcao.cortada ? { cortada: true } : {}),
      pedidos: direcao.pedidos,
      aceitos: direcao.cenas.map((c) => ({ inicioS: c.inicioS, fimS: c.fimS, tipo: presetDeMotion(c.cena.preset)?.nome ?? c.cena.preset, layout: c.cena.layout, gatilho: palavras.filter((p) => p.s >= c.inicioS && p.s < c.fimS).map((p) => p.texto).join(' ').slice(0, 80) })),
      descartados: direcao.descartados,
    });
    aoDirigir(direcao.cenas.map((c) => ({ inicioMs: Math.round(c.inicioS * 1000), fimMs: Math.round(c.fimS * 1000) })));
    aoAvancar(60);
    // O título de abertura e a chamada final do acabamento viram cenas do
    // visual (sem fundo; o título atrás da pessoa quando há rosto) e saem
    // da camada de textos: um vídeo, uma língua visual.
    const titulos = this.titulosComoCenas(plano, visual, paleta, perfil);
    if (!direcao.cenas.length && !titulos.ops.length) {
      const nota = direcao.pedidos
        ? `Sem animações: a IA sugeriu ${direcao.pedidos}, mas nenhuma passou na conferência (toque para ver os motivos).`
        : 'Sem animações: a IA achou que este vídeo fica melhor só com o rosto e a fala.';
      return { criadas: 0, nota: await registrar(nota) };
    }
    const ops: TimelineOperation[] = [];
    const falhas: string[] = [];
    const cobrem: Array<Pick<Momento, 'inicioS' | 'fimS' | 'layout'>> = [];
    for (const c of direcao.cenas) {
      const nome = presetDeMotion(c.cena.preset)?.nome ?? c.cena.preset;
      try {
        const { composicao, duracaoMs } = this.montarCena(c, visual.chave, palavras, paleta);
        ops.push({ op: 'adicionar_midia', assetId: 'html', kind: 'html', layout: 'tela_cheia', composicao, timelineStartMs: Math.round(c.inicioS * 1000), durationMs: duracaoMs });
        cobrem.push({ inicioS: c.inicioS, fimS: c.fimS, layout: composicao.layout });
        relatorio.escrita.push({ inicioS: c.inicioS, tipo: nome, ok: true });
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        falhas.push(`${c.inicioS.toFixed(0)}s: ${motivo}`);
        relatorio.escrita.push({ inicioS: c.inicioS, tipo: nome, ok: false, detalhe: motivo.slice(0, 200) });
      }
    }
    if (!ops.length && !titulos.ops.length) return { criadas: 0, nota: await registrar(`Sem animações: ${falhas.join(' | ').slice(0, 380)}`) };
    const cenasDaFala = ops.length;
    ops.push(...titulos.ops);
    const naoSalvo = await this.salvarAnimacoes(sistema, projectId, ops, cobrem, temaDaAnimacao(visual.chave, paleta), relatorio);
    if (naoSalvo) return { criadas: 0, nota: await registrar(`Sem animações: ${naoSalvo.slice(0, 380)}`) };
    aoAvancar(100);
    const quando = ops
      .slice(0, cenasDaFala)
      .map((o) => (o.op === 'adicionar_midia' ? `${Math.round(o.timelineStartMs / 1000)}s` : ''))
      .join(', ');
    const saiu = direcao.descartados.length + falhas.length;
    const extras = titulos.nomes.length ? ` + ${titulos.nomes.join(' e ')}` : '';
    const nota = `A IA criou ${cenasDaFala} ${cenasDaFala === 1 ? 'animação' : 'animações'} no visual ${visual.nome}${cenasDaFala ? ` (em ${quando})` : ''}${extras}${saiu ? `; ${saiu} ${saiu === 1 ? 'ficou' : 'ficaram'} de fora (toque para ver por quê)` : ''}.`;
    return { criadas: cenasDaFala + titulos.nomes.length, nota: await registrar(nota) };
  }

  /**
   * O título de abertura e a chamada final (os textos que o acabamento põe)
   * como cenas do visual: mesmo texto, mesmo instante, sem fundo. O título
   * passa atrás da pessoa quando a imagem tem rosto (a máscara do render; sem
   * ela, fica na frente).
   */
  private titulosComoCenas(plano: EditPlanV1, visual: VisualDeMotion, paleta: string | undefined, perfil: PerfilDoVideo | null): { ops: TimelineOperation[]; nomes: string[] } {
    const ops: TimelineOperation[] = [];
    const nomes: string[] = [];
    for (const o of plano.overlays) {
      if ((o.component !== 'HookTitle' && o.component !== 'CTA') || !o.text?.trim()) continue;
      const titulo = o.component === 'HookTitle';
      const cena: CenaDeMotion = {
        preset: titulo ? 'titulo' : 'chamada',
        textos: lerTextosDaCena({ titulo: o.text }),
        layout: 'cartao',
        ...(titulo && perfil?.olhar?.rosto !== 'sem_rosto' ? { atras: true } : {}),
      };
      const composicao = composicaoDoPreset(cena, visual.chave, o.durationMs / 1000, [], { ...(paleta && coresDaPaleta(paleta) ? { paleta } : {}), ideia: titulo ? 'o título do vídeo' : 'a chamada final' });
      if (problemasDaComposicao(composicao).length) continue;
      ops.push({ op: 'remover_overlay', overlayId: o.id });
      ops.push({ op: 'adicionar_midia', assetId: 'html', kind: 'html', layout: 'tela_cheia', composicao, timelineStartMs: o.timelineStartMs, durationMs: o.durationMs });
      nomes.push(titulo ? 'o título de abertura' : 'a chamada final');
    }
    return { ops, nomes };
  }
}

/** Roda `fazer` em cada item, no máximo `n` ao mesmo tempo, na ordem dos resultados. */
async function emLotes<T, R>(itens: readonly T[], n: number, fazer: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const saida: PromiseSettledResult<R>[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      try {
        saida[i] = { status: 'fulfilled', value: await fazer(itens[i]!) };
      } catch (reason) {
        saida[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return saida;
}
