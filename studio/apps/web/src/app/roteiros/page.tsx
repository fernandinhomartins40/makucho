'use client';

// ============================================================
// Roteiros: criar com IA por pedido livre, ver, ajustar e salvar.
//
// A pessoa escreve do jeito dela o que quer ("um vídeo de 30s pro
// Instagram vendendo minha mentoria pra dentistas, tom descontraído"), e
// a IA monta o roteiro aplicando as técnicas de retenção sozinha --
// gancho, loop aberto, uma ideia, CTA único -- e diz quais usou. Nada de
// listas fechadas de tema, público e tom: o pedido livre diz tudo isso
// melhor (e antes, só o tema chegava à IA).
//
// Depois, o roteiro é editável à mão e por pedido livre à IA ("gancho
// mais forte", "encurta pra 30s", "mais informal"). A IA recebe o roteiro
// inteiro e revisa o todo; a resposta NÃO entra direto: aparece como
// proposta, com o que mudou marcado palavra a palavra, e a pessoa aprova
// (tudo ou bloco a bloco) ou recusa. Com desfazer. Salva sozinho, e leva
// ao teleprompter.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '../../components/shell/Topbar';
import { Folha } from '../../components/shell/Folha';
import { ia, roteiros as apiRoteiros, type RoteiroNaLista, type RoteiroParaSalvar } from '../../lib/api';
import { alinharBlocos, diferencaDeTexto, type Par } from '../../lib/diffDeRoteiro';
import {
  IconeIA,
  IconeRelogio,
  IconeRoteiro,
  IconeMais,
  IconeGravar,
  IconeLixeira,
  IconeCopiar,
  IconeDesfazer,
  IconeSubir,
  IconeDescer,
  IconeFechar,
  IconeCheck,
  IconeBusca,
} from '../../components/icones';

// ---------- Vocabulário ----------

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

const ROTULO: Record<Papel, string> = {
  hook: 'Gancho',
  problem: 'Problema',
  context: 'Contexto',
  curiosity_gap: 'Curiosidade',
  authority: 'Autoridade',
  introduction: 'Apresentação',
  proof: 'Prova',
  insight: 'Insight',
  solution: 'Solução',
  pattern_interrupt: 'Virada',
  payoff: 'Recompensa',
  offer: 'Oferta',
  cta: 'Chamada (CTA)',
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

const PAPEIS = Object.keys(ROTULO) as Papel[];
const ehPapel = (v: string): v is Papel => (PAPEIS as string[]).includes(v);
/**
 * O papel como a tela usa. O banco guarda em maiúsculas (HOOK, CTA), e o
 * roteiro salvo voltava todo como "Insight" ao ser aberto.
 */
const papelDe = (v: string | null | undefined): Papel => {
  const k = (v ?? '').toLowerCase();
  return ehPapel(k) ? k : 'insight';
};
const ESTRUTURAS = ['authority_education', 'viral_education', 'storytelling', 'pas', 'sales'];

const PALAVRAS_POR_SEGUNDO = 2.5;
const palavrasDe = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const DURACOES: ReadonlyArray<{ s: number | null; rotulo: string }> = [
  { s: null, rotulo: 'A IA decide' },
  { s: 15, rotulo: '15 s' },
  { s: 30, rotulo: '30 s' },
  { s: 45, rotulo: '45 s' },
  { s: 60, rotulo: '1 min' },
  { s: 90, rotulo: '1 min 30' },
];

const EXEMPLOS = [
  'Um Reels de 30s mostrando 3 erros que fazem uma loja perder vendas no WhatsApp, tom direto',
  'Vídeo para o TikTok contando como eu comecei minha confeitaria em casa, emocionante e com final inspirador',
  'Vender minha consultoria de finanças para autônomos, com uma chamada para chamar no direct',
];

const RAPIDOS = ['Gancho mais forte', 'Deixa mais curto', 'Mais informal', 'Mais vendedor', 'Conta como história', 'Outra chamada no final'];

// ---------- Estado da tela ----------

interface Bloco {
  id: string;
  papel: Papel;
  intencao: string;
  texto: string;
}

interface Estado {
  titulo: string;
  duracaoMs: number;
  framework: string;
  blocos: Bloco[];
}

const novoId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function daIa(r: RoteiroParaSalvar): Estado {
  return {
    titulo: r.title,
    duracaoMs: r.targetDurationMs,
    framework: r.framework,
    blocos: r.blocks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((b) => ({ id: novoId(), papel: papelDe(b.role), intencao: b.goal ?? '', texto: b.text })),
  };
}

export default function RoteirosPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <Roteiros />
    </Suspense>
  );
}

