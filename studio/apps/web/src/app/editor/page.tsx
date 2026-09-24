'use client';

// ============================================================
// Editor.
//
// Anatomia: rail de ferramentas à esquerda, painel da ferramenta,
// preview 9:16 ao centro, inspector à direita e timeline na base.
//
// O editor tem três momentos, e cada um mostra só o que é verdade
// nele:
//
//   sem projeto     a lista dos vídeos que dá para abrir;
//   processando     o vídeo chegou e está sendo preparado, transcrito
//                   e montado. A tela acompanha sozinha, etapa por
//                   etapa, e abre a edição quando a proposta fica
//                   pronta. Antes, aqui aparecia um plano de EXEMPLO
//                   com legendas inventadas sobre o vídeo real;
//   editando        a proposta real, salva a cada ajuste.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EditPlanV1, MarcaDoVideo, ProjectState, TimelineOperation } from '@makucho/studio-contracts';
import {
  aplicarOperacao,
  comIdsNovos,
  aplicarOperacoes,
  CORES_PADRAO_DA_MARCA,
  estaProcessando,
  podeEditar,
  MOTIVO_DA_MONTAGEM_AUTOMATICA,
  ROTULO_DE_ESTADO,
} from '@makucho/studio-contracts';
import { RailDeFerramentas, type AbaDoEditor } from '../../components/editor/RailDeFerramentas';
import { PreparoDoVideo, avisarQueFicouPronto } from '../../components/editor/PreparoDoVideo';
import type { ItemDaTimeline } from '../../components/timeline/camadas';
import type { ProgressoDoPreparo } from '@makucho/studio-contracts';
import { PainelDaIA } from '../../components/editor/PainelDaIA';
import { PainelDeRefino } from '../../components/editor/PainelDeRefino';
import { PainelDeLegendas } from '../../components/editor/PainelDeLegendas';
import { Inspector, type RecursosDaMarca } from '../../components/editor/Inspector';
import { PedirAIa, type RespostaDaIa } from '../../components/editor/PedirAIa';
import { Palco } from '../../components/editor/Palco';
import { Timeline } from '../../components/timeline/Timeline';
import { tempo } from '../../components/editor/funcoes';
import {
  planos as apiPlanos,
  projetos as apiProjetos,
  ia as apiIa,
  renders as apiRenders,
  transcricao as apiTranscricao,
  marca as apiMarca,
  assets as apiAssets,
  urlDoVideo,
  type PerfilDeMarca,
  type Projeto,
  type ProjetoDetalhado,
  type SituacaoDoRender,
  type Transcricao,
} from '../../lib/api';
import { useDados } from '../../lib/useDados';
import {
  IconeDesfazer,
  IconeRefazer,
  IconeExportar,
  IconeTocar,
  IconeAviso,
  IconeVoltar,
  IconeRenomear,
  IconeSalvo,
  IconeSalvando,
  IconeCheck,
  IconeIA,
  IconeVideo,
  IconeEnviar,
  IconeMidia,
  IconeMarca,
} from '../../components/icones';

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <EntradaDoEditor />
    </Suspense>
  );
}

function EntradaDoEditor() {
  const projectId = useSearchParams().get('projeto');
  return projectId ? <Editor key={projectId} projectId={projectId} /> : <EscolherProjeto />;
}

type EstadoDoSalvamento = 'salvo' | 'salvando' | 'erro';

/** O plano tem proposta de verdade quando o servidor tem uma versão. */
function temPlano(projeto: ProjetoDetalhado | null): boolean {
  return !!projeto && projeto.editPlans.length > 0;
}

