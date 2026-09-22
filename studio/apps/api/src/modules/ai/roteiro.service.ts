// ============================================================
// Roteiro e sugestões (Fase 5c, chamadas #1 e #2).
//
// As duas únicas chamadas do produto que não dependem de vídeo. Rodam
// antes de existir gravação, e é por isso que elas podem ser
// entregues antes do resto: o cliente vê IA funcionando sem precisar
// gravar nada.
//
// A #1 é a única chamada que escreve texto original. O que a mantém
// legítima não é uma regra técnica, é a ordem das coisas: o texto
// ainda será falado por uma pessoa, que lê, corrige e decide. Nenhum
// roteiro gerado é salvo sozinho — o serviço devolve para a tela, e
// quem salva é o usuário, pela mesma rota de um roteiro escrito à
// mão.
//
// A #2 NÃO substitui o checklist local. Os quatro critérios da tela
// são determinísticos, explicáveis e funcionam offline; a IA entra
// como camada adicional, no que exige julgamento. Se a chamada falha,
// o checklist continua — e é essa a razão de ele nunca ter dependido
// de IA.
// ============================================================

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  PERFIL_COMUNICACAO_PADRAO,
  parseRoteiroGerado,
  parseSugestoes,
  roteiroParaEntrada,
} from '@makucho/studio-contracts';
import type {
  CommunicationProfileInput,
  Framework,
  ScriptMode,
  SugestoesDeRoteiro,
} from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

/**
 * Tetos de tokens.
 *
 * Seis blocos de até 2000 caracteres é o pior caso do schema, o que
 * dá perto de 3000 tokens com o JSON em volta. 4000 cobre com folga.
 * As sugestões são menores: três blocos reescritos, não seis.
 */
const MAX_TOKENS_ROTEIRO = 4000;
const MAX_TOKENS_SUGESTOES = 3000;

/**
 * Uma chamada a cada 20 segundos por roteiro (seção 26.3).
 *
 * A tela já aplica debounce de 2s, mas debounce é uma proteção do
 * cliente e o cliente não é confiável: uma aba presa num laço, ou
 * alguém chamando a rota direto, transformaria digitação em uma
 * chamada por tecla. O teto de custo pegaria isso — depois de gastar.
 *
 * Em memória, e isso basta: o limite é por conforto de custo, não de
 * segurança, e a API sobe em processo único nesta VPS. Se virar
 * multi-instância, vai para o Redis.
 */
const INTERVALO_MINIMO_MS = 20_000;

