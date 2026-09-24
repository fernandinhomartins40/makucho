'use client';

// ============================================================
// Roteiro (plano, seção 11.2).
//
// Três colunas: configuração à esquerda, o roteiro ao centro e o
// assistente de IA à direita.
//
// O roteiro reduz a necessidade de "salvar" um vídeo mal estruturado
// na edição — por isso ele vem ANTES de gravar, e termina levando ao
// teleprompter.
//
// A pontuação do assistente é calculada do próprio texto (blocos
// presentes, tamanho, pergunta no hook, CTA com verbo de ação). Um
// número vindo de lugar nenhum daria autoridade a um palpite.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '../../components/shell/Topbar';
import { ia, roteiros as apiRoteiros } from '../../lib/api';
import type { SugestaoDaIa } from '../../lib/api';
import {
  IconeIA,
  IconeRelogio,
  IconeRoteiro,
  IconeMais,
  IconeMenu,
  IconeArrastar,
  IconeCheck,
  IconeAviso,
  IconeGravar,
  IconeOlho,
  IconeSalvo,
  IconeLixeira,
  IconeRenomear,
} from '../../components/icones';

// ---------- Estrutura ----------

// Os treze papeis do vocabulario (`clipRoleSchema`), nao quatro.
//
// A tela nasceu com quatro, e isso criava dois defeitos: um roteiro
// salvo com qualquer outro papel -- vindo da IA ou de outra tela --
// virava `undefined` em ROTULO e INTENCAO e quebrava a renderizacao;
// e a geracao com IA ficaria limitada a um quarto do vocabulario que
// o resto do produto usa.
type Papel =
  | 'hook'
  | 'problem'
  | 'context'
  | 'curiosity_gap'
  | 'authority'
  | 'introduction'
  | 'proof'
  | 'insight'
  | 'solution'
  | 'pattern_interrupt'
  | 'payoff'
  | 'offer'
  | 'cta';

/** Duracao alvo do roteiro, no limite que o contrato aceita. */
const DURACAO_ALVO_MS = 45_000;

interface Bloco {
  id: string;
  papel: Papel;
  texto: string;
}

const ROTULO: Record<Papel, string> = {
  hook: 'Hook',
  problem: 'Problema',
  context: 'Contexto',
  curiosity_gap: 'Curiosidade',
  authority: 'Autoridade',
  introduction: 'Apresentação',
  proof: 'Prova',
  insight: 'Insight',
  solution: 'Solução',
  pattern_interrupt: 'Quebra de padrão',
  payoff: 'Recompensa',
  offer: 'Oferta',
  cta: 'CTA',
};

const COR: Record<Papel, string> = {
  hook: '#2f66ff',
  problem: '#8b5cf6',
  context: '#64748b',
  curiosity_gap: '#a855f7',
  authority: '#41c8ff',
  introduction: '#94a3b8',
  proof: '#0ea5e9',
  insight: '#eab308',
  solution: '#14b8a6',
  pattern_interrupt: '#f97316',
  payoff: '#10b981',
  offer: '#ec4899',
  cta: '#22c55e',
};

/** A intenção de cada bloco, mostrada enquanto se escreve. */
const INTENCAO: Record<Papel, string> = {
  hook: 'Os primeiros segundos. Uma afirmação que dá vontade de continuar.',
  problem: 'O que dói, nomeado com clareza.',
  context: 'O que quem assiste precisa saber antes.',
  curiosity_gap: 'A pergunta que fica aberta e segura até o fim.',
  authority: 'Por que você pode falar disso — experiência, não currículo.',
  introduction: 'Quem é você, depois de já ter entregado valor.',
  proof: 'O que sustenta o que você disse — caso, número, resultado.',
  insight: 'O que muda a forma de ver o problema.',
  solution: 'O caminho, aplicável hoje.',
  pattern_interrupt: 'A virada que recupera quem estava dispersando.',
  payoff: 'A entrega do que o hook prometeu.',
  offer: 'O que você oferece, sem rodeio.',
  cta: 'Uma ação só, clara e verificável.',
};

/** Um papel do banco que a tela não conhece não pode quebrar a tela. */
const PAPEIS = Object.keys(ROTULO) as Papel[];
const ehPapel = (v: string): v is Papel => (PAPEIS as string[]).includes(v);

