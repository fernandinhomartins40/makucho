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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
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

type Papel = 'hook' | 'problem' | 'authority' | 'cta';

interface Bloco {
  id: string;
  papel: Papel;
  texto: string;
}

const ROTULO: Record<Papel, string> = {
  hook: 'Hook',
  problem: 'Problema',
  authority: 'Autoridade',
  cta: 'CTA',
};

const COR: Record<Papel, string> = {
  hook: '#2f66ff',
  problem: '#8b5cf6',
  authority: '#41c8ff',
  cta: '#22c55e',
};

/** A intenção de cada bloco, mostrada enquanto se escreve. */
const INTENCAO: Record<Papel, string> = {
  hook: 'Os primeiros segundos. Uma afirmação que dá vontade de continuar.',
  problem: 'O que dói, nomeado com clareza.',
  authority: 'Por que você pode falar disso — experiência, não currículo.',
  cta: 'Uma ação só, clara e verificável.',
};

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
  const [blocos, setBlocos] = useState<Bloco[]>(INICIAL);
  const [titulo, setTitulo] = useState('Atendimento rápido vende mais');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>('b1');
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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

  // A geração real entra na Fase 5, com a chave de IA cadastrada no
  // painel. Até lá, o botão diz o que falta em vez de fingir.
  const gerar = () => {
    setGerando(true);
    setAviso(null);
    setTimeout(() => {
      setGerando(false);
      setAviso(
        'A geração com IA entra na Fase 5, junto com a chave de API. A estrutura e o assistente já funcionam sobre o que você escrever.',
      );
    }, 700);
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
        estado="salvo"
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

            <h3 style={{ marginBottom: 'var(--e3)' }}>Sugestões da IA</h3>

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

            <Link href="/gravar" className="botao botao--largo" style={{ marginTop: 'var(--e5)' }}>
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
