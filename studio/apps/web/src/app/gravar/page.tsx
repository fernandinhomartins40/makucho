'use client';

// ============================================================
// Novo vídeo — gravar com teleprompter ou enviar um arquivo.
//
// A tela começa pela ESCOLHA, não pela câmera. Abrir a webcam de cara
// assustava quem só queria enviar um vídeo pronto, disparava o pedido
// de permissão sem contexto e acendia a luz da câmera sem motivo.
//
//   escolher   título do vídeo + dois caminhos lado a lado;
//   câmera     só aqui o navegador pede câmera e microfone. Verificar
//              antes de gravar, gravar com o roteiro à vista, revisar
//              antes de enviar;
//   enviando   progresso real, velocidade, tempo restante e cancelar.
//
// Terminado o envio, o destino é o editor do projeto, que acompanha o
// processamento — e não a lista, onde o vídeo "sumia".
// ============================================================

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { podeEditar, estaProcessando } from '@makucho/studio-contracts';
import type { ProjectState } from '@makucho/studio-contracts';
import { Topbar } from '../../components/shell/Topbar';
import { useGravacao } from '../../lib/useGravacao';
import {
  enviar,
  duracaoDe,
  validar,
  formatarBytes,
  tipoDoArquivo,
  TIPOS_ACEITOS,
  type ProgressoDoUpload,
} from '../../lib/upload';
import { projetos as apiProjetos, roteiros as apiRoteiros, type ProjetoDetalhado } from '../../lib/api';
import {
  IconeCamera,
  IconeMicrofone,
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
  IconeNuvem,
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

// Um roteiro de apoio para quem chega sem roteiro salvo. O
// teleprompter vazio seria pior: a pessoa não saberia o que ele faz.
const ROTEIRO_PADRAO: BlocoDoRoteiro[] = [
  {
    role: 'HOOK',
    rotulo: 'Hook',
    texto: 'Comece pela frase mais forte: o problema ou o resultado que prende quem assiste.',
  },
  {
    role: 'PROBLEM',
    rotulo: 'Problema',
    texto: 'Explique o que acontece com quem ignora esse problema. Seja concreto.',
  },
  {
    role: 'AUTHORITY',
    rotulo: 'Autoridade',
    texto: 'Diga por que você fala disso: o que você vê, faz ou mediu na prática.',
  },
  {
    role: 'CTA',
    rotulo: 'CTA',
    texto: 'Feche com uma ação clara: salvar, comentar, chamar no WhatsApp.',
  },
];

type Etapa = 'escolher' | 'camera';

interface EstadoDoEnvio {
  progresso: ProgressoDoUpload | null;
  bytesPorSegundo: number | null;
}

export default function GravarPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <NovoVideo />
    </Suspense>
  );
}

