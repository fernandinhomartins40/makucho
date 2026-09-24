'use client';

// ============================================================
// Novo vídeo — enviar e gravar um ou vários vídeos, e só então editar.
//
// A tela começa pela ESCOLHA, não pela câmera. Abrir a webcam de cara
// assustava quem só queria enviar um vídeo pronto, disparava o pedido
// de permissão sem contexto e acendia a luz da câmera sem motivo.
//
//   escolher   título, os dois caminhos (enviar vários arquivos,
//              gravar tomadas) e a LISTA dos vídeos do projeto: cada um
//              com o seu envio, na ordem em que vão entrar, com setas
//              para trocar e lixeira para tirar;
//   câmera     só aqui o navegador pede câmera e microfone. Cada
//              gravação volta para a lista, e dá para gravar outra.
//
// Nada é processado enquanto a pessoa monta a lista: só "Ir para a
// edição com IA" junta os vídeos num só, na ordem da lista, e começa o
// preparo. O destino é o editor, que acompanha tudo.
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
  ACEITAR_VIDEOS_DA_GALERIA,
  ACEITAR_VIDEOS_EM_ARQUIVOS,
} from '../../lib/upload';
import {
  projetos as apiProjetos,
  roteiros as apiRoteiros,
  type ParteDoProjeto,
  type ProjetoDetalhado,
} from '../../lib/api';
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
  IconeVideo,
  IconeIA,
  IconeSubir,
  IconeDescer,
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

  const [itens, setItens] = useState<ItemDoVideo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const cancelarRef = useRef<Map<string, AbortController>>(new Map());
  // O projeto é criado no primeiro envio, e todos os vídeos seguintes
  // entram nele. Um envio que falha não cria rascunho novo.
  const projetoRef = useRef<string | null>(projetoDaUrl);

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

  // ---------- Projeto que já existe (voltou para acrescentar vídeos) ----------
  useEffect(() => {
    if (!projetoDaUrl) return;

    void apiProjetos
      .obter(projetoDaUrl)
      .then(async (p) => {
        setProjeto(p);
        if (p.title && p.title !== 'Vídeo sem título') setTitulo(p.title);
        const doProjeto = p.script?.id;
        if (doProjeto && !roteiroDaUrl) await carregarRoteiro(doProjeto);
        const partes = await apiProjetos.partes(projetoDaUrl);
        setItens(partes.map(itemDaParte));
      })
      // O roteiro é um apoio: sem ele, grava-se com o padrão.
      .catch(() => undefined);
  }, [projetoDaUrl, roteiroDaUrl, carregarRoteiro]);

  const garantirProjeto = useCallback(
    async (nomeDoArquivo: string) => {
      if (projetoRef.current) return projetoRef.current;
      const nome = titulo.trim() || nomeDoArquivo.replace(/\.[^.]+$/, '') || 'Vídeo sem título';
      const criado = await apiProjetos.criar({ title: nome.slice(0, 120), scriptId });
      projetoRef.current = criado.id;
      return criado.id;
    },
    [titulo, scriptId],
  );

  const atualizar = (chave: string, mudanca: Partial<ItemDoVideo>) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));

  // ---------- Fila de envio: um vídeo por vez ----------
  //
  // Um por vez, e não todos juntos: a banda é a mesma, e em paralelo
  // nenhum termina antes — quem enviou três vídeos esperaria o último
  // para ver o primeiro pronto. A ordem de chegada é a ordem da lista.
  const enviandoAgora = itens.some((i) => i.estado === 'enviando');
  const proximo = itens.find((i) => i.estado === 'esperando');

  useEffect(() => {
    if (enviandoAgora || !proximo?.arquivo) return;
    const item = proximo;
    const arquivo = item.arquivo!;
    const controle = new AbortController();
    cancelarRef.current.set(item.chave, controle);
    const inicio = Date.now();
    atualizar(item.chave, { estado: 'enviando', progresso: 0 });

    void (async () => {
      try {
        const projectId = await garantirProjeto(item.nome);
        const r = await enviar({
          projectId,
          arquivo,
          nome: item.nome,
          mimeType: item.mimeType,
          duracaoMs: item.duracaoMs,
          parte: true,
          sinal: controle.signal,
          onProgresso: (p) => {
            const segundos = (Date.now() - inicio) / 1000;
            atualizar(item.chave, {
              progresso: p.percentual,
              bytesPorSegundo: segundos > 1 ? p.bytesEnviados / segundos : undefined,
            });
          },
        });
        atualizar(item.chave, { estado: 'pronto', progresso: 100, parteId: r.mediaSourceId, arquivo: undefined });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setItens((atual) => atual.filter((i) => i.chave !== item.chave));
          return;
        }
        atualizar(item.chave, { estado: 'erro', erro: e instanceof Error ? e.message : 'não foi possível enviar.' });
      } finally {
        cancelarRef.current.delete(item.chave);
      }
    })();
    // A fila anda quando um termina; o item em si é lido acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enviandoAgora, proximo?.chave]);

  /** Arquivos escolhidos ou arrastados: validados e postos na fila. */
  const adicionarArquivos = useCallback(async (arquivos: File[]) => {
    setErro(null);
    const novos: ItemDoVideo[] = [];
    const recusados: string[] = [];
    for (const arquivo of arquivos) {
      const problema = await validar(arquivo);
      if (problema) {
        recusados.push(`${arquivo.name}: ${problema}`);
        continue;
      }
      novos.push({
        chave: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nome: arquivo.name,
        tamanhoBytes: arquivo.size,
        mimeType: tipoDoArquivo(arquivo),
        duracaoMs: (await duracaoDe(arquivo)) ?? undefined,
        estado: 'esperando',
        progresso: 0,
        arquivo,
      });
    }
    if (recusados.length) setErro(recusados.join(' · '));
    setItens((atual) => [...atual, ...novos]);
  }, []);

  const adicionarGravacao = useCallback(async (blob: Blob, mime: string, segundos: number) => {
    const tipo = mime.split(';')[0] ?? 'video/webm';
    setItens((atual) => {
      const tomada = atual.filter((i) => i.nome.startsWith('Gravação')).length + 1;
      return [
        ...atual,
        {
          chave: `${Date.now()}-g`,
          nome: `Gravação ${tomada}.${tipo.includes('mp4') ? 'mp4' : 'webm'}`,
          tamanhoBytes: blob.size,
          mimeType: tipo,
          duracaoMs: segundos > 0 ? segundos * 1000 : undefined,
          estado: 'esperando',
          progresso: 0,
          arquivo: blob,
        },
      ];
    });
    setEtapa('escolher');
  }, []);

  const remover = useCallback(async (item: ItemDoVideo) => {
    setErro(null);
    if (item.estado === 'enviando') {
      cancelarRef.current.get(item.chave)?.abort();
      return;
    }
    if (item.parteId && projetoRef.current) {
      try {
        const partes = await apiProjetos.removerParte(projetoRef.current, item.parteId);
        setItens((atual) => [...partes.map(itemDaParte), ...atual.filter((i) => !i.parteId && i.chave !== item.chave)]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'não foi possível remover.');
      }
      return;
    }
    setItens((atual) => atual.filter((i) => i.chave !== item.chave));
  }, []);

  /** Sobe ou desce um vídeo já enviado. A ordem é a do vídeo final. */
  const mover = useCallback(
    async (item: ItemDoVideo, direcao: -1 | 1) => {
      const prontos = itens.filter((i) => i.parteId);
      const de = prontos.findIndex((i) => i.chave === item.chave);
      const para = de + direcao;
      if (de < 0 || para < 0 || para >= prontos.length || !projetoRef.current) return;
      const ordem = [...prontos];
      [ordem[de], ordem[para]] = [ordem[para]!, ordem[de]!];
      // Mostra na hora; o servidor confirma.
      setItens((atual) => [...ordem, ...atual.filter((i) => !i.parteId)]);
      try {
        await apiProjetos.ordenarPartes(projetoRef.current, ordem.map((i) => i.parteId!));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'não foi possível mudar a ordem.');
      }
    },
    [itens],
  );

  const irParaEdicao = useCallback(async () => {
    if (!projetoRef.current) return;
    setFinalizando(true);
    setErro(null);
    try {
      if (titulo.trim() && titulo.trim() !== projeto?.title) {
        await apiProjetos.atualizar(projetoRef.current, { title: titulo.trim() }).catch(() => undefined);
      }
      await apiProjetos.finalizarPartes(projetoRef.current);
      router.push(`/editor?projeto=${projetoRef.current}`);
    } catch (e) {
      setFinalizando(false);
      setErro(e instanceof Error ? e.message : 'não foi possível ir para a edição.');
    }
  }, [router, titulo, projeto?.title]);

  // Aviso ao sair no meio do envio: fechar a aba perde o que falta.
  const pendentes = itens.filter((i) => i.estado === 'enviando' || i.estado === 'esperando').length;
  useEffect(() => {
    if (!pendentes) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendentes]);

  const estadoDoProjeto = projeto?.state as ProjectState | undefined;
  const jaFoiParaEdicao =
    !!estadoDoProjeto && (podeEditar(estadoDoProjeto) || estaProcessando(estadoDoProjeto));
  const prontos = itens.filter((i) => i.estado === 'pronto').length;

  return (
    <>
      <Topbar
        trilha={['Projetos', projeto?.title && projeto.title !== 'Vídeo sem título' ? projeto.title : 'Novo vídeo']}
        selo={
          pendentes
            ? { texto: 'Enviando', tom: 'info' }
            : etapa === 'camera'
              ? { texto: 'Gravação', tom: 'info' }
              : undefined
        }
      >
        {etapa === 'camera' ? (
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setEtapa('escolher')}>
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
        {erro && (
          <div className="aviso aviso--erro" role="alert">
            <IconeAviso size={18} />
            <span>{erro}</span>
          </div>
        )}

        {jaFoiParaEdicao && projetoDaUrl ? (
          <div className="aviso aviso--info" role="status">
            <IconeAviso size={18} />
            <span>
              Os vídeos deste projeto já foram para a edição.{' '}
              <Link href={`/editor?projeto=${projetoDaUrl}`}>Abrir no editor</Link> ou{' '}
              <Link href="/gravar">começar um vídeo novo</Link>.
            </span>
          </div>
        ) : etapa === 'escolher' ? (
          <Composicao
            titulo={titulo}
            onTitulo={setTitulo}
            onGravar={() => setEtapa('camera')}
            onArquivos={(a) => void adicionarArquivos(a)}
            temRoteiroProprio={temRoteiroProprio}
            focoNoEnvio={parametros.get('modo') === 'enviar'}
            itens={itens}
            onRemover={(i) => void remover(i)}
            onMover={(i, d) => void mover(i, d)}
            onTentarDeNovo={(i) => atualizar(i.chave, { estado: 'esperando', erro: undefined, progresso: 0 })}
            podeIr={prontos > 0 && pendentes === 0 && !finalizando}
            finalizando={finalizando}
            pendentes={pendentes}
            onIrParaEdicao={() => void irParaEdicao()}
          />
        ) : (
          <EstudioDeGravacao
            roteiro={roteiro}
            onEnviar={(blob, mime, segundos) => void adicionarGravacao(blob, mime, segundos)}
          />
        )}
      </div>
    </>
  );
}

