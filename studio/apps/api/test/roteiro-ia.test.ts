// ============================================================
// As chamadas #1 e #2 (Fase 5c).
//
// O que importa aqui não é que a IA responda — isso o provedor falso
// garante. É o que o serviço faz em volta dela:
//
//   - o perfil versionado chega ao prompt, e não um texto improvisado;
//   - palavra banida no perfil vira instrução explícita;
//   - a #2 NUNCA lança: a tela a chama sozinha, sem clique, e um erro
//     vermelho sem ninguém ter pedido nada é um defeito;
//   - o intervalo mínimo é marcado ANTES da chamada, não depois.
//
// Prisma e AiService são dublês. O que está sob teste é a decisão do
// serviço, não o banco nem o modelo.
// ============================================================

import { PERFIL_COMUNICACAO_PADRAO, scriptInputSchema } from '@makucho/studio-contracts';
import { FalsoProvedor } from '../src/modules/ai/falso.provedor';
import { PromptsService } from '../src/modules/ai/prompts.service';
import { RoteiroService } from '../src/modules/ai/roteiro.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

/** Guarda o que foi pedido ao modelo, para conferir o prompt montado. */
interface PedidoVisto {
  chamada: string;
  sistema: string;
  usuario: string;
  promptVersion: string;
}

function montar(opcoes: {
  perfil?: Record<string, unknown> | null;
  blocos?: Array<{ role: string; goal: string | null; text: string; position: number }>;
  comportamento?: 'valido' | 'json_quebrado' | 'campo_extra' | 'prosa';
  aiLanca?: Error;
}) {
  const vistos: PedidoVisto[] = [];
  const provedor = new FalsoProvedor(opcoes.comportamento ?? 'valido');

  const ai = {
    async chamar(p: PedidoVisto & { maxTokens: number }) {
      vistos.push({
        chamada: p.chamada,
        sistema: p.sistema,
        usuario: p.usuario,
        promptVersion: p.promptVersion,
      });
      if (opcoes.aiLanca) throw opcoes.aiLanca;
      const r = await provedor.conversar({
        chamada: p.chamada as never,
        sistema: p.sistema,
        usuario: p.usuario,
        maxTokens: p.maxTokens,
      });
      return { texto: r.texto, custoCentavos: 3, inputTokens: 10, outputTokens: 20, modelo: 'falso' };
    },
  };

  const prisma = {
    communicationProfile: {
      findUnique: async () => opcoes.perfil ?? null,
    },
    script: {
      findFirst: async () =>
        opcoes.blocos === undefined ? null : { id: 's1', blocks: opcoes.blocos },
    },
  };

  const servico = new RoteiroService(
    prisma as never,
    ai as never,
    new PromptsService(),
  );

  return { servico, vistos };
}

const blocosPadrao = [
  { role: 'hook', goal: 'criar curiosidade', text: 'Voce perde cliente todo dia.', position: 0 },
  { role: 'problem', goal: 'nomear a dor', text: 'A resposta demora horas.', position: 1 },
  { role: 'cta', goal: 'convidar', text: 'Comenta AGENDA.', position: 2 },
];