function NovoVideo() {
  const router = useRouter();
  const parametros = useSearchParams();
  const projetoDaUrl = parametros.get('projeto');
  // "Gravar com este roteiro", vindo da tela de Roteiro.
  const roteiroDaUrl = parametros.get('roteiro');

  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [projeto, setProjeto] = useState<ProjetoDetalhado | null>(null);
  const [titulo, setTitulo] = useState('');
  const [roteiro, setRoteiro] = useState<BlocoDoRoteiro[]>(ROTEIRO_PADRAO);
  const [temRoteiroProprio, setTemRoteiroProprio] = useState(false);
  const [scriptId, setScriptId] = useState<string | null>(roteiroDaUrl);

  const [enviando, setEnviando] = useState(false);
  const [envio, setEnvio] = useState<EstadoDoEnvio>({ progresso: null, bytesPorSegundo: null });
  const [erroDeEnvio, setErroDeEnvio] = useState<string | null>(null);
  const cancelarRef = useRef<AbortController | null>(null);
  // Um envio que falhou deixa o projeto criado: a nova tentativa usa o
  // mesmo, em vez de acumular rascunhos vazios na lista.
  const criadoRef = useRef<string | null>(null);

  const carregarRoteiro = useCallback(async (id: string) => {
    const doProjeto = await apiRoteiros.obter(id);
    if (doProjeto.blocks?.length) {
      setRoteiro(
        [...doProjeto.blocks]
          .sort((a, b) => a.position - b.position)
          .map((b) => ({ role: b.role, rotulo: ROTULO[b.role] ?? b.role, texto: b.text })),
      );
      setTemRoteiroProprio(true);
      setScriptId(id);
      setTitulo((t) => t || doProjeto.title);
    }
  }, []);

  useEffect(() => {
    if (roteiroDaUrl) void carregarRoteiro(roteiroDaUrl).catch(() => undefined);
  }, [roteiroDaUrl, carregarRoteiro]);

  // ---------- Projeto e roteiro, quando vierem na URL ----------
  useEffect(() => {
    if (!projetoDaUrl) return;

    void apiProjetos
      .obter(projetoDaUrl)
      .then(async (p) => {
        setProjeto(p);
        if (p.title && p.title !== 'Vídeo sem título') setTitulo(p.title);

        const doProjeto = p.script?.id;
        if (doProjeto && !roteiroDaUrl) await carregarRoteiro(doProjeto);
      })
      // O roteiro é um apoio: sem ele, grava-se com o padrão.
      .catch(() => undefined);
  }, [projetoDaUrl, roteiroDaUrl, carregarRoteiro]);

  /**
   * O envio, igual para gravação e arquivo.
   *
   * O projeto só é criado aqui, na hora de enviar: criar ao clicar em
   * "Novo vídeo" deixava rascunhos vazios na lista toda vez que alguém
   * desistia.
   */
  const enviarVideo = useCallback(
    async (dados: { arquivo: Blob; nome: string; mimeType: string; duracaoMs?: number }) => {
      setEnviando(true);
      setErroDeEnvio(null);
      setEnvio({ progresso: null, bytesPorSegundo: null });

      const controle = new AbortController();
      cancelarRef.current = controle;
      const inicio = Date.now();

      try {
        const nomeDoProjeto = titulo.trim() || dados.nome.replace(/\.[^.]+$/, '') || 'Vídeo sem título';

        let projectId = projetoDaUrl ?? criadoRef.current;
        if (projectId) {
          // O título digitado aqui vale para o projeto que já existia.
          if (titulo.trim() && titulo.trim() !== projeto?.title) {
            await apiProjetos.atualizar(projectId, { title: titulo.trim() }).catch(() => undefined);
          }
        } else {
          projectId = (await apiProjetos.criar({ title: nomeDoProjeto.slice(0, 120), scriptId })).id;
          criadoRef.current = projectId;
        }

        await enviar({
          projectId,
          arquivo: dados.arquivo,
          nome: dados.nome,
          mimeType: dados.mimeType,
          duracaoMs: dados.duracaoMs,
          sinal: controle.signal,
          onProgresso: (p) => {
            const segundos = (Date.now() - inicio) / 1000;
            setEnvio({
              progresso: p,
              bytesPorSegundo: segundos > 1 ? p.bytesEnviados / segundos : null,
            });
          },
        });

        router.push(`/editor?projeto=${projectId}`);
      } catch (e) {
        setEnviando(false);
        if (e instanceof DOMException && e.name === 'AbortError') {
          setErroDeEnvio('Envio cancelado. Nada foi perdido: você pode enviar de novo.');
          return;
        }
        setErroDeEnvio(e instanceof Error ? e.message : 'não foi possível enviar o vídeo.');
      } finally {
        cancelarRef.current = null;
      }
    },
    [projetoDaUrl, projeto?.title, router, titulo, scriptId],
  );

  const enviarArquivo = useCallback(
    async (arquivo: File) => {
      setErroDeEnvio(null);
      const problema = await validar(arquivo);
      if (problema) {
        setErroDeEnvio(problema);
        return;
      }
      await enviarVideo({
        arquivo,
        nome: arquivo.name,
        mimeType: tipoDoArquivo(arquivo),
        duracaoMs: (await duracaoDe(arquivo)) ?? undefined,
      });
    },
    [enviarVideo],
  );

  // Aviso ao sair no meio do envio: fechar a aba perde o que falta.
  useEffect(() => {
    if (!enviando) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [enviando]);

  const estadoDoProjeto = projeto?.state as ProjectState | undefined;
  const jaTemVideo =
    !!estadoDoProjeto && (podeEditar(estadoDoProjeto) || estaProcessando(estadoDoProjeto));

  return (
    <>
      <Topbar
        trilha={['Projetos', projeto?.title && projeto.title !== 'Vídeo sem título' ? projeto.title : 'Novo vídeo']}
        selo={
          enviando
            ? { texto: 'Enviando', tom: 'info' }
            : etapa === 'camera'
              ? { texto: 'Gravação', tom: 'info' }
              : undefined
        }
      >
        {etapa === 'camera' && !enviando ? (
          <button
            type="button"
            className="botao botao--fantasma botao--pequeno"
            onClick={() => setEtapa('escolher')}
          >
            <IconeVoltar size={18} />
            Voltar
          </button>
        ) : (
          <Link href="/" className="botao botao--fantasma botao--pequeno">
            <IconeVoltar size={18} />
            Projetos
          </Link>
        )}
      </Topbar>

      <div className="conteudo" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--e4)' }}>
        {erroDeEnvio && (
          <div className="aviso aviso--erro" role="alert">
            <IconeAviso size={18} />
            <span>{erroDeEnvio}</span>
          </div>
        )}

        {jaTemVideo && !enviando && projetoDaUrl && (
          <div className="aviso aviso--info" role="status">
            <IconeAviso size={18} />
            <span>
              Este projeto já tem um vídeo. Enviar outro <strong>substitui</strong> o atual e refaz a
              proposta de edição.{' '}
              <Link href={`/editor?projeto=${projetoDaUrl}`}>Abrir no editor</Link>
            </span>
          </div>
        )}

        {enviando ? (
          <PainelDeEnvio
            envio={envio}
            onCancelar={() => cancelarRef.current?.abort()}
          />
        ) : etapa === 'escolher' ? (
          <Escolha
            titulo={titulo}
            onTitulo={setTitulo}
            onGravar={() => setEtapa('camera')}
            onArquivo={(a) => void enviarArquivo(a)}
            temRoteiroProprio={temRoteiroProprio}
            focoNoEnvio={parametros.get('modo') === 'enviar'}
          />
        ) : (
          <EstudioDeGravacao
            roteiro={roteiro}
            onEnviar={(blob, mime, segundos) =>
              void (async () => {
                const tipo = mime.split(';')[0] ?? 'video/webm';
                await enviarVideo({
                  arquivo: blob,
                  nome: `gravacao.${tipo.includes('mp4') ? 'mp4' : 'webm'}`,
                  mimeType: tipo,
                  duracaoMs: (await duracaoDe(blob)) ?? (segundos > 0 ? segundos * 1000 : undefined),
                });
              })()
            }
          />
        )}
      </div>
    </>
  );
}