function Roteiros() {
  const idDaUrl = useSearchParams().get('id');
  const [lista, setLista] = useState<RoteiroNaLista[] | null>(null);
  const [roteiroId, setRoteiroId] = useState<string | null>(idDaUrl);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [historico, setHistorico] = useState<Estado[]>([]);
  const [tecnicas, setTecnicas] = useState<Array<{ nome: string; onde: string }>>([]);
  const [salvamento, setSalvamento] = useState<'salvo' | 'salvando' | 'erro'>('salvo');
  const [aviso, setAviso] = useState<string | null>(null);
  const [listaAberta, setListaAberta] = useState(false);

  const carregarLista = useCallback(() => {
    void apiRoteiros
      .listar()
      .then(setLista)
      .catch(() => setLista([]));
  }, []);
  useEffect(carregarLista, [carregarLista]);

  // ---------- Abrir um roteiro salvo ----------
  const abrir = useCallback((id: string | null) => {
    setListaAberta(false);
    setAviso(null);
    setHistorico([]);
    setTecnicas([]);
    setRoteiroId(id);
    window.history.replaceState(null, '', id ? `/roteiros?id=${id}` : '/roteiros');
    if (!id) {
      setEstado(null);
      return;
    }
    carregando.current = true;
    void apiRoteiros
      .obter(id)
      .then((r) =>
        setEstado({
          titulo: r.title,
          duracaoMs: r.targetDurationMs,
          framework: r.framework,
          blocos: r.blocks
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((b) => ({ id: b.id ?? novoId(), papel: papelDe(b.role), intencao: b.goal ?? '', texto: b.text })),
        }),
      )
      .catch((e) => setAviso(e instanceof Error ? e.message : 'não foi possível abrir o roteiro.'));
  }, []);

  const carregando = useRef(false);
  useEffect(() => {
    if (idDaUrl) abrir(idDaUrl);
    // Só a URL da primeira visita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Mudar (com desfazer) ----------
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const mudar = useCallback((novo: Estado, guardar = true) => {
    const atual = estadoRef.current;
    if (guardar && atual) setHistorico((h) => [...h.slice(-29), atual]);
    setEstado(novo);
  }, []);

  const desfazer = () => {
    const anterior = historico[historico.length - 1];
    if (!anterior) return;
    setHistorico((h) => h.slice(0, -1));
    setEstado(anterior);
  };

  // ---------- Salvar sozinho ----------
  useEffect(() => {
    if (!estado) return;
    // O que acabou de ser aberto não precisa ser salvo de novo.
    if (carregando.current) {
      carregando.current = false;
      return;
    }
    if (!estado.blocos.some((b) => b.texto.trim())) return;
    setSalvamento('salvando');
    const t = setTimeout(async () => {
      const blocos = estado.blocos
        .filter((b) => b.texto.trim())
        .map((b, i) => ({ role: b.papel as string, goal: b.intencao.slice(0, 120) || undefined, text: b.texto.trim().slice(0, 2000), position: i }));
      // O servidor exige um gancho: sem nenhum, o primeiro bloco abre.
      if (!blocos.some((b) => b.role === 'hook')) blocos[0]!.role = 'hook';
      const corpo: RoteiroParaSalvar = {
        title: estado.titulo.trim().slice(0, 160) || 'Roteiro sem título',
        mode: 'FULL',
        framework: ESTRUTURAS.includes(estado.framework) ? estado.framework : 'authority_education',
        targetDurationMs: Math.min(180_000, Math.max(15_000, estado.duracaoMs || 45_000)),
        blocks: blocos,
      };
      try {
        if (roteiroId) {
          await apiRoteiros.atualizar(roteiroId, corpo);
        } else {
          const criado = await apiRoteiros.criar(corpo);
          setRoteiroId(criado.id);
          window.history.replaceState(null, '', `/roteiros?id=${criado.id}`);
        }
        setSalvamento('salvo');
        carregarLista();
      } catch (e) {
        setSalvamento('erro');
        setAviso(e instanceof Error ? e.message : 'não foi possível salvar.');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [estado, roteiroId, carregarLista]);

  const excluir = async (id: string) => {
    if (!window.confirm('Excluir este roteiro? Não dá para desfazer.')) return;
    try {
      await apiRoteiros.remover(id);
      if (id === roteiroId) abrir(null);
      carregarLista();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não foi possível excluir.');
    }
  };

  const listaDeRoteiros = <ListaDeRoteiros lista={lista} atual={roteiroId} onAbrir={abrir} onExcluir={(id) => void excluir(id)} />;

  return (
    <>
      <Topbar
        titulo={
          <div>
            <strong style={{ fontSize: 15, display: 'block' }}>Roteiros</strong>
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              Diga o que quer; a IA escreve com as técnicas que prendem atenção.
            </span>
          </div>
        }
        estado={estado ? salvamento : undefined}
      >
        <button type="button" className="botao botao--fantasma botao--pequeno so-celular" onClick={() => setListaAberta(true)}>
          <IconeRoteiro size={15} /> Meus roteiros
        </button>
        {estado && (
          <Link href={roteiroId ? `/gravar?roteiro=${roteiroId}` : '/gravar'} className="botao botao--pequeno">
            <IconeGravar size={15} weight="fill" />
            <span className="so-largo">Gravar com este roteiro</span>
            <span className="so-celular">Gravar</span>
          </Link>
        )}
      </Topbar>

      <div className="conteudo roteiros">
        <aside className="roteiros__lista so-largo">{listaDeRoteiros}</aside>

        <main className="roteiros__area">
          {aviso && (
            <p className="roteiros__aviso" role="alert">
              {aviso}
              <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Fechar aviso" onClick={() => setAviso(null)}>
                <IconeFechar size={14} />
              </button>
            </p>
          )}
          {estado ? (
            <EditorDeRoteiro
              estado={estado}
              tecnicas={tecnicas}
              podeDesfazer={historico.length > 0}
              onMudar={mudar}
              onDesfazer={desfazer}
              onTecnicas={setTecnicas}
              onAviso={setAviso}
              onNovo={() => abrir(null)}
            />
          ) : (
            <NovoRoteiro
              onPronto={(e, t) => {
                setRoteiroId(null);
                setHistorico([]);
                setTecnicas(t);
                setEstado(e);
              }}
              onEmBranco={() =>
                setEstado({ titulo: 'Novo roteiro', duracaoMs: 45_000, framework: 'authority_education', blocos: [{ id: novoId(), papel: 'hook', intencao: '', texto: '' }] })
              }
              onAviso={setAviso}
            />
          )}
        </main>
      </div>

      <Folha aberta={listaAberta} aoFechar={() => setListaAberta(false)} titulo="Meus roteiros">
        {listaDeRoteiros}
      </Folha>
    </>
  );
}

// ============================================================
// Lista de roteiros salvos
// ============================================================

function ListaDeRoteiros({
  lista,
  atual,
  onAbrir,
  onExcluir,
}: {
  lista: RoteiroNaLista[] | null;
  atual: string | null;
  onAbrir: (id: string | null) => void;
  onExcluir: (id: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const filtrados = (lista ?? []).filter((r) => !termo || r.title.toLocaleLowerCase('pt-BR').includes(termo));
  return (
    <div className="lista-roteiros">
      <button type="button" className="botao botao--primario" onClick={() => onAbrir(null)}>
        <IconeMais size={16} /> Novo roteiro
      </button>
      {(lista?.length ?? 0) > 4 && (
        <label className="lista-roteiros__busca">
          <IconeBusca size={14} aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar roteiro" aria-label="Buscar roteiro" />
        </label>
      )}
      <h2 className="lista-roteiros__titulo">Meus roteiros</h2>
      {lista === null ? (
        <span className="esqueleto" style={{ height: 120 }} />
      ) : filtrados.length === 0 ? (
        <p className="lista-roteiros__vazio">{lista.length ? 'Nenhum com esse nome.' : 'Os roteiros que você criar aparecem aqui.'}</p>
      ) : (
        <ul>
          {filtrados.map((r) => (
            <li key={r.id} data-atual={r.id === atual || undefined}>
              <button type="button" className="lista-roteiros__item" onClick={() => onAbrir(r.id)}>
                <strong>{r.title}</strong>
                <span>
                  {mmss(r.targetDurationMs / 1000)} · {new Date(r.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
              </button>
              <button type="button" className="botao-icone botao-icone--pequeno lista-roteiros__excluir" aria-label={`Excluir ${r.title}`} onClick={() => onExcluir(r.id)}>
                <IconeLixeira size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// Novo roteiro: um pedido livre
// ============================================================

function NovoRoteiro({
  onPronto,
  onEmBranco,
  onAviso,
}: {
  onPronto: (e: Estado, tecnicas: Array<{ nome: string; onde: string }>) => void;
  onEmBranco: () => void;
  onAviso: (a: string | null) => void;
}) {
  const [pedido, setPedido] = useState('');
  const [duracaoS, setDuracaoS] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);

  const gerar = async () => {
    if (pedido.trim().length < 3 || gerando) return;
    setGerando(true);
    onAviso(null);
    try {
      const r = await ia.roteiroLivre({ pedido: pedido.trim(), duracaoS });
      onPronto(daIa(r.roteiro), r.tecnicas);
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'não foi possível criar o roteiro.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <section className="roteiro-novo">
      <span className="roteiro-novo__icone" aria-hidden>
        <IconeIA size={26} weight="fill" />
      </span>
      <h1>Sobre o que é o seu vídeo?</h1>
      <p className="roteiro-novo__ajuda">
        Escreva do seu jeito: o assunto, para quem é, onde vai postar, o objetivo e o tom. Quanto mais contexto, melhor o roteiro.
      </p>
      <form
        className="roteiro-novo__form"
        onSubmit={(e) => {
          e.preventDefault();
          void gerar();
        }}
      >
        <textarea
          className="roteiro-novo__pedido"
          value={pedido}
          maxLength={3000}
          rows={4}
          autoFocus
          placeholder="Ex.: Um Reels de 30s para donos de restaurante mostrando por que responder rápido no WhatsApp aumenta as vendas. Tom direto, termina pedindo para seguir o perfil."
          onChange={(e) => setPedido(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void gerar();
          }}
        />
        <div className="roteiro-novo__linha">
          <div className="roteiro-novo__duracoes" role="radiogroup" aria-label="Duração">
            <IconeRelogio size={14} aria-hidden />
            {DURACOES.map((d) => (
              <button key={d.rotulo} type="button" role="radio" aria-checked={duracaoS === d.s} onClick={() => setDuracaoS(d.s)}>
                {d.rotulo}
              </button>
            ))}
          </div>
          <button type="submit" className="botao botao--primario" disabled={gerando || pedido.trim().length < 3}>
            <IconeIA size={16} weight="fill" />
            {gerando ? 'Escrevendo o roteiro…' : 'Criar roteiro'}
          </button>
        </div>
      </form>

      <div className="roteiro-novo__exemplos">
        <span>Ideias para começar:</span>
        {EXEMPLOS.map((e) => (
          <button key={e} type="button" onClick={() => setPedido(e)}>
            {e}
          </button>
        ))}
      </div>
      <button type="button" className="roteiro-novo__branco" onClick={onEmBranco}>
        ou escrever do zero, sem IA
      </button>
    </section>
  );
}

// ============================================================
// Editor do roteiro
// ============================================================

function EditorDeRoteiro({
  estado,
  tecnicas,
  podeDesfazer,
  onMudar,
  onDesfazer,
  onTecnicas,
  onAviso,
  onNovo,
}: {
  estado: Estado;
  tecnicas: Array<{ nome: string; onde: string }>;
  podeDesfazer: boolean;
  onMudar: (e: Estado, guardar?: boolean) => void;
  onDesfazer: () => void;
  onTecnicas: (t: Array<{ nome: string; onde: string }>) => void;
  onAviso: (a: string | null) => void;
  onNovo: () => void;
}) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [pedido, setPedido] = useState('');
  const [pedindo, setPedindo] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<{ pedido: string; resposta: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  // O que a IA propôs, esperando a pessoa aprovar (nada muda antes disso).
  const [proposta, setProposta] = useState<Proposta | null>(null);

  const palavras = useMemo(() => estado.blocos.reduce((t, b) => t + palavrasDe(b.texto), 0), [estado.blocos]);
  const segundos = palavras / PALAVRAS_POR_SEGUNDO;
  const alvoS = estado.duracaoMs / 1000;
  const temGancho = estado.blocos[0]?.papel === 'hook' && Boolean(estado.blocos[0].texto.trim());
  const temCta = estado.blocos.some((b) => b.papel === 'cta' && b.texto.trim());
  const indiceSelecionado = estado.blocos.findIndex((b) => b.id === selecionado);

  // Digitação não entra no desfazer a cada tecla: guarda o estado de
  // antes da primeira tecla num bloco, uma vez.
  const digitando = useRef<string | null>(null);
  const mudarBloco = (id: string, mudanca: Partial<Bloco>) => {
    const guardar = digitando.current !== id || !('texto' in mudanca);
    if ('texto' in mudanca) digitando.current = id;
    onMudar({ ...estado, blocos: estado.blocos.map((b) => (b.id === id ? { ...b, ...mudanca } : b)) }, guardar);
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= estado.blocos.length) return;
    const blocos = [...estado.blocos];
    [blocos[i], blocos[j]] = [blocos[j]!, blocos[i]!];
    onMudar({ ...estado, blocos });
  };
  const remover = (id: string) => {
    if (estado.blocos.length === 1) return;
    onMudar({ ...estado, blocos: estado.blocos.filter((b) => b.id !== id) });
  };
  const adicionar = () => {
    const bloco: Bloco = { id: novoId(), papel: 'insight', intencao: '', texto: '' };
    const i = indiceSelecionado >= 0 ? indiceSelecionado + 1 : estado.blocos.length;
    const blocos = [...estado.blocos];
    blocos.splice(i, 0, bloco);
    onMudar({ ...estado, blocos });
    setSelecionado(bloco.id);
  };

  const pedirIa = async (texto: string) => {
    const limpo = texto.trim();
    if (limpo.length < 2 || pedindo) return;
    setPedindo(true);
    setResposta(null);
    onAviso(null);
    // Com uma proposta aberta, o novo pedido ajusta a proposta.
    const base = proposta?.estado ?? estado;
    try {
      const r = await ia.editarRoteiro({
        pedido: limpo,
        // O roteiro INTEIRO vai como contexto: a IA revisa o todo, não um bloco.
        roteiro: {
          title: base.titulo.slice(0, 160),
          ...(ESTRUTURAS.includes(base.framework) ? { framework: base.framework } : {}),
          targetDurationMs: Math.min(600_000, Math.max(5_000, base.duracaoMs || 45_000)),
          blocks: base.blocos
            .filter((b) => b.texto.trim())
            .slice(0, 30)
            .map((b) => ({ role: b.papel, goal: b.intencao.slice(0, 200) || undefined, text: b.texto.slice(0, 2000) })),
        },
        ...(anterior ? { anterior: { pedido: anterior.pedido.slice(0, 2000), resposta: anterior.resposta.slice(0, 600) } } : {}),
      });
      const novo = daIa(r.roteiro);
      const pares = alinharBlocos(
        estado.blocos,
        novo.blocos,
        (b) => b.texto,
        (a, b) => a.papel === b.papel,
      );
      setProposta({
        estado: novo,
        pares,
        aceitos: pares.map((p) => p.tipo !== 'igual'),
        tecnicas: r.tecnicas,
        resposta: r.resposta || 'Ajustei o roteiro.',
        mudancas: r.mudancas ?? [],
        pedido: limpo,
      });
      setAnterior({ pedido: limpo, resposta: r.resposta });
      setPedido('');
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'a IA não conseguiu ajustar agora.');
    } finally {
      setPedindo(false);
    }
  };

  /** Aplica as mudanças marcadas; as desmarcadas ficam como estavam. */
  const aplicarProposta = () => {
    if (!proposta) return;
    const blocos: Bloco[] = [];
    proposta.pares.forEach((p, i) => {
      const aceito = proposta.aceitos[i];
      if (p.tipo === 'igual') blocos.push(p.velho);
      else if (aceito && p.novo) blocos.push(p.velho ? { ...p.novo, id: p.velho.id } : p.novo);
      else if (!aceito && p.velho) blocos.push(p.velho);
    });
    if (!blocos.length) return;
    const algumAceito = proposta.aceitos.some(Boolean);
    digitando.current = null;
    onMudar(
      algumAceito
        ? { ...estado, titulo: proposta.estado.titulo || estado.titulo, framework: proposta.estado.framework, duracaoMs: proposta.estado.duracaoMs, blocos }
        : estado,
    );
    if (algumAceito && proposta.tecnicas.length) onTecnicas(proposta.tecnicas);
    setResposta(algumAceito ? proposta.resposta : null);
    setProposta(null);
    setSelecionado(null);
  };

  const copiar = async () => {
    const texto = estado.blocos.map((b) => b.texto.trim()).filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      onAviso('não foi possível copiar; selecione o texto e copie.');
    }
  };

  return (
    <div className="roteiro">
      <header className="roteiro__topo">
        <input
          className="roteiro__titulo"
          value={estado.titulo}
          maxLength={160}
          aria-label="Título do roteiro"
          onChange={(e) => onMudar({ ...estado, titulo: e.target.value }, false)}
        />
        <div className="roteiro__meta">
          <span data-alerta={alvoS > 0 && segundos > alvoS * 1.2 ? '' : undefined} title="Estimado em ritmo de fala (2,5 palavras por segundo)">
            <IconeRelogio size={14} /> ~{mmss(segundos)}
            {alvoS > 0 ? ` de ${mmss(alvoS)}` : ''}
          </span>
          <span>{palavras} palavras</span>
          <span data-ok={temGancho || undefined}>{temGancho ? <IconeCheck size={13} /> : null} Gancho</span>
          <span data-ok={temCta || undefined}>{temCta ? <IconeCheck size={13} /> : null} Chamada</span>
        </div>
        <div className="roteiro__acoes">
          <button type="button" className="botao botao--fantasma botao--pequeno" disabled={!podeDesfazer} onClick={onDesfazer}>
            <IconeDesfazer size={14} /> Desfazer
          </button>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => void copiar()}>
            <IconeCopiar size={14} /> {copiado ? 'Copiado' : 'Copiar texto'}
          </button>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={onNovo}>
            <IconeMais size={14} /> Novo
          </button>
        </div>
      </header>

      {tecnicas.length > 0 && (
        <details className="roteiro__tecnicas">
          <summary>
            <IconeIA size={14} weight="fill" /> {tecnicas.length} técnicas aplicadas pela IA
          </summary>
          <ul>
            {tecnicas.map((t) => (
              <li key={t.nome + t.onde}>
                <strong>{t.nome}</strong> {t.onde}
              </li>
            ))}
          </ul>
        </details>
      )}

      {proposta ? (
        <RevisaoDaIa
          atual={estado}
          proposta={proposta}
          onMarcar={(i, v) => setProposta((p) => (p ? { ...p, aceitos: p.aceitos.map((a, j) => (j === i ? v : a)) } : p))}
          onTodos={(v) => setProposta((p) => (p ? { ...p, aceitos: p.pares.map((par) => par.tipo !== 'igual' && v) } : p))}
          onAplicar={aplicarProposta}
          onRecusar={() => {
            setProposta(null);
            setResposta(null);
          }}
        />
      ) : (
        <>
      <ol className="roteiro__blocos">
        {estado.blocos.map((b, i) => (
          <li
            key={b.id}
            className="roteiro-bloco"
            data-selecionado={b.id === selecionado || undefined}
            style={{ ['--cor-papel' as string]: COR[b.papel] }}
            onClick={() => setSelecionado(b.id)}
          >
            <div className="roteiro-bloco__cabeca">
              <select
                className="roteiro-bloco__papel"
                value={b.papel}
                aria-label={`Tipo do bloco ${i + 1}`}
                onChange={(e) => mudarBloco(b.id, { papel: e.target.value as Papel })}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO[p]}
                  </option>
                ))}
              </select>
              <span className="roteiro-bloco__tempo">~{Math.max(1, Math.round(palavrasDe(b.texto) / PALAVRAS_POR_SEGUNDO))} s</span>
              <span className="roteiro-bloco__ferramentas">
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Subir bloco" disabled={i === 0} onClick={() => mover(i, -1)}>
                  <IconeSubir size={14} />
                </button>
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Descer bloco" disabled={i === estado.blocos.length - 1} onClick={() => mover(i, 1)}>
                  <IconeDescer size={14} />
                </button>
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Remover bloco" disabled={estado.blocos.length === 1} onClick={() => remover(b.id)}>
                  <IconeLixeira size={14} />
                </button>
              </span>
            </div>
            {b.intencao && <p className="roteiro-bloco__intencao">{b.intencao}</p>}
            <TextoAutoAjustavel valor={b.texto} aoMudar={(t) => mudarBloco(b.id, { texto: t })} rotulo={`Texto do bloco ${i + 1}`} />
          </li>
        ))}
      </ol>
      <button type="button" className="roteiro__adicionar" onClick={adicionar}>
        <IconeMais size={14} /> Adicionar bloco
      </button>
        </>
      )}

      {/* ---------- Peça à IA ---------- */}
      <div className="roteiro-ia">
        {resposta && (
          <p className="roteiro-ia__resposta" role="status">
            <IconeCheck size={14} /> {resposta}
            {podeDesfazer && (
              <button type="button" onClick={onDesfazer}>
                Desfazer
              </button>
            )}
          </p>
        )}
        {pedindo && (
          <p className="roteiro-ia__alvo" role="status">
            A IA está relendo o roteiro inteiro e revisando o que o pedido pede…
          </p>
        )}
        <form
          className="roteiro-ia__linha"
          onSubmit={(e) => {
            e.preventDefault();
            void pedirIa(pedido);
          }}
        >
          <IconeIA size={18} weight="fill" aria-hidden />
          <input
            value={pedido}
            maxLength={2000}
            placeholder={proposta ? 'Quer mudar algo nesta proposta? Peça aqui' : 'Peça à IA: "deixa o gancho mais forte", "encurta pra 30s", "fala do preço no bloco 3"...'}
            onChange={(e) => setPedido(e.target.value)}
            disabled={pedindo}
            aria-label="Pedido para a IA ajustar o roteiro"
          />
          <button type="submit" className="botao botao--primario botao--pequeno" disabled={pedindo || pedido.trim().length < 2}>
            {pedindo ? 'Ajustando…' : 'Ajustar'}
          </button>
        </form>
        {!pedindo && !proposta && (
          <div className="roteiro-ia__rapidos">
            {RAPIDOS.map((r) => (
              <button key={r} type="button" onClick={() => void pedirIa(r)}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Revisão da proposta da IA: o que mudou, bloco a bloco, para aprovar
// ============================================================

interface Proposta {
  estado: Estado;
  pares: Par<Bloco>[];
  /** Por par: usar a versão da IA? (os iguais não contam) */
  aceitos: boolean[];
  tecnicas: Array<{ nome: string; onde: string }>;
  resposta: string;
  mudancas: string[];
  pedido: string;
}

const SELO_DO_PAR: Record<Par<Bloco>['tipo'], string> = { igual: 'Sem mudança', alterado: 'Alterado', novo: 'Bloco novo', removido: 'Removido' };

function RevisaoDaIa({
  atual,
  proposta,
  onMarcar,
  onTodos,
  onAplicar,
  onRecusar,
}: {
  atual: Estado;
  proposta: Proposta;
  onMarcar: (i: number, v: boolean) => void;
  onTodos: (v: boolean) => void;
  onAplicar: () => void;
  onRecusar: () => void;
}) {
  const [mostrarIguais, setMostrarIguais] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // A proposta chega com a pessoa lá embaixo, na barra da IA: leva ao topo dela.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [proposta.pedido, proposta.estado]);
  const mudados = proposta.pares.filter((p) => p.tipo !== 'igual').length;
  const marcados = proposta.pares.filter((p, i) => p.tipo !== 'igual' && proposta.aceitos[i]).length;
  const tempo = (e: Estado | Bloco[]) => mmss((Array.isArray(e) ? e : e.blocos).reduce((t, b) => t + palavrasDe(b.texto), 0) / PALAVRAS_POR_SEGUNDO);
  const tituloMudou = proposta.estado.titulo.trim() && proposta.estado.titulo.trim() !== atual.titulo.trim();

  return (
    <section ref={ref} className="revisao-ia" aria-label="Mudanças propostas pela IA" style={{ scrollMarginTop: 72 }}>
      <header className="revisao-ia__topo">
        <span className="revisao-ia__icone" aria-hidden>
          <IconeIA size={18} weight="fill" />
        </span>
        <div>
          <h2>A IA propõe {mudados === 1 ? '1 mudança' : `${mudados} mudanças`}</h2>
          <p>
            Pedido: <em>&ldquo;{proposta.pedido}&rdquo;</em>. {proposta.resposta}
          </p>
        </div>
      </header>

      {proposta.mudancas.length > 0 && (
        <ul className="revisao-ia__lista">
          {proposta.mudancas.map((m) => (
            <li key={m}>
              <IconeCheck size={13} /> {m}
            </li>
          ))}
        </ul>
      )}

      <div className="revisao-ia__resumo">
        <span>
          Duração: ~{tempo(atual)} → <strong>~{tempo(proposta.estado)}</strong>
        </span>
        {tituloMudou && (
          <span>
            Título: <del>{atual.titulo}</del> <ins>{proposta.estado.titulo}</ins>
          </span>
        )}
        <span className="revisao-ia__legenda">
          <ins>texto novo</ins> <del>texto que sai</del>
        </span>
      </div>

      {mudados === 0 ? (
        <p className="revisao-ia__vazio">A IA devolveu o roteiro sem mudanças. Tente descrever o pedido de outro jeito.</p>
      ) : (
        <div className="revisao-ia__marcar">
          <span>
            {marcados} de {mudados} marcadas
          </span>
          <button type="button" onClick={() => onTodos(true)}>
            Marcar todas
          </button>
          <button type="button" onClick={() => onTodos(false)}>
            Desmarcar todas
          </button>
          {mudados < proposta.pares.length && (
            <button type="button" onClick={() => setMostrarIguais((v) => !v)}>
              {mostrarIguais ? 'Esconder' : 'Mostrar'}{' '}
              {proposta.pares.length - mudados === 1 ? 'o bloco sem mudança' : `os ${proposta.pares.length - mudados} blocos sem mudança`}
            </button>
          )}
        </div>
      )}

      <ol className="revisao-ia__blocos">
        {proposta.pares.map((p, i) => {
          if (p.tipo === 'igual' && !mostrarIguais) return null;
          const bloco = p.novo ?? p.velho!;
          const aceito = p.tipo !== 'igual' && proposta.aceitos[i];
          const papelMudou = p.tipo === 'alterado' && p.velho.papel !== p.novo.papel;
          return (
            <li
              key={`${i}-${bloco.id}`}
              className="revisao-bloco"
              data-tipo={p.tipo}
              data-aceito={aceito || undefined}
              style={{ ['--cor-papel' as string]: COR[bloco.papel] }}
            >
              <div className="revisao-bloco__cabeca">
                <span className="revisao-bloco__papel">
                  {papelMudou ? (
                    <>
                      <del>{ROTULO[p.velho!.papel]}</del> → {ROTULO[p.novo!.papel]}
                    </>
                  ) : (
                    ROTULO[bloco.papel]
                  )}
                </span>
                <span className="revisao-bloco__selo" data-tipo={p.tipo}>
                  {SELO_DO_PAR[p.tipo]}
                </span>
                {p.tipo !== 'igual' && (
                  <label className="revisao-bloco__usar">
                    <input type="checkbox" checked={aceito} onChange={(e) => onMarcar(i, e.target.checked)} />
                    {p.tipo === 'removido' ? 'Remover' : 'Usar'}
                  </label>
                )}
              </div>
              {p.novo?.intencao && <p className="roteiro-bloco__intencao">{p.novo.intencao}</p>}
              <p className="revisao-bloco__texto">
                {p.tipo === 'alterado' ? (
                  diferencaDeTexto(p.velho.texto, p.novo.texto).map((t, k) => {
                    // O espaço que separa fica fora do destaque.
                    const espaco = t.texto.startsWith(' ') ? ' ' : '';
                    const palavras = t.texto.trimStart();
                    return (
                      <span key={k}>
                        {espaco}
                        {t.tipo === 'mais' ? <ins>{palavras}</ins> : t.tipo === 'menos' ? <del>{palavras}</del> : palavras}
                      </span>
                    );
                  })
                ) : p.tipo === 'novo' ? (
                  <ins>{p.novo.texto}</ins>
                ) : p.tipo === 'removido' ? (
                  <del>{p.velho.texto}</del>
                ) : (
                  bloco.texto
                )}
              </p>
            </li>
          );
        })}
      </ol>

      <div className="revisao-ia__acoes">
        <button type="button" className="botao botao--primario" disabled={mudados > 0 && marcados === 0} onClick={onAplicar}>
          <IconeCheck size={15} /> {marcados === mudados ? 'Aprovar mudanças' : `Aprovar ${marcados} de ${mudados}`}
        </button>
        <button type="button" className="botao botao--fantasma" onClick={onRecusar}>
          <IconeFechar size={14} /> Recusar e manter como estava
        </button>
      </div>
    </section>
  );
}

/** Caixa de texto que cresce com o conteúdo (o texto do bloco lido de uma vez). */
function TextoAutoAjustavel({ valor, aoMudar, rotulo }: { valor: string; aoMudar: (t: string) => void; rotulo: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);
  return (
    <textarea
      ref={ref}
      className="roteiro-bloco__texto"
      value={valor}
      rows={1}
      maxLength={2000}
      aria-label={rotulo}
      placeholder="O que você vai falar neste momento do vídeo…"
      onChange={(e) => aoMudar(e.target.value)}
    />
  );
}