async function main() {
  // ============================================================
  // #1 — gerar roteiro
  // ============================================================

  {
    const { servico, vistos } = montar({});
    const r = await servico.gerar('w1', { tema: 'tempo de resposta no atendimento' });

    t('o roteiro gerado volta pronto', r.roteiro.blocks.length === 4);
    t(
      'e passa no scriptInputSchema -- a mesma porta do roteiro manual',
      scriptInputSchema.safeParse(r.roteiro).success,
    );
    t('o custo volta junto, para a tela mostrar', r.custoCentavos === 3);

    t('a chamada registrada é gerar_roteiro', vistos[0]?.chamada === 'gerar_roteiro');
    t('a versão do prompt vai gravada', vistos[0]?.promptVersion === 'roteiro-v1');

    // A regra da seção 26.3: o texto ainda será falado por uma
    // pessoa, e é isso que mantém a chamada legítima. O prompt
    // precisa dizer isso, não só o comentário do código.
    t(
      'o prompt diz que o texto será FALADO por uma pessoa',
      // `\s` e não um espaço literal: a frase quebra linha no meio do
      // negrito, e casar com espaço faria o teste falhar por causa da
      // largura do parágrafo em Markdown.
      /falado\*{0,2}\s+\*{0,2}por uma pessoa/i.test(vistos[0]?.sistema ?? ''),
    );
    t(
      'o prompt proíbe inventar número ou estudo',
      /não invente dado, número, estudo/i.test(vistos[0]?.sistema ?? ''),
    );

    // O tom vem do perfil versionado, não de campo livre digitado na
    // hora: é o que torna o resultado auditável meses depois.
    t('o tom do perfil chega ao pedido', vistos[0]?.usuario.includes('tom: direto') === true);
    t('o tema digitado chega ao pedido', vistos[0]?.usuario.includes('atendimento') === true);
  }

  // --- Duração: do perfil quando não é pedida ---
  {
    const { servico, vistos } = montar({});
    const r = await servico.gerar('w1', { tema: 'x' });
    const meio = (PERFIL_COMUNICACAO_PADRAO.targetDurationMinMs +
      PERFIL_COMUNICACAO_PADRAO.targetDurationMaxMs) / 2;

    t('sem duração pedida, usa o meio da faixa do perfil', r.roteiro.targetDurationMs === meio);
    t(
      'e a duração vai ao prompt em segundos, não em ms',
      vistos[0]?.usuario.includes(`${Math.round(meio / 1000)} segundos`) === true,
    );
  }

  // --- Duração explícita ganha ---
  {
    const { servico } = montar({});
    const r = await servico.gerar('w1', { tema: 'x', targetDurationMs: 30_000 });
    t('duração pedida explicitamente é respeitada', r.roteiro.targetDurationMs === 30_000);
  }

  // --- Framework fora do perfil ---
  {
    const { servico } = montar({
      perfil: {
        ...PERFIL_COMUNICACAO_PADRAO,
        allowedFrameworks: ['storytelling'],
        bannedWords: [],
        removableFillers: [],
      },
    });

    let recusou = false;
    try {
      await servico.gerar('w1', { tema: 'x', framework: 'sales' });
    } catch {
      recusou = true;
    }
    t('framework fora do perfil é recusado antes de gastar a chamada', recusou);
  }

  // --- Palavra banida vira instrução ---
  {
    const { servico, vistos } = montar({
      perfil: {
        ...PERFIL_COMUNICACAO_PADRAO,
        allowedFrameworks: ['authority_education'],
        bannedWords: ['gurusinho', 'mentoria'],
        removableFillers: [],
      },
    });
    await servico.gerar('w1', { tema: 'x' });

    t(
      'palavra banida no perfil vira instrução explícita no prompt',
      vistos[0]?.usuario.includes('gurusinho') === true &&
        /BANIDAS/.test(vistos[0]?.usuario ?? ''),
    );
  }

  // --- Saída inválida: mensagem que orienta, não stack trace ---
  {
    const { servico } = montar({ comportamento: 'json_quebrado' });
    let mensagem = '';
    try {
      await servico.gerar('w1', { tema: 'x' });
    } catch (e) {
      mensagem = (e as Error).message;
    }
    t('JSON quebrado vira erro para o usuário', mensagem.length > 0);
    t('e a mensagem sugere tentar de novo -- falha de sintaxe passa', /de novo/i.test(mensagem));
    t('a mensagem não vaza detalhe de schema', !/schemaVersion|ZodError|blocks\./.test(mensagem));
  }

  {
    const { servico } = montar({ comportamento: 'campo_extra' });
    let mensagem = '';
    try {
      await servico.gerar('w1', { tema: 'x' });
    } catch (e) {
      mensagem = (e as Error).message;
    }
    // Campo extra é violação de conteúdo: repetir a mesma chamada só
    // gastaria o teto para receber a mesma recusa.
    t('campo extra é recusado', mensagem.length > 0);
    t('e a mensagem NÃO promete que tentar de novo resolve', !/tente gerar de novo/i.test(mensagem));
  }

  // ============================================================
  // #2 — sugestões
  // ============================================================

  {
    const { servico, vistos } = montar({ blocos: blocosPadrao });
    const r = await servico.sugerir('w1', 's1');

    t('as sugestões voltam', r.sugestoes.length === 1);
    t('cada uma traz o texto reescrito pronto', r.sugestoes[0]?.replacementText.length > 0);
    t('a versão do prompt vai gravada', vistos[0]?.promptVersion === 'sugestoes-v1');

    // O ponto central da #2: ela não repete o que a tela já calcula
    // sozinha, de forma determinística e offline.
    t(
      'o prompt manda NÃO repetir os critérios locais',
      /já rodam sozinhas na tela|NÃO sugerir/i.test(vistos[0]?.sistema ?? ''),
    );
    t(
      'o prompt exige o texto reescrito',
      /replacementText/.test(vistos[0]?.sistema ?? ''),
    );
    t(
      'o prompt autoriza lista vazia',
      /lista vazia|"suggestions": \[\]/i.test(vistos[0]?.sistema ?? ''),
    );

    // Os blocos vão numerados a partir de zero, que é como o modelo
    // devolve o blockIndex.
    t('os blocos vão numerados a partir de zero', vistos[0]?.usuario.includes('[0] hook') === true);
  }

  // --- O intervalo mínimo ---
  {
    const { servico, vistos } = montar({ blocos: blocosPadrao });
    await servico.sugerir('w1', 's1');
    const segunda = await servico.sugerir('w1', 's1');

    t('a segunda chamada seguida é barrada', segunda.sugestoes.length === 0);
    t('e diz quanto falta esperar', /aguarde \d+s/.test(segunda.indisponivel ?? ''));
    t('e NÃO gastou uma chamada de IA', vistos.length === 1);
  }

  // --- Roteiros diferentes não se bloqueiam ---
  {
    const { servico, vistos } = montar({ blocos: blocosPadrao });
    await servico.sugerir('w1', 's1');
    await servico.sugerir('w1', 's2');
    t('o intervalo é por roteiro, não global', vistos.length === 2);
  }

  // --- A #2 nunca lança ---
  {
    const { servico } = montar({
      blocos: blocosPadrao,
      aiLanca: new Error('você atingiu o limite de gasto com IA deste mês'),
    });
    const r = await servico.sugerir('w1', 's1');

    t('teto de gasto NÃO vira exceção na tela', r.sugestoes.length === 0);
    t('e o motivo chega ao usuário', (r.indisponivel ?? '').includes('limite de gasto'));
  }

  {
    const { servico } = montar({ blocos: blocosPadrao, comportamento: 'prosa' });
    const r = await servico.sugerir('w1', 's1');
    t('prosa em vez de JSON não vira exceção', r.sugestoes.length === 0);
    t('e o usuário sabe que as sugestões falharam', (r.indisponivel ?? '').length > 0);
  }

  // --- Roteiro sem blocos ---
  {
    const { servico, vistos } = montar({ blocos: [] });
    const r = await servico.sugerir('w1', 's1');
    t('roteiro vazio não gasta chamada de IA', vistos.length === 0 && r.sugestoes.length === 0);
  }

  // --- Roteiro de outro workspace ---
  {
    const { servico } = montar({});
    let recusou = false;
    try {
      await servico.sugerir('w1', 'de-outro-workspace');
    } catch {
      recusou = true;
    }
    t('roteiro fora do workspace é recusado', recusou);
  }

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
