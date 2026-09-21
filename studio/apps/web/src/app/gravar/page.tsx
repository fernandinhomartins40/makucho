'use client';

// ============================================================
// Gravação — teleprompter, câmera e envio (ADR 0010, Fase 4a).
//
// A tela tem quatro momentos, e cada um mostra o que cabe nele:
//
//   verificar  câmera e microfone, ANTES de gravar — descobrir que o
//              microfone estava mudo depois de oito minutos custa a
//              gravação inteira;
//   gravar     teleprompter em foco, controles fora do caminho;
//   revisar    assistir antes de enviar, porque a primeira tomada
//              quase nunca é a boa;
//   enviar     progresso real, com a opção de regravar até o fim.
// ============================================================

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { useGravacao } from '../../lib/useGravacao';
import { enviar, duracaoDe, validar, formatarBytes } from '../../lib/upload';
import { projetos as apiProjetos, roteiros as apiRoteiros } from '../../lib/api';
import {
  IconeCamera,
  IconeMicrofone,
  IconeConfiguracoes,
  IconeCheck,
  IconeAviso,
  IconeAvancar,
  IconeVoltar,
  IconeTexto,
  IconeRelogio,
  IconeGravar,
  IconePausar,
  IconeTocar,
  IconeLixeira,
  IconeEnviar,
  IconeRoteiro,
} from '../../components/icones';

interface BlocoDoRoteiro {
  role: string;
  rotulo: string;
  texto: string;
}

const ROTULO: Record<string, string> = {
  HOOK: 'Hook',
  PROBLEM: 'Problema',
  AUTHORITY: 'Autoridade',
  CTA: 'CTA',
  CONTEXT: 'Contexto',
  SOLUTION: 'Solução',
};

// Exemplo da seção 7 do contexto mestre, usado quando o projeto não
// tem roteiro associado.
const ROTEIRO_PADRAO: BlocoDoRoteiro[] = [
  {
    role: 'HOOK',
    rotulo: 'Hook',
    texto:
      'Se sua empresa demora para responder no WhatsApp, você pode estar pagando para perder cliente.',
  },
  {
    role: 'PROBLEM',
    rotulo: 'Problema',
    texto:
      'Muitas empresas investem em anúncio, conseguem gerar interesse e perdem a venda justamente no atendimento.',
  },
  {
    role: 'AUTHORITY',
    rotulo: 'Autoridade',
    texto:
      'Eu vejo isso constantemente quando analiso processos comerciais de pequenas empresas.',
  },
  {
    role: 'CTA',
    rotulo: 'CTA',
    texto: 'Salva este vídeo e verifica esses três pontos no seu atendimento hoje.',
  },
];

type EstadoDosDispositivos = 'verificando' | 'prontos' | 'negado' | 'ausente';

export default function GravarPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <Gravar />
    </Suspense>
  );
}