const INICIAL: Bloco[] = [
  {
    id: 'b1',
    papel: 'hook',
    texto:
      'Cansado de esperar no atendimento? Aqui a sua mensagem tem resposta em minutos!',
  },
  {
    id: 'b2',
    papel: 'problem',
    texto:
      'Muita gente perde clientes porque demora para responder no WhatsApp. Isso gera frustração e faz o cliente procurar a concorrência.',
  },
  {
    id: 'b3',
    papel: 'authority',
    texto:
      'Aqui na nossa empresa, usamos um atendimento ágil, organizado e com uma equipe real, pronta para ajudar. Mais de 500 clientes já confiam na nossa agilidade.',
  },
  {
    id: 'b4',
    papel: 'cta',
    texto:
      'Fale agora com a nossa equipe no WhatsApp e descubra como podemos ajudar o seu negócio também!',
  },
];

// ---------- Medidas do texto ----------

/** Ritmo de fala em vídeo curto: ~150 palavras por minuto. */
const PALAVRAS_POR_MINUTO = 150;

function palavrasDe(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

function segundosDe(texto: string): number {
  return Math.round((palavrasDe(texto) / PALAVRAS_POR_MINUTO) * 60);
}

function mmss(segundos: number): string {
  return `${Math.floor(segundos / 60)
    .toString()
    .padStart(2, '0')}:${(segundos % 60).toString().padStart(2, '0')}`;
}

// ---------- Análise ----------

interface Criterio {
  id: string;
  rotulo: string;
  descricao: string;
  ok: boolean;
}

/**
 * Avalia o roteiro pelo próprio texto.
 *
 * Cada critério é verificável, e é isso que separa a análise de um
 * palpite: quem discordar pode conferir a regra.
 */
function analisar(blocos: Bloco[]): { nota: number; criterios: Criterio[] } {
  const porPapel = new Map(blocos.map((b) => [b.papel, b.texto]));
  const hook = porPapel.get('hook') ?? '';
  const cta = porPapel.get('cta') ?? '';
  const total = blocos.reduce((t, b) => t + segundosDe(b.texto), 0);

  const criterios: Criterio[] = [
    {
      id: 'clareza',
      rotulo: 'Clareza',
      descricao: 'Mensagem fácil de entender',
      // Frases muito longas cansam em vídeo curto.
      ok: blocos.every((b) => palavrasDe(b.texto) <= 45),
    },
    {
      id: 'ritmo',
      rotulo: 'Ritmo',
      descricao: 'Tempo bem distribuído',
      ok: total >= 20 && total <= 75,
    },
    {
      id: 'gancho',
      rotulo: 'Gancho',
      descricao: 'Prende a atenção no início',
      // Pergunta ou frase curta e direta seguram os primeiros segundos.
      ok: hook.includes('?') || (palavrasDe(hook) > 0 && palavrasDe(hook) <= 20),
    },
    {
      id: 'cta',
      rotulo: 'CTA',
      descricao: 'Chamada para ação presente',
      ok: /\b(fale|chame|salve|comente|acesse|clique|envie|descubra|veja|siga)\b/i.test(
        cta,
      ),
    },
  ];

  const nota = Math.round((criterios.filter((c) => c.ok).length / criterios.length) * 100);
  return { nota, criterios };
}

/** Sugestões que só aparecem quando cabem de fato. */
function sugerir(blocos: Bloco[]): Array<{ id: string; texto: string; aplicar: () => Bloco[] }> {
  const lista: Array<{ id: string; texto: string; aplicar: () => Bloco[] }> = [];
  const hook = blocos.find((b) => b.papel === 'hook');
  const autoridade = blocos.find((b) => b.papel === 'authority');
  const cta = blocos.find((b) => b.papel === 'cta');

  if (hook && !hook.texto.includes('?')) {
    lista.push({
      id: 'hook-pergunta',
      texto: 'Deixe o hook mais impactante com uma pergunta direta.',
      aplicar: () =>
        blocos.map((b) =>
          b.id === hook.id
            ? { ...b, texto: `E se o problema não fosse o preço? ${b.texto}` }
            : b,
        ),
    });
  }

  if (autoridade && !/\d/.test(autoridade.texto)) {
    lista.push({
      id: 'autoridade-numero',
      texto: 'Inclua um número ou dado para mais credibilidade.',
      aplicar: () =>
        blocos.map((b) =>
          b.id === autoridade.id
            ? { ...b, texto: `${b.texto} Já são mais de 500 casos acompanhados.` }
            : b,
        ),
    });
  }

  if (cta && !/whatsapp|link|perfil|bio/i.test(cta.texto)) {
    lista.push({
      id: 'cta-especifico',
      texto: 'Deixe o CTA mais específico (como "chamar no WhatsApp").',
      aplicar: () =>
        blocos.map((b) =>
          b.id === cta.id ? { ...b, texto: `${b.texto} Chame no WhatsApp da bio.` } : b,
        ),
    });
  }

  return lista;
}

// ============================================================

export default function RoteirosPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <Roteiro />
    </Suspense>
  );
}