function Editor({ projectId }: { projectId: string }) {
  const [projeto, setProjeto] = useState<ProjetoDetalhado | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);
  const [plano, setPlano] = useState<EditPlanV1 | null>(null);

  const [salvamento, setSalvamento] = useState<EstadoDoSalvamento>('salvo');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [posicaoMs, setPosicaoMs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaDoEditor>('ia');
  // Celular: qual folha está aberta sobre o preview. No computador os
  // painéis ficam sempre à vista e o CSS ignora isto.
  const [folha, setFolha] = useState<'painel' | 'inspector' | null>(null);
  // Legenda, corte, elemento ou som selecionado na timeline.
  const [itemSelecionado, setItemSelecionado] = useState<ItemDaTimeline | null>(null);
  // Preparo: progresso ao vivo e a comemoração antes de abrir o editor.
  const [progresso, setProgresso] = useState<ProgressoDoPreparo | null>(null);
  const [comemorando, setComemorando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [comandoTocar, setComandoTocar] = useState(0);

  const [transcricao, setTranscricao] = useState<Transcricao | null>(null);
  const [carregandoTranscricao, setCarregandoTranscricao] = useState(false);

  const [analisando, setAnalisando] = useState(false);
  const [avisosDaIa, setAvisosDaIa] = useState<string[]>([]);

  const [exportando, setExportando] = useState(false);
  const [render, setRender] = useState<SituacaoDoRender | null>(null);

  // Trechos desligados continuam na lista (a seção 13 exige poder
  // restaurar o que foi descartado). Ficam guardados por projeto: um
  // recarregar da página não pode religar o que a pessoa desligou.
  const chaveDosDesligados = `studio:desligados:${projectId}`;
  const [desligados, setDesligados] = useState<Set<string>>(() => {
    try {
      const salvo = typeof window !== 'undefined' ? window.localStorage.getItem(chaveDosDesligados) : null;
      return new Set(salvo ? (JSON.parse(salvo) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(chaveDosDesligados, JSON.stringify([...desligados]));
    } catch {
      // Sem armazenamento local, o estado vale só nesta aba.
    }
  }, [desligados, chaveDosDesligados]);

  const [passado, setPassado] = useState<EditPlanV1[]>([]);
  const [futuro, setFuturo] = useState<EditPlanV1[]>([]);

  // Kit de marca: cores e fontes da legenda na prévia, e o logo e a
  // trilha que os controles de efeito oferecem.
  const [marcaDoVideo, setMarcaDoVideo] = useState<MarcaDoVideo>({ cores: CORES_PADRAO_DA_MARCA });
  const [recursos, setRecursos] = useState<RecursosDaMarca>({});
  const [refazendoAcabamento, setRefazendoAcabamento] = useState(false);

  useEffect(() => {
    void apiMarca
      .obter()
      .then((perfil) => {
        if (perfil) setMarcaDoVideo({ cores: perfil.colors, fonteTitulo: perfil.fontPrimary, fonteCorpo: perfil.fontSecond });
      })
      .catch(() => undefined);
    void Promise.all([apiAssets.listar('LOGO').catch(() => []), apiAssets.listar('MUSIC').catch(() => [])]).then(
      ([logos, trilhas]) => setRecursos({ logoAssetId: logos[0]?.id ?? null, musicaAssetId: trilhas[0]?.id ?? null }),
    );
  }, []);

  // ---------- Carga ----------
  const carregarPlano = useCallback(async () => {
    const versao = await apiPlanos.atual(projectId);
    setPlano(versao.document as EditPlanV1);
    setPassado([]);
    setFuturo([]);

    // A transcrição alimenta a legenda do preview e a aba de legendas.
    setCarregandoTranscricao(true);
    void apiTranscricao
      .obter(projectId)
      .then(setTranscricao)
      .catch(() => setTranscricao({ existe: false, segmentos: [] }))
      .finally(() => setCarregandoTranscricao(false));

    // Quem pediu a exportação e fechou a aba encontra o arquivo ao voltar.
    void apiRenders
      .situacao(projectId)
      .then((r) => r.existe && setRender(r))
      .catch(() => undefined);
  }, [projectId]);

  const carregarProjeto = useCallback(async () => {
    const p = await apiProjetos.obter(projectId);
    setProjeto(p);
    return p;
  }, [projectId]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const p = await carregarProjeto();
        if (cancelado) return;
        setTitulo(p.title);
        if (temPlano(p)) await carregarPlano();
      } catch (e) {
        if (!cancelado) setErroDeCarga(e instanceof Error ? e.message : 'não foi possível abrir o projeto.');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [carregarProjeto, carregarPlano]);

  // ---------- Acompanhar o processamento ----------
  // Enquanto não há plano, a tela pergunta de tempos em tempos e abre
  // a edição sozinha quando a proposta fica pronta.
  const estado = projeto?.state as ProjectState | undefined;

  // Vídeos ainda na lista (ou rascunho): a edição não começou. O lugar
  // certo é a tela de vídeos, onde dá para acrescentar e ir para a
  // edição -- aqui ficaria uma espera por um processamento que nem
  // foi pedido.
  const router = useRouter();
  useEffect(() => {
    if (estado === 'UPLOADING' || estado === 'DRAFT') router.replace(`/gravar?projeto=${projectId}`);
  }, [estado, projectId, router]);
  useEffect(() => {
    if (!projeto || plano) return;
    if (!estado || !estaProcessando(estado)) return;

    const id = setInterval(() => {
      void carregarProjeto()
        .then((p) => {
          if (!temPlano(p)) return;
          // A proposta chegou com a pessoa esperando: comemora (confete,
          // vibração, aviso se a aba está em segundo plano) e só então
          // abre o editor. Abrir de supetão desperdiça o momento.
          setComemorando(true);
          avisarQueFicouPronto(p.title);
          setTimeout(() => void carregarPlano().finally(() => setComemorando(false)), 2400);
        })
        .catch(() => undefined);
    }, 3000);

    // O progresso ao vivo, mais frequente: é leve (uma chave no Redis).
    const lerProgresso = () =>
      void apiProjetos
        .progresso(projectId)
        .then((r) => setProgresso(r.progresso))
        .catch(() => undefined);
    lerProgresso();
    const idProgresso = setInterval(lerProgresso, 1200);

    return () => {
      clearInterval(id);
      clearInterval(idProgresso);
    };
  }, [projeto, plano, estado, projectId, carregarProjeto, carregarPlano]);

  // ---------- Salvar ----------
  // Todo salvamento passa por UMA fila, na ordem em que a pessoa editou.
  // Em paralelo, o documento inteiro (de uma edição em lote) podia
  // chegar ao servidor depois de uma operação feita em seguida -- e
  // apagá-la. Com a fila, cada um sai quando o anterior terminou.
  const filaDeSalvamento = useRef<Promise<unknown>>(Promise.resolve());
  const enfileirar = useCallback(<T,>(tarefa: () => Promise<T>): Promise<T> => {
    const proxima = filaDeSalvamento.current.then(tarefa, tarefa);
    filaDeSalvamento.current = proxima.catch(() => undefined);
    return proxima;
  }, []);

  const salvarDocumento = useCallback(
    (documento: EditPlanV1) => {
      setSalvamento('salvando');
      return enfileirar(() => apiPlanos.salvar(projectId, documento))
        .then(() => setSalvamento('salvo'))
        .catch((e: unknown) => {
          setSalvamento('erro');
          setErro(e instanceof Error ? e.message : 'não foi possível salvar.');
        });
    },
    [projectId, enfileirar],
  );

  // As palavras, no formato do contrato: a faixa de legendas da
  // timeline sai delas pela mesma função que gera o .ass.
  const palavrasDaTranscricao = useMemo(
    () =>
      (transcricao?.segmentos ?? [])
        .flatMap((sg) => sg.palavras)
        .map((w) => ({ id: w.id, startMs: w.startMs, endMs: w.endMs, word: w.texto })),
    [transcricao],
  );

  const executar = useCallback(
    (pedida: TimelineOperation) => {
      if (!plano) return;
      // O id do que for criado é escolhido AQUI e vai junto para o
      // servidor: tela e banco criam o mesmo elemento, com o mesmo id.
      const operacao = comIdsNovos(pedida);
      const resultado = aplicarOperacao(plano, operacao);

      if (!resultado.ok || !resultado.plan) {
        // A recusa vem com o motivo: o usuário precisa saber POR QUE.
        setErro(resultado.erro ?? 'não foi possível aplicar o ajuste');
        return;
      }

      const anterior = plano;
      setPassado((h) => [...h, anterior]);
      setFuturo([]);
      setPlano(resultado.plan);
      setErro(null);

      // O servidor aplica a mesma operação e cria a versão. Se recusar,
      // a tela volta: os dois lados não podem discordar do que está salvo.
      setSalvamento('salvando');
      void enfileirar(() => apiPlanos.operar(projectId, operacao))
        .then(() => setSalvamento('salvo'))
        .catch((e: unknown) => {
          setPlano(anterior);
          setPassado((h) => h.slice(0, -1));
          setSalvamento('erro');
          setErro(e instanceof Error ? e.message : 'não foi possível salvar o ajuste.');
        });

      if (operacao.op === 'alternar_clipe' && !operacao.enabled) setSelecionado(null);
    },
    [plano, projectId, enfileirar],
  );

  /**
   * Várias operações numa versão só (zoom em todos os trechos, sons).
   *
   * Aplicadas em sequência sobre o plano local e salvas como UM
   * documento: disparar uma operação por vez faria cada uma partir do
   * plano de antes das outras, e só a última valeria na tela.
   */
  const executarVarias = useCallback(
    (operacoes: TimelineOperation[]) => {
      if (!plano || operacoes.length === 0) return;
      const resultado = aplicarOperacoes(plano, operacoes);
      if (!resultado.ok || !resultado.plan) {
        setErro(resultado.erro ?? 'não foi possível aplicar o ajuste');
        return;
      }
      setPassado((h) => [...h, plano]);
      setFuturo([]);
      setPlano(resultado.plan);
      setErro(null);
      void salvarDocumento(resultado.plan);
    },
    [plano, salvarDocumento],
  );

  /** Um plano novo vindo do servidor (acabamento, comando da IA). */
  const receberPlano = useCallback(
    (documento: EditPlanV1) => {
      if (plano) setPassado((h) => [...h, plano]);
      setFuturo([]);
      setPlano(documento);
      setSalvamento('salvo');
    },
    [plano],
  );

  const refazerAcabamento = useCallback(async () => {
    setRefazendoAcabamento(true);
    setErro(null);
    try {
      const versao = await apiPlanos.refazerAcabamento(projectId);
      receberPlano(versao.document as EditPlanV1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível refazer o acabamento.');
    } finally {
      setRefazendoAcabamento(false);
    }
  }, [projectId, receberPlano]);

  const pedirAIa = useCallback(
    async (texto: string): Promise<RespostaDaIa | null> => {
      setErro(null);
      try {
        const r = await apiPlanos.comando(projectId, texto);
        if (r.aplicadas > 0) receberPlano(r.plano.document as EditPlanV1);
        return { texto: r.resposta, ignoradas: r.ignoradas, aplicadas: r.aplicadas };
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'a IA não conseguiu aplicar o pedido.');
        return null;
      }
    },
    [projectId, receberPlano],
  );

  // Desfazer e refazer SALVAM a versão: antes só mudavam a tela, e a
  // exportação usava o plano do servidor, com o ajuste desfeito dentro.
  const desfazer = useCallback(() => {
    const anterior = passado[passado.length - 1];
    if (!anterior || !plano) return;
    setFuturo((f) => [plano, ...f]);
    setPassado((h) => h.slice(0, -1));
    setPlano(anterior);
    setErro(null);
    void salvarDocumento(anterior);
  }, [passado, plano, salvarDocumento]);

  const refazer = useCallback(() => {
    const proximo = futuro[0];
    if (!proximo || !plano) return;
    setPassado((h) => [...h, plano]);
    setFuturo((f) => f.slice(1));
    setPlano(proximo);
    setErro(null);
    void salvarDocumento(proximo);
  }, [futuro, plano, salvarDocumento]);

  // Ctrl+Z / Ctrl+Shift+Z, fora de campos de texto.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [desfazer, refazer]);

  const renomear = useCallback(async () => {
    setEditandoTitulo(false);
    const novo = titulo.trim();
    if (!projeto || !novo || novo === projeto.title) {
      setTitulo(projeto?.title ?? titulo);
      return;
    }
    try {
      await apiProjetos.atualizar(projectId, { title: novo });
      setProjeto({ ...projeto, title: novo });
    } catch (e) {
      setTitulo(projeto.title);
      setErro(e instanceof Error ? e.message : 'não foi possível renomear.');
    }
  }, [titulo, projeto, projectId]);

  // ---------- IA ----------
  const analisar = useCallback(async () => {
    if (analisando) return;
    setAnalisando(true);
    setErro(null);
    setAvisosDaIa([]);
    try {
      const resultado = await apiIa.analisar(projectId);
      await carregarPlano();
      await carregarProjeto();
      setAvisosDaIa(resultado.avisos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível analisar.');
    } finally {
      setAnalisando(false);
    }
  }, [analisando, projectId, carregarPlano, carregarProjeto]);

  // ---------- Exportar ----------
  const exportar = useCallback(async () => {
    if (exportando) return;
    setExportando(true);
    setErro(null);
    try {
      await apiRenders.exportar(projectId, [...desligados]);
      setRender({ existe: true, estado: 'na_fila' });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível exportar.');
      setExportando(false);
    }
  }, [projectId, exportando, desligados]);

  useEffect(() => {
    if (!render?.existe) return;
    if (render.estado !== 'na_fila' && render.estado !== 'processando') {
      setExportando(false);
      return;
    }
    const id = setInterval(() => {
      void apiRenders.situacao(projectId).then(setRender).catch(() => undefined);
    }, 5000);
    return () => clearInterval(id);
  }, [projectId, render?.existe, render?.estado]);

  // Um ajuste depois da exportação deixa o arquivo pronto desatualizado.
  const planoExportado = useRef<EditPlanV1 | null>(null);
  useEffect(() => {
    if (render?.estado === 'pronto' && !planoExportado.current) planoExportado.current = plano;
  }, [render?.estado, plano]);
  const exportacaoDesatualizada =
    render?.estado === 'pronto' && planoExportado.current !== null && planoExportado.current !== plano;

  const alternarTrecho = useCallback((clipId: string) => {
    setDesligados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(clipId)) proximo.delete(clipId);
      else proximo.add(clipId);
      return proximo;
    });
  }, []);

  const duracaoMs = useMemo(
    () =>
      plano
        ? plano.clips
            .filter((c) => !desligados.has(c.id))
            .reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0)
        : 0,
    [plano, desligados],
  );

  const semIa = !!plano && plano.clips.every((c) => c.reason === MOTIVO_DA_MONTAGEM_AUTOMATICA);
  const reducao = plano ? Math.round((1 - duracaoMs / Math.max(1, plano.sourceDurationMs)) * 100) : 0;
  const temProxy = !!projeto?.mediaSources.some((m) => m.kind === 'PROXY');

  // ---------- Telas ----------
  if (erroDeCarga) {
    return (
      <div className="conteudo">
        <div className="cartao vazio">
          <div className="vazio__icone">
            <IconeAviso size={26} />
          </div>
          <div>
            <h3 style={{ marginBottom: 4 }}>Não foi possível abrir o projeto</h3>
            <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
              {erroDeCarga}
            </p>
            <Link href="/" className="botao botao--secundario">
              Voltar para Projetos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cabecalho = (
    <header className="topbar topbar--editor">
      <Link href="/" className="botao-icone" aria-label="Voltar para Projetos">
        <IconeVoltar size={20} />
      </Link>

      {editandoTitulo ? (
        <input
          className="campo__entrada"
          value={titulo}
          autoFocus
          maxLength={120}
          aria-label="Nome do projeto"
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={() => void renomear()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void renomear();
            if (e.key === 'Escape') {
              setTitulo(projeto?.title ?? '');
              setEditandoTitulo(false);
            }
          }}
          style={{ maxWidth: 320, fontSize: 19, fontWeight: 600 }}
        />
      ) : (
        <button
          type="button"
          className="linha"
          onClick={() => setEditandoTitulo(true)}
          aria-label={`Renomear o projeto ${titulo}`}
          disabled={!projeto}
          style={{
            gap: 'var(--e2)',
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'text',
            fontSize: 19,
            fontWeight: 600,
            padding: 0,
            minWidth: 0,
          }}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>
            {titulo || 'Carregando…'}
          </span>
          <IconeRenomear size={16} color="var(--text-secondary)" />
        </button>
      )}

      {plano && (
        <span
          className="linha texto-secundario"
          style={{ gap: 'var(--e1)', fontSize: 14, color: salvamento === 'erro' ? 'var(--danger)' : undefined }}
          role="status"
          aria-live="polite"
        >
          {salvamento === 'salvando' ? <IconeSalvando size={17} /> : salvamento === 'erro' ? <IconeAviso size={17} /> : <IconeSalvo size={17} />}
          <span className="so-largo">{salvamento === 'salvando' ? 'Salvando…' : salvamento === 'erro' ? 'Não salvo' : 'Salvo'}</span>
        </span>
      )}

      {plano && (
        <span className="texto-secundario auto editor__duracao" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {tempo(plano.sourceDurationMs)} → {tempo(duracaoMs)}
          {reducao > 0 && ` · −${reducao}%`}
        </span>
      )}

      {plano && (
        <>
          <button type="button" className="botao-icone" onClick={desfazer} disabled={passado.length === 0} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
            <IconeDesfazer size={19} />
          </button>
          <button type="button" className="botao-icone" onClick={refazer} disabled={futuro.length === 0} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">
            <IconeRefazer size={19} />
          </button>

          <button
            type="button"
            className="botao botao--secundario"
            disabled={!temProxy}
            onClick={() => setComandoTocar((n) => n + 1)}
            title="Assistir do começo, como o vídeo vai sair"
          >
            <IconeTocar size={16} />
            <span className="so-largo">Pré-visualizar</span>
          </button>

          {render?.estado === 'pronto' && !exportacaoDesatualizada ? (
            <a className="botao" href={apiRenders.urlDeDownload(projectId)} download>
              <IconeExportar size={16} />
              <span className="so-largo">Baixar vídeo</span>
              <span className="so-celular">Baixar</span>
              {render.tamanhoBytes ? (
                <span className="so-largo" style={{ opacity: 0.75, fontSize: 12 }}>{(render.tamanhoBytes / 1024 / 1024).toFixed(1)} MB</span>
              ) : null}
            </a>
          ) : (
            <button
              type="button"
              className="botao"
              disabled={exportando || render?.estado === 'na_fila' || render?.estado === 'processando'}
              onClick={() => void exportar()}
            >
              <IconeExportar size={16} />
              <span className="so-largo">
                {render?.estado === 'processando'
                  ? 'Exportando…'
                  : render?.estado === 'na_fila'
                    ? 'Na fila…'
                    : exportacaoDesatualizada
                      ? 'Exportar de novo'
                      : 'Exportar vídeo'}
              </span>
              <span className="so-celular">
                {render?.estado === 'processando' || render?.estado === 'na_fila' ? 'Gerando' : 'Exportar'}
              </span>
            </button>
          )}
        </>
      )}
    </header>
  );

  if (!plano) {
    return (
      <>
        {cabecalho}
        <Processamento
          projeto={projeto}
          progresso={progresso}
          comemorando={comemorando}
          onTentarDeNovo={async () => {
            setErro(null);
            try {
              await apiProjetos.reprocessar(projectId);
              await carregarProjeto();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'não foi possível tentar de novo.');
            }
          }}
          erro={erro}
        />
      </>
    );
  }

  return (
    <>
      {cabecalho}

      {render?.estado === 'falhou' && (
        <div role="alert" className="aviso aviso--erro" style={{ margin: 'var(--e3) var(--e4) 0', flexShrink: 0 }}>
          <IconeAviso size={16} />
          <span>{render.erro ?? 'A exportação falhou.'} Você pode tentar de novo.</span>
        </div>
      )}

      {(render?.estado === 'na_fila' || render?.estado === 'processando') && (
        <div role="status" className="aviso aviso--info" style={{ margin: 'var(--e3) var(--e4) 0', flexShrink: 0 }}>
          <IconeSalvando size={16} />
          <span className="so-largo">
            Gerando o vídeo final. Leva alguns minutos — pode continuar editando ou fechar a aba; o
            arquivo fica disponível aqui.
          </span>
          {/* No celular, uma linha: o espaço vertical é do preview. */}
          <span className="so-celular">Gerando o vídeo final… pode continuar editando.</span>
        </div>
      )}

      {erro && (
        <div role="alert" className="aviso aviso--erro" style={{ margin: 'var(--e3) var(--e4) 0', flexShrink: 0 }}>
          <IconeAviso size={16} />
          <span>{erro}</span>
        </div>
      )}

      <div className="editor" data-folha={folha ?? undefined}>
        <RailDeFerramentas
          aba={aba}
          onTrocar={(nova) => {
            setAba(nova);
            // Tocar de novo na ferramenta aberta fecha a folha.
            setFolha((f) => (f === 'painel' && nova === aba ? null : 'painel'));
          }}
          onAjustes={() => setFolha((f) => (f === 'inspector' ? null : 'inspector'))}
          ajustesAbertos={folha === 'inspector'}
        />

        {folha && <div className="editor__veu so-celular" onClick={() => setFolha(null)} aria-hidden />}

        <section className="editor__ia" aria-label="Painel de conteúdo">
          <CabecalhoDaFolha titulo={ROTULO_DA_ABA[aba]} aoFechar={() => setFolha(null)} />
          {aba === 'ia' && (
            <div style={{ padding: 'var(--e4)', borderBottom: '1px solid var(--border)', display: 'grid', gap: 'var(--e3)' }}>
              {semIa && (
                <div className="aviso aviso--atencao">
                  <IconeAviso size={15} />
                  <span style={{ fontSize: 12 }}>
                    Esta proposta foi montada <strong>sem IA</strong>: toda a fala, sem as pausas longas.
                    {projeto?.aiFallbackReason ? (
                      <>
                        {' '}Motivo: <strong>{projeto.aiFallbackReason}</strong> Depois de resolver, clique em
                        &quot;Analisar com IA&quot;. Para conferir a chave, use &quot;Testar a chave&quot; em{' '}
                        <Link href="/configuracoes">Configurações</Link>.
                      </>
                    ) : (
                      <>
                        {' '}Para a IA escolher os melhores trechos, cadastre a chave em{' '}
                        <Link href="/configuracoes">Configurações</Link> e clique em &quot;Analisar com IA&quot;.
                      </>
                    )}
                  </span>
                </div>
              )}
              <button type="button" className="botao botao--secundario" style={{ width: '100%' }} disabled={analisando} onClick={() => void analisar()}>
                <IconeIA size={16} weight="fill" />
                {analisando ? 'Analisando a gravação…' : semIa ? 'Analisar com IA' : 'Refazer a análise com IA'}
              </button>
              {analisando && (
                <p className="texto-secundario" style={{ fontSize: 12 }} role="status" aria-live="polite">
                  Leva de alguns segundos a poucos minutos. A proposta atual continua salva.
                </p>
              )}
              {avisosDaIa.map((a) => (
                <div key={a} className="aviso aviso--atencao">
                  <IconeAviso size={15} />
                  <span style={{ fontSize: 12 }}>{a}</span>
                </div>
              ))}
              {!semIa && projeto?.entendimentoDaIa && <EntendimentoDaIa e={projeto.entendimentoDaIa} />}
              {!semIa && <PedirAIa onEnviar={pedirAIa} />}
            </div>
          )}

          {aba === 'ia' && (
            <PainelDaIA
              plan={plano}
              selecionado={selecionado}
              desligados={desligados}
              onSelecionar={(id) => {
                setSelecionado(id);
                // Selecionar um trecho leva o preview até ele.
                if (id) {
                  let acumulado = 0;
                  for (const c of plano.clips) {
                    if (desligados.has(c.id)) continue;
                    if (c.id === id) break;
                    acumulado += c.sourceEndMs - c.sourceStartMs;
                  }
                  setPosicaoMs(acumulado);
                }
              }}
              onAlternar={alternarTrecho}
              onOperacao={executar}
            />
          )}
          {aba === 'ia' && <PainelDeRefino projectId={projectId} plan={plano} onOperacao={executar} />}
          {aba === 'midia' && projeto && <PainelDeMidia projeto={projeto} />}
          {aba === 'legendas' && (
            <PainelDeLegendas plano={plano} transcricao={transcricao} carregando={carregandoTranscricao} onOperacao={executar} />
          )}
          {aba === 'marca' && <PainelDeMarca />}
        </section>

        <main className="editor__palco">
          <Palco
            plan={plano}
            proxyUrl={temProxy ? urlDoVideo(projectId) : undefined}
            posicaoMs={posicaoMs}
            onPosicao={setPosicaoMs}
            desligados={desligados}
            transcricao={transcricao}
            comandoTocar={comandoTocar}
            marca={marcaDoVideo}
            urlDoAsset={apiAssets.url}
            destaqueSelecionado={itemSelecionado?.tipo === 'elemento' ? itemSelecionado.id : null}
            onSelecionarDestaque={(id) => setItemSelecionado({ tipo: 'elemento', id })}
            onMoverDestaque={(id, x, y) =>
              executar({ op: 'editar_overlay', overlayId: id, style: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } })
            }
          />
        </main>

        <aside className="editor__inspector" aria-label="Propriedades">
          <CabecalhoDaFolha titulo="Ajustes" aoFechar={() => setFolha(null)} />
          <Inspector
            plan={plano}
            clipId={selecionado}
            onOperacao={executar}
            onOperacoes={executarVarias}
            marca={marcaDoVideo}
            recursos={recursos}
            onRefazerAcabamento={() => void refazerAcabamento()}
            refazendoAcabamento={refazendoAcabamento}
            item={itemSelecionado}
            onFecharItem={() => setItemSelecionado(null)}
          />
        </aside>

        <section className="editor__timeline" aria-label="Linha do tempo">
          <Timeline
            plan={plano}
            posicaoMs={posicaoMs}
            onSeek={setPosicaoMs}
            onOperacao={executar}
            clipeSelecionado={selecionado}
            onSelecionar={setSelecionado}
            palavras={palavrasDaTranscricao}
            itemSelecionado={itemSelecionado}
            onSelecionarItem={(item) => {
              setItemSelecionado(item);
              // No celular as propriedades ficam numa folha: selecionar
              // um item já a abre.
              if (item && window.matchMedia('(max-width: 899px)').matches) setFolha('inspector');
            }}
          />
        </section>
      </div>
    </>
  );
}