function Gravar() {
  const router = useRouter();
  const parametros = useSearchParams();
  const projetoDaUrl = parametros.get('projeto');

  const videoRef = useRef<HTMLVideoElement>(null);
  const fluxoRef = useRef<MediaStream | null>(null);

  const [fluxo, setFluxo] = useState<MediaStream | null>(null);
  const [dispositivos, setDispositivos] = useState<EstadoDosDispositivos>('verificando');
  const [erroDeAcesso, setErroDeAcesso] = useState<string | null>(null);

  const [roteiro, setRoteiro] = useState<BlocoDoRoteiro[]>(ROTEIRO_PADRAO);
  const [bloco, setBloco] = useState(0);
  const [tamanhoDoTexto, setTamanhoDoTexto] = useState(28);
  const [comContagem, setComContagem] = useState(true);

  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erroDeEnvio, setErroDeEnvio] = useState<string | null>(null);

  const gravacao = useGravacao(fluxo);
  const gravando = gravacao.estado === 'gravando' || gravacao.estado === 'pausado';

  // ---------- Câmera e microfone ----------
  useEffect(() => {
    let cancelado = false;

    async function pedirAcesso() {
      try {
        const obtido = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });

        if (cancelado) {
          obtido.getTracks().forEach((t) => t.stop());
          return;
        }

        fluxoRef.current = obtido;
        setFluxo(obtido);
        if (videoRef.current) videoRef.current.srcObject = obtido;
        setDispositivos('prontos');
      } catch (e) {
        if (cancelado) return;

        // Distinguir permissão negada de dispositivo ausente importa:
        // as saídas são diferentes — uma é reabrir a permissão, a
        // outra é conectar um equipamento.
        const nome = (e as Error).name;
        if (nome === 'NotAllowedError' || nome === 'SecurityError') {
          setDispositivos('negado');
          setErroDeAcesso(
            'O navegador bloqueou a câmera. Autorize o acesso no cadeado ao lado do endereço e recarregue.',
          );
        } else if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError') {
          setDispositivos('ausente');
          setErroDeAcesso('Nenhuma câmera encontrada. Conecte uma e recarregue a página.');
        } else {
          setDispositivos('ausente');
          setErroDeAcesso(`Não foi possível acessar a câmera (${nome}).`);
        }
      }
    }

    void pedirAcesso();

    return () => {
      cancelado = true;
      // Liberar as faixas apaga a luz da webcam. Sem isso, ela fica
      // acesa depois de sair da tela.
      fluxoRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ---------- Roteiro do projeto ----------
  useEffect(() => {
    if (!projetoDaUrl) return;

    void apiProjetos
      .obter(projetoDaUrl)
      .then(async (projeto) => {
        const scriptId = (projeto as { script?: { id: string } }).script?.id;
        if (!scriptId) return;

        const roteiroDoProjeto = await apiRoteiros.obter(scriptId);
        if (roteiroDoProjeto.blocks?.length) {
          setRoteiro(
            roteiroDoProjeto.blocks.map((b) => ({
              role: b.role,
              rotulo: ROTULO[b.role] ?? b.role,
              texto: b.text,
            })),
          );
        }
      })
      // O roteiro é um apoio: não conseguir carregá-lo não impede
      // gravar, então a falha fica silenciosa e o padrão vale.
      .catch(() => undefined);
  }, [projetoDaUrl]);

  // ---------- Teclado ----------
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setBloco((b) => Math.min(roteiro.length - 1, b + 1));
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setBloco((b) => Math.max(0, b - 1));
      }
    };

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [roteiro.length]);

  // ---------- Envio ----------
  const enviarGravacao = useCallback(async () => {
    if (!gravacao.resultado) return;

    setEnviando(true);
    setErroDeEnvio(null);
    setProgresso(0);

    try {
      // Sem projeto na URL, cria um: quem chegou direto em /gravar
      // não deveria precisar voltar para criar antes.
      const projectId =
        projetoDaUrl ??
        (await apiProjetos.criar({ title: `Gravação de ${new Date().toLocaleDateString('pt-BR')}` }))
          .id;

      const duracaoMs = (await duracaoDe(gravacao.resultado)) ?? gravacao.segundos * 1000;

      await enviar({
        projectId,
        arquivo: gravacao.resultado,
        nome: `gravacao.${gravacao.mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
        mimeType: gravacao.mimeType.split(';')[0] ?? 'video/webm',
        duracaoMs,
        onProgresso: (p) => setProgresso(p.percentual),
      });

      router.push('/');
    } catch (e) {
      setErroDeEnvio(
        e instanceof Error ? e.message : 'não foi possível enviar a gravação.',
      );
      setEnviando(false);
    }
  }, [gravacao.resultado, gravacao.mimeType, gravacao.segundos, projetoDaUrl, router]);

  // ---------- Envio de arquivo ----------
  const enviarArquivo = useCallback(
    async (arquivo: File) => {
      const problema = await validar(arquivo);
      if (problema) {
        setErroDeEnvio(problema);
        return;
      }

      setEnviando(true);
      setErroDeEnvio(null);
      setProgresso(0);

      try {
        const projectId =
          projetoDaUrl ?? (await apiProjetos.criar({ title: arquivo.name })).id;

        await enviar({
          projectId,
          arquivo,
          nome: arquivo.name,
          mimeType: arquivo.type,
          duracaoMs: (await duracaoDe(arquivo)) ?? undefined,
          onProgresso: (p) => setProgresso(p.percentual),
        });

        router.push('/');
      } catch (e) {
        setErroDeEnvio(e instanceof Error ? e.message : 'não foi possível enviar o vídeo.');
        setEnviando(false);
      }
    },
    [projetoDaUrl, router],
  );

  const tempo = `${Math.floor(gravacao.segundos / 60)
    .toString()
    .padStart(2, '0')}:${(gravacao.segundos % 60).toString().padStart(2, '0')}`;

  const selo =
    gravacao.estado === 'revisando'
      ? { texto: 'Grave revisada', tom: 'sucesso' as const }
      : gravando
        ? { texto: 'Gravando', tom: 'aviso' as const }
        : dispositivos === 'prontos'
          ? { texto: 'Pronto para gravar', tom: 'sucesso' as const }
          : dispositivos === 'verificando'
            ? { texto: 'Verificando dispositivos…', tom: 'info' as const }
            : { texto: 'Dispositivo indisponível', tom: 'aviso' as const };

  return (
    <>
      <Topbar trilha={['Projetos', 'Nova gravação']} selo={selo}>
        <button type="button" className="botao botao--fantasma botao--pequeno" disabled={gravando}>
          <IconeConfiguracoes size={18} />
          Configurações
        </button>
        <Link href="/" className="botao botao--fantasma botao--pequeno">
          <IconeVoltar size={18} />
          Sair
        </Link>
      </Topbar>

      <div
        className="conteudo"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--e4)' }}
      >
        {erroDeAcesso && (
          <div className="aviso aviso--atencao" role="alert">
            <IconeAviso size={18} />
            <span>{erroDeAcesso}</span>
          </div>
        )}

        {erroDeEnvio && (
          <div className="aviso aviso--erro" role="alert">
            <IconeAviso size={18} />
            <span>{erroDeEnvio}</span>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--e4)',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* ---------- Câmera ---------- */}
          <section
            style={{
              position: 'relative',
              borderRadius: 'var(--r-cartao)',
              overflow: 'hidden',
              background: '#000',
              border: '1px solid var(--border)',
              minHeight: 380,
            }}
          >
            {gravacao.estado === 'revisando' && gravacao.urlDaPrevia ? (
              <video
                src={gravacao.urlDaPrevia}
                controls
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}

            {gravacao.estado !== 'revisando' && (
              <>
                {/* Área segura: o que sobrevive ao corte 9:16. */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: '10% 18%',
                    border: '1px dashed rgb(255 255 255 / 35%)',
                    borderRadius: 6,
                    pointerEvents: 'none',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: 'var(--e4)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '5px 12px',
                    borderRadius: 999,
                    background: 'rgb(4 23 53 / 82%)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Área segura para o vídeo
                </span>
              </>
            )}

            {gravando && (
              <div
                className="linha"
                role="status"
                aria-live="polite"
                style={{
                  position: 'absolute',
                  top: 'var(--e4)',
                  left: 'var(--e4)',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgb(4 23 53 / 85%)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: 'var(--danger)',
                    animation:
                      gravacao.estado === 'gravando' ? 'pulsar 1.4s infinite' : undefined,
                  }}
                />
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                  {gravacao.estado === 'pausado' ? 'Pausado' : 'Gravando'} · {tempo}
                </span>
              </div>
            )}

            {/* Contagem regressiva sobre a câmera, grande o bastante
                para ser vista de longe — quem grava está a um braço
                de distância da tela. */}
            {gravacao.estado === 'contando' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgb(4 23 53 / 55%)',
                  fontSize: 96,
                  fontWeight: 800,
                }}
                role="status"
                aria-live="assertive"
              >
                {gravacao.contagem || 'Já!'}
              </div>
            )}
          </section>

          {/* ---------- Roteiro ---------- */}
          <section className="cartao" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="linha entre" style={{ marginBottom: 'var(--e3)' }}>
              <h2 className="linha" style={{ gap: 'var(--e2)' }}>
                <IconeRoteiro size={18} />
                Roteiro
              </h2>
              <span className="texto-secundario" style={{ fontSize: 13 }}>
                {roteiro.length} blocos
              </span>
            </div>

            <div className="linha" style={{ gap: 'var(--e2)', marginBottom: 'var(--e4)' }}>
              {roteiro.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  className={`botao botao--pequeno ${i === bloco ? '' : 'botao--secundario'}`}
                  onClick={() => setBloco(i)}
                  style={{ flex: 1 }}
                >
                  {b.rotulo}
                </button>
              ))}
            </div>

            <div
              className="crescer"
              style={{
                padding: 'var(--e4)',
                borderRadius: 'var(--r-cartao)',
                background: 'var(--surface-2)',
                fontSize: tamanhoDoTexto,
                lineHeight: 1.45,
                fontWeight: 600,
                overflowY: 'auto',
              }}
            >
              {roteiro[bloco]?.texto}
            </div>

            <div className="linha entre" style={{ marginTop: 'var(--e3)' }}>
              <span className="texto-secundario" style={{ fontSize: 13 }}>
                {bloco + 1} / {roteiro.length}
              </span>
              <span className="linha texto-secundario" style={{ gap: 4, fontSize: 13 }}>
                Use as setas ou o espaço para avançar
                <IconeAvancar size={14} />
              </span>
            </div>
          </section>
        </div>

        {/* ---------- Controles ---------- */}
        <section className="cartao linha" style={{ gap: 'var(--e4)', flexWrap: 'wrap' }}>
          {gravacao.estado === 'revisando' ? (
            <>
              <span className="linha crescer" style={{ gap: 'var(--e2)' }}>
                <IconeCheck size={18} color="var(--success)" />
                <span>
                  Gravação de {tempo}
                  {gravacao.resultado && (
                    <span className="texto-secundario">
                      {' '}
                      · {formatarBytes(gravacao.resultado.size)}
                    </span>
                  )}
                </span>
              </span>

              {enviando ? (
                <span className="linha" style={{ gap: 'var(--e3)', minWidth: 260 }}>
                  <div
                    className="barra crescer"
                    role="progressbar"
                    aria-valuenow={progresso}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progresso do envio"
                  >
                    <div className="barra__preenchida" style={{ width: `${progresso}%` }} />
                  </div>
                  <span
                    className="texto-secundario"
                    style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {progresso}%
                  </span>
                </span>
              ) : (
                <>
                  {/* Regravar vem ANTES de enviar: a primeira tomada
                      quase nunca é a boa, e o caminho de volta precisa
                      ser mais fácil que o de frente. */}
                  <button
                    type="button"
                    className="botao botao--secundario"
                    onClick={gravacao.descartar}
                  >
                    <IconeLixeira size={16} />
                    Regravar
                  </button>
                  <button type="button" className="botao" onClick={enviarGravacao}>
                    <IconeEnviar size={16} />
                    Enviar para edição
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <Seletor Icone={IconeCamera} rotulo="Câmera" valor="Padrão do sistema" />
              <Seletor Icone={IconeMicrofone} rotulo="Microfone" valor="Padrão do sistema" />

              <label className="linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
                <IconeTexto size={16} />
                Tamanho
                <input
                  type="range"
                  className="deslizante"
                  style={{ width: 90 }}
                  min={18}
                  max={44}
                  value={tamanhoDoTexto}
                  aria-label="Tamanho do texto do teleprompter"
                  onChange={(e) => setTamanhoDoTexto(Number(e.target.value))}
                />
              </label>

              <label className="linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
                <IconeRelogio size={16} />
                Contagem
                <button
                  type="button"
                  role="switch"
                  aria-checked={comContagem}
                  aria-label="Contagem regressiva antes de gravar"
                  className="chave"
                  onClick={() => setComContagem((v) => !v)}
                  disabled={gravando}
                >
                  <span className="chave__bola" aria-hidden />
                </button>
              </label>

              <span className="auto linha" style={{ gap: 'var(--e3)' }}>
                {gravando && (
                  <button
                    type="button"
                    className="botao botao--secundario"
                    onClick={
                      gravacao.estado === 'pausado' ? gravacao.retomar : gravacao.pausar
                    }
                  >
                    {gravacao.estado === 'pausado' ? (
                      <>
                        <IconeTocar size={16} weight="fill" />
                        Retomar
                      </>
                    ) : (
                      <>
                        <IconePausar size={16} weight="fill" />
                        Pausar
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  className="botao"
                  disabled={dispositivos !== 'prontos' || gravacao.estado === 'contando'}
                  onClick={() => (gravando ? gravacao.parar() : gravacao.iniciar(comContagem))}
                  style={{
                    background: gravando ? 'var(--danger)' : undefined,
                    minWidth: 150,
                  }}
                >
                  <IconeGravar size={18} weight="fill" />
                  {gravando ? 'Parar' : 'Gravar'}
                </button>

                {/* O outro caminho do ADR 0010, ao lado do primeiro:
                    quem já tem o vídeo no computador não precisa
                    regravar para usar a ferramenta. */}
                <label className="botao botao--secundario" style={{ cursor: 'pointer' }}>
                  <IconeEnviar size={16} />
                  Enviar arquivo
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo"
                    style={{ display: 'none' }}
                    disabled={gravando || enviando}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      if (arquivo) void enviarArquivo(arquivo);
                    }}
                  />
                </label>
              </span>
            </>
          )}
        </section>

        {enviando && gravacao.estado !== 'revisando' && (
          <div className="cartao linha" style={{ gap: 'var(--e3)' }}>
            <div
              className="barra crescer"
              role="progressbar"
              aria-valuenow={progresso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso do envio"
            >
              <div className="barra__preenchida" style={{ width: `${progresso}%` }} />
            </div>
            <span className="texto-secundario" style={{ fontSize: 13 }}>
              Enviando… {progresso}%
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function Seletor({
  Icone,
  rotulo,
  valor,
}: {
  Icone: typeof IconeCamera;
  rotulo: string;
  valor: string;
}) {
  return (
    <span className="linha" style={{ gap: 'var(--e2)' }}>
      <Icone size={18} />
      <span style={{ lineHeight: 1.2 }}>
        <span className="texto-secundario" style={{ fontSize: 11, display: 'block' }}>
          {rotulo}
        </span>
        <span style={{ fontSize: 13 }}>{valor}</span>
      </span>
    </span>
  );
}
