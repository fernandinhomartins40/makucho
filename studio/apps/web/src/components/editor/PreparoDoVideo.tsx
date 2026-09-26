'use client';

// ============================================================
// A espera entre o envio e a proposta -- a parte mais longa do produto.
//
// Uma lista de etapas parada gera ansiedade ("travou?"). Esta tela
// troca a ansiedade por expectativa, com três regras:
//
//   1. Mostrar que está andando DE VERDADE: a barra e a estimativa vêm
//      do progresso real publicado pelos workers, e na transcrição as
//      frases aparecem conforme a IA as ouve ("a IA está ouvindo você");
//   2. Mostrar o que vem aí: o que o vídeo vai ganhar (legenda, zoom,
//      título...) acende conforme o preparo avança;
//   3. Comemorar o fim: confete, vibração, aviso do sistema se a aba
//      estiver em segundo plano -- e só então o editor abre.
//
// Nada aqui inventa progresso: a etapa de montagem (uma chamada à IA)
// não tem porcentagem, então a barra avança devagar e as mensagens
// descrevem o que a IA faz nessa chamada, sem números falsos.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressoDoPreparo } from '@makucho/studio-contracts';
import {
  IconeCheck,
  IconeIA,
  IconeLegenda,
  IconeCortar,
  IconeAjustarZoom,
  IconeTexto,
  IconeNotificacao,
  IconeMidia,
} from '../icones';

type Estado = 'INGESTING' | 'TRANSCRIBING' | 'ANALYZING' | 'PRONTO' | string;

interface Props {
  estado: Estado;
  progresso: ProgressoDoPreparo | null;
  miniaturaUrl?: string;
  duracaoDaGravacaoMs?: number | null;
  /** A proposta ficou pronta: comemora antes de abrir o editor. */
  comemorando: boolean;
}

const FAIXAS: Record<string, { de: number; ate: number; etapa: ProgressoDoPreparo['etapa'] }> = {
  INGESTING: { de: 4, ate: 25, etapa: 'preparando' },
  TRANSCRIBING: { de: 25, ate: 80, etapa: 'transcrevendo' },
  ANALYZING: { de: 80, ate: 99, etapa: 'montando' },
};

const ETAPAS = [
  { chave: 'recebido', titulo: 'Vídeo recebido', texto: 'O arquivo chegou inteiro ao servidor.' },
  { chave: 'INGESTING', titulo: 'Preparando o vídeo', texto: 'Prévia leve, áudio separado e pausas detectadas.' },
  { chave: 'TRANSCRIBING', titulo: 'Ouvindo a sua fala', texto: 'Cada palavra com o tempo exato em que foi dita.' },
  { chave: 'ANALYZING', titulo: 'Montando o vídeo', texto: 'Gancho, cortes, legenda, zoom, transições e imagens para você aprovar.' },
];

const MENSAGENS: Record<string, string[]> = {
  INGESTING: ['Gerando a prévia leve do vídeo…', 'Separando o áudio da imagem…', 'Encontrando as pausas da fala…'],
  ANALYZING: [
    'Entendendo o assunto do vídeo…',
    'Procurando a frase mais forte para o gancho…',
    'Cortando pausas e repetições…',
    'Colocando os trechos na ordem que prende…',
    'Escolhendo a legenda que combina com o tom…',
    'Marcando os momentos fortes para o zoom…',
    'Escrevendo o título de abertura…',
    'Buscando imagens e ícones que ilustram a fala…',
  ],
};

/** O que o vídeo vai ganhar -- acende conforme o preparo avança. */
const GANHOS = [
  { a: 25, Icone: IconeLegenda, texto: 'Legendas animadas' },
  { a: 55, Icone: IconeCortar, texto: 'Cortes no ritmo certo' },
  { a: 82, Icone: IconeAjustarZoom, texto: 'Zoom e transições' },
  { a: 95, Icone: IconeTexto, texto: 'Título e chamada' },
  { a: 97, Icone: IconeMidia, texto: 'Imagens para aprovar' },
];