// ============================================================
// Composição — os vídeos que vão virar um só
// ============================================================

interface ItemDoVideo {
  chave: string;
  nome: string;
  tamanhoBytes: number;
  mimeType: string;
  duracaoMs?: number;
  estado: 'esperando' | 'enviando' | 'pronto' | 'erro';
  progresso: number;
  bytesPorSegundo?: number;
  erro?: string;
  /** Id da parte no servidor, depois de enviada. */
  parteId?: string;
  /** O arquivo, enquanto não foi enviado. */
  arquivo?: Blob;
}

function itemDaParte(p: ParteDoProjeto): ItemDoVideo {
  return {
    chave: p.id,
    nome: p.nome,
    tamanhoBytes: p.tamanhoBytes,
    mimeType: p.mimeType,
    estado: 'pronto',
    progresso: 100,
    parteId: p.id,
  };
}

function Composicao({
  titulo,
  onTitulo,
  onGravar,
  onArquivos,
  temRoteiroProprio,
  focoNoEnvio,
  itens,
  onRemover,
  onMover,
  onTentarDeNovo,
  podeIr,
  finalizando,
  pendentes,
  onIrParaEdicao,
}: {
  titulo: string;
  onTitulo: (v: string) => void;
  onGravar: () => void;
  onArquivos: (arquivos: File[]) => void;
  temRoteiroProprio: boolean;
  focoNoEnvio: boolean;
  itens: ItemDoVideo[];
  onRemover: (i: ItemDoVideo) => void;
  onMover: (i: ItemDoVideo, direcao: -1 | 1) => void;
  onTentarDeNovo: (i: ItemDoVideo) => void;
  podeIr: boolean;
  finalizando: boolean;
  pendentes: number;
  onIrParaEdicao: () => void;
}) {
  const [arrastando, setArrastando] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  // Decidido depois de montar: no servidor não há navegador para ler.
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(/Android/i.test(navigator.userAgent)), []);

  useEffect(() => {
    if (focoNoEnvio) entradaRef.current?.click();
    // Só na chegada: "Enviar vídeo" da lista já abre o seletor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enviados = itens.filter((i) => i.parteId);
  const temItens = itens.length > 0;

  return (
    <div style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 'var(--e5)' }}>
      <div>
        <h1 style={{ marginBottom: 'var(--e2)' }}>Novo vídeo</h1>
        <p className="texto-secundario">
          Envie um ou vários vídeos, grave tomadas com o teleprompter e ponha na ordem. Quando estiver
          tudo aqui, a IA junta, transcreve e monta a edição.
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
        <span className="campo__ajuda">Opcional. Sem nome, usamos o nome do primeiro arquivo.</span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 'var(--e4)' }}>
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
            const arquivos = [...(e.dataTransfer.files ?? [])];
            if (arquivos.length) onArquivos(arquivos);
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
          <h2>{temItens ? 'Enviar mais vídeos' : 'Enviar vídeos'}</h2>
          <p className="texto-secundario" style={{ fontSize: 14 }}>
            Arraste um ou vários arquivos para cá, ou escolha no computador ou celular. MP4, MOV, WebM,
            MKV ou AVI, até 2 GB cada e 30 minutos no total.
          </p>
          <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
            <button type="button" className="botao" onClick={() => entradaRef.current?.click()}>
              <IconeEnviar size={16} />
              Escolher arquivos
            </button>
            {/* Android: o botão principal abre o gerenciador de arquivos
                (Downloads, WhatsApp, Drive...); a galeria fica aqui. */}
            {android && (
              <button type="button" className="botao botao--secundario" onClick={() => galeriaRef.current?.click()}>
                <IconeVideo size={16} />
                Da galeria
              </button>
            )}
          </div>
          {android && (
            <p className="campo__ajuda">
              Não achou o vídeo? Em &quot;Escolher arquivos&quot;, toque em ☰ e escolha Downloads, WhatsApp ou Drive.
            </p>
          )}
          <input
            ref={entradaRef}
            type="file"
            multiple
            accept={ACEITAR_VIDEOS_EM_ARQUIVOS}
            style={{ display: 'none' }}
            aria-label="Escolher vídeos"
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = '';
              if (arquivos.length) onArquivos(arquivos);
            }}
          />
          <input
            ref={galeriaRef}
            type="file"
            multiple
            accept={ACEITAR_VIDEOS_DA_GALERIA}
            style={{ display: 'none' }}
            aria-label="Escolher vídeos da galeria"
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = '';
              if (arquivos.length) onArquivos(arquivos);
            }}
          />
        </section>

        {/* ---------- Gravar ---------- */}
        <section className="cartao" style={{ display: 'grid', gap: 'var(--e3)', alignContent: 'start' }}>
          <span className="vazio__icone" aria-hidden>
            <IconeGravar size={26} weight="fill" />
          </span>
          <h2>{temItens ? 'Gravar outra tomada' : 'Gravar com teleprompter'}</h2>
          <p className="texto-secundario" style={{ fontSize: 14 }}>
            {temRoteiroProprio
              ? 'O roteiro deste projeto aparece ao lado da câmera, bloco a bloco.'
              : 'O roteiro aparece ao lado da câmera, bloco a bloco. Sem roteiro salvo, usamos um guia de estrutura.'}{' '}
            Cada gravação entra na lista abaixo. O navegador pede a câmera só quando você entrar.
          </p>
          <div className="linha" style={{ gap: 'var(--e3)', flexWrap: 'wrap' }}>
            <button type="button" className="botao botao--secundario" onClick={onGravar}>
              <IconeCamera size={16} />
              Abrir a câmera
            </button>
            {!temRoteiroProprio && !temItens && (
              <Link href="/roteiros" className="botao botao--fantasma">
                <IconeRoteiro size={16} />
                Escrever um roteiro antes
              </Link>
            )}
          </div>
        </section>
      </div>

      {/* ---------- Os vídeos deste projeto ---------- */}
      {temItens && (
        <section className="cartao" aria-labelledby="titulo-dos-videos" style={{ display: 'grid', gap: 'var(--e3)' }}>
          <div className="linha entre" style={{ flexWrap: 'wrap', gap: 'var(--e3)' }}>
            <div>
              <h2 id="titulo-dos-videos">
                {itens.length} {itens.length === 1 ? 'vídeo' : 'vídeos'} neste projeto
              </h2>
              <p className="texto-secundario" style={{ fontSize: 13 }}>
                {itens.length > 1
                  ? 'Eles viram um vídeo só, nesta ordem. Use as setas para trocar.'
                  : 'Pode enviar ou gravar mais antes de ir para a edição.'}
              </p>
            </div>
          </div>

          <ol className="lista-de-partes">
            {itens.map((item) => {
              const posicao = enviados.findIndex((i) => i.chave === item.chave);
              return (
                <li key={item.chave} className="lista-de-partes__item">
                  <span className="lista-de-partes__numero" aria-hidden>
                    {itens.indexOf(item) + 1}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong className="lista-de-partes__nome" title={item.nome}>
                      {item.nome}
                    </strong>
                    <span className="texto-secundario" style={{ fontSize: 12, display: 'block' }}>
                      {formatarBytes(item.tamanhoBytes)}
                      {item.duracaoMs ? ` · ${formatarDuracao(item.duracaoMs)}` : ''}
                      {item.estado === 'esperando' && ' · na fila'}
                      {item.estado === 'enviando' &&
                        ` · enviando ${item.progresso}%${item.bytesPorSegundo ? ` · ${formatarBytes(item.bytesPorSegundo)}/s` : ''}`}
                      {item.estado === 'pronto' && ' · enviado'}
                    </span>
                    {item.estado === 'enviando' && (
                      <span
                        className="barra"
                        role="progressbar"
                        aria-valuenow={item.progresso}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Envio de ${item.nome}`}
                        style={{ display: 'block', marginTop: 6 }}
                      >
                        <span className="barra__preenchida" style={{ width: `${item.progresso}%`, display: 'block' }} />
                      </span>
                    )}
                    {item.estado === 'erro' && (
                      <span style={{ fontSize: 12, color: 'var(--danger)', display: 'block' }}>{item.erro}</span>
                    )}
                  </span>

                  <span className="linha" style={{ gap: 4, flexShrink: 0 }}>
                    {item.estado === 'pronto' && enviados.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="botao-icone botao-icone--pequeno"
                          aria-label={`Mover ${item.nome} para cima`}
                          disabled={posicao <= 0}
                          onClick={() => onMover(item, -1)}
                        >
                          <IconeSubir size={15} />
                        </button>
                        <button
                          type="button"
                          className="botao-icone botao-icone--pequeno"
                          aria-label={`Mover ${item.nome} para baixo`}
                          disabled={posicao >= enviados.length - 1}
                          onClick={() => onMover(item, 1)}
                        >
                          <IconeDescer size={15} />
                        </button>
                      </>
                    )}
                    {item.estado === 'erro' && (
                      <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => onTentarDeNovo(item)}>
                        Tentar de novo
                      </button>
                    )}
                    <button
                      type="button"
                      className="botao-icone botao-icone--pequeno"
                      aria-label={item.estado === 'enviando' ? `Cancelar envio de ${item.nome}` : `Remover ${item.nome}`}
                      onClick={() => onRemover(item)}
                    >
                      <IconeLixeira size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="linha entre" style={{ gap: 'var(--e3)', flexWrap: 'wrap', marginTop: 'var(--e2)' }}>
            <span className="texto-secundario" style={{ fontSize: 13 }}>
              {pendentes
                ? `Aguarde ${pendentes === 1 ? 'o envio' : `os ${pendentes} envios`} terminar. Mantenha esta aba aberta.`
                : 'Depois de ir para a edição, a IA prepara, transcreve e monta a proposta. Você acompanha no editor.'}
            </span>
            <button type="button" className="botao" disabled={!podeIr} onClick={onIrParaEdicao}>
              <IconeIA size={16} weight="fill" />
              {finalizando ? 'Abrindo a edição…' : 'Ir para a edição com IA'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function formatarDuracao(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
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
              Usar esta gravação
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