const ESTRUTURA: Record<string, string> = {
  gancho_promessa_entrega: 'Gancho → promessa → entrega',
  problema_solucao: 'Problema → solução',
  topicos_numerados: 'Tópicos numerados',
  tutorial: 'Tutorial passo a passo',
  antes_depois: 'Antes e depois',
  historia: 'História',
  opiniao_polemica: 'Opinião forte',
  loop: 'Loop (o fim puxa o começo)',
};

const GANCHO: Record<string, string> = {
  curiosidade: 'curiosidade',
  dor: 'dor do público',
  promessa: 'promessa',
  polemica: 'polêmica',
  pergunta: 'pergunta',
  prova: 'prova',
  numero: 'número',
};

/**
 * O que a IA entendeu do vídeo, antes de cortar. Se o assunto ou a
 * promessa estiverem errados, os cortes também estarão -- e a pessoa
 * vê isso num relance, sem precisar assistir tudo.
 */
function EntendimentoDaIa({ e }: { e: NonNullable<ProjetoDetalhado['entendimentoDaIa']> }) {
  return (
    <details className="entendimento" open>
      <summary>
        <IconeIA size={14} weight="fill" /> O que a IA entendeu
      </summary>
      <dl>
        <dt>Assunto</dt>
        <dd>{e.topic}</dd>
        {e.audience && (
          <>
            <dt>Para quem</dt>
            <dd>{e.audience}</dd>
          </>
        )}
        <dt>Promessa</dt>
        <dd>{e.promise}</dd>
        <dt>Estrutura</dt>
        <dd>
          {ESTRUTURA[e.structure] ?? e.structure} · gancho de {GANCHO[e.hookType] ?? e.hookType}
        </dd>
      </dl>
    </details>
  );
}