export function PreparoDoVideo({ estado, progresso, miniaturaUrl, duracaoDaGravacaoMs, comemorando }: Props) {
  const faixa = FAIXAS[estado];

  // ---------- Progresso geral ----------
  // Na montagem não há porcentagem real: a barra anda devagar com o
  // tempo, sem nunca chegar ao fim antes da hora.
  const [inicioDaMontagem, setInicioDaMontagem] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (estado === 'ANALYZING' && inicioDaMontagem === null) setInicioDaMontagem(Date.now());
  }, [estado, inicioDaMontagem]);
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  let geral = 2;
  if (comemorando) geral = 100;
  else if (faixa) {
    const pctDaEtapa =
      estado === 'ANALYZING'
        ? Math.min(92, ((agora - (inicioDaMontagem ?? agora)) / 1000) * 5)
        : progresso?.etapa === faixa.etapa
          ? progresso.pct
          : 0;
    geral = faixa.de + ((faixa.ate - faixa.de) * pctDaEtapa) / 100;
  }

  // ---------- Estimativa ----------
  // Pela velocidade medida desde que a tela abriu. Só aparece quando
  // há dado suficiente para não prometer errado.
  const amostra = useRef<{ t: number; v: number } | null>(null);
  if (amostra.current === null && geral > 0) amostra.current = { t: Date.now(), v: geral };
  const estimativa = useMemo(() => {
    const a = amostra.current;
    if (!a || comemorando) return null;
    const passou = (agora - a.t) / 1000;
    const andou = geral - a.v;
    if (passou < 8 || andou < 3) return null;
    const falta = ((100 - geral) / andou) * passou;
    if (falta < 20) return 'quase lá';
    if (falta < 90) return 'falta cerca de 1 minuto';
    return `faltam cerca de ${Math.round(falta / 60)} minutos`;
  }, [agora, geral, comemorando]);

  // ---------- Mensagens que giram ----------
  const mensagens = MENSAGENS[estado] ?? [];
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    setIndice(0);
    if (mensagens.length < 2) return;
    const id = setInterval(() => setIndice((i) => (i + 1) % mensagens.length), 2600);
    return () => clearInterval(id);
  }, [estado, mensagens.length]);

  // ---------- Título da aba ----------
  useEffect(() => {
    const antes = document.title;
    document.title = comemorando ? '✓ Proposta pronta — Studio' : `(${Math.round(geral)}%) Preparando — Studio`;
    return () => {
      document.title = antes;
    };
  }, [geral, comemorando]);

  const ordem = ['recebido', 'INGESTING', 'TRANSCRIBING', 'ANALYZING'];
  const atual = comemorando ? ordem.length : Math.max(1, ordem.indexOf(estado));

  const titulo = comemorando
    ? 'Sua proposta está pronta!'
    : estado === 'TRANSCRIBING'
      ? 'A IA está ouvindo você'
      : estado === 'ANALYZING'
        ? 'A IA está montando seu vídeo'
        : 'Recebemos seu vídeo';

  const subtitulo = comemorando
    ? 'Abrindo a edição…'
    : `${duracaoDaGravacaoMs ? `Gravação de ${tempo(duracaoDaGravacaoMs)}. ` : ''}Pode fechar a aba e voltar depois — nada se perde.`;

  return (
    <section className="preparo" data-comemorando={comemorando || undefined} aria-live="polite">
      {comemorando && <Confete />}

      <div className="preparo__visual">
        <div className="preparo__miniatura">
          {miniaturaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={miniaturaUrl} alt="" />
          ) : (
            <span className="preparo__miniatura-vazia" />
          )}
          {!comemorando && <span className="preparo__varredura" aria-hidden />}
          {comemorando && (
            <span className="preparo__selo-pronto" aria-hidden>
              <IconeCheck size={34} weight="bold" />
            </span>
          )}
        </div>
      </div>

      <div className="preparo__corpo">
        <div>
          <h1 className="preparo__titulo">{titulo}</h1>
          <p className="texto-secundario">{subtitulo}</p>
        </div>

        {/* ---------- Barra geral ---------- */}
        <div className="preparo__geral">
          <div className="linha entre" style={{ fontSize: 13 }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(geral)}%</strong>
            <span className="texto-secundario">{estimativa ?? (comemorando ? 'concluído' : 'calculando o tempo…')}</span>
          </div>
          <div
            className="preparo__barra"
            role="progressbar"
            aria-valuenow={Math.round(geral)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Preparo do vídeo"
          >
            <span style={{ width: `${geral}%` }} />
          </div>
        </div>

        {/* ---------- Ao vivo ---------- */}
        {!comemorando && (
          <div className="preparo__aovivo">
            {estado === 'TRANSCRIBING' ? (
              <>
                <span className="preparo__chip">
                  <span className="preparo__onda" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  Ao vivo
                </span>
                {progresso?.etapa === 'transcrevendo' && progresso.ouvidas?.length ? (
                  <ul className="preparo__ouvidas">
                    {progresso.ouvidas.map((f, i, todas) => (
                      <li key={f} data-nova={i === todas.length - 1 || undefined}>
                        “{f}”
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="texto-secundario">Transcrevendo cada palavra, com o tempo exato em que foi dita…</p>
                )}
              </>
            ) : (
              <>
                <span className="preparo__chip">
                  <IconeIA size={13} weight="fill" /> Agora
                </span>
                <p key={`${estado}-${indice}`} className="preparo__mensagem">
                  {mensagens[indice] ?? 'Preparando…'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ---------- Etapas ---------- */}
        <ol className="preparo__etapas">
          {ETAPAS.map((e, i) => {
            const situacao = i < atual ? 'feita' : i === atual ? 'atual' : 'pendente';
            const pct = situacao === 'atual' && faixa ? Math.round(((geral - faixa.de) / (faixa.ate - faixa.de)) * 100) : 0;
            return (
              <li key={e.chave} data-situacao={situacao}>
                <span
                  className="preparo__marca"
                  aria-hidden
                  style={situacao === 'atual' ? ({ '--p': `${Math.max(6, pct)}%` } as React.CSSProperties) : undefined}
                >
                  {situacao === 'feita' ? <IconeCheck size={13} weight="bold" /> : situacao === 'atual' ? <span className="preparo__ponto" /> : null}
                </span>
                <span>
                  <strong>{e.titulo}</strong>
                  <span className="texto-secundario">{e.texto}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* ---------- O que vem aí ---------- */}
        <div>
          <p className="rotulo-secao" style={{ marginBottom: 'var(--e2)' }}>
            O que o seu vídeo vai ganhar
          </p>
          <div className="preparo__ganhos">
            {GANHOS.map(({ a, Icone, texto }) => (
              <span key={texto} className="preparo__ganho" data-aceso={geral >= a || undefined}>
                <Icone size={16} />
                {texto}
              </span>
            ))}
          </div>
        </div>

        {!comemorando && <AvisarQuandoPronto />}
      </div>
    </section>
  );
}

// ---------- Avisar quando ficar pronto ----------

/**
 * Pede permissão de notificação; o aviso em si sai do editor quando a
 * proposta chega com a aba em segundo plano (ver `avisarQueFicouPronto`).
 */
function AvisarQuandoPronto() {
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>('indisponivel');
  useEffect(() => {
    setPermissao(typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission);
  }, []);

  if (permissao === 'indisponivel' || permissao === 'denied') return null;
  if (permissao === 'granted') {
    return (
      <p className="preparo__avisar texto-secundario">
        <IconeNotificacao size={15} /> Vamos avisar quando ficar pronto.
      </p>
    );
  }
  return (
    <button
      type="button"
      className="botao botao--secundario botao--pequeno preparo__avisar"
      onClick={() => void Notification.requestPermission().then(setPermissao)}
    >
      <IconeNotificacao size={15} /> Me avise quando ficar pronto
    </button>
  );
}

/** Chamado pelo editor quando a proposta chega. */
export function avisarQueFicouPronto(titulo: string) {
  try {
    navigator.vibrate?.([40, 60, 40]);
  } catch {
    // sem vibração
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    new Notification('Sua proposta está pronta', {
      body: `${titulo} — a IA montou o vídeo. Toque para revisar.`,
      icon: '/api/pwa/icone/icon-192.png',
      tag: 'studio-proposta',
    });
  } catch {
    // Alguns navegadores (Android) só notificam pelo service worker.
    void navigator.serviceWorker?.ready
      .then((r) =>
        r.showNotification('Sua proposta está pronta', {
          body: `${titulo} — a IA montou o vídeo.`,
          icon: '/api/pwa/icone/icon-192.png',
          tag: 'studio-proposta',
        }),
      )
      .catch(() => undefined);
  }
}

// ---------- Confete ----------

const CORES = ['#2f66ff', '#41c8ff', '#22c55e', '#eab308', '#ff4d5e', '#ffffff'];

function Confete() {
  const pedacos = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        x: Math.round((Math.random() - 0.5) * 520),
        y: Math.round(-120 - Math.random() * 260),
        r: Math.round(Math.random() * 720 - 360),
        d: Math.round(Math.random() * 180),
        cor: CORES[i % CORES.length],
      })),
    [],
  );
  return (
    <span className="confete" aria-hidden>
      {pedacos.map((p, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
              '--r': `${p.r}deg`,
              animationDelay: `${p.d}ms`,
              background: p.cor,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

function tempo(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
