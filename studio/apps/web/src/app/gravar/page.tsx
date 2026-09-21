'use client';

// ============================================================
// Gravação — teleprompter com verificação de dispositivos.
//
// O guia pede: preview da câmera à esquerda, roteiro segmentado à
// direita, verificação de câmera e microfone ANTES de gravar, e modo
// foco depois que começa.
//
// A verificação prévia existe porque descobrir que o microfone
// estava mudo depois de gravar oito minutos é o tipo de erro que
// custa a gravação inteira.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Topbar } from '../../components/shell/Topbar';
import {
  IconeCamera,
  IconeMicrofone,
  IconeConfiguracoes,
  IconeSair,
  IconeCheck,
  IconeAviso,
  IconeAvancar,
  IconeTexto,
  IconeRelogio,
} from '../../components/icones';

interface BlocoDoRoteiro {
  role: string;
  rotulo: string;
  texto: string;
}

// Exemplo da seção 7 do contexto mestre. Vem da API quando a tela de
// roteiros estiver ligada.
const ROTEIRO: BlocoDoRoteiro[] = [
  {
    role: 'hook',
    rotulo: 'Hook',
    texto:
      'Se sua empresa demora para responder no WhatsApp, você pode estar pagando para perder cliente.',
  },
  {
    role: 'problem',
    rotulo: 'Problema',
    texto:
      'Muitas empresas investem em anúncio, conseguem gerar interesse e perdem a venda justamente no atendimento.',
  },
  {
    role: 'authority',
    rotulo: 'Autoridade',
    texto:
      'Eu vejo isso constantemente quando analiso processos comerciais de pequenas empresas.',
  },
  {
    role: 'cta',
    rotulo: 'CTA',
    texto: 'Salva este vídeo e verifica esses três pontos no seu atendimento hoje.',
  },
];

type EstadoDosDispositivos = 'verificando' | 'prontos' | 'negado' | 'ausente';