@Injectable()
export class RoteiroService {
  private readonly log = new Logger(RoteiroService.name);
  private readonly ultimaSugestao = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
  ) {}

  // ----------------------------------------------------------
  // #1 — gerar roteiro
  // ----------------------------------------------------------

  /**
   * Escreve um rascunho a partir do tema e do perfil de comunicação.
   *
   * Devolve; não salva. Um roteiro que aparece salvo sem o usuário
   * ter aceitado transforma "gerar com IA" em "substituir o que eu
   * estava escrevendo", e desfazer isso custa mais que escrever de
   * novo.
   */
  async gerar(
    workspaceId: string,
    pedido: { tema: string; framework?: Framework; mode?: ScriptMode; targetDurationMs?: number },
  ) {
    const perfil = await this.perfilDe(workspaceId);

    // O framework precisa estar entre os permitidos pelo perfil: são
    // eles que descrevem como esta pessoa comunica, e gerar fora
    // disso produz um texto correto que ela não diria.
    const framework = pedido.framework ?? perfil.allowedFrameworks[0];
    if (!perfil.allowedFrameworks.includes(framework)) {
      throw new BadRequestException(
        `o framework ${framework} não está entre os permitidos no seu perfil de comunicação`,
      );
    }

    // No meio da faixa do perfil quando não vier pedido: é a duração
    // que essa pessoa já decidiu que funciona para ela.
    const duracao =
      pedido.targetDurationMs ??
      Math.round((perfil.targetDurationMinMs + perfil.targetDurationMaxMs) / 2);

    const mode: ScriptMode = pedido.mode ?? 'BULLETS';
    const { texto: sistema, versao } = this.prompts.obter('gerar_roteiro');

    const resposta = await this.ai.chamar({
      workspaceId,
      chamada: 'gerar_roteiro',
      sistema,
      usuario: this.montarPedidoDeRoteiro(pedido.tema, perfil, framework, mode, duracao),
      maxTokens: MAX_TOKENS_ROTEIRO,
      promptVersion: versao,
    });

    const lido = parseRoteiroGerado(resposta.texto);

    if (!lido.ok) {
      // O log guarda o detalhe técnico; a tela recebe uma frase que
      // diz o que fazer. "blocks.2.role: invalid enum value" não
      // ajuda ninguém a escrever um roteiro.
      this.log.warn(`roteiro inválido (${lido.recuperavel ? 'sintaxe' : 'conteúdo'}): ${lido.erro}`);
      throw new BadRequestException(
        lido.recuperavel
          ? 'a resposta da IA veio incompleta; tente gerar de novo'
          : 'a IA devolveu um roteiro fora do formato esperado; tente com um tema mais específico',
      );
    }

    return {
      // Já no formato que o `scriptInputSchema` aceita: a tela salva
      // pela rota de sempre, sem conversão própria. Dois caminhos de
      // salvamento seriam dois lugares para divergir.
      roteiro: roteiroParaEntrada(lido.dados, duracao),
      custoCentavos: resposta.custoCentavos,
    };
  }

  // ----------------------------------------------------------
  // #2 — sugestões
  // ----------------------------------------------------------

  /**
   * Propõe até três melhorias no roteiro salvo, com o texto pronto.
   *
   * Nunca lança por falha da IA: a tela chama isso sozinha, ao abrir
   * e ao parar de digitar, e um erro vermelho que aparece sem ninguém
   * ter clicado em nada é um defeito, não um aviso. O checklist local
   * continua funcionando do mesmo jeito.
   */
  async sugerir(
    workspaceId: string,
    scriptId: string,
  ): Promise<{ sugestoes: SugestoesDeRoteiro['suggestions']; indisponivel?: string }> {
    // A AUTORIZAÇÃO VEM PRIMEIRO, antes do intervalo mínimo.
    //
    // O contrário seria um vazamento: responder "aguarde 12s" a quem
    // pede sugestão de um roteiro de outro workspace confirma que
    // aquele id existe e está sendo editado agora. E deixaria um
    // workspace negar serviço ao outro, porque o intervalo é por
    // `scriptId` — bastaria pedir a cada 19 segundos.
    const script = await this.prisma.script.findFirst({
      where: { id: scriptId, workspaceId },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });

    if (!script) throw new BadRequestException('roteiro não encontrado');
    if (script.blocks.length === 0) return { sugestoes: [] };

    const agora = Date.now();
    const anterior = this.ultimaSugestao.get(scriptId) ?? 0;

    if (agora - anterior < INTERVALO_MINIMO_MS) {
      const faltam = Math.ceil((INTERVALO_MINIMO_MS - (agora - anterior)) / 1000);
      return { sugestoes: [], indisponivel: `aguarde ${faltam}s para pedir novas sugestões` };
    }

    // Marca ANTES de chamar, não depois: marcar no fim deixaria duas
    // chamadas simultâneas passarem juntas, que é justamente o caso
    // que o intervalo existe para impedir.
    this.ultimaSugestao.set(scriptId, agora);

    const perfil = await this.perfilDe(workspaceId);
    const { texto: sistema, versao } = this.prompts.obter('sugerir_melhorias');

    try {
      const resposta = await this.ai.chamar({
        workspaceId,
        chamada: 'sugerir_melhorias',
        sistema,
        usuario: this.montarPedidoDeSugestoes(script.blocks, perfil),
        maxTokens: MAX_TOKENS_SUGESTOES,
        promptVersion: versao,
      });

      const lido = parseSugestoes(resposta.texto, script.blocks.length);

      if (!lido.ok) {
        this.log.warn(`sugestões inválidas: ${lido.erro}`);
        return { sugestoes: [], indisponivel: 'as sugestões da IA não vieram no formato esperado' };
      }

      return { sugestoes: lido.dados.suggestions };
    } catch (e) {
      // Inclui o 403 do teto de gasto, que é o caso comum e
      // previsível: o usuário atingiu o limite do mês e a tela
      // precisa dizer isso sem parecer um defeito.
      const mensagem = e instanceof Error ? e.message : 'as sugestões da IA estão indisponíveis';
      this.log.warn(`sugestões indisponíveis para o roteiro ${scriptId}: ${mensagem}`);
      return { sugestoes: [], indisponivel: mensagem };
    }
  }

  // ----------------------------------------------------------
  // Montagem do pedido
  // ----------------------------------------------------------

  /**
   * O perfil versionado do workspace, ou o padrão.
   *
   * O tom e o público vêm daqui e não de campo livre digitado na
   * hora (seção 26.3): um perfil versionado é auditável — dá para
   * responder por que um roteiro de março soou diferente de um de
   * setembro — e um prompt improvisado não é.
   */
  private async perfilDe(workspaceId: string): Promise<CommunicationProfileInput> {
    const salvo = await this.prisma.communicationProfile.findUnique({ where: { workspaceId } });
    if (!salvo) return PERFIL_COMUNICACAO_PADRAO;

    return {
      tone: salvo.tone as CommunicationProfileInput['tone'],
      energy: salvo.energy as CommunicationProfileInput['energy'],
      sentenceLen: salvo.sentenceLen as CommunicationProfileInput['sentenceLen'],
      preferredOpening: salvo.preferredOpening as CommunicationProfileInput['preferredOpening'],
      allowedHooks: (salvo.allowedHooks as CommunicationProfileInput['allowedHooks']) ?? [],
      allowedFrameworks:
        (salvo.allowedFrameworks as CommunicationProfileInput['allowedFrameworks']) ?? [],
      selfIntroPolicy: salvo.selfIntroPolicy as CommunicationProfileInput['selfIntroPolicy'],
      storytellingLevel: salvo.storytellingLevel as CommunicationProfileInput['storytellingLevel'],
      humorLevel: salvo.humorLevel as CommunicationProfileInput['humorLevel'],
      allowProfanity: salvo.allowProfanity,
      ctaStyle: salvo.ctaStyle as CommunicationProfileInput['ctaStyle'],
      targetDurationMinMs: salvo.targetDurationMinMs,
      targetDurationMaxMs: salvo.targetDurationMaxMs,
      cutAggressiveness:
        (salvo.cutAggressiveness as CommunicationProfileInput['cutAggressiveness']) ?? 'media',
      bannedWords: (salvo.bannedWords as string[]) ?? [],
      removableFillers: (salvo.removableFillers as string[]) ?? [],
    };
  }

  /**
   * O perfil em texto, para o prompt.
   *
   * Em prosa e não em JSON: o modelo segue melhor uma instrução escrita
   * do que um objeto que ele precisa interpretar. A saída é JSON; a
   * entrada não precisa ser.
   */
  private descreverPerfil(p: CommunicationProfileInput): string {
    const linhas = [
      `- tom: ${p.tone}`,
      `- energia: ${p.energy}`,
      `- frases: ${p.sentenceLen}`,
      `- abertura preferida: ${p.preferredOpening}`,
      `- ganchos permitidos: ${p.allowedHooks.join(', ')}`,
      `- auto-apresentação: ${p.selfIntroPolicy}`,
      `- storytelling: ${p.storytellingLevel}`,
      `- humor: ${p.humorLevel}`,
      `- estilo de CTA: ${p.ctaStyle}`,
    ];

    if (p.bannedWords.length > 0) {
      linhas.push(`- palavras BANIDAS (não use em nenhuma variação): ${p.bannedWords.join(', ')}`);
    }
    if (!p.allowProfanity) {
      linhas.push('- não use palavrão');
    }

    return linhas.join('\n');
  }

  private montarPedidoDeRoteiro(
    tema: string,
    perfil: CommunicationProfileInput,
    framework: Framework,
    mode: ScriptMode,
    duracaoMs: number,
  ): string {
    return [
      `TEMA: ${tema}`,
      '',
      `FRAMEWORK: ${framework}`,
      `MODO: ${mode}`,
      `DURAÇÃO ALVO: ${Math.round(duracaoMs / 1000)} segundos`,
      '',
      'PERFIL DE COMUNICAÇÃO DE QUEM VAI FALAR:',
      this.descreverPerfil(perfil),
      '',
      'Devolva apenas o JSON.',
    ].join('\n');
  }

  private montarPedidoDeSugestoes(
    blocos: Array<{ role: string; goal: string | null; text: string }>,
    perfil: CommunicationProfileInput,
  ): string {
    // Numerado a partir de zero, que é como o modelo devolve o
    // `blockIndex` — o parser confere contra o total, mas uma
    // numeração que combina evita o erro de origem.
    const roteiro = blocos
      .map((b, i) => `[${i}] ${b.role}${b.goal ? ` (${b.goal})` : ''}: ${b.text}`)
      .join('\n\n');

    return [
      'ROTEIRO ATUAL:',
      roteiro,
      '',
      'PERFIL DE COMUNICAÇÃO DE QUEM VAI FALAR:',
      this.descreverPerfil(perfil),
      '',
      'Devolva apenas o JSON. Lista vazia é resposta válida.',
    ].join('\n');
  }
}