const ROTULO_DA_ABA: Record<AbaDoEditor, string> = {
  ia: 'Ferramentas',
  midia: 'Mídia',
  texto: 'Texto',
  legendas: 'Legendas',
  marca: 'Marca',
  audio: 'Áudio',
};

/** Alça e título da folha -- só aparece no celular, onde o painel sobe de baixo. */
function CabecalhoDaFolha({ titulo, aoFechar }: { titulo: string; aoFechar: () => void }) {
  return (
    <div className="editor__folha-cabecalho so-celular">
      <span aria-hidden className="folha__puxador" />
      <div className="linha entre" style={{ width: '100%' }}>
        <h2 style={{ fontSize: 16 }}>{titulo}</h2>
        <button type="button" className="botao-icone" aria-label="Fechar" onClick={aoFechar}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Processamento — do envio à proposta
// ============================================================

const ETAPAS: Array<{ estado: ProjectState; titulo: string; texto: string }> = [
  { estado: 'INGESTING', titulo: 'Preparando o vídeo', texto: 'Gerando a prévia leve e separando o áudio.' },
  { estado: 'TRANSCRIBING', titulo: 'Transcrevendo a fala', texto: 'Cada palavra com o tempo exato em que foi dita.' },
  { estado: 'ANALYZING', titulo: 'Montando a proposta', texto: 'Escolhendo os trechos e a ordem do vídeo.' },
];

function Processamento({
  projeto,
  progresso,
  comemorando,
  onTentarDeNovo,
  erro,
}: {
  projeto: ProjetoDetalhado | null;
  progresso: ProgressoDoPreparo | null;
  comemorando: boolean;
  onTentarDeNovo: () => Promise<void>;
  erro: string | null;
}) {
  const [tentando, setTentando] = useState(false);

  if (!projeto) {
    return (
      <div className="conteudo" role="status" aria-live="polite">
        <div className="cartao" style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 'var(--e3)' }}>
          <span className="esqueleto" style={{ height: 18, width: '40%' }} />
          <span className="esqueleto" style={{ height: 12, width: '80%' }} />
          <span className="esqueleto" style={{ height: 12, width: '65%' }} />
        </div>
      </div>
    );
  }

  const estado = projeto.state as ProjectState;
  const indiceAtual = ETAPAS.findIndex((e) => e.estado === estado);
  const falhou = estado === 'FAILED_RETRYABLE' || estado === 'FAILED_FINAL';
  const semVideo = estado === 'DRAFT' || !projeto.mediaSources.some((m) => m.kind === 'ORIGINAL');
  const temMiniatura = projeto.mediaSources.some((m) => m.kind === 'THUMBNAIL');
  const original = projeto.mediaSources.find((m) => m.kind === 'ORIGINAL');

  // O caminho feliz -- o vídeo sendo preparado, ou acabando de ficar
  // pronto -- tem a tela própria, com progresso ao vivo.
  if (comemorando || (!falhou && !semVideo && estaProcessando(estado))) {
    return (
      <div className="conteudo">
        <PreparoDoVideo
          estado={comemorando ? 'PRONTO' : estado}
          progresso={progresso}
          miniaturaUrl={temMiniatura ? apiProjetos.urlDaMiniatura(projeto.id) : undefined}
          duracaoDaGravacaoMs={original?.durationMs}
          comemorando={comemorando}
        />
      </div>
    );
  }

  return (
    <div className="conteudo">
      <section className="cartao processo" data-com-miniatura={temMiniatura || undefined}>
        {temMiniatura && <img className="processo__miniatura" src={apiProjetos.urlDaMiniatura(projeto.id)} alt="" />}

        <div style={{ display: 'grid', gap: 'var(--e4)', alignContent: 'start' }}>
          {semVideo && !falhou ? (
            <>
              <div>
                <h1 className="processo__titulo">Este projeto ainda não tem vídeo</h1>
                <p className="texto-secundario">Grave com o teleprompter ou envie um arquivo para começar.</p>
              </div>
              <Link href={`/gravar?projeto=${projeto.id}`} className="botao" style={{ justifySelf: 'start' }}>
                <IconeEnviar size={16} />
                Gravar ou enviar vídeo
              </Link>
            </>
          ) : falhou ? (
            <>
              <div>
                <h1 className="processo__titulo">O processamento parou</h1>
                <p className="texto-secundario">
                  {projeto.publicError ?? 'Algo falhou no preparo do vídeo.'}
                </p>
              </div>
              {erro && (
                <div className="aviso aviso--erro" role="alert">
                  <IconeAviso size={16} />
                  <span>{erro}</span>
                </div>
              )}
              <div className="linha" style={{ gap: 'var(--e3)', flexWrap: 'wrap' }}>
                {estado === 'FAILED_RETRYABLE' && (
                  <button
                    type="button"
                    className="botao"
                    disabled={tentando}
                    onClick={() => {
                      setTentando(true);
                      void onTentarDeNovo().finally(() => setTentando(false));
                    }}
                  >
                    {tentando ? 'Recomeçando…' : 'Tentar de novo'}
                  </button>
                )}
                <Link href={`/gravar?projeto=${projeto.id}`} className="botao botao--secundario">
                  Enviar outro vídeo
                </Link>
              </div>
            </>
          ) : (
            <>
              <div>
                <h1 className="processo__titulo">Seu vídeo está sendo preparado</h1>
                <p className="texto-secundario">
                  {original?.durationMs ? `Gravação de ${tempo(original.durationMs)}. ` : ''}
                  Esta tela abre a edição sozinha quando a proposta ficar pronta. Pode fechar a aba e
                  voltar depois — nada se perde.
                </p>
              </div>

              <ol style={{ listStyle: 'none', display: 'grid', gap: 'var(--e3)' }} aria-live="polite">
                <EtapaDoProcesso titulo="Vídeo recebido" texto="O arquivo chegou inteiro ao servidor." situacao="feita" />
                {ETAPAS.map((etapa, i) => (
                  <EtapaDoProcesso
                    key={etapa.estado}
                    titulo={etapa.titulo}
                    texto={etapa.texto}
                    situacao={indiceAtual < 0 ? 'pendente' : i < indiceAtual ? 'feita' : i === indiceAtual ? 'atual' : 'pendente'}
                  />
                ))}
              </ol>

              {!estaProcessando(estado) && !podeEditar(estado) && (
                <p className="texto-secundario" style={{ fontSize: 13 }}>
                  Situação: {ROTULO_DE_ESTADO[estado]?.texto ?? estado}.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function EtapaDoProcesso({
  titulo,
  texto,
  situacao,
}: {
  titulo: string;
  texto: string;
  situacao: 'feita' | 'atual' | 'pendente';
}) {
  return (
    <li className="linha" style={{ gap: 'var(--e3)', alignItems: 'flex-start', opacity: situacao === 'pendente' ? 0.55 : 1 }}>
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          background: situacao === 'feita' ? 'var(--success)' : 'var(--surface-2)',
          border: situacao === 'atual' ? '2px solid var(--accent)' : situacao === 'feita' ? 'none' : '1px solid var(--border-forte)',
          color: situacao === 'feita' ? '#041735' : 'var(--accent)',
        }}
      >
        {situacao === 'feita' ? <IconeCheck size={14} weight="bold" /> : situacao === 'atual' ? <span className="giro" /> : null}
      </span>
      <span>
        <strong style={{ fontSize: 14 }}>
          {titulo}
          {situacao === 'atual' && <span className="texto-secundario" style={{ fontWeight: 400 }}> · agora</span>}
        </strong>
        <span className="texto-secundario" style={{ display: 'block', fontSize: 12 }}>
          {texto}
        </span>
      </span>
    </li>
  );
}

// ============================================================
// Painéis
// ============================================================

function PainelDeMidia({ projeto }: { projeto: ProjetoDetalhado }) {
  const original = projeto.mediaSources.find((m) => m.kind === 'ORIGINAL');
  const temMiniatura = projeto.mediaSources.some((m) => m.kind === 'THUMBNAIL');

  return (
    <>
      <header className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeMidia size={20} />
          <strong style={{ fontSize: 17 }}>Mídia do projeto</strong>
        </span>
      </header>
      <div style={{ padding: 'var(--e4)', display: 'grid', gap: 'var(--e4)' }}>
        {temMiniatura && (
          <img
            src={apiProjetos.urlDaMiniatura(projeto.id)}
            alt="Quadro da gravação"
            style={{ width: 120, aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 'var(--r-controle)' }}
          />
        )}
        {original ? (
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13 }}>
            <dt className="texto-secundario">Duração</dt>
            <dd>{original.durationMs ? tempo(original.durationMs) : '—'}</dd>
            <dt className="texto-secundario">Resolução</dt>
            <dd>{original.widthPx && original.heightPx ? `${original.widthPx}×${original.heightPx}` : '—'}</dd>
            <dt className="texto-secundario">Enviado</dt>
            <dd>{new Date(original.createdAt).toLocaleString('pt-BR')}</dd>
          </dl>
        ) : (
          <p className="texto-secundario">Nenhum vídeo enviado.</p>
        )}
        <p className="texto-secundario" style={{ fontSize: 12 }}>
          O editor toca uma prévia leve; o vídeo final é gerado a partir do original, na qualidade
          em que foi gravado.
        </p>
        <Link href={`/gravar?projeto=${projeto.id}`} className="botao botao--secundario">
          <IconeEnviar size={16} />
          Substituir o vídeo
        </Link>
      </div>
    </>
  );
}

function PainelDeMarca() {
  const { dados: perfil, carregando } = useDados<PerfilDeMarca | null>(() => apiMarca.obter());

  return (
    <>
      <header className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeMarca size={20} />
          <strong style={{ fontSize: 17 }}>Kit de marca</strong>
        </span>
      </header>
      <div style={{ padding: 'var(--e4)', display: 'grid', gap: 'var(--e4)' }}>
        {carregando ? (
          <span className="esqueleto" style={{ height: 60 }} />
        ) : perfil ? (
          <>
            <strong>{perfil.name}</strong>
            <div className="linha" style={{ gap: 6 }}>
              {Object.entries(perfil.colors).map(([nome, cor]) => (
                <span
                  key={nome}
                  title={`${nome}: ${cor}`}
                  style={{ width: 28, height: 28, borderRadius: 6, background: cor, border: '1px solid var(--border-forte)' }}
                />
              ))}
            </div>
            {perfil.fontPrimary && (
              <p className="texto-secundario" style={{ fontSize: 13 }}>
                Fonte: {perfil.fontPrimary}
              </p>
            )}
          </>
        ) : (
          <p className="texto-secundario">Nenhum kit de marca cadastrado ainda.</p>
        )}
        <p className="texto-secundario" style={{ fontSize: 12 }}>
          Cores, fontes, logo e trilha do kit entram no vídeo exportado. O estilo de legenda e o
          acabamento padrão dos vídeos novos também são definidos no kit.
        </p>
        <Link href="/marca" className="botao botao--secundario">
          Editar kit de marca
        </Link>
      </div>
    </>
  );
}

// ============================================================
// Sem projeto na URL
// ============================================================

function EscolherProjeto() {
  const { dados, carregando, erro } = useDados<Projeto[]>(() => apiProjetos.listar());
  const lista = dados ?? [];

  return (
    <>
      <header className="topbar">
        <Link href="/" className="botao-icone" aria-label="Voltar para Projetos">
          <IconeVoltar size={20} />
        </Link>
        <h1 style={{ fontSize: 19 }}>Editor</h1>
      </header>
      <div className="conteudo">
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 'var(--e4)' }}>
          <p className="texto-secundario">Escolha o vídeo que você quer editar.</p>
          {carregando && <span className="esqueleto" style={{ height: 64 }} />}
          {erro && (
            <div className="aviso aviso--erro" role="alert">
              <IconeAviso size={16} />
              <span>{erro}</span>
            </div>
          )}
          {!carregando && !erro && lista.length === 0 && (
            <div className="cartao vazio">
              <div className="vazio__icone">
                <IconeVideo size={26} />
              </div>
              <div>
                <h3 style={{ marginBottom: 4 }}>Nenhum vídeo ainda</h3>
                <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                  Grave ou envie um vídeo; a proposta de edição aparece aqui.
                </p>
                <Link href="/gravar" className="botao">
                  Novo vídeo
                </Link>
              </div>
            </div>
          )}
          {lista.map((p) => {
            const estado = ROTULO_DE_ESTADO[p.state as ProjectState];
            return (
              <Link key={p.id} href={`/editor?projeto=${p.id}`} className="cartao cartao--clicavel linha" style={{ gap: 'var(--e4)' }}>
                <span
                  style={{ width: 44, aspectRatio: '9 / 16', borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0, display: 'grid', placeItems: 'center' }}
                >
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <IconeVideo size={18} />
                  )}
                </span>
                <span className="crescer" style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</strong>
                  <span className="texto-secundario" style={{ fontSize: 12 }}>
                    {p.durationMs ? `${tempo(p.durationMs)} · ` : ''}
                    {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                  </span>
                </span>
                {estado && (
                  <span className={`selo selo--${estado.tom}`} style={{ fontSize: 11 }}>
                    <span className="selo__ponto" aria-hidden />
                    {estado.texto}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