export default function GravarPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fluxoRef = useRef<MediaStream | null>(null);

  const [dispositivos, setDispositivos] = useState<EstadoDosDispositivos>('verificando');
  const [erroDeAcesso, setErroDeAcesso] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [bloco, setBloco] = useState(0);
  const [tamanhoDoTexto, setTamanhoDoTexto] = useState(28);
  const [velocidade, setVelocidade] = useState(1);
  const [contagem, setContagem] = useState(true);

  // ---------- Câmera e microfone ----------
  useEffect(() => {
    let cancelado = false;

    async function pedirAcesso() {
      try {
        const fluxo = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        if (cancelado) {
          fluxo.getTracks().forEach((t) => t.stop());
          return;
        }

        fluxoRef.current = fluxo;
        if (videoRef.current) videoRef.current.srcObject = fluxo;
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

  // ---------- Cronômetro ----------
  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [gravando]);

  // ---------- Teclado ----------
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setBloco((b) => Math.min(ROTEIRO.length - 1, b + 1));
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setBloco((b) => Math.max(0, b - 1));
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const alternarGravacao = useCallback(() => {
    if (gravando) {
      setGravando(false);
      return;
    }
    setSegundos(0);
    setBloco(0);
    setGravando(true);
  }, [gravando]);

  const tempo = `${Math.floor(segundos / 60)
    .toString()
    .padStart(2, '0')}:${(segundos % 60).toString().padStart(2, '0')}`;

  const selo =
    dispositivos === 'prontos'
      ? { texto: gravando ? 'Gravando' : 'Pronto para gravar', tom: 'sucesso' as const }
      : dispositivos === 'verificando'
        ? { texto: 'Verificando dispositivos…', tom: 'info' as const }
        : { texto: 'Dispositivo indisponível', tom: 'aviso' as const };

  return (
    <>
      <Topbar trilha={['Projetos', 'Atendimento no WhatsApp']} selo={selo}>
        <button type="button" className="botao botao--fantasma botao--pequeno">
          <IconeConfiguracoes size={18} />
          Configurações
        </button>
        <button type="button" className="botao botao--fantasma botao--pequeno">
          <IconeSair size={18} />
          Sair
        </button>
      </Topbar>

      <div className="conteudo" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--e4)' }}>
        {erroDeAcesso && (
          <div className="aviso aviso--atencao" role="alert">
            <IconeAviso size={18} />
            <span>{erroDeAcesso}</span>
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Área segura: o que sobrevive ao corte 9:16. Enquadrar
                fora dela significa perder o rosto no resultado. */}
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
                background: 'rgb(6 19 45 / 78%)',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              Área segura para o vídeo
            </span>

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
                  background: 'rgb(255 77 94 / 92%)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#fff',
                    animation: 'pulsar 1.4s infinite',
                  }}
                />
                REC {tempo}
              </div>
            )}
          </section>

          {/* ---------- Roteiro ---------- */}
          <section className="painel">
            <div className="painel__cabecalho">
              <IconeTexto size={18} />
              <h2 style={{ fontSize: 15 }}>Roteiro</h2>
              <span className="texto-secundario auto" style={{ fontSize: 12 }}>
                {ROTEIRO.length} blocos
              </span>
            </div>

            {/* Abas dos blocos: dá para pular sem sair da tela. */}
            <div
              role="tablist"
              aria-label="Blocos do roteiro"
              style={{
                display: 'flex',
                gap: 6,
                padding: 'var(--e3)',
                borderBottom: '1px solid var(--border)',
                overflowX: 'auto',
              }}
            >
              {ROTEIRO.map((b, i) => (
                <button
                  key={b.role}
                  role="tab"
                  aria-selected={i === bloco}
                  onClick={() => setBloco(i)}
                  className="linha"
                  style={{
                    gap: 6,
                    minHeight: 36,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: i === bloco ? 'var(--primary)' : 'var(--border)',
                    background: i === bloco ? 'var(--primary)' : 'transparent',
                    color: i === bloco ? '#fff' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: i === bloco ? 600 : 400,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: i === bloco ? '#fff' : 'var(--text-secondary)',
                    }}
                  />
                  {b.rotulo}
                </button>
              ))}
            </div>

            <div className="painel__corpo" style={{ padding: 'var(--e5)' }}>
              {/* A frase atual em destaque; o resto do bloco continua
                  visível com menos ênfase, como o guia pede. */}
              <p
                style={{
                  fontSize: tamanhoDoTexto,
                  lineHeight: 1.45,
                  fontWeight: 500,
                }}
              >
                <mark
                  style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: 4,
                    boxDecorationBreak: 'clone',
                    WebkitBoxDecorationBreak: 'clone',
                  }}
                >
                  {ROTEIRO[bloco]?.texto.split(' ').slice(0, 5).join(' ')}
                </mark>{' '}
                {ROTEIRO[bloco]?.texto.split(' ').slice(5).join(' ')}
              </p>
            </div>

            <div
              className="linha entre"
              style={{ padding: 'var(--e3) var(--e4)', borderTop: '1px solid var(--border)' }}
            >
              <span className="texto-secundario" style={{ fontSize: 12 }}>
                {bloco + 1} / {ROTEIRO.length}
              </span>
              <button
                type="button"
                className="botao botao--fantasma botao--pequeno"
                onClick={() => setBloco((b) => Math.min(ROTEIRO.length - 1, b + 1))}
                disabled={bloco === ROTEIRO.length - 1}
              >
                Use as setas ou o espaço para avançar
                <IconeAvancar size={14} />
              </button>
            </div>
          </section>
        </div>

        {/* ---------- Controles ---------- */}
        <section
          className="cartao linha"
          style={{ gap: 'var(--e3)', flexWrap: 'wrap', padding: 'var(--e3) var(--e4)' }}
        >
          <Controle icone={<IconeCamera size={18} />} rotulo="Câmera" valor="Padrão do sistema" />
          <Controle icone={<IconeMicrofone size={18} />} rotulo="Microfone" valor="Padrão do sistema" />

          <label className="linha" style={{ gap: 8 }}>
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              Velocidade
            </span>
            <select
              className="campo__selecao"
              value={velocidade}
              onChange={(e) => setVelocidade(Number(e.target.value))}
              style={{ width: 86, minHeight: 40, fontSize: 13 }}
            >
              {[0.8, 1, 1.2, 1.5].map((v) => (
                <option key={v} value={v}>
                  {v.toFixed(1).replace('.', ',')}×
                </option>
              ))}
            </select>
          </label>

          <label className="linha" style={{ gap: 8 }}>
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              Tamanho
            </span>
            <input
              type="range"
              min={18}
              max={48}
              value={tamanhoDoTexto}
              onChange={(e) => setTamanhoDoTexto(Number(e.target.value))}
              aria-label="Tamanho do texto do teleprompter"
              style={{ width: 96 }}
            />
          </label>

          <label className="linha" style={{ gap: 8, cursor: 'pointer' }}>
            <IconeRelogio size={16} />
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              Contagem
            </span>
            <input
              type="checkbox"
              checked={contagem}
              onChange={(e) => setContagem(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>

          <div className="linha auto" style={{ gap: 'var(--e3)' }}>
            <button
              type="button"
              onClick={alternarGravacao}
              disabled={dispositivos !== 'prontos'}
              className="linha"
              style={{
                gap: 10,
                minHeight: 52,
                padding: '0 22px',
                borderRadius: 999,
                border: 'none',
                background: gravando ? 'var(--surface-2)' : 'var(--danger)',
                color: dispositivos === 'prontos' ? '#fff' : 'var(--text-secondary)',
                fontSize: 15,
                fontWeight: 600,
                cursor: dispositivos === 'prontos' ? 'pointer' : 'not-allowed',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: gravando ? 3 : '50%',
                  background: gravando ? 'var(--danger)' : '#fff',
                  transition: 'border-radius var(--transicao)',
                }}
              />
              {gravando ? 'Finalizar' : 'Gravar'}
            </button>

            {/* Estado dos dispositivos com ícone e texto, não só cor. */}
            <span
              className={`selo selo--${dispositivos === 'prontos' ? 'sucesso' : 'aviso'}`}
              role="status"
            >
              {dispositivos === 'prontos' ? (
                <IconeCheck size={13} weight="bold" />
              ) : (
                <IconeAviso size={13} />
              )}
              {dispositivos === 'prontos'
                ? 'Câmera e microfone prontos'
                : dispositivos === 'verificando'
                  ? 'Verificando…'
                  : 'Indisponível'}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function Controle({
  icone,
  rotulo,
  valor,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
}) {
  return (
    <div
      className="linha"
      style={{
        gap: 8,
        padding: '8px 12px',
        borderRadius: 'var(--r-controle)',
        border: '1px solid var(--border)',
        background: 'var(--bg-canvas)',
      }}
    >
      <span aria-hidden style={{ color: 'var(--text-secondary)', display: 'flex' }}>
        {icone}
      </span>
      <div style={{ lineHeight: 1.2 }}>
        <div className="texto-secundario" style={{ fontSize: 11 }}>
          {rotulo}
        </div>
        <div style={{ fontSize: 12 }}>{valor}</div>
      </div>
    </div>
  );
}