function Roteiro() {
  const parametros = useSearchParams();
  const idDaUrl = parametros.get('id');

  const [blocos, setBlocos] = useState<Bloco[]>(INICIAL);
  const [titulo, setTitulo] = useState('Atendimento rápido vende mais');
  const [roteiroId, setRoteiroId] = useState<string | null>(idDaUrl);
  const [salvamento, setSalvamento] = useState<'salvo' | 'salvando' | 'erro'>('salvo');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>('b1');
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Sugestoes da IA -- ADICIONAIS ao checklist local, nunca no lugar
  // dele. Os quatro criterios sao deterministicos, explicaveis e
  // funcionam offline; se a IA falhar, eles continuam.
  const [sugestoesIa, setSugestoesIa] = useState<SugestaoDaIa[]>([]);
  const [iaIndisponivel, setIaIndisponivel] = useState<string | null>(null);
  const [pedindoSugestoes, setPedindoSugestoes] = useState(false);

  const [tema, setTema] = useState('Atendimento via WhatsApp');
  const [objetivo, setObjetivo] = useState('Atrair mais clientes');
  const [publico, setPublico] = useState('Pequenos e médios negócios');
  const [plataforma, setPlataforma] = useState('WhatsApp (Status)');
  const [duracao, setDuracao] = useState('Até 1 minuto (≈ 45s)');
  const [tom, setTom] = useState('Amigável e profissional');

  const palavras = useMemo(
    () => blocos.reduce((t, b) => t + palavrasDe(b.texto), 0),
    [blocos],
  );
  const segundos = useMemo(
    () => blocos.reduce((t, b) => t + segundosDe(b.texto), 0),
    [blocos],
  );
  const { nota, criterios } = useMemo(() => analisar(blocos), [blocos]);
  const sugestoes = useMemo(() => sugerir(blocos), [blocos]);

  // ---------- Carregar ----------
  useEffect(() => {
    if (!idDaUrl) return;

    void apiRoteiros
      .obter(idDaUrl)
      .then((r) => {
        setTitulo(r.title);
        setBlocos(
          r.blocks
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((b, i) => ({
              id: b.id ?? `b${i}`,
              // `ehPapel` e nao `as`: um papel que a tela nao conhece
              // viraria `undefined` em ROTULO e quebraria o render.
              papel: ehPapel(b.role) ? b.role : 'insight',
              texto: b.text,
            })),
        );
      })
      .catch((e) => setAviso(e instanceof Error ? e.message : 'não foi possível carregar.'));
  }, [idDaUrl]);

  // ---------- Salvar sozinho ----------
  //
  // Debounce de 1,5 s: salvar a cada tecla encheria o banco de
  // versões que ninguém pediu, e não salvar nada faria a pessoa
  // perder o roteiro ao fechar a aba.
  const primeiroRender = useRef(true);

  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }

    // Sem hook o contrato recusa — não adianta tentar e mostrar erro
    // enquanto a pessoa ainda está escrevendo.
    const temHook = blocos.some((b) => b.papel === 'hook' && b.texto.trim());
    const temTexto = blocos.some((b) => b.texto.trim());
    if (!temHook || !temTexto) return;

    setSalvamento('salvando');

    const id = setTimeout(async () => {
      const corpo = {
        title: titulo.trim() || 'Roteiro sem título',
        // `BULLETS` e nao 'manual': 'manual' nao existe em
        // SCRIPT_MODES, e o contrato recusava TODO salvamento desta
        // tela com 400 -- a pessoa escrevia, via "salvando", e nada
        // era gravado. O modo descreve o formato do texto, nao quem
        // escreveu, e o que esta tela produz e frase curta por bloco.
        mode: 'BULLETS',
        framework: 'authority_education',
        targetDurationMs: DURACAO_ALVO_MS,
        blocks: blocos
          .filter((b) => b.texto.trim())
          .map((b, i) => ({
            role: b.papel,
            goal: INTENCAO[b.papel].slice(0, 120),
            text: b.texto.trim(),
            position: i,
          })),
      };

      try {
        if (roteiroId) {
          await apiRoteiros.atualizar(roteiroId, corpo);
        } else {
          const criado = await apiRoteiros.criar(corpo);
          setRoteiroId(criado.id);
          // A URL passa a carregar o id: recarregar a página não
          // cria um roteiro duplicado.
          window.history.replaceState(null, '', `/roteiros?id=${criado.id}`);
        }
        setSalvamento('salvo');
      } catch (e) {
        setSalvamento('erro');
        setAviso(e instanceof Error ? e.message : 'não foi possível salvar.');
      }
    }, 1500);

    return () => clearTimeout(id);
  }, [blocos, titulo, roteiroId]);

  // ---------- Sugestões da IA ----------
  //
  // Sob demanda, por um botão. Antes elas eram pedidas sozinhas a cada
  // pausa de 2 s na digitação: uma sessão de escrita de dez minutos
  // virava dezenas de chamadas pagas sobre versões intermediárias que
  // ninguém ia ler. Agora quem escreve pede quando terminou — e pedir de
  // novo sobre o mesmo texto sai do cache do servidor, sem custo.
  const pedirSugestoes = useCallback(async () => {
    if (!roteiroId || pedindoSugestoes) return;
    setPedindoSugestoes(true);
    try {
      const r = await ia.sugestoesDeRoteiro(roteiroId);
      setSugestoesIa(r.sugestoes);
      setIaIndisponivel(r.indisponivel ?? null);
    } catch (e) {
      setSugestoesIa([]);
      setIaIndisponivel(e instanceof Error ? e.message : 'sugestões indisponíveis');
    } finally {
      setPedindoSugestoes(false);
    }
  }, [roteiroId, pedindoSugestoes]);

  /**
   * Aplica uma sugestão: troca o texto do bloco pelo reescrito.
   *
   * Some da lista depois de aplicada. Uma sugestão que continua
   * visível depois de aceita convida a clicar de novo, e o segundo
   * clique trocaria o texto por um que já está lá.
   */
  const aplicarSugestaoDaIa = (s: SugestaoDaIa) => {
    setBlocos((atual) =>
      atual.map((b, i) => (i === s.blockIndex ? { ...b, texto: s.replacementText } : b)),
    );
    setSugestoesIa((atual) => atual.filter((x) => x.blockIndex !== s.blockIndex));
  };

  const editar = (id: string, texto: string) =>
    setBlocos((atual) => atual.map((b) => (b.id === id ? { ...b, texto } : b)));

  const remover = (id: string) => {
    if (blocos.length === 1) {
      setAviso('O roteiro precisa de ao menos um bloco.');
      return;
    }
    setBlocos((atual) => atual.filter((b) => b.id !== id));
    if (selecionado === id) setSelecionado(null);
  };

  const duplicar = (id: string) =>
    setBlocos((atual) => {
      const i = atual.findIndex((b) => b.id === id);
      const alvo = atual[i];
      if (!alvo) return atual;
      const copia = { ...alvo, id: `b${Date.now().toString(36)}` };
      const novo = [...atual];
      novo.splice(i + 1, 0, copia);
      return novo;
    });

  const adicionar = () =>
    setBlocos((atual) => [
      ...atual,
      { id: `b${Date.now().toString(36)}`, papel: 'problem', texto: '' },
    ]);

  /**
   * #1 — gera um rascunho a partir do tema.
   *
   * SUBSTITUI o que está escrito, e é por isso que confirma antes
   * quando já há texto: "gerar" não pode significar "apagar o que eu
   * estava escrevendo" sem aviso. O tom e o público não vão daqui —
   * vêm do perfil de comunicação, versionado, que é o que torna o
   * resultado auditável depois.
   */
  const gerar = async () => {
    const temTexto = blocos.some((b) => b.texto.trim());
    if (
      temTexto &&
      !window.confirm('Isso substitui o roteiro atual. Continuar?')
    ) {
      return;
    }

    setGerando(true);
    setAviso(null);

    try {
      const { roteiro } = await ia.gerarRoteiro({
        tema: tema.trim() || titulo.trim(),
        targetDurationMs: DURACAO_ALVO_MS,
      });

      setTitulo(roteiro.title);
      setBlocos(
        roteiro.blocks.map((b, i) => ({
          id: `b${Date.now().toString(36)}${i}`,
          papel: ehPapel(b.role) ? b.role : 'insight',
          texto: b.text,
        })),
      );
      // O autosave grava sozinho a seguir: o roteiro gerado entra
      // pela mesma porta de um escrito à mão, sem caminho próprio.
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não foi possível gerar o roteiro.');
    } finally {
      setGerando(false);
    }
  };

  const trocarPapel = (id: string, papel: Papel) =>
    setBlocos((atual) => atual.map((b) => (b.id === id ? { ...b, papel } : b)));

  return (
    <>
      <Topbar
        titulo={
          <div>
            <strong style={{ fontSize: 15, display: 'block' }}>Roteiro</strong>
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              Planeje sua mensagem antes de gravar.
            </span>
          </div>
        }
        estado={salvamento}
        busca
      >
        <Link href="/gravar" className="botao botao--pequeno">
          <IconeGravar size={15} weight="fill" />
          Gravar
        </Link>
      </Topbar>

      <div className="conteudo">
        {/* ---------- Projeto ---------- */}
        <section
          className="cartao linha"
          style={{ gap: 'var(--e4)', marginBottom: 'var(--e5)' }}
        >
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: 'var(--r-cartao)',
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            }}
          >
            <IconeRoteiro size={26} color="#fff" />
          </span>

          <div className="crescer" style={{ minWidth: 0 }}>
            {editandoTitulo ? (
              <input
                className="campo__entrada"
                value={titulo}
                autoFocus
                aria-label="Nome do roteiro"
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => setEditandoTitulo(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditandoTitulo(false)}
                style={{ fontSize: 19, fontWeight: 700 }}
              />
            ) : (
              <button
                type="button"
                className="linha"
                onClick={() => setEditandoTitulo(true)}
                aria-label={`Renomear o roteiro ${titulo}`}
                style={{
                  gap: 'var(--e2)',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'text',
                  fontSize: 19,
                  fontWeight: 700,
                  padding: 0,
                }}
              >
                {titulo}
                <IconeRenomear size={16} color="var(--text-secondary)" />
              </button>
            )}
            <p className="texto-secundario" style={{ fontSize: 13, marginTop: 2 }}>
              Projeto · {blocos.length} blocos · {palavras} palavras
            </p>
          </div>

          <button type="button" className="botao-icone" aria-label="Mais opções do roteiro">
            <IconeMenu size={18} />
          </button>
        </section>

        {aviso && (
          <div className="aviso aviso--info" role="status" style={{ marginBottom: 'var(--e4)' }}>
            <IconeAviso size={16} />
            <span>{aviso}</span>
          </div>
        )}

        <div className="roteiro">
          {/* ---------- Configurações ---------- */}
          <aside className="cartao" aria-label="Configurações do roteiro">
            <h2 style={{ marginBottom: 'var(--e4)' }}>Configurações</h2>

            <Selecao rotulo="Tema do vídeo" valor={tema} onMudar={setTema} opcoes={[
              'Atendimento via WhatsApp',
              'Lançamento de produto',
              'Bastidores da empresa',
              'Dúvida frequente',
            ]} />

            <Selecao rotulo="Objetivo" valor={objetivo} onMudar={setObjetivo} opcoes={[
              'Atrair mais clientes',
              'Educar o público',
              'Gerar autoridade',
              'Vender agora',
            ]} />

            <Selecao rotulo="Público" valor={publico} onMudar={setPublico} opcoes={[
              'Pequenos e médios negócios',
              'Profissionais liberais',
              'Consumidor final',
            ]} />

            <Selecao rotulo="Plataforma" valor={plataforma} onMudar={setPlataforma} opcoes={[
              'WhatsApp (Status)',
              'Instagram Reels',
              'TikTok',
              'YouTube Shorts',
            ]} />

            <Selecao rotulo="Duração" valor={duracao} onMudar={setDuracao} opcoes={[
              'Até 30 segundos',
              'Até 1 minuto (≈ 45s)',
              'Até 90 segundos',
            ]} />

            <Selecao rotulo="Tom de voz" valor={tom} onMudar={setTom} opcoes={[
              'Amigável e profissional',
              'Direto e objetivo',
              'Descontraído',
              'Técnico',
            ]} />

            <button
              type="button"
              className="botao botao--largo"
              onClick={gerar}
              disabled={gerando}
              style={{ marginTop: 'var(--e4)' }}
            >
              <IconeIA size={17} weight="fill" />
              {gerando ? 'Gerando…' : 'Gerar com IA'}
            </button>

            <button
              type="button"
              className="botao botao--fantasma botao--largo"
              onClick={() => {
                setBlocos(INICIAL.map((b) => ({ ...b, texto: '' })));
                setAviso(null);
              }}
            >
              Limpar
            </button>
          </aside>

          {/* ---------- Roteiro ---------- */}
          <section className="cartao" aria-label="Roteiro do vídeo">
            <div className="linha entre" style={{ marginBottom: 'var(--e4)' }}>
              <h2>Roteiro do vídeo</h2>

              <span className="linha" style={{ gap: 'var(--e4)' }}>
                <span className="texto-secundario linha" style={{ gap: 4, fontSize: 13 }}>
                  <IconeRelogio size={14} />
                  {mmss(segundos)} estimados
                </span>
                <span className="texto-secundario linha" style={{ gap: 4, fontSize: 13 }}>
                  <IconeRoteiro size={14} />
                  {palavras} palavras
                </span>
                <span className="selo selo--info">
                  <span className="selo__ponto" aria-hidden />
                  Em edição
                </span>
              </span>
            </div>

            <div className="pilha">
              {blocos.map((bloco, i) => (
                <BlocoDoRoteiro
                  key={bloco.id}
                  bloco={bloco}
                  numero={i + 1}
                  ativo={bloco.id === selecionado}
                  onSelecionar={() => setSelecionado(bloco.id)}
                  onEditar={(texto) => editar(bloco.id, texto)}
                  onPapel={(papel) => trocarPapel(bloco.id, papel)}
                  onDuplicar={() => duplicar(bloco.id)}
                  onRemover={() => remover(bloco.id)}
                />
              ))}

              <button type="button" className="botao botao--tracejado" onClick={adicionar}>
                <IconeMais size={16} weight="bold" />
                Adicionar bloco
              </button>
            </div>
          </section>

          {/* ---------- Assistente ---------- */}
          <aside className="cartao" aria-label="Assistente de IA">
            <h2 className="linha" style={{ gap: 'var(--e2)', marginBottom: 'var(--e4)' }}>
              <IconeIA size={19} weight="fill" color="var(--accent)" />
              Assistente de IA
            </h2>

            <div className="linha" style={{ gap: 'var(--e4)', marginBottom: 'var(--e5)' }}>
              <Medidor nota={nota} />
              <div>
                <strong style={{ fontSize: 15, color: 'var(--success)' }}>
                  {nota >= 75 ? 'Boa estrutura' : nota >= 50 ? 'Dá para melhorar' : 'Precisa de ajustes'}
                </strong>
                <p className="texto-secundario" style={{ fontSize: 13, marginTop: 2 }}>
                  {nota >= 75
                    ? 'Seu roteiro está bem organizado e pronto para gravar.'
                    : 'Veja os pontos abaixo antes de gravar.'}
                </p>
              </div>
            </div>

            <h3 style={{ marginBottom: 'var(--e3)' }}>Ajustes rápidos</h3>

            {sugestoes.length === 0 ? (
              <p className="texto-secundario" style={{ fontSize: 13, marginBottom: 'var(--e5)' }}>
                Nada a apontar por enquanto — o roteiro cobre o essencial.
              </p>
            ) : (
              <div className="pilha" style={{ marginBottom: 'var(--e5)' }}>
                {sugestoes.map((s) => (
                  <div key={s.id} className="sugestao">
                    <IconeIA size={16} color="var(--warning)" />
                    <span style={{ fontSize: 13, lineHeight: 1.4 }}>{s.texto}</span>
                    <button
                      type="button"
                      className="botao botao--pequeno"
                      onClick={() => setBlocos(s.aplicar())}
                    >
                      Aplicar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* As sugestoes da IA vem DEPOIS dos ajustes locais e
                antes do checklist: sao adicionais, e a ordem diz
                isso sem precisar de rotulo explicando. */}
            {roteiroId && blocos.some((b) => b.texto.trim()) && (
              <button
                type="button"
                className="botao botao--secundario botao--largo"
                style={{ marginBottom: 'var(--e4)' }}
                disabled={pedindoSugestoes}
                onClick={() => void pedirSugestoes()}
              >
                {pedindoSugestoes ? 'A IA está lendo o roteiro…' : 'Pedir sugestões à IA'}
              </button>
            )}

            {(sugestoesIa.length > 0 || iaIndisponivel || pedindoSugestoes) && (
              <>
                <h3 style={{ marginBottom: 'var(--e3)' }}>
                  Sugestões da IA
                  {pedindoSugestoes && (
                    <span
                      className="texto-secundario"
                      style={{ fontSize: 12, fontWeight: 400, marginLeft: 'var(--e2)' }}
                    >
                      analisando…
                    </span>
                  )}
                </h3>

                {iaIndisponivel ? (
                  <p
                    className="texto-secundario"
                    style={{ fontSize: 13, marginBottom: 'var(--e5)' }}
                  >
                    {iaIndisponivel}
                  </p>
                ) : (
                  <div className="pilha" style={{ marginBottom: 'var(--e5)' }}>
                    {sugestoesIa.map((s) => (
                      <div key={s.blockIndex} className="sugestao" style={{ alignItems: 'start' }}>
                        <IconeIA size={16} color="var(--accent)" />
                        <div style={{ display: 'grid', gap: 'var(--e2)' }}>
                          <strong style={{ fontSize: 13 }}>{s.issue}</strong>
                          <span className="texto-secundario" style={{ fontSize: 12, lineHeight: 1.4 }}>
                            {s.reason}
                          </span>
                          {/* O texto reescrito aparece INTEIRO antes de
                              aplicar: aceitar sem ler o que muda e
                              assinar em branco. */}
                          <span
                            style={{
                              fontSize: 13,
                              lineHeight: 1.45,
                              padding: 'var(--e2) var(--e3)',
                              borderRadius: 6,
                              background: 'var(--surface-2)',
                              borderLeft: '2px solid var(--accent)',
                            }}
                          >
                            {s.replacementText}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="botao botao--pequeno"
                          onClick={() => aplicarSugestaoDaIa(s)}
                        >
                          Aplicar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <h3 style={{ marginBottom: 'var(--e3)' }}>Checklist do roteiro</h3>

            <ul style={{ listStyle: 'none', display: 'grid', gap: 'var(--e3)' }}>
              {criterios.map((c) => (
                <li key={c.id} className="linha" style={{ gap: 'var(--e2)' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: c.ok ? 'var(--success)' : 'var(--surface-2)',
                      border: c.ok ? 'none' : '1px solid var(--border-forte)',
                      color: c.ok ? '#041735' : 'var(--text-secondary)',
                    }}
                  >
                    {c.ok ? <IconeCheck size={12} weight="bold" /> : <IconeAviso size={11} />}
                  </span>
                  <strong style={{ fontSize: 13, minWidth: 74 }}>{c.rotulo}</strong>
                  <span className="texto-secundario" style={{ fontSize: 12 }}>
                    {c.descricao}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href={roteiroId ? `/gravar?roteiro=${roteiroId}` : '/gravar'}
              className="botao botao--largo"
              style={{ marginTop: 'var(--e5)' }}
            >
              <IconeGravar size={16} weight="fill" />
              Usar no teleprompter
            </Link>
          </aside>
        </div>

        {/* ---------- Rodapé ---------- */}
        <footer className="cartao linha" style={{ gap: 'var(--e5)', marginTop: 'var(--e5)' }}>
          <span className="texto-secundario linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
            <IconeRoteiro size={15} />
            {blocos.length} blocos
          </span>
          <span className="texto-secundario linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
            <IconeSalvo size={15} />
            {palavras} palavras
          </span>
          <span className="texto-secundario linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
            <IconeRelogio size={15} />≈ {segundos} segundos
          </span>

          <span className="texto-secundario auto" style={{ fontSize: 13 }}>
            Dica: escreva como você fala. O teleprompter respeita o seu ritmo.
          </span>

          <Link href="/gravar" className="botao botao--secundario botao--pequeno">
            <IconeOlho size={15} />
            Pré-visualizar
          </Link>
        </footer>
      </div>
    </>
  );
}

// ============================================================

function Selecao({
  rotulo,
  valor,
  onMudar,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  onMudar: (v: string) => void;
  opcoes: string[];
}) {
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={`campo-${rotulo}`}>
        {rotulo}
      </label>
      <select
        id={`campo-${rotulo}`}
        className="campo__selecao"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
      >
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function BlocoDoRoteiro({
  bloco,
  numero,
  ativo,
  onSelecionar,
  onEditar,
  onPapel,
  onDuplicar,
  onRemover,
}: {
  bloco: Bloco;
  numero: number;
  ativo: boolean;
  onSelecionar: () => void;
  onEditar: (texto: string) => void;
  onPapel: (papel: Papel) => void;
  onDuplicar: () => void;
  onRemover: () => void;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const segundos = segundosDe(bloco.texto);

  return (
    <article
      className="bloco"
      data-ativo={ativo || undefined}
      style={{ ['--cor-bloco' as string]: COR[bloco.papel] }}
      onClick={onSelecionar}
    >
      <span className="bloco__alca" aria-hidden>
        <IconeArrastar size={16} />
      </span>

      <span className="bloco__numero" aria-hidden>
        {numero}
      </span>

      <div style={{ minWidth: 0 }}>
        <div className="linha" style={{ gap: 'var(--e3)', marginBottom: 'var(--e2)' }}>
          {/* O papel é editável: a IA propõe a estrutura, você
              reclassifica o que discordar. */}
          <select
            className="bloco__papel"
            value={bloco.papel}
            aria-label={`Função do bloco ${numero}`}
            onChange={(e) => onPapel(e.target.value as Papel)}
            onClick={(e) => e.stopPropagation()}
          >
            {(Object.keys(ROTULO) as Papel[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO[p]}
              </option>
            ))}
          </select>

          <span className="texto-secundario linha" style={{ gap: 4, fontSize: 12 }}>
            <IconeRelogio size={12} />
            {mmss(segundos)}
          </span>
        </div>

        <textarea
          className="bloco__texto"
          value={bloco.texto}
          rows={Math.max(2, Math.ceil(bloco.texto.length / 62))}
          placeholder={INTENCAO[bloco.papel]}
          aria-label={`Texto do bloco ${numero}: ${ROTULO[bloco.papel]}`}
          onChange={(e) => onEditar(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <span style={{ position: 'relative' }}>
        <button
          type="button"
          className="botao-icone botao-icone--pequeno"
          aria-label={`Opções do bloco ${numero}`}
          aria-expanded={menuAberto}
          onClick={(e) => {
            e.stopPropagation();
            setMenuAberto((v) => !v);
          }}
        >
          <IconeMenu size={16} />
        </button>

        {menuAberto && (
          <span className="menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="menu__item"
              onClick={() => {
                onDuplicar();
                setMenuAberto(false);
              }}
            >
              <IconeMais size={15} />
              Duplicar
            </button>
            <button
              type="button"
              className="menu__item menu__item--perigo"
              onClick={() => {
                onRemover();
                setMenuAberto(false);
              }}
            >
              <IconeLixeira size={15} />
              Remover
            </button>
          </span>
        )}
      </span>
    </article>
  );
}

/** Anel de progresso. O número vai no centro, legível sem a cor. */
function Medidor({ nota }: { nota: number }) {
  const r = 34;
  const circunferencia = 2 * Math.PI * r;

  return (
    <span
      style={{ position: 'relative', flexShrink: 0 }}
      role="img"
      aria-label={`Pontuação do roteiro: ${nota} de 100`}
    >
      <svg width={84} height={84} aria-hidden>
        <circle cx={42} cy={42} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={7} />
        <circle
          cx={42}
          cy={42}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - nota / 100)}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <strong
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {nota}
      </strong>
    </span>
  );
}