// ============================================================
// Escolha
// ============================================================

function Escolha({
  titulo,
  onTitulo,
  onGravar,
  onArquivo,
  temRoteiroProprio,
  focoNoEnvio,
}: {
  titulo: string;
  onTitulo: (v: string) => void;
  onGravar: () => void;
  onArquivo: (arquivo: File) => void;
  temRoteiroProprio: boolean;
  focoNoEnvio: boolean;
}) {
  const [arrastando, setArrastando] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focoNoEnvio) entradaRef.current?.click();
    // Só na chegada: "Enviar vídeo" da lista já abre o seletor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 'var(--e5)' }}>
      <div>
        <h1 style={{ marginBottom: 'var(--e2)' }}>Novo vídeo</h1>
        <p className="texto-secundario">
          Grave agora com o teleprompter ou envie um vídeo que você já tem. A IA monta a proposta de
          edição sozinha assim que o vídeo chegar.
        </p>
      </div>

      <label className="campo" style={{ maxWidth: 520 }}>
        <span className="campo__rotulo">Nome do vídeo</span>
        <input
          className="campo__entrada"
          value={titulo}
          maxLength={120}
          placeholder="Ex.: 3 erros no atendimento pelo WhatsApp"
          onChange={(e) => onTitulo(e.target.value)}
        />
        <span className="campo__ajuda">Opcional. Sem nome, usamos o nome do arquivo ou a data.</span>
      </label>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--e4)',
        }}
      >
        {/* ---------- Enviar ---------- */}
        <section
          className="cartao"
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const arquivo = e.dataTransfer.files?.[0];
            if (arquivo) onArquivo(arquivo);
          }}
          style={{
            display: 'grid',
            gap: 'var(--e3)',
            alignContent: 'start',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: arrastando ? 'var(--accent)' : 'var(--border-forte)',
            background: arrastando ? 'var(--surface-2)' : undefined,
            transition: 'border-color .15s, background .15s',
          }}
        >
          <span className="vazio__icone" aria-hidden>
            <IconeNuvem size={26} />
          </span>
          <h2>Enviar um vídeo</h2>
          <p className="texto-secundario" style={{ fontSize: 14 }}>
            Arraste o arquivo para cá ou escolha no computador ou celular. MP4, MOV, WebM, MKV ou
            AVI, até 2 GB e 30 minutos.
          </p>
          <button
            type="button"
            className="botao"
            style={{ justifySelf: 'start' }}
            onClick={() => entradaRef.current?.click()}
          >
            <IconeEnviar size={16} />
            Escolher arquivo
          </button>
          <input
            ref={entradaRef}
            type="file"
            accept={[...TIPOS_ACEITOS, '.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].join(',')}
            style={{ display: 'none' }}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = '';
              if (arquivo) onArquivo(arquivo);
            }}
          />
        </section>

        {/* ---------- Gravar ---------- */}
        <section className="cartao" style={{ display: 'grid', gap: 'var(--e3)', alignContent: 'start' }}>
          <span className="vazio__icone" aria-hidden>
            <IconeGravar size={26} weight="fill" />
          </span>
          <h2>Gravar com teleprompter</h2>
          <p className="texto-secundario" style={{ fontSize: 14 }}>
            {temRoteiroProprio
              ? 'O roteiro deste projeto aparece ao lado da câmera, bloco a bloco.'
              : 'O roteiro aparece ao lado da câmera, bloco a bloco. Sem roteiro salvo, usamos um guia de estrutura.'}{' '}
            O navegador pede acesso à câmera só quando você entrar.
          </p>
          <div className="linha" style={{ gap: 'var(--e3)', flexWrap: 'wrap' }}>
            <button type="button" className="botao botao--secundario" onClick={onGravar}>
              <IconeCamera size={16} />
              Abrir a câmera
            </button>
            {!temRoteiroProprio && (
              <Link href="/roteiros" className="botao botao--fantasma">
                <IconeRoteiro size={16} />
                Escrever um roteiro antes
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Envio
// ============================================================

function PainelDeEnvio({ envio, onCancelar }: { envio: EstadoDoEnvio; onCancelar: () => void }) {
  const p = envio.progresso;
  const percentual = p?.percentual ?? 0;
  const restante =
    p && envio.bytesPorSegundo && envio.bytesPorSegundo > 0
      ? (p.bytesTotais - p.bytesEnviados) / envio.bytesPorSegundo
      : null;

  return (
    <section
      className="cartao"
      style={{ maxWidth: 640, width: '100%', margin: 'var(--e6) auto 0', display: 'grid', gap: 'var(--e4)' }}
      aria-live="polite"
    >
      <div className="linha" style={{ gap: 'var(--e3)' }}>
        <span className="vazio__icone" aria-hidden>
          <IconeNuvem size={24} />
        </span>
        <div>
          <h2>Enviando o vídeo</h2>
          <p className="texto-secundario" style={{ fontSize: 13 }}>
            Mantenha esta aba aberta. Se a conexão cair, o envio continua de onde parou.
          </p>
        </div>
      </div>

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do envio"
      >
        <div className="barra__preenchida" style={{ width: `${percentual}%` }} />
      </div>

      <div className="linha entre texto-secundario" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span>
          {percentual}%{p ? ` · ${formatarBytes(p.bytesEnviados)} de ${formatarBytes(p.bytesTotais)}` : ' · preparando…'}
        </span>
        <span>
          {envio.bytesPorSegundo ? `${formatarBytes(envio.bytesPorSegundo)}/s` : ''}
          {restante !== null ? ` · falta ${formatarRestante(restante)}` : ''}
        </span>
      </div>

      <p className="texto-secundario" style={{ fontSize: 13 }}>
        Depois do envio, o vídeo é preparado, transcrito e a proposta de edição é montada
        automaticamente. Você acompanha tudo no editor.
      </p>

      <button type="button" className="botao botao--secundario" style={{ justifySelf: 'start' }} onClick={onCancelar}>
        Cancelar envio
      </button>
    </section>
  );
}

function formatarRestante(segundos: number): string {
  if (segundos < 60) return `${Math.max(1, Math.round(segundos))} s`;
  const minutos = Math.round(segundos / 60);
  return `${minutos} min`;
}

// ============================================================
// Estúdio de gravação — só existe depois da escolha
// ============================================================

type EstadoDosDispositivos = 'verificando' | 'prontos' | 'negado' | 'ausente';

function EstudioDeGravacao({
  roteiro,
  onEnviar,
}: {
  roteiro: BlocoDoRoteiro[];
  onEnviar: (blob: Blob, mime: string, segundos: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fluxoRef = useRef<MediaStream | null>(null);

  const [fluxo, setFluxo] = useState<MediaStream | null>(null);
  const [dispositivos, setDispositivos] = useState<EstadoDosDispositivos>('verificando');
  const [erroDeAcesso, setErroDeAcesso] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microfones, setMicrofones] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [microfoneId, setMicrofoneId] = useState<string>('');
  const [nivel, setNivel] = useState(0);
  // O que a pessoa ESCOLHEU (reabre a câmera) é separado do que está
  // em uso (só exibe): mostrar o id em uso não pode reabrir o fluxo.
  const [escolha, setEscolha] = useState<{ camera: string; microfone: string }>({ camera: '', microfone: '' });

  const [bloco, setBloco] = useState(0);
  const [tamanhoDoTexto, setTamanhoDoTexto] = useState(28);
  const [comContagem, setComContagem] = useState(true);

  const gravacao = useGravacao(fluxo);
  const gravando = gravacao.estado === 'gravando' || gravacao.estado === 'pausado';

  // O <video> da câmera é desmontado durante a revisão. Ligar o fluxo
  // pela ref de callback faz a imagem voltar ao regravar — antes, a
  // tela ficava preta depois do primeiro "Regravar".
  const ligarVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && fluxoRef.current && el.srcObject !== fluxoRef.current) {
      el.srcObject = fluxoRef.current;
    }
  }, []);

  // ---------- Câmera e microfone ----------
  useEffect(() => {
    let cancelado = false;

    async function pedirAcesso() {
      setDispositivos('verificando');
      try {
        const obtido = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(escolha.camera ? { deviceId: { exact: escolha.camera } } : {}),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: {
            ...(escolha.microfone ? { deviceId: { exact: escolha.microfone } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        if (cancelado) {
          obtido.getTracks().forEach((t) => t.stop());
          return;
        }

        fluxoRef.current?.getTracks().forEach((t) => t.stop());
        fluxoRef.current = obtido;
        setFluxo(obtido);
        if (videoRef.current) videoRef.current.srcObject = obtido;
        setDispositivos('prontos');
        setErroDeAcesso(null);

        // Os nomes dos dispositivos só aparecem depois da permissão.
        const lista = await navigator.mediaDevices.enumerateDevices();
        if (cancelado) return;
        setCameras(lista.filter((d) => d.kind === 'videoinput'));
        setMicrofones(lista.filter((d) => d.kind === 'audioinput'));
        setCameraId(obtido.getVideoTracks()[0]?.getSettings().deviceId ?? '');
        setMicrofoneId(obtido.getAudioTracks()[0]?.getSettings().deviceId ?? '');
      } catch (e) {
        if (cancelado) return;

        // Permissão negada e dispositivo ausente têm saídas diferentes:
        // uma é reabrir a permissão, a outra é conectar um equipamento.
        const nome = (e as Error).name;
        if (nome === 'NotAllowedError' || nome === 'SecurityError') {
          setDispositivos('negado');
          setErroDeAcesso(
            'O navegador bloqueou a câmera. Autorize o acesso no cadeado ao lado do endereço e tente de novo — ou volte e envie um arquivo.',
          );
        } else if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError') {
          setDispositivos('ausente');
          setErroDeAcesso('Nenhuma câmera encontrada. Conecte uma, ou volte e envie um arquivo.');
        } else {
          setDispositivos('ausente');
          setErroDeAcesso(`Não foi possível acessar a câmera (${nome}).`);
        }
      }
    }

    void pedirAcesso();

    return () => {
      cancelado = true;
    };
    // O id escolhido reabre o fluxo com o dispositivo novo.
  }, [escolha]);

  // Liberar as faixas ao sair apaga a luz da webcam.
  useEffect(() => {
    return () => fluxoRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // ---------- Medidor do microfone ----------
  // Descobrir que o microfone estava mudo depois de oito minutos custa
  // a gravação inteira: o medidor mostra que o som está chegando.
  useEffect(() => {
    if (!fluxo || fluxo.getAudioTracks().length === 0) return;
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;

    const contexto = new Contexto();
    const fonte = contexto.createMediaStreamSource(fluxo);
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 512;
    fonte.connect(analisador);
    const dados = new Uint8Array(analisador.fftSize);
    let quadro = 0;

    const medir = () => {
      analisador.getByteTimeDomainData(dados);
      let pico = 0;
      for (const v of dados) pico = Math.max(pico, Math.abs(v - 128));
      setNivel(Math.min(1, pico / 64));
      quadro = requestAnimationFrame(medir);
    };
    medir();

    return () => {
      cancelAnimationFrame(quadro);
      void contexto.close();
    };
  }, [fluxo]);

  // ---------- Teclado do teleprompter ----------
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement || alvo instanceof HTMLButtonElement) {
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

  const tempo = `${Math.floor(gravacao.segundos / 60)
    .toString()
    .padStart(2, '0')}:${(gravacao.segundos % 60).toString().padStart(2, '0')}`;

  return (
    <>
      {erroDeAcesso && (
        <div className="aviso aviso--atencao" role="alert">
          <IconeAviso size={18} />
          <span>{erroDeAcesso}</span>
        </div>
      )}
      {gravacao.erro && (
        <div className="aviso aviso--erro" role="alert">
          <IconeAviso size={18} />
          <span>{gravacao.erro}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
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
              ref={ligarVideo}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          )}

          {dispositivos === 'verificando' && gravacao.estado !== 'revisando' && (
            <div
              role="status"
              style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}
            >
              Ligando a câmera…
            </div>
          )}

          {gravacao.estado !== 'revisando' && dispositivos === 'prontos' && (
            <>
              {/* Área segura: o que sobrevive ao corte 9:16. */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: '4% 34%',
                  border: '1px dashed rgb(255 255 255 / 45%)',
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
                  whiteSpace: 'nowrap',
                }}
              >
                Fique dentro da área tracejada: é o que aparece no vídeo vertical
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
                  animation: gravacao.estado === 'gravando' ? 'pulsar 1.4s infinite' : undefined,
                }}
              />
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                {gravacao.estado === 'pausado' ? 'Pausado' : 'Gravando'} · {tempo}
              </span>
            </div>
          )}

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

          <div className="linha" style={{ gap: 'var(--e2)', marginBottom: 'var(--e4)', flexWrap: 'wrap' }}>
            {roteiro.map((b, i) => (
              <button
                key={i}
                type="button"
                className={`botao botao--pequeno ${i === bloco ? '' : 'botao--secundario'}`}
                onClick={() => setBloco(i)}
                aria-pressed={i === bloco}
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
              minHeight: 160,
            }}
          >
            {roteiro[bloco]?.texto}
          </div>

          <div className="linha entre" style={{ marginTop: 'var(--e3)' }}>
            <span className="texto-secundario" style={{ fontSize: 13 }}>
              {bloco + 1} / {roteiro.length}
            </span>
            <span className="linha texto-secundario" style={{ gap: 4, fontSize: 13 }}>
              Setas ou espaço para avançar
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
                  <span className="texto-secundario"> · {formatarBytes(gravacao.resultado.size)}</span>
                )}
              </span>
            </span>

            {/* Regravar vem ANTES de enviar: a primeira tomada quase
                nunca é a boa. */}
            <button type="button" className="botao botao--secundario" onClick={gravacao.descartar}>
              <IconeLixeira size={16} />
              Regravar
            </button>
            <button
              type="button"
              className="botao"
              onClick={() => gravacao.resultado && onEnviar(gravacao.resultado, gravacao.mimeType, gravacao.segundos)}
            >
              <IconeEnviar size={16} />
              Enviar para edição
            </button>
          </>
        ) : (
          <>
            <SeletorDeDispositivo
              Icone={IconeCamera}
              rotulo="Câmera"
              opcoes={cameras}
              valor={cameraId}
              desabilitado={gravando || dispositivos === 'verificando'}
              onTrocar={(id) => setEscolha((e) => ({ ...e, camera: id }))}
            />
            <SeletorDeDispositivo
              Icone={IconeMicrofone}
              rotulo="Microfone"
              opcoes={microfones}
              valor={microfoneId}
              desabilitado={gravando || dispositivos === 'verificando'}
              onTrocar={(id) => setEscolha((e) => ({ ...e, microfone: id }))}
            />

            <span
              className="linha"
              style={{ gap: 6, fontSize: 12 }}
              title="Nível do microfone"
              aria-label={`Nível do microfone: ${Math.round(nivel * 100)}%`}
            >
              <span className="texto-secundario">Som</span>
              <span
                aria-hidden
                style={{ width: 70, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.round(nivel * 100)}%`,
                    background: nivel > 0.9 ? 'var(--warning)' : 'var(--success)',
                    transition: 'width 80ms linear',
                  }}
                />
              </span>
            </span>

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

            <span className="linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
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
            </span>

            <span className="auto linha" style={{ gap: 'var(--e3)' }}>
              {gravando && (
                <button
                  type="button"
                  className="botao botao--secundario"
                  onClick={gravacao.estado === 'pausado' ? gravacao.retomar : gravacao.pausar}
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
                style={{ background: gravando ? 'var(--danger)' : undefined, minWidth: 150 }}
              >
                <IconeGravar size={18} weight="fill" />
                {gravando ? 'Parar' : 'Gravar'}
              </button>
            </span>
          </>
        )}
      </section>
    </>
  );
}

function SeletorDeDispositivo({
  Icone,
  rotulo,
  opcoes,
  valor,
  desabilitado,
  onTrocar,
}: {
  Icone: typeof IconeCamera;
  rotulo: string;
  opcoes: MediaDeviceInfo[];
  valor: string;
  desabilitado: boolean;
  onTrocar: (id: string) => void;
}) {
  return (
    <label className="linha" style={{ gap: 'var(--e2)' }}>
      <Icone size={18} />
      <span style={{ lineHeight: 1.2, display: 'grid' }}>
        <span className="texto-secundario" style={{ fontSize: 11 }}>
          {rotulo}
        </span>
        <select
          className="campo__selecao"
          value={valor}
          disabled={desabilitado || opcoes.length === 0}
          onChange={(e) => onTrocar(e.target.value)}
          style={{ fontSize: 13, maxWidth: 200, padding: '2px 6px', minHeight: 0 }}
          aria-label={rotulo}
        >
          {opcoes.length === 0 && <option value="">Padrão do sistema</option>}
          {opcoes.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `${rotulo} ${i + 1}`}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
