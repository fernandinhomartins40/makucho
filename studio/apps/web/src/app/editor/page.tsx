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

import { EscolhaDoEstilo } from '../../components/novo-video/EscolhaDoEstilo';
import { estiloDeAnimacao } from '@makucho/studio-contracts';
import { AnimacoesDaIaContexto, type OpcoesDeRefazerAnimacao } from '../../components/editor/animacoesDaIa';
import { ouvirRepouso, repousoDasAnimacoes } from '../../components/editor/AnimacoesAoVivo';
import { BotaoDoTutorial } from '../../components/shell/Tutoriais';
import { rastro } from '../../lib/diagnostico';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EditPlanV1, MarcaDoVideo, ProjectState, TimelineOperation } from '@makucho/studio-contracts';
import {
  aplicarOperacao,
  textoDoPost,
  comIdsNovos,
  comKeyframe,
  comKeyframeDaMidia,
  pacoteRecomendado,
  padraoDaCaixa,
  aplicarOperacoes,
  CORES_PADRAO_DA_MARCA,
  estaProcessando,
  podeEditar,
  MOTIVO_DA_MONTAGEM_AUTOMATICA,
  ROTULO_DE_ESTADO,
  tirarPausas,
  agendaDoPlano, duracaoNaTimeline, PRESETS_DE_TEXTO, ROTULO_DO_AUDIO, RECEITAS, tipoDeVideoSchema, type TipoDeVideo } from '@makucho/studio-contracts';
import { TipoDoVideo } from '../../components/editor/TipoDoVideo';
import { AcoesDoPalco, FerramentasDoPalco, type AcaoDoPalco, type FerramentaDoPalco } from '../../components/editor/LateraisDoPalco';
import type { AbaDoInspector } from '../../components/editor/Inspector';
import { useQuadrosDoVideo } from '../../lib/quadrosDoVideo';
import { Congelado } from '../../components/editor/Congelado';
import type { DestinoSimples } from '../../components/editor/EditorSimples';
import { EditorPratico } from '../../components/editor/EditorPratico';
import { DiagnosticoDaPrevia } from '../../components/editor/DiagnosticoDaPrevia';
import { itemDoAlvo, itensDoVideo, itensNaCena, legendaNoInstante, type ItemNaCena } from '../../components/editor/naCena';
import { EtiquetaDoItem, type Alvo, type ItemCopiado } from '../../components/editor/EtiquetaDoItem';
import { focoDoItem } from '../../lib/focoDaIa';
import { BarraMovel, type AcaoMovel } from '../../components/editor/BarraMovel';
import { GravadorDeNarracao } from '../../components/editor/GravadorDeNarracao';
import { RailDeFerramentas, type AbaDoEditor, type CategoriaDaColuna } from '../../components/editor/RailDeFerramentas';
import { ProporcaoDoVideo } from '../../components/editor/ProporcaoDoVideo';
import { PreparoDoVideo, avisarQueFicouPronto } from '../../components/editor/PreparoDoVideo';
import { AvisoDeFechamento } from '../../components/editor/AvisoDeFechamento';
import type { ItemDaTimeline } from '../../components/timeline/camadas';
import type { ProgressoDoPreparo } from '@makucho/studio-contracts';
import { PainelDaIA } from '../../components/editor/PainelDaIA';
import { PainelDaBiblioteca, type CategoriaDaBiblioteca } from '../../components/biblioteca/PainelDaBiblioteca';
import { PainelDeMidias } from '../../components/biblioteca/PainelDeMidias';
import { AtalhosDoEditor } from '../../components/editor/AtalhosDoEditor';
import { PainelDeRefino } from '../../components/editor/PainelDeRefino';
import { PainelDeLegendas } from '../../components/editor/PainelDeLegendas';
import { Inspector, type RecursosDaMarca } from '../../components/editor/Inspector';
import { PedirAIa, type RespostaDaIa } from '../../components/editor/PedirAIa';
import { Palco } from '../../components/editor/Palco';
import { Timeline } from '../../components/timeline/Timeline';
import { DivisorDaTimeline } from '../../components/editor/DivisorDaTimeline';
import { DialogoDeExportacao } from '../../components/exportacao/DialogoDeExportacao';
import { BotaoDeTema } from '../../components/shell/BotaoDeTema';
import { useExportacoes } from '../../lib/exportacao/tarefas';
import { esconderCamadas, ehCamadaOcultavel, CAMADAS_OCULTAVEIS, type CamadaOcultavel } from '../../lib/camadasOcultas';
import type { OpcoesDeExportacao } from '../../lib/exportacao/opcoes';
import { tempo } from '../../components/editor/funcoes';
import {
  planos as apiPlanos,
  projetos as apiProjetos,
  ia as apiIa,
  transcricao as apiTranscricao,
  marca as apiMarca,
  assets as apiAssets, animacoes as apiAnimacoes,
  bancoDeMidia,
  urlDoVideo,
  type MidiasSeparadas,
  type PerfilDeMarca,
  type Projeto,
  type ProjetoDetalhado,
  type Transcricao,
} from '../../lib/api';
import { useDados } from '../../lib/useDados';
import {
  IconeDesfazer,
  IconeRefazer,
  IconeExportar,
  IconeTocar,
  IconeAviso, IconeAnimacao,
  IconeVoltar,
  IconeRenomear,
  IconeSalvo,
  IconeSalvando,
  IconeCheck,
  IconeIA,
  IconeVideo,
  IconeEnviar,
  IconeMidia,
  IconeParametros,
  IconeAbrir,
  IconePausar,
  IconeTelaCheia,
  IconeMarca,
  IconeTrilha,
  IconeTexto,
  IconeMicrofone,
  IconeCelular,
  IconeFechar,
} from '../../components/icones';

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <EntradaDoEditor />
    </Suspense>
  );
}

function EntradaDoEditor() {
  const parametros = useSearchParams();
  const projectId = parametros.get('projeto');
  // "Publicar" (passo 3 de Criar vídeo): escolhe o vídeo e já exporta.
  const publicar = parametros.get('publicar') === '1';
  return projectId ? <Editor key={projectId} projectId={projectId} publicar={publicar} /> : <EscolherProjeto />;
}

type EstadoDoSalvamento = 'salvo' | 'salvando' | 'erro';

/** O plano tem proposta de verdade quando o servidor tem uma versão. */
function temPlano(projeto: ProjetoDetalhado | null): boolean {
  return !!projeto && projeto.editPlans.length > 0;
}

function Editor({ projectId, publicar = false }: { projectId: string; publicar?: boolean }) {
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
  // Diagnóstico remoto (só com ?diagnostico=1): a gaveta e o item escolhido, a cada mudança.
  useEffect(() => {
    rastro('gaveta', { para: folha });
  }, [folha]);
  useEffect(() => {
    rastro('item', itemSelecionado ? { tipo: itemSelecionado.tipo, id: 'id' in itemSelecionado ? String(itemSelecionado.id) : null } : { tipo: null });
  }, [itemSelecionado]);
  // Preparo: progresso ao vivo e a comemoração antes de abrir o editor.
  const [progresso, setProgresso] = useState<ProgressoDoPreparo | null>(null);
  const [comemorando, setComemorando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [comandoTocar, setComandoTocar] = useState(0);
  const [comandoAlternar, setComandoAlternar] = useState(0);
  const [comandoTelaCheia, setComandoTelaCheia] = useState(0);
  const abrirTelaCheia = () => setComandoTelaCheia((n) => n + 1);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const [categoriaDaBiblioteca, setCategoriaDaBiblioteca] = useState<CategoriaDaBiblioteca>('textos');
  const [aviso, setAviso] = useState<string | null>(null);
  /** Picos do áudio do original (100/s): a forma de onda da faixa Áudio. */
  const [onda, setOnda] = useState<Uint8Array | null>(null);
  // A grade do editor: o divisor arrastável grava nela a altura da timeline.
  const editorRef = useRef<HTMLDivElement>(null);

  const [transcricao, setTranscricao] = useState<Transcricao | null>(null);
  const [carregandoTranscricao, setCarregandoTranscricao] = useState(false);

  const [analisando, setAnalisando] = useState(false);
  const [avisosDaIa, setAvisosDaIa] = useState<string[]>([]);

  // Exportação no navegador (lib/exportacao): a janela e a tarefa deste projeto.
  const [exportarAberto, setExportarAberto] = useState(false);
  // Veio de "Publicar": a janela abre sozinha e a exportação já começa.
  const [publicando, setPublicando] = useState(false);
  useEffect(() => {
    if (!publicar || !plano || publicando) return;
    setPublicando(true);
    setExportarAberto(true);
    // O pedido sai do endereço: recarregar a página não exporta de novo.
    window.history.replaceState(null, '', `/editor?projeto=${projectId}`);
  }, [publicar, plano, publicando, projectId]);
  const tarefaDeExportacao = useExportacoes((s) => [...s.tarefas].reverse().find((t) => t.projectId === projectId));
  const iniciarExportacao = useExportacoes((s) => s.iniciar);

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

  // Faixas escondidas pelo olho da timeline: saem da prévia e da
  // exportação sem apagar nada do plano. Guardadas por projeto.
  const chaveDasOcultas = `studio:camadas-ocultas:${projectId}`;
  const [ocultas, setOcultas] = useState<Set<CamadaOcultavel>>(() => {
    try {
      const salvo = typeof window !== 'undefined' ? window.localStorage.getItem(chaveDasOcultas) : null;
      return new Set(salvo ? (JSON.parse(salvo) as string[]).filter(ehCamadaOcultavel) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(chaveDasOcultas, JSON.stringify([...ocultas]));
    } catch {
      // Sem armazenamento local, vale só nesta aba.
    }
  }, [ocultas, chaveDasOcultas]);

  const planoVisivel = useMemo(() => (plano ? esconderCamadas(plano, ocultas) : null), [plano, ocultas]);

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
  }, [projectId]);

  const carregarProjeto = useCallback(async () => {
    const p = await apiProjetos.obter(projectId);
    setProjeto(p);
    return p;
  }, [projectId]);

  // ---------- Animações da fala, sob demanda ----------
  // A mesma etapa do fim da montagem, num projeto já aberto. Roda no
  // servidor em segundo plano; a tela acompanha pela nota do projeto e,
  // quando ela muda, traz o plano com as animações.
  // Criando ou refazendo: a nota termina em "…" até a IA terminar.
  const criandoAnimacoes = !!projeto?.animationNote?.endsWith('…');
  const temAnimacoes = !!plano?.mediaLayers?.some((m) => m.kind === 'html');
  const [verNotaDasAnimacoes, setVerNotaDasAnimacoes] = useState(false);
  // Uma linha: quantas e o estilo; o texto completo da nota fica no title.
  const resumoDasAnimacoes = (() => {
    const nota = projeto?.animationNote;
    if (criandoAnimacoes) return nota?.startsWith('Refazendo') ? 'Refazendo animações… (1-2 min)' : 'Criando animações… (alguns minutos)';
    const feitas = nota?.match(/(criou|refez) (\d+) anima\S+(?: no estilo ([^(]+?))? \(/);
    if (feitas) return `${feitas[2]} ${feitas[1] === 'refez' ? (feitas[2] === '1' ? 'refeita' : 'refeitas') : feitas[2] === '1' ? 'animação' : 'animações'}${feitas[3] ? ` · estilo ${feitas[3]}` : ''}`;
    if (nota?.startsWith('Não deu para refazer')) return 'Não deu para refazer (veja o motivo)';
    if (temAnimacoes) return 'Animações no vídeo';
    return nota?.startsWith('Sem animações') ? 'Sem animações nesta montagem' : 'Sem animações';
  })();
  const criarAnimacoesDaFala = useCallback(async () => {
    try {
      const r = await apiIa.animarFala(projectId);
      setProjeto((p) => (p ? { ...p, animationNote: r.nota } : p));
    } catch (e) {
      setProjeto((p) => (p ? { ...p, animationNote: `Sem animações: ${e instanceof Error ? e.message : 'o pedido falhou'}` } : p));
    }
  }, [projectId]);
  // Do clique até o servidor responder: sem isto a tela ficava parada por
  // um instante, sem sinal de que o toque valeu, e dava para tocar em
  // outra opção por cima do pedido que já estava indo.
  const [pedindoAnimacoes, setPedindoAnimacoes] = useState(false);
  const refazerAnimacoes = useCallback(
    async (camadas: string[] | 'todas', o: OpcoesDeRefazerAnimacao) => {
      setPedindoAnimacoes(true);
      try {
        const r = await apiIa.refazerAnimacoes(projectId, { ...(camadas === 'todas' ? {} : { camadas }), ...o });
        setProjeto((p) => (p ? { ...p, animationNote: r.nota } : p));
      } catch (e) {
        setProjeto((p) => (p ? { ...p, animationNote: `Não deu para refazer: ${e instanceof Error ? e.message : 'o pedido falhou'}` } : p));
      } finally {
        setPedindoAnimacoes(false);
      }
    },
    [projectId],
  );
  const falhaDasAnimacoes = projeto?.animationNote?.startsWith('Não deu para refazer') ? projeto.animationNote : null;
  const animacoesDaIa = useMemo(
    () => ({ trabalhando: criandoAnimacoes || pedindoAnimacoes, falha: falhaDasAnimacoes, refazer: (c: string[] | 'todas', o: OpcoesDeRefazerAnimacao) => void refazerAnimacoes(c, o) }),
    [criandoAnimacoes, pedindoAnimacoes, falhaDasAnimacoes, refazerAnimacoes],
  );
  useEffect(() => {
    if (!criandoAnimacoes) return;
    const id = setInterval(() => {
      void apiProjetos
        .obter(projectId)
        .then((p) => {
          if (p.animationNote?.endsWith('…')) return;
          setProjeto(p);
          void carregarPlano();
        })
        .catch(() => undefined);
      // A cada 2 s: remontar uma cena leva segundos, e com 5 s a pessoa
      // esperava mais pela conferência do que pelo trabalho.
    }, 2000);
    return () => clearInterval(id);
  }, [criandoAnimacoes, projectId, carregarPlano]);

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

  /**
   * Um plano novo vindo do servidor (acabamento, comando da IA). A edição
   * da IA aparece inteira: todas as faixas voltam a ficar visíveis, e a
   * legenda liga -- a não ser que o pedido tenha sido tirá-la.
   */
  const receberPlano = useCallback(
    (documento: EditPlanV1, pedido?: string) => {
      if (plano) setPassado((h) => [...h, plano]);
      setFuturo([]);
      setOcultas(new Set());
      const pediuSemLegenda = pedido ? /(sem|tir[ae]|remov|desliga|esconde|oculta)\w*\s.*legenda|legenda.*(sem|fora|desligad|escondid)/i.test(pedido) : false;
      if (!documento.captions.enabled && !pediuSemLegenda) {
        const ligada = aplicarOperacao(documento, { op: 'configurar_legenda', enabled: true });
        if (ligada.ok && ligada.plan) {
          setPlano(ligada.plan);
          void salvarDocumento(ligada.plan);
          return;
        }
      }
      setPlano(documento);
      setSalvamento('salvo');
    },
    [plano, salvarDocumento],
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

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Os passos do agente, ao vivo, enquanto ele trabalha no pedido.
  const [passosDaIa, setPassosDaIa] = useState<string[]>([]);
  // O item que a pessoa escolheu como assunto do pedido ("Pedir à IA" na
  // etiqueta dele). Fica preso até ela tirar o chip -- clicar em outra
  // coisa na timeline não troca o assunto no meio da conversa.
  const [alvoDaIa, setAlvoDaIa] = useState<Alvo | null>(null);
  const focoDaIa = useMemo(() => (alvoDaIa && plano ? focoDoItem(plano, alvoDaIa) : null), [alvoDaIa, plano]);
  const pedirAIa = useCallback(
    async (texto: string, anterior?: { pedido: string; resposta: string }): Promise<RespostaDaIa | null> => {
      setErro(null);
      setPassosDaIa([]);
      try {
        // O que a pessoa está vendo: dá sentido a "isso", "aqui" e às
        // respostas curtas ("sim", "todos") da conversa.
        // O foco escolhido vale sobre a seleção; sem foco, a seleção vai
        // descrita (a IA sabe do que se fala sem abrir o plano).
        const daSelecao = plano
          ? itemSelecionado
            ? focoDoItem(plano, { tipo: 'item', item: itemSelecionado })
            : selecionado
              ? focoDoItem(plano, { tipo: 'clipe', id: selecionado })
              : null
          : null;
        const selecionadoAgora = focoDaIa
          ? { tipo: focoDaIa.tipo, id: focoDaIa.id, descricao: focoDaIa.descricao.slice(0, 600), foco: true }
          : daSelecao
            ? { tipo: daSelecao.tipo, id: daSelecao.id, descricao: daSelecao.descricao.slice(0, 600) }
            : itemSelecionado
              ? { tipo: itemSelecionado.tipo, id: itemSelecionado.id }
              : null;
        const inicio = await apiPlanos.comandoEmFundo(projectId, texto, {
          ...(selecionadoAgora ? { selecionado: selecionadoAgora } : {}),
          cursorMs: Math.max(0, Math.round(posicaoMs)),
          ...(anterior ? { anterior } : {}),
        });
        let r = 'iniciado' in inicio ? null : inicio;
        // O agente trabalha em segundo plano: acompanha os passos até o fim.
        const limite = Date.now() + 5 * 60_000;
        while (!r) {
          await new Promise((ok) => setTimeout(ok, 800));
          const a = await apiPlanos.andamentoDoComando(projectId);
          setPassosDaIa(a.passos);
          if (a.erro) throw new Error(a.erro);
          if (!a.ativo && a.resultado) r = a.resultado;
          if (Date.now() > limite) throw new Error('a IA está demorando demais; tente de novo.');
        }
        if (r.aplicadas > 0) receberPlano(r.plano.document as EditPlanV1, texto);
        return { texto: r.resposta, ignoradas: r.ignoradas, aplicadas: r.aplicadas };
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'a IA não conseguiu aplicar o pedido.');
        return null;
      } finally {
        setPassosDaIa([]);
      }
    },
    [projectId, receberPlano, itemSelecionado, selecionado, posicaoMs, plano, focoDaIa],
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
  // Que vídeo é (e o que a IA não vê): editáveis no "Refazer a análise".
  const [tipoDoVideo, setTipoDoVideo] = useState<TipoDeVideo | null>(null);
  const [resumoDoVideo, setResumoDoVideo] = useState('');
  const [estiloDasAnimacoes, setEstiloDasAnimacoes] = useState<string | null>(null);
  const [paletaDasAnimacoes, setPaletaDasAnimacoes] = useState<string | null>(null);
  useEffect(() => {
    if (!projeto) return;
    const lido = tipoDeVideoSchema.safeParse(projeto.videoKind);
    setTipoDoVideo(lido.success ? lido.data : null);
    setResumoDoVideo(projeto.contentBrief ?? '');
    setEstiloDasAnimacoes(projeto.animationStyle ?? null);
    setPaletaDasAnimacoes(projeto.animationPalette ?? null);
    // Só quando o projeto muda (não a cada recarga do mesmo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto?.id]);
  const pelasCenas = Boolean(projeto?.audioProfile && projeto.audioProfile.tipo !== 'fala');

  const analisar = useCallback(async () => {
    if (analisando) return;
    setAnalisando(true);
    setErro(null);
    setAvisosDaIa([]);
    try {
      const resultado = await apiIa.analisar(projectId);
      setOcultas(new Set());
      await carregarPlano();
      await carregarProjeto();
      carregarMidiasSeparadas();
      setAvisosDaIa(resultado.avisos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível analisar.');
    } finally {
      setAnalisando(false);
    }
  }, [analisando, projectId, carregarPlano, carregarProjeto]);

  const refazerComOTipo = async () => {
    const resumo = resumoDoVideo.trim().slice(0, 400) || null;
    if ((projeto?.videoKind ?? null) !== tipoDoVideo || (projeto?.contentBrief ?? null) !== resumo || (projeto?.animationStyle ?? null) !== estiloDasAnimacoes || (projeto?.animationPalette ?? null) !== paletaDasAnimacoes) {
      try {
        await apiProjetos.atualizar(projectId, { videoKind: tipoDoVideo, contentBrief: resumo, animationStyle: estiloDasAnimacoes, animationPalette: estiloDasAnimacoes ? paletaDasAnimacoes : null });
      } catch (e) {
        return setErro(e instanceof Error ? e.message : 'não foi possível salvar o tipo do vídeo.');
      }
    }
    await analisar();
  };


  // ---------- Reprodução: o que para enquanto o vídeo toca ----------
  const [tocandoNaPrevia, setTocandoNaPrevia] = useState(false);
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const atualizar = () => setCelular(mq.matches);
    atualizar();
    mq.addEventListener('change', atualizar);
    return () => mq.removeEventListener('change', atualizar);
  }, []);

  // ---------- Visual: prático ou completo ----------
  // O mesmo editor (plano, operações, prévia, propriedades), com duas
  // caras: a completa, com as faixas da timeline; e a prática, para quem
  // nunca editou -- o vídeo na tela toda, e edita-se tocando no que
  // aparece nele. Sem escolha guardada, o celular abre na prática.
  const [visual, setVisual] = useState<'pratico' | 'completo' | null>(null);
  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = window.localStorage.getItem('studio:visual-do-editor');
    } catch {
      // Sem armazenamento: vale o padrão da tela.
    }
    setVisual(salvo === 'pratico' || salvo === 'completo' ? salvo : window.matchMedia('(max-width: 899px)').matches ? 'pratico' : 'completo');
  }, []);
  // No prático: assistindo (falso) ou editando o quadro parado.
  const [editandoNoPratico, setEditandoNoPratico] = useState(false);
  useEffect(() => {
    rastro('editando', { ligado: editandoNoPratico });
  }, [editandoNoPratico]);
  const trocarVisual = (novo: 'pratico' | 'completo') => {
    setVisual(novo);
    setFolha(null);
    setEditandoNoPratico(false);
    try {
      window.localStorage.setItem('studio:visual-do-editor', novo);
    } catch {
      // Vale só nesta visita.
    }
  };
  /** O visual prático: painéis e propriedades abrem em gavetas, em qualquer tela. */
  const simples = visual === 'pratico';

  // A película da timeline: a folha de quadros que o servidor gerou no
  // preparo. Sem timeline (visual prático), nem se baixa.
  const quadrosDoVideo = useQuadrosDoVideo(visual === 'completo' && projeto?.mediaSources.some((m) => m.kind === 'PROXY') ? `/api/projects/${projectId}/pelicula` : undefined, plano?.sourceDurationMs ?? 0);

  // O que foi copiado na etiqueta do item (cola no cursor).
  const [copiado, setCopiado] = useState<ItemCopiado | null>(null);

  // ---------- Coluna de categorias (computador) ----------
  const [painelAberto, setPainelAberto] = useState(true);
  const colunaAtiva: CategoriaDaColuna | null = !painelAberto
    ? null
    : aba === 'ia' || aba === 'midia' || aba === 'legendas' || aba === 'ajustes'
      ? aba
      : aba === 'biblioteca'
        ? (categoriaDaBiblioteca as CategoriaDaColuna)
        : null;
  const escolherNaColuna = (c: CategoriaDaColuna) => {
    if (c === colunaAtiva) return setPainelAberto(false);
    setPainelAberto(true);
    // Legendas: corrigir as palavras à esquerda, o estilo à direita.
    if (c === 'ia' || c === 'midia' || c === 'legendas' || c === 'ajustes') return setAba(c);
    setCategoriaDaBiblioteca(c as CategoriaDaBiblioteca);
    setAba('biblioteca');
  };

  // ---------- Narração ----------
  const [gravadorDe, setGravadorDe] = useState<number | null>(null);
  const [gravandoDe, setGravandoDe] = useState<number | null>(null);

  // ---------- Celular: as colunas ao lado do vídeo ----------
  const [abaDoInspector, setAbaDoInspector] = useState<{ aba: AbaDoInspector; n: number } | null>(null);
  // Computador (jeito do CapCut): as Propriedades da direita são só do
  // item SELECIONADO. O que é do vídeo todo (formato, legendas, efeitos)
  // abre em "Ajustes", no painel da esquerda, como as outras categorias.
  const pedirAbaDoInspector = (a: AbaDoInspector) => {
    setAbaDoInspector((x) => ({ aba: a, n: (x?.n ?? 0) + 1 }));
    if (!simples && !window.matchMedia('(max-width: 899px)').matches) {
      setSelecionado(null);
      setItemSelecionado(null);
      setAba('ajustes');
      setPainelAberto(true);
    }
  };
  /** As gavetas de baixo: no celular e no visual prático. */
  const noCelular = () => simples || window.matchMedia('(max-width: 899px)').matches;

  // Computador: selecionar um trecho ou item abre as PROPRIEDADES dele no
  // painel da esquerda (nada abre à direita). Tirar a seleção (o X) volta
  // à categoria em que a pessoa estava.
  const voltarDasPropriedades = useRef<AbaDoEditor>('ia');
  useEffect(() => {
    if (celular || simples) return;
    if (selecionado || itemSelecionado) {
      setAba((a) => {
        if (a !== 'propriedades') voltarDasPropriedades.current = a;
        return 'propriedades';
      });
      setPainelAberto(true);
    } else {
      setAba((a) => (a === 'propriedades' ? voltarDasPropriedades.current : a));
    }
  }, [selecionado, itemSelecionado, celular, simples]);
  const abrirPainel = (a: AbaDoEditor) => {
    setAba(a);
    setPainelAberto(true);
    if (noCelular() || simples) setFolha('painel');
  };
  // Um pedido para o "Peça à IA" vindo de um botão (o "Revisar o vídeo"): o painel abre e o envia.
  const [pedidoParaIa, setPedidoParaIa] = useState<string | null>(null);
  const revisarComIa = () => {
    abrirPainel('ia');
    setPedidoParaIa(PEDIDO_DE_REVISAO);
  };
  /**
   * A biblioteca acabou de pôr algo no vídeo. No visual prático a gaveta
   * dela sai da frente: um texto novo abre para escrever, o resto fica
   * escolhido no vídeo, pronto para mover e ajustar.
   */
  const selecionarDaBiblioteca = (item: ItemDaTimeline) => {
    setItemSelecionado(item);
    if (!simples) return;
    setSelecionado(null);
    setFolha(item.tipo === 'elemento' ? 'inspector' : null);
  };
  const abrirBiblioteca = (c: CategoriaDaBiblioteca) => {
    setCategoriaDaBiblioteca(c);
    abrirPainel('biblioteca');
  };
  /** O trecho que as ações da direita mudam: o selecionado, ou o que está sob o cursor. */
  const trechoAlvo = (): string | null => {
    if (selecionado) return selecionado;
    if (!plano) return null;
    const ag = agendaDoPlano(plano, [...desligados]);
    const t = ag.trechos.find((x) => posicaoMs >= x.inicioMs && posicaoMs < x.inicioMs + x.duracaoMs) ?? ag.trechos[ag.trechos.length - 1];
    return t?.clip.id ?? null;
  };
  const naFerramenta = (f: FerramentaDoPalco) => {
    if (f === 'midia') return abrirPainel('midia');
    const categoria: Record<Exclude<FerramentaDoPalco, 'midia'>, CategoriaDaBiblioteca> = {
      audio: 'trilha',
      texto: 'textos',
      stickers: 'stickers',
      efeitos: 'efeitos',
      transicoes: 'transicoes',
      filtros: 'cor',
      mais: 'estilos',
    };
    abrirBiblioteca(categoria[f]);
  };
  const naAcao = (a: AcaoDoPalco) => {
    const alvo = trechoAlvo();
    if (a === 'recorte') {
      setSelecionado(null);
      setItemSelecionado(null);
      pedirAbaDoInspector('video');
      return setFolha('inspector');
    }
    if (a === 'cor') {
      if (alvo) setSelecionado(alvo);
      return abrirBiblioteca('cor');
    }
    if (a === 'volume' && alvo) {
      setSelecionado(null);
      setItemSelecionado({ tipo: 'audio', id: alvo });
      return setFolha('inspector');
    }
    if (a === 'mais') {
      if (noCelular()) return setFolha('inspector');
      setAba('ajustes');
      return setPainelAberto(true);
    }
    // Ajustar e velocidade: as propriedades do trecho.
    setItemSelecionado(null);
    if (alvo) setSelecionado(alvo);
    setFolha('inspector');
    // Velocidade: a folha abre já no controle.
    if (a === 'velocidade') setTimeout(() => document.getElementById('velocidade-do-trecho')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 260);
  };

  const abrirNoSimples = (d: DestinoSimples) => {
    if (d === 'narracao') return setGravadorDe(Math.round(posicaoMs));
    if (d === 'legendas') {
      // Primeiro o que o leigo quer: ligar e escolher o estilo; corrigir palavras fica a um toque.
      setSelecionado(null);
      setItemSelecionado(null);
      pedirAbaDoInspector('legendas');
      return setFolha('inspector');
    }
    if (d === 'imagens') return abrirPainel('midia');
    const categoria: Record<'texto' | 'musica' | 'estilo', CategoriaDaBiblioteca> = { texto: 'textos', musica: 'trilha', estilo: 'estilos' };
    abrirBiblioteca(categoria[d]);
  };

  // ---------- Mídias que a montagem separou, para aprovar ----------
  const [midiasSeparadas, setMidiasSeparadas] = useState<MidiasSeparadas | null>(null);
  const carregarMidiasSeparadas = useCallback(() => {
    void bancoDeMidia
      .pendentes(projectId)
      // Só um registro com a lista de momentos conta (resposta vazia ou de
      // outra versão da API não pode derrubar o editor).
      .then((r) => setMidiasSeparadas(r && Array.isArray(r.momentos) ? r : null))
      .catch(() => setMidiasSeparadas(null));
  }, [projectId]);
  useEffect(carregarMidiasSeparadas, [carregarMidiasSeparadas]);
  const abrirMidiasSeparadas = () => {
    setAba('midia');
    if (noCelular()) setFolha('painel');
  };
  const concluirMidiasSeparadas = useCallback(() => {
    setMidiasSeparadas(null);
    void bancoDeMidia.concluir(projectId).catch(() => undefined);
  }, [projectId]);

  // ---------- Exportar ----------
  // No navegador, não na VPS: o pedido leva o plano, a transcrição (para
  // as legendas e para a trilha abaixar na fala) e onde estão os arquivos.
  const exportar = useCallback(
    (opcoes: OpcoesDeExportacao) => {
      if (!plano) return;
      // No servidor (o iPhone vai por aqui): a fila de render monta o plano salvo.
      if (opcoes.onde === 'servidor') {
        useExportacoes.getState().iniciarNoServidor(projectId, titulo || projeto?.title || 'Vídeo', [...desligados]);
        return;
      }
      iniciarExportacao(projectId, {
        titulo: titulo || projeto?.title || 'Vídeo',
        plano: planoVisivel ?? plano,
        desligados: [...desligados],
        palavras: (transcricao?.segmentos ?? []).flatMap((s) => s.palavras).map((p) => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, word: p.texto })),
        marca: marcaDoVideo,
        opcoes,
        urlDoOriginal: `/api/projects/${projectId}/original`,
        urlDoProxy: urlDoVideo(projectId),
        urlDoAsset: apiAssets.url,
        urlDaAnimacao: async (composicao, duracaoMs, aoEsperar) => {
          // Pede (ou acha) o vídeo com transparência e espera ficar pronto.
          let r = await apiAnimacoes.preparar(projectId, composicao, duracaoMs);
          // Folga para a fila: os pedaços da legenda do HyperFrames saem um por vez.
          const limite = Date.now() + 20 * 60_000;
          while (r.estado !== 'pronta') {
            if (r.estado === 'falhou') throw new Error(`uma animação não pôde ser preparada: ${r.erro ?? 'erro no servidor'}`);
            if (Date.now() > limite) throw new Error('as animações demoraram demais para ficar prontas; tente de novo');
            aoEsperar('Preparando as animações no servidor…');
            await new Promise((ok) => setTimeout(ok, 3000));
            r = { chave: r.chave, ...(await apiAnimacoes.estado(projectId, r.chave)) };
          }
          return apiAnimacoes.urlDoVideo(projectId, r.chave);
        },
      });
    },
    [plano, planoVisivel, projectId, titulo, projeto?.title, desligados, transcricao, marcaDoVideo, iniciarExportacao],
  );

  /** O olho de uma faixa. A legenda desligada no plano liga de verdade. */
  const alternarCamada = useCallback(
    (faixa: CamadaOcultavel) => {
      if (faixa === 'legendas' && plano && !plano.captions.enabled) {
        setOcultas((atual) => {
          const proximo = new Set(atual);
          proximo.delete('legendas');
          return proximo;
        });
        executar({ op: 'configurar_legenda', enabled: true });
        return;
      }
      setOcultas((atual) => {
        const proximo = new Set(atual);
        if (proximo.has(faixa)) proximo.delete(faixa);
        else proximo.add(faixa);
        return proximo;
      });
    },
    [plano, executar],
  );

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
            .reduce((t, c) => t + duracaoNaTimeline(c), 0)
        : 0,
    [plano, desligados],
  );

  const semIa = !!plano && plano.clips.every((c) => c.reason === MOTIVO_DA_MONTAGEM_AUTOMATICA);
  const reducao = plano ? Math.round((1 - duracaoMs / Math.max(1, plano.sourceDurationMs)) * 100) : 0;
  const temProxy = !!projeto?.mediaSources.some((m) => m.kind === 'PROXY');

  useEffect(() => {
    if (!temProxy || onda) return;
    let cancelado = false;
    void fetch(`/api/projects/${projectId}/onda`, { credentials: 'include' })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => {
        if (!cancelado && b && b.byteLength) setOnda(new Uint8Array(b));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [temProxy, projectId, onda]);

  /** Aperta os cortes na fala e tira as pausas longas do meio. */
  const tirarAsPausas = useCallback(() => {
    if (!plano || !palavrasDaTranscricao.length) {
      setErro('a transcrição ainda não carregou: sem ela não dá para achar as pausas.');
      return;
    }
    const r = tirarPausas(plano, palavrasDaTranscricao, { pausaMinimaMs: 700 });
    if (r.removidoMs < 100) {
      setAviso('Os cortes já estão encostados na fala: não havia pausa para tirar.');
      return;
    }
    setPassado((h) => [...h, plano]);
    setFuturo([]);
    setPlano(r.plano);
    setErro(null);
    void salvarDocumento(r.plano);
    setAviso(
      `Tiramos ${(r.removidoMs / 1000).toFixed(1).replace('.', ',')} s de pausas${r.divisoes ? ` (${r.divisoes} corte${r.divisoes > 1 ? 's' : ''} novo${r.divisoes > 1 ? 's' : ''} no meio da fala)` : ''}. Ctrl+Z desfaz.`,
    );
  }, [plano, palavrasDaTranscricao, salvarDocumento]);

  /** Delete no item selecionado: cada tipo sai do jeito dele. */
  const excluirItem = useCallback(() => {
    const item = itemSelecionado;
    if (!item) return false;
    if (item.tipo === 'legenda') {
      if (item.manualId) executar({ op: 'remover_legenda_manual', legendaId: item.manualId });
      else if (item.wordIds.length) executar({ op: 'ocultar_legenda', wordIds: item.wordIds.slice(0, 80) });
    } else if (item.tipo === 'elemento') executar({ op: 'remover_overlay', overlayId: item.id });
    else if (item.tipo === 'som') executar({ op: 'remover_efeito_sonoro', soundEffectId: item.id });
    else if (item.tipo === 'corte') executar({ op: 'definir_transicao', clipId: item.clipId, type: 'cut' });
    else if (item.tipo === 'audio') executar({ op: 'ajustar_audio_do_clipe', clipId: item.id, muted: true });
    else if (item.tipo === 'trilha') executar({ op: 'trocar_musica', assetId: null });
    setItemSelecionado(null);
    return true;
  }, [itemSelecionado, executar]);

  // Atalhos de editor de vídeo (fora de campos de texto).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        alvo instanceof HTMLSelectElement ||
        alvo.isContentEditable
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const quadro = 1000 / 30;
      const fim = plano ? plano.targetDurationMs : 0;
      if (e.key === ' ' || e.code === 'Space') {
        // Espaço toca/pausa; Shift+Espaço toca do começo.
        e.preventDefault();
        if (e.shiftKey) setComandoTocar((n) => n + 1);
        else setComandoAlternar((n) => n + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setPosicaoMs(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setPosicaoMs(Math.max(0, fim - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const passo = e.shiftKey ? 1000 : quadro;
        setPosicaoMs((p) => Math.min(Math.max(0, fim - 1), Math.max(0, p + (e.key === 'ArrowLeft' ? -passo : passo))));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // O trecho selecionado é da timeline; aqui, o item.
        if (excluirItem()) e.preventDefault();
      } else if (e.key === 'Escape') {
        setItemSelecionado(null);
        setSelecionado(null);
        setAtalhosAbertos(false);
      } else if (e.key === '?') {
        e.preventDefault();
        setAtalhosAbertos((v) => !v);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [plano, excluirItem]);

  // ---------- Animação escolhida: o vídeo vai para o descanso dela ----------
  // O ajuste das peças vale para a animação inteira. Posicionar no meio de
  // uma entrada (a peça ainda subindo, ainda pequena) deixava a peça longe
  // de onde foi solta. Escolhida uma animação, a prévia vai para o instante
  // em que tudo já entrou e nada saiu; desmarcada, volta para onde estava.
  const descanso = useRef<{ id: string; voltarPara: number; foiPara: number | null } | null>(null);
  const irParaODescanso = useCallback(
    (id: string): number | null => {
      const m = plano?.mediaLayers?.find((x) => x.id === id && x.kind === 'html');
      const r = repousoDasAnimacoes.get(id);
      if (!m || r === undefined) return null;
      const ms = Math.min(m.timelineStartMs + m.durationMs - 1, m.timelineStartMs + Math.round(r * 1000));
      setPosicaoMs(ms);
      setAviso('Animação com tudo no lugar: mova e ajuste as peças aqui.');
      return ms;
    },
    [plano],
  );
  const animacaoEscolhida = itemSelecionado?.tipo === 'midia' && plano?.mediaLayers?.find((m) => m.id === itemSelecionado.id)?.kind === 'html' ? itemSelecionado.id : null;
  useEffect(() => {
    const atual = descanso.current;
    if (animacaoEscolhida && atual?.id !== animacaoEscolhida) {
      const voltarPara = atual ? atual.voltarPara : posicaoMs;
      descanso.current = { id: animacaoEscolhida, voltarPara, foiPara: tocandoNaPrevia ? null : irParaODescanso(animacaoEscolhida) };
    } else if (!animacaoEscolhida && atual) {
      descanso.current = null;
      // Só volta se a pessoa não levou o vídeo para outro ponto enquanto editava.
      if (atual.foiPara !== null && Math.abs(posicaoMs - atual.foiPara) < 50) setPosicaoMs(atual.voltarPara);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animacaoEscolhida]);
  // A animação escolhida ainda não tinha montado (veio da lista "Tudo no vídeo"): vai quando ela informar o descanso.
  useEffect(
    () =>
      ouvirRepouso((id) => {
        const atual = descanso.current;
        if (atual && atual.id === id && atual.foiPara === null && !tocandoNaPrevia) atual.foiPara = irParaODescanso(id);
      }),
    [irParaODescanso, tocandoNaPrevia],
  );

  // ---------- Visual prático: o que está na tela no quadro parado ----------
  const naCena = useMemo(
    () => (plano && simples && !tocandoNaPrevia ? itensNaCena(planoVisivel ?? plano, posicaoMs, palavrasDaTranscricao, [...desligados]) : []),
    [plano, planoVisivel, simples, tocandoNaPrevia, posicaoMs, palavrasDaTranscricao, desligados],
  );
  const escolherNaCena = (i: ItemNaCena) => {
    rastro('chip', { rotulo: i.rotulo, animacao: !!i.animacao });
    if (i.alvo.tipo === 'clipe') {
      setItemSelecionado(null);
      setSelecionado(i.alvo.id);
    } else {
      setSelecionado(null);
      setItemSelecionado(i.alvo.item);
      // A animação abre direto para editar (textos, modelo, elementos), como na timeline;
      // as peças dela continuam à mão no vídeo, acima da gaveta.
      if (i.animacao) setFolha('inspector');
    }
  };
  /** Leva o vídeo até o item e o escolhe (a lista "Tudo no vídeo"). */
  const irParaItem = (i: ItemNaCena) => {
    const ms = i.alvo.tipo === 'item' && i.alvo.item.tipo === 'corte' ? i.alvo.item.ms : i.inicioMs;
    setPosicaoMs(Math.min(Math.max(0, duracaoMs - 1), Math.max(0, ms)));
    escolherNaCena(i);
  };
  // A lista de tudo e o item escolhido saem do plano inteiro: o que está
  // escondido continua lá, e o escolhido vale mesmo fora do quadro atual.
  const tudoNoVideo = useMemo(() => (plano && simples ? itensDoVideo(plano, [...desligados]) : []), [plano, simples, desligados]);
  const escolhido = useMemo(() => {
    if (!plano || !simples) return null;
    if (itemSelecionado) return itemDoAlvo(plano, { tipo: 'item', item: itemSelecionado }, [...desligados]);
    return selecionado ? itemDoAlvo(plano, { tipo: 'clipe', id: selecionado }, [...desligados]) : null;
  }, [plano, simples, itemSelecionado, selecionado, desligados]);

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

  // ---------- Barra de baixo do celular ----------
  const somOriginalMudo = !!plano && plano.clips.every((c) => c.audio?.muted);
  // O volume do som do vídeo: o ganho que a maioria dos trechos usa (mudo = null).
  const volumeDoVideo = (() => {
    if (!plano || somOriginalMudo) return null;
    const contagem = new Map<number, number>();
    for (const c of plano.clips) if (!c.audio?.muted) contagem.set(c.audio?.gainDb ?? 0, (contagem.get(c.audio?.gainDb ?? 0) ?? 0) + 1);
    return [...contagem].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  })();
  const executarAcaoMovel = (a: AcaoMovel) => {
    if (!plano) return;
    const biblioteca: Partial<Record<AcaoMovel, CategoriaDaBiblioteca>> = {
      enfeites: 'stickers',
      filtros: 'cor',
      estilos: 'estilos',
      marca: 'marca',
      efeitos: 'efeitos',
      transicoes: 'transicoes',
      animacoes: 'animacoes',
      musica: 'trilha',
      sons: 'sons',
      'modelos-texto': 'textos',
    };
    const categoria = biblioteca[a];
    if (categoria) return abrirBiblioteca(categoria);
    const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoMs - 1000));
    switch (a) {
      case 'imagens':
        return abrirPainel('midia');
      case 'formato':
      case 'preencher':
        return naAcao('recorte');
      case 'narrar':
        return setGravadorDe(Math.round(posicaoMs));
      case 'silenciar':
        return executarVarias(plano.clips.map((c) => ({ op: 'ajustar_audio_do_clipe' as const, clipId: c.id, muted: somOriginalMudo ? null : true })));
      case 'revisar':
        return revisarComIa();
      case 'silencios':
        return tirarAsPausas();
      case 'novo-texto': {
        const novo = comIdsNovos<Extract<TimelineOperation, { op: 'adicionar_overlay' }>>({
          op: 'adicionar_overlay',
          component: 'Destaque',
          text: 'Seu destaque',
          timelineStartMs: noCursor,
          durationMs: Math.min(2500, Math.max(300, duracaoMs - noCursor)),
          style: { ...(PRESETS_DE_TEXTO.find((x) => x.id === 'marca_texto')?.estilo ?? {}), x: 0.5, y: 0.3 },
        });
        executar(novo);
        // No visual prático o texto novo já abre para escrever.
        if (simples && novo.id) selecionarDaBiblioteca({ tipo: 'elemento', id: novo.id, aba: 'texto' });
        return;
      }
      case 'nova-legenda': {
        const nova = comIdsNovos<Extract<TimelineOperation, { op: 'adicionar_legenda' }>>({ op: 'adicionar_legenda', timelineStartMs: noCursor, durationMs: 1500, text: 'Nova legenda' });
        executar(nova);
        if (simples && nova.id) {
          setSelecionado(null);
          setItemSelecionado({ tipo: 'legenda', id: nova.id, manualId: nova.id, wordIds: [], inicioMs: noCursor, fimMs: noCursor + 1500, texto: 'Nova legenda' });
          setFolha('inspector');
        }
        return;
      }
      case 'legenda-estilo':
        return abrirNoSimples('legendas');
      case 'legenda-corrigir':
        setAba('legendas');
        return setFolha('painel');
      case 'legenda-onoff':
        return executar({ op: 'configurar_legenda', enabled: !plano.captions.enabled });
      case 'velocidade':
      case 'ajustes':
        return naAcao(a === 'ajustes' ? 'ajustar' : 'velocidade');
      case 'som':
        return naAcao('volume');
      case 'cor':
        return naAcao('cor');
    }
    // Dividir, cortar, duplicar e excluir: o trecho selecionado ou o do cursor.
    const alvo = trechoAlvo();
    const t = alvo ? agendaDoPlano(plano, [...desligados]).trechos.find((x) => x.clip.id === alvo) : undefined;
    if (!t) return;
    const dentro = posicaoMs - t.inicioMs;
    const ponto = dentro > 300 && dentro < t.duracaoMs - 300 ? Math.round(t.clip.sourceStartMs + dentro * t.velocidade) : null;
    if (a === 'duplicar') return executar({ op: 'duplicar_clipe', clipId: t.clip.id });
    if (a === 'excluir') {
      if (plano.clips.length <= 1) return setAviso('O vídeo precisa de ao menos um trecho.');
      executar({ op: 'alternar_clipe', clipId: t.clip.id, enabled: false });
      return setSelecionado(null);
    }
    if (ponto === null) return setAviso('Leve a agulha para dentro do trecho (longe das pontas) para cortar ali.');
    if (a === 'dividir') return executar({ op: 'dividir_clipe', clipId: t.clip.id, sourceMs: ponto });
    if (a === 'cortar') return executar({ op: 'ajustar_corte', clipId: t.clip.id, sourceStartMs: ponto, sourceEndMs: t.clip.sourceEndMs });
  };

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

          {/* Claro ou escuro, como nas outras telas (o editor não usa a Topbar comum). */}
          <BotaoDeTema />
          <BotaoDoTutorial />

          {/* O outro visual do mesmo editor: o vídeo na tela toda, sem timeline. */}
          <button type="button" className="botao-icone" onClick={() => trocarVisual('pratico')} aria-label="Modo prático" title="Modo prático: o vídeo na tela toda, e você edita tocando nele">
            <IconeCelular size={19} />
          </button>



          <button
            type="button"
            className="botao botao--secundario so-largo"
            disabled={!temProxy}
            onClick={() => setComandoTocar((n) => n + 1)}
            title="Assistir do começo, como o vídeo vai sair"
          >
            <IconeTocar size={16} />
            <span className="so-largo">Pré-visualizar</span>
          </button>

          <button type="button" className="botao botao--secundario so-celular editor__qualidade" onClick={() => setExportarAberto(true)} aria-label="Qualidade da exportação">
            1080p <IconeAbrir size={12} />
          </button>
          <button type="button" className="botao" onClick={() => setExportarAberto(true)}>
            <IconeExportar size={16} />
            <span className="so-largo">
              {tarefaDeExportacao?.estado === 'rodando'
                ? `Exportando… ${Math.round(tarefaDeExportacao.progresso.fracao * 100)}%`
                : tarefaDeExportacao?.estado === 'pronta'
                  ? 'Vídeo pronto'
                  : 'Exportar vídeo'}
            </span>
            <span className="so-celular">
              {tarefaDeExportacao?.estado === 'rodando' ? `${Math.round(tarefaDeExportacao.progresso.fracao * 100)}%` : 'Exportar'}
            </span>
          </button>
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

  const avisoDeErro = erro && (
    <div role="alert" className="aviso aviso--erro" style={{ margin: 'var(--e3) var(--e4) 0', flexShrink: 0 }}>
      <IconeAviso size={16} />
      <span>{erro}</span>
    </div>
  );
  const avisoDeFechamento = transcricao && (
    <AvisoDeFechamento plano={plano} segmentos={transcricao.segmentos} desligados={[...desligados]} onOperacao={executar} />
  );

  /** As ações do que está selecionado: junto do item na timeline, ou na bandeja do visual prático. */
  const etiquetaDoItem = (noPratico: boolean) => (
    <EtiquetaDoItem
      plan={plano}
      alvo={itemSelecionado ? { tipo: 'item', item: itemSelecionado } : selecionado && (noPratico || !celular) ? { tipo: 'clipe', id: selecionado } : null}
      rotulos={noPratico}
      posicaoMs={posicaoMs}
      copiado={copiado}
      onCopiar={(c) => {
        setCopiado(c);
        setAviso(noPratico ? `${c.rotulo} copiado. Pare o vídeo onde quiser, escolha um item e use "Colar aqui" em Mais.` : `${c.rotulo} copiado. Leve o cursor e use "Colar" em Mais opções.`);
      }}
      onOperacao={executar}
      onOperacoes={executarVarias}
      {...(!semIa
        ? {
            onPedirIa: () => {
              const alvo: Alvo | null = itemSelecionado ? { tipo: 'item', item: itemSelecionado } : selecionado ? { tipo: 'clipe', id: selecionado } : null;
              if (!alvo) return;
              setAlvoDaIa(alvo);
              abrirPainel('ia');
            },
          }
        : {})}
      onEditar={(estilos) => {
        if (estilos && itemSelecionado?.tipo === 'elemento') setItemSelecionado({ tipo: 'elemento', id: itemSelecionado.id, aba: 'estilos' });
        if (noCelular() || simples) setFolha('inspector');
      }}
      onCor={() => {
        setCategoriaDaBiblioteca('cor');
        abrirPainel('biblioteca');
      }}
      onDesmarcar={() => {
        setSelecionado(null);
        setItemSelecionado(null);
      }}
    />
  );

  const rotuloDeExportar = tarefaDeExportacao?.estado === 'rodando' ? `${Math.round(tarefaDeExportacao.progresso.fracao * 100)}%` : tarefaDeExportacao?.estado === 'pronta' ? 'Vídeo pronto' : 'Exportar';
  const praticoEl = (
    <EditorPratico
      titulo={titulo || projeto?.title || 'Vídeo'}
      posicaoMs={posicaoMs}
      duracaoMs={duracaoMs}
      tocando={tocandoNaPrevia}
      // Gravando a voz, o vídeo toca sozinho: um toque nele não pode parar a gravação.
      temVideo={temProxy && gravandoDe === null}
      onAlternar={() => setComandoAlternar((n) => n + 1)}
      onPosicao={setPosicaoMs}
      editando={editandoNoPratico}
      onEditando={(v) => {
        setEditandoNoPratico(v);
        if (v) return;
        setFolha(null);
        setSelecionado(null);
        setItemSelecionado(null);
      }}
      salvamento={salvamento}
      podeDesfazer={passado.length > 0}
      podeRefazer={futuro.length > 0}
      onDesfazer={desfazer}
      onRefazer={refazer}
      rotuloDeExportar={rotuloDeExportar}
      onExportar={() => setExportarAberto(true)}
      itens={naCena}
      onEscolher={escolherNaCena}
      selecionado={
        selecionado || itemSelecionado ? (
          <div className="pratico__cena">
            <div className="pratico__escolhido">
              <span>
                <strong>{escolhido ? [escolhido.rotulo, escolhido.detalhe].filter(Boolean).join(' · ') : 'Escolhido'}</strong>
                {escolhido && <small>{Number.isFinite(escolhido.fimMs) ? `aparece de ${tempo(escolhido.inicioMs)} a ${tempo(escolhido.fimMs)}` : `de ${tempo(escolhido.inicioMs)} até o fim`}</small>}
              </span>
              <button
                type="button"
                className="botao-icone"
                aria-label="Fechar"
                onClick={() => {
                  setSelecionado(null);
                  setItemSelecionado(null);
                }}
              >
                <IconeFechar size={18} />
              </button>
            </div>
            {etiquetaDoItem(true)}
          </div>
        ) : undefined
      }
      {...(escolhido ? { faixa: { inicioMs: escolhido.inicioMs, fimMs: escolhido.fimMs } } : {})}
      tudo={tudoNoVideo}
      onIrPara={irParaItem}
      camadas={CAMADAS_OCULTAVEIS.map((id) => ({ id, rotulo: ROTULO_DA_CAMADA[id], oculta: ocultas.has(id) }))}
      onAlternarCamada={(id) => alternarCamada(id as CamadaOcultavel)}
      onAcao={executarAcaoMovel}
      {...(!semIa ? { onPedirIa: () => abrirPainel('ia') } : {})}
      onTrechos={() => abrirPainel('ia')}
      onEditorCompleto={() => trocarVisual('completo')}
      legendasLigadas={plano.captions.enabled}
      somOriginalMudo={somOriginalMudo}
      volume={{ video: volumeDoVideo, trilha: plano.music ? plano.music.gainDb : null }}
      onVolumeDoVideo={(db) =>
        // O mesmo volume em todos os trechos (um desfazer só). Zero tira o som; subir de novo devolve.
        executarVarias(plano.clips.map((c) => ({ op: 'ajustar_audio_do_clipe' as const, clipId: c.id, ...(db === null ? { muted: true } : { gainDb: db === 0 ? null : db, muted: null }) })))
      }
      onVolumeDaTrilha={(db) => executar({ op: 'configurar_musica', gainDb: db })}
      animacoes={{ estado: criandoAnimacoes ? 'criando' : temAnimacoes ? 'prontas' : 'nenhuma', ...(!semIa ? { onCriar: () => void criarAnimacoesDaFala() } : {}) }}
      gavetaAberta={folha !== null}
      avisos={
        <>
          {avisoDeErro}
          {editandoNoPratico && avisoDeFechamento}
        </>
      }
    />
  );

  return (
    <AnimacoesDaIaContexto.Provider value={animacoesDaIa}>
      <DiagnosticoDaPrevia />
      {/* No computador o topo vai para dentro da grade (só sobre o vídeo e
          a timeline, como no CapCut); no celular fica em cima de tudo. */}
      {celular && !simples && cabecalho}

      {plano && (
        <DialogoDeExportacao
          aberto={exportarAberto}
          aoFechar={() => setExportarAberto(false)}
          projectId={projectId}
          titulo={titulo || projeto?.title || 'video'}
          plano={planoVisivel ?? plano}
          desligados={desligados}
          aoExportar={exportar}
          legendaDoPost={textoDoPost(projeto?.postDaIa ?? projeto?.entendimentoDaIa)}
          postDaIa={projeto?.postDaIa ?? projeto?.entendimentoDaIa ?? null}
          iniciarAoAbrir={publicando}
        />
      )}

      {!simples && avisoDeErro}
      {!simples && avisoDeFechamento}

      <div
        className="editor"
        ref={editorRef}
        data-folha={folha ?? undefined}
        data-tocando={tocandoNaPrevia || undefined}
        data-modo={simples ? 'pratico' : 'completo'}
        data-editando={(simples && editandoNoPratico) || undefined}
        data-painel={painelAberto ? undefined : 'fechado'}
        data-props="sem"
      >
        {!celular && !simples && cabecalho}
        {!simples && <RailDeFerramentas ativa={colunaAtiva} onEscolher={escolherNaColuna} />}
        {/* A alça na borda do painel: recolhe e devolve (computador). */}
        {!simples && <button
          type="button"
          className="editor__alca so-largo"
          aria-label={painelAberto ? 'Recolher o painel' : 'Abrir o painel'}
          title={painelAberto ? 'Recolher o painel' : 'Abrir o painel'}
          onClick={() => setPainelAberto((v) => !v)}
        >
          <span aria-hidden>{painelAberto ? '‹' : '›'}</span>
        </button>}

        {folha && !simples && <div className="editor__veu so-celular" onClick={() => setFolha(null)} aria-hidden />}

        <section className="editor__ia" aria-label="Painel de conteúdo">
          {/* No celular a folha fechada não se atualiza (continua montada:
              nada do que foi digitado se perde) -- durante o vídeo, é
              trabalho a menos a cada atualização. */}
          <Congelado ativo={(!celular && !simples) || folha === 'painel'}>
          <CabecalhoDaFolha titulo={ROTULO_DA_ABA[aba]} aoFechar={() => setFolha(null)} />
          {/* Aba IA, na ordem do que a pessoa quer fazer: (1) pedir um
              ajuste, (2) conferir os trechos, (3) o que a IA entendeu e
              refazer a análise -- recolhido, porque é consulta. Uma só
              rolagem: duas barras no mesmo painel confundiam. */}
          {aba === 'ia' && (
            <div className="ia-secao ia-secao--topo">
              {plano && (projeto?.animationNote || !temAnimacoes) && (
                <div className="aviso aviso--info aviso--linha" role="status" style={{ flexWrap: 'wrap' }}>
                  <IconeAnimacao size={15} />
                  {/* Tocar abre a nota inteira: o motivo de não ter animação (no celular não há "passar o mouse"). */}
                  <button
                    type="button"
                    className="aviso__texto botao-sem-estilo"
                    aria-expanded={verNotaDasAnimacoes}
                    disabled={!projeto?.animationNote}
                    onClick={() => setVerNotaDasAnimacoes((v) => !v)}
                  >
                    {resumoDasAnimacoes}
                    {projeto?.animationNote && !criandoAnimacoes ? (verNotaDasAnimacoes ? ' ▴' : ' ▾') : ''}
                  </button>
                  {!temAnimacoes && (
                    <button type="button" className="botao-link" disabled={criandoAnimacoes} onClick={() => void criarAnimacoesDaFala()}>
                      {criandoAnimacoes ? 'Criando…' : 'Criar'}
                    </button>
                  )}
                  {verNotaDasAnimacoes && projeto?.animationNote && (
                    <span style={{ flexBasis: '100%', fontSize: 12, opacity: 0.85, whiteSpace: 'normal' }}>{projeto.animationNote}</span>
                  )}
                  {verNotaDasAnimacoes && !criandoAnimacoes && projeto?.animationReport && <DetalhesDasAnimacoes relatorio={projeto.animationReport} />}
                </div>
              )}
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
              {semIa && (
                <button type="button" className="botao botao--primario" style={{ width: '100%' }} disabled={analisando} onClick={() => void analisar()}>
                  <IconeIA size={16} weight="fill" />
                  {analisando ? 'Analisando a gravação…' : 'Analisar com IA'}
                </button>
              )}
              {analisando && (
                <p className="texto-secundario" style={{ fontSize: 12 }} role="status" aria-live="polite">
                  Analisando a gravação. Leva de alguns segundos a poucos minutos; a edição atual continua salva.
                </p>
              )}
              {avisosDaIa.map((a) => (
                <div key={a} className="aviso aviso--atencao">
                  <IconeAviso size={15} />
                  <span style={{ fontSize: 12 }}>{a}</span>
                </div>
              ))}
              {pelasCenas && projeto?.audioProfile && (
                <div className="aviso-cenas" role="status">
                  <strong>{ROTULO_DO_AUDIO[projeto.audioProfile.tipo]}</strong>
                  <span>Montei pelas cenas{tipoDoVideo ? ` (${RECEITAS[tipoDoVideo].rotulo.toLowerCase()})` : ''}. Deixe mais vivo:</span>
                  <div className="aviso-cenas__acoes">
                    <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => abrirBiblioteca('trilha')}>
                      <IconeTrilha size={15} /> Música
                    </button>
                    <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => abrirBiblioteca('textos')}>
                      <IconeTexto size={15} /> Textos
                    </button>
                    <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => setGravadorDe(Math.round(posicaoMs))}>
                      <IconeMicrofone size={15} /> Narrar
                    </button>
                  </div>
                </div>
              )}
              {!semIa && (
                <PedirAIa
                  onEnviar={pedirAIa}
                  passos={passosDaIa}
                  foco={focoDaIa}
                  onTirarFoco={() => setAlvoDaIa(null)}
                  pedido={pedidoParaIa}
                  onPedidoFeito={() => setPedidoParaIa(null)}
                  extras={[
                    { rotulo: 'Revisar o vídeo inteiro', onClick: () => setPedidoParaIa(PEDIDO_DE_REVISAO) },
                    ...(midiasSeparadas?.momentos.length || pelasCenas ? [] : [{ rotulo: 'Ilustrar a fala com imagens', onClick: abrirMidiasSeparadas }]),
                  ]}
                />
              )}
              {midiasSeparadas?.momentos.length ? (
                <div className="midias-separadas" role="status">
                  <div className="midias-separadas__topo">
                    <IconeMidia size={18} />
                    <strong>
                      A IA separou {midiasSeparadas.momentos.length} {midiasSeparadas.momentos.length === 1 ? 'mídia' : 'mídias'} para ilustrar a fala
                    </strong>
                  </div>
                  <div className="midias-separadas__miniaturas" aria-hidden>
                    {midiasSeparadas.momentos.slice(0, 6).map((m) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={`${m.inicioMs}-${m.conceito}`} src={m.opcoes[0]?.miniatura} alt="" data-transparente={m.opcoes[0]?.transparente || undefined} />
                    ))}
                  </div>
                  <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
                    <button type="button" className="botao botao--primario botao--pequeno" onClick={abrirMidiasSeparadas}>
                      Revisar e aprovar
                    </button>
                    <button type="button" className="botao botao--fantasma botao--pequeno" onClick={concluirMidiasSeparadas}>
                      Dispensar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {midiasSeparadas?.erro && (
                    <div className="aviso aviso--atencao">
                      <IconeAviso size={15} />
                      <span style={{ fontSize: 12 }}>
                        A montagem não separou imagens: {midiasSeparadas.erro}. Peça de novo no botão abaixo.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {aba === 'ia' && (
            <div className="ia-secao">
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
                      acumulado += duracaoNaTimeline(c);
                    }
                    setPosicaoMs(acumulado);
                  }
                }}
                onAlternar={alternarTrecho}
                onOperacao={executar}
              >
                <PainelDeRefino projectId={projectId} plan={plano} onOperacao={executar} />
              </PainelDaIA>
            </div>
          )}
          {aba === 'ia' && !semIa && (
            <SobreOVideo
              entendimento={pelasCenas ? null : (projeto?.entendimentoDaIa ?? null)}
              analisando={analisando}
              onRefazer={() => void refazerComOTipo()}
              audio={projeto?.audioProfile?.tipo ?? null}
              tipo={tipoDoVideo}
              onTipo={setTipoDoVideo}
              resumo={resumoDoVideo}
              onResumo={setResumoDoVideo}
                  estilo={estiloDasAnimacoes}
                  onEstilo={setEstiloDasAnimacoes}
                  paleta={paletaDasAnimacoes}
                  onPaleta={setPaletaDasAnimacoes}
            />
          )}
          {aba === 'biblioteca' && (
            <PainelDaBiblioteca
              plan={plano}
              posicaoMs={posicaoMs}
              categoria={categoriaDaBiblioteca}
              onCategoria={setCategoriaDaBiblioteca}
              itemSelecionado={itemSelecionado}
              clipeSelecionado={selecionado}
              marca={marcaDoVideo}
              onOperacao={executar}
              onOperacoes={executarVarias}
              onSelecionarItem={selecionarDaBiblioteca}
              urlDoAsset={apiAssets.url}
              transcricao={transcricao}
              desligados={[...desligados]}
              midiasSeparadas={midiasSeparadas}
              onMidiasConcluidas={concluirMidiasSeparadas}
              {...(!semIa ? { onPedirIa: pedirAIa, passosDaIa } : {})}
              recomendado={pacoteRecomendado(
                projeto?.framework,
                projeto?.entendimentoDaIa ? `${projeto.entendimentoDaIa.topic} ${projeto.entendimentoDaIa.structure} ${projeto.entendimentoDaIa.hookType}` : null,
              )}
            />
          )}
          {/* Ajustes do vídeo todo (formato, enquadramento, legendas e
              efeitos gerais): no painel, como as outras categorias. */}
          {aba === 'ajustes' && (
            <div className="painel-de-ajustes">
              <Inspector
                titulo="Ajustes"
                plan={plano}
                clipId={null}
                item={null}
                onOperacao={executar}
                onOperacoes={executarVarias}
                marca={marcaDoVideo}
                recursos={recursos}
                onRefazerAcabamento={() => void refazerAcabamento()}
                refazendoAcabamento={refazendoAcabamento}
                posicaoMs={posicaoMs}
                onSeek={setPosicaoMs}
                abaPedida={abaDoInspector ?? AJUSTES_DO_VIDEO}
                onCorrigirLegendas={() => setAba('legendas')}
              />
            </div>
          )}
          {/* Propriedades do item selecionado (computador). */}
          {aba === 'propriedades' && (selecionado || itemSelecionado) && (
            <div className="painel-de-ajustes">
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
                onSelecionarItem={(item) => setItemSelecionado(item)}
                posicaoMs={posicaoMs}
                onSeek={setPosicaoMs}
                abaPedida={abaDoInspector}
                onRecolher={() => {
                  setSelecionado(null);
                  setItemSelecionado(null);
                }}
                onCorrigirLegendas={() => setAba('legendas')}
              />
            </div>
          )}
          {aba === 'midia' && (
            <div className="painel-de-midias">
              <PainelDeMidias
                plan={plano}
                posicaoMs={posicaoMs}
                onOperacao={executar}
                onOperacoes={executarVarias}
                onSelecionarItem={selecionarDaBiblioteca}
                urlDoAsset={apiAssets.url}
                transcricao={transcricao}
                desligados={[...desligados]}
                midiasSeparadas={midiasSeparadas?.momentos.length ? midiasSeparadas : null}
                onMidiasConcluidas={concluirMidiasSeparadas}
                onVerNoVideo={(ms) => {
                  setPosicaoMs(ms);
                  // No celular a folha cobre o vídeo: fecha para ver.
                  if (noCelular()) setFolha(null);
                }}
                {...(marcaDoVideo ? { marca: marcaDoVideo } : {})}
              />
              {projeto && <PainelDeMidia projeto={projeto} />}
            </div>
          )}
          {aba === 'legendas' && (
            <PainelDeLegendas plano={plano} transcricao={transcricao} carregando={carregandoTranscricao} onOperacao={executar} posicaoMs={posicaoMs} onPosicao={setPosicaoMs} desligados={desligados} />
          )}
          </Congelado>
        </section>

        <main
          className="editor__palco"
          style={{ ['--quadro-ar' as string]: `${plano.canvas.width} / ${plano.canvas.height}`, ['--quadro-hw' as string]: String(plano.canvas.height / plano.canvas.width) }}
        >
          {!simples && <ProporcaoDoVideo formato={plano.canvas.aspectRatio} onEscolher={(f) => executar({ op: 'definir_formato', aspectRatio: f })} />}
          {!simples && <FerramentasDoPalco
            ativa={folha === 'painel' ? (aba === 'midia' ? 'midia' : null) : null}
            onEscolher={naFerramenta}
          />}
          {!simples && <AcoesDoPalco
            formato={plano.canvas.aspectRatio}
            resolucao="1080P"
            onFormato={(f) => executar({ op: 'definir_formato', aspectRatio: f })}
            onResolucao={() => setExportarAberto(true)}
            onAcao={naAcao}
          />}
          <Palco
            plan={planoVisivel ?? plano}
            proxyUrl={temProxy ? urlDoVideo(projectId) : undefined}
            posicaoMs={posicaoMs}
            onPosicao={setPosicaoMs}
            desligados={desligados}
            transcricao={transcricao}
            comandoTocar={comandoTocar}
            comandoAlternar={comandoAlternar}
            comandoTelaCheia={comandoTelaCheia}
            marca={marcaDoVideo}
            urlDoAsset={apiAssets.url}
            destaqueSelecionado={itemSelecionado?.tipo === 'elemento' ? itemSelecionado.id : null}
            onSelecionarDestaque={(id) =>
              setItemSelecionado((atual) => (atual?.tipo === 'elemento' && atual.id === id ? atual : { tipo: 'elemento', id }))
            }
            onMoverDestaque={(id, x, y) => {
              const px = Math.round(x * 1000) / 1000;
              const py = Math.round(y * 1000) / 1000;
              const o = plano.overlays.find((v) => v.id === id);
              // Com animação livre, mover grava o ponto no cursor.
              if (o?.style?.keyframes?.length) {
                const keyframes = comKeyframe(o, posicaoMs - o.timelineStartMs, { x: px, y: py }, marcaDoVideo);
                executar({ op: 'editar_overlay', overlayId: id, style: { keyframes } });
              } else executar({ op: 'editar_overlay', overlayId: id, style: { x: px, y: py } });
            }}
            onRedimensionarTexto={(id, sizeScale) => {
              const o = plano.overlays.find((v) => v.id === id);
              if (o?.style?.keyframes?.length) {
                // A alça mede o tamanho total; o ponto guarda a escala sobre o tamanho do estilo.
                const scale = Math.round((sizeScale / (o.style.sizeScale ?? 1)) * 1000) / 1000;
                const keyframes = comKeyframe(o, posicaoMs - o.timelineStartMs, { scale }, marcaDoVideo);
                executar({ op: 'editar_overlay', overlayId: id, style: { keyframes } });
              } else executar({ op: 'editar_overlay', overlayId: id, style: { sizeScale } });
            }}
            onAjustarLegenda={(mudanca) => executar({ op: 'configurar_legenda', ...mudanca })}
            onPosicionarBloco={(inicioMs, fimMs, y) => {
              executar({ op: 'posicionar_legenda_no_trecho', inicioMs: Math.round(inicioMs), fimMs: Math.round(fimMs), y });
              setAviso(simples ? 'Só esta legenda mudou de lugar. Para mover todas, use Mais ajustes → Estilo da legenda.' : 'Só esta legenda mudou de lugar. Para mover todas, segure Shift ao arrastar ou use Legendas → Posição.');
            }}
            midiaSelecionada={itemSelecionado?.tipo === 'midia' ? itemSelecionado.id : null}
            onSelecionarMidia={(id) => setItemSelecionado({ tipo: 'midia', id })}
            onEditarAnimacao={(id, composicao) => executar({ op: 'editar_midia', mediaId: id, composicao })}
            onAjustarMidia={(id, mudanca) => {
              const c = plano.mediaLayers?.find((m) => m.id === id);
              if (!c?.keyframes?.length) return executar({ op: 'editar_midia', mediaId: id, ...mudanca });
              // Com pontos de movimento, arrastar grava o ponto no cursor.
              const p = padraoDaCaixa(c);
              const valores = {
                ...(mudanca.x !== undefined ? { x: mudanca.x, y: mudanca.y } : {}),
                ...(mudanca.width !== undefined ? { scale: Math.round((mudanca.width / (c.width ?? p.width)) * 1000) / 1000 } : {}),
              };
              const keyframes = comKeyframeDaMidia(c, posicaoMs - c.timelineStartMs, valores, { x: c.x ?? p.x, y: c.y ?? p.y });
              executar({ op: 'editar_midia', mediaId: id, keyframes });
            }}
            gravandoDe={gravandoDe}
            onTocando={setTocandoNaPrevia}
            onAbrirEstilos={(id) => {
              setItemSelecionado({ tipo: 'elemento', id, aba: 'estilos' });
              if (noCelular()) setFolha('inspector');
            }}
            // Tocando, a página não é redesenhada para acompanhar a posição: o cursor,
            // o tempo e a rolagem da timeline andam pelo relógio ao vivo (relogioAoVivo),
            // e o Palco avisa a posição ao pausar. Redesenhar o editor inteiro (timeline
            // com todos os blocos) a cada meio segundo travava a prévia no celular.
            ritmoDoAvisoMs={5000}
            {...(simples && editandoNoPratico
              ? {
                  onTocarNaAnimacao: (id: string) => {
                    rastro('toque-na-animacao', { id });
                    setSelecionado(null);
                    setItemSelecionado({ tipo: 'midia', id });
                  },
                }
              : {})}
            {...(simples
              ? {
                  onTocarNaLegenda: () => {
                    const legenda = legendaNoInstante(plano, palavrasDaTranscricao, posicaoMs);
                    if (!legenda) return;
                    setSelecionado(null);
                    setItemSelecionado((atual) => (atual?.tipo === 'legenda' && atual.id === legenda.id ? atual : legenda));
                  },
                }
              : {})}
          />
          {/* Celular: tela cheia, play no meio, desfazer e refazer (o CapCut
              põe aqui; o topo fica só com fechar, qualidade e exportar). */}
          {!simples && <div className="controles-moveis so-celular">
            <button type="button" className="botao-icone" aria-label="Tela cheia" onClick={abrirTelaCheia}>
              <IconeTelaCheia size={20} />
            </button>
            <button type="button" className="controles-moveis__play" aria-label={tocandoNaPrevia ? 'Pausar' : 'Reproduzir'} disabled={!temProxy} onClick={() => setComandoAlternar((n) => n + 1)}>
              {tocandoNaPrevia ? <IconePausar size={22} weight="fill" /> : <IconeTocar size={22} weight="fill" />}
            </button>
            <span className="controles-moveis__direita">
              <button type="button" className="botao-icone" onClick={desfazer} disabled={passado.length === 0} aria-label="Desfazer">
                <IconeDesfazer size={20} />
              </button>
              <button type="button" className="botao-icone" onClick={refazer} disabled={futuro.length === 0} aria-label="Refazer">
                <IconeRefazer size={20} />
              </button>
            </span>
          </div>}
        </main>

        <aside className="editor__inspector" aria-label="Propriedades">
          {/* Só no celular (a gaveta de baixo): no computador as
              propriedades abrem no painel da esquerda. */}
          <Congelado ativo={folha === 'inspector'}>
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
            onSelecionarItem={(item) => setItemSelecionado(item)}
            posicaoMs={posicaoMs}
            onSeek={setPosicaoMs}
            abaPedida={abaDoInspector}
            onRecolher={() => {
              setSelecionado(null);
              setItemSelecionado(null);
            }}
            onCorrigirLegendas={() => {
              setAba('legendas');
              setFolha('painel');
            }}
          />
          </Congelado>
        </aside>

        {atalhosAbertos && <AtalhosDoEditor onFechar={() => setAtalhosAbertos(false)} />}
        {gravadorDe !== null && (
          <GravadorDeNarracao
            inicioMs={gravadorDe}
            onGravando={setGravandoDe}
            onFechar={() => setGravadorDe(null)}
            onPronta={(assetId, duracao, inicio) => {
              setGravadorDe(null);
              const cabe = Math.max(200, Math.min(duracao, duracaoMs - inicio));
              executar({ op: 'adicionar_narracao', assetId, timelineStartMs: inicio, durationMs: cabe });
            }}
          />
        )}
        {aviso && (
          <div className="editor__aviso" role="status">
            <IconeCheck size={16} /> {aviso}
          </div>
        )}

        {!simples && <section className="editor__timeline" aria-label="Linha do tempo">
            <DivisorDaTimeline editorRef={editorRef} />
            <Timeline
              plan={plano}
              ocultas={ocultas}
              onAlternarCamada={alternarCamada}
              posicaoMs={posicaoMs}
              onSeek={setPosicaoMs}
              onOperacao={executar}
              clipeSelecionado={selecionado}
              onSelecionar={setSelecionado}
              palavras={palavrasDaTranscricao}
              onda={onda}
              quadros={quadrosDoVideo}
              onAbrirIa={() => abrirPainel('ia')}
              onAjustes={() => naAcao('ajustar')}
              onVelocidade={() => naAcao('velocidade')}
              central={celular}
            faixasEnxutas={!celular}
            tocando={tocandoNaPrevia}
            onAlternarReproducao={temProxy ? () => setComandoAlternar((n) => n + 1) : undefined}
            onTelaCheia={temProxy ? abrirTelaCheia : undefined}
            onSilenciarTudo={() => executarAcaoMovel('silenciar')}
            somOriginalMudo={somOriginalMudo}
            onGravarNarracao={() => {
                setFolha(null);
                setGravadorDe(Math.round(posicaoMs));
              }}
              onTirarPausas={tirarAsPausas}
              onAbrirBiblioteca={(categoria) => {
                // Mídia tem ferramenta própria na barra (sugestões da IA + bancos).
                if (categoria === 'midia') setAba('midia');
                else {
                  setCategoriaDaBiblioteca(categoria === 'trilha' ? 'trilha' : categoria);
                  setAba('biblioteca');
                }
                if (window.matchMedia('(max-width: 899px)').matches) setFolha('painel');
              }}
              onMostrarAtalhos={() => setAtalhosAbertos(true)}
              itemSelecionado={itemSelecionado}
              onSelecionarItem={(item) => {
                setItemSelecionado(item);
                // A etiqueta do item aparece junto dele; a folha de
                // propriedades só abre sozinha no clique duplo (estilos).
                if (item && item.tipo === 'elemento' && item.aba && (window.matchMedia('(max-width: 899px)').matches || simples)) setFolha('inspector');
                // A animação abre direto para editar (textos, modelo, elemento, posição e tamanho).
                if (item && item.tipo === 'midia' && plano.mediaLayers?.find((m) => m.id === item.id)?.kind === 'html' && (window.matchMedia('(max-width: 899px)').matches || simples)) setFolha('inspector');
              }}
            />
          </section>}

        {celular && !simples && (
          <>
            <BarraMovel
              trechoSelecionado={Boolean(selecionado) && !itemSelecionado}
              onDesmarcarTrecho={() => setSelecionado(null)}
              onAcao={executarAcaoMovel}
              legendasLigadas={plano.captions.enabled}
              somOriginalMudo={somOriginalMudo}
            />
            {!semIa && (
              <button type="button" className="botao-da-ia" aria-label="Pedir à IA" onClick={() => abrirPainel('ia')}>
                <IconeIA size={24} weight="fill" />
              </button>
            )}
            {/* As animações (HyperFrames) à mão no celular: no menu ficavam
                escondidas dentro de "Efeitos". */}
            <button type="button" className="botao-de-animacoes" aria-label="Animações" title="Animações" onClick={() => abrirBiblioteca('animacoes')}>
              <IconeAnimacao size={24} weight="fill" />
            </button>
          </>
        )}

        {!simples && etiquetaDoItem(false)}

        {simples && praticoEl}
      </div>
    </AnimacoesDaIaContexto.Provider>
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
/**
 * "Sobre este vídeo": o que a IA entendeu e o botão de refazer a
 * análise. Fica recolhido no fim do painel -- é consulta, não o que a
 * pessoa vai fazer agora -- e refazer a análise, que troca a seleção
 * de trechos, fica longe do caminho de quem só quer ajustar.
 */
function SobreOVideo({
  entendimento: e,
  analisando,
  onRefazer,
  audio,
  tipo,
  onTipo,
  resumo,
  onResumo,
  estilo,
  onEstilo,
  paleta,
  onPaleta,
}: {
  entendimento: ProjetoDetalhado['entendimentoDaIa'] | null;
  analisando: boolean;
  onRefazer: () => void;
  audio: keyof typeof ROTULO_DO_AUDIO | null;
  tipo: TipoDeVideo | null;
  onTipo: (t: TipoDeVideo | null) => void;
  resumo: string;
  onResumo: (r: string) => void;
  estilo: string | null;
  onEstilo: (e: string | null) => void;
  paleta: string | null;
  onPaleta: (p: string | null) => void;
}) {
  return (
    <details className="ia-sobre">
      <summary>
        <span className="linha" style={{ gap: 6 }}>
          <IconeIA size={14} weight="fill" color="var(--accent)" />
          O que a IA entendeu do vídeo
        </span>
      </summary>
      {e && (
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
      )}
      {audio && <p className="ia-sobre__audio">Áudio: {ROTULO_DO_AUDIO[audio]}</p>}
      <div className="ia-sobre__refazer">
        <p>Não ficou bom? Diga que vídeo é e o que tem nele: a IA monta de novo. A edição atual continua salva.</p>
        <TipoDoVideo tipo={tipo} onTipo={onTipo} resumo={resumo} onResumo={onResumo} id="resumo-no-editor" />
        {/* Os mesmos cartões do Novo vídeo, recolhidos: o painel é estreito. */}
        <details className="ia-sobre__visual">
          <summary>
            Visual das animações: <strong>{estiloDeAnimacao(estilo)?.nome ?? 'Automático'}</strong> · Trocar
          </summary>
          <EscolhaDoEstilo valor={estilo} onValor={onEstilo} paleta={paleta} onPaleta={onPaleta} />
        </details>
        <button type="button" className="botao botao--secundario botao--pequeno" disabled={analisando} onClick={onRefazer}>
          <IconeIA size={14} weight="fill" />
          {analisando ? 'Analisando…' : 'Refazer a análise'}
        </button>
      </div>
    </details>
  );
}

/** As faixas da timeline, com o nome que o visual prático mostra para esconder e mostrar. */
const ROTULO_DA_CAMADA: Record<CamadaOcultavel, string> = {
  midia: 'Imagens e animações',
  textos: 'Textos',
  elementos: 'Logo e elementos',
  legendas: 'Legenda',
  efeitos: 'Efeitos',
  audio: 'Som do vídeo',
  sons: 'Sons',
  trilha: 'Música',
};

const ROTULO_DA_ABA: Record<AbaDoEditor, string> = {
  ia: 'IA',
  biblioteca: 'Biblioteca',
  midia: 'Mídia',
  texto: 'Texto',
  legendas: 'Legendas',
  marca: 'Marca',
  audio: 'Áudio',
  ajustes: 'Ajustes',
  propriedades: 'Propriedades',
};

/** O pedido do "Revisar o vídeo": o agente usa a ferramenta revisar_video e resolve o que ela devolver. */
const PEDIDO_DE_REVISAO =
  'Revise o vídeo inteiro como um editor antes de entregar (use revisar_video) e corrija tudo o que estiver errado: animações sobre o rosto, pequenas ou sobrepostas, legenda com palavra errada, trilha alta sobre a fala. Mantenha o que está bom.';

/** "Ajustes" abre já no formato e no enquadramento do vídeo. */
const AJUSTES_DO_VIDEO = { aba: 'video', n: 0 } as const;

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
    <details className="gravacao-original">
      <summary className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeMidia size={18} />
          <strong style={{ fontSize: 15 }}>Gravação original</strong>
        </span>
      </summary>
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
        <p className="campo__ajuda">
          O editor toca uma prévia leve; o vídeo final é gerado a partir do original, na qualidade
          em que foi gravado.
        </p>
        <Link href={`/gravar?projeto=${projeto.id}`} className="botao botao--secundario">
          <IconeEnviar size={16} />
          Substituir o vídeo
        </Link>
      </div>
    </details>
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
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--e4)' }}>
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

/**
 * O diagnóstico das animações: o que a direção pediu, o que entrou e o
 * que ficou de fora -- cada um com o motivo. É o que responde "por que
 * esta montagem não teve animação" sem abrir o servidor.
 */
function DetalhesDasAnimacoes({ relatorio }: { relatorio: import('@makucho/studio-contracts').RelatorioDasAnimacoes }) {
  const s = (x: number) => `${Math.round(x)}s`;
  const falhas = relatorio.escrita.filter((e) => !e.ok);
  const layout: Record<string, string> = { meio_a_meio: 'meio a meio', cartao: 'cartão', tela_cheia: 'tela cheia', pip: 'vídeo no canto' };
  const TIPO: Record<string, string> = { numero: 'número', lista: 'lista', comparacao: 'comparação', citacao: 'citação', passos: 'passos', grafico: 'gráfico', termo: 'termo', pergunta: 'pergunta', destaque: 'destaque' };
  const tipo = (t: string) => TIPO[t] ?? (t || 'cartão');
  // Direção livre: a IA escreveu o design deste vídeo e um crítico olhou os quadros.
  const design = relatorio.design;
  const nota = (inicioS: number) => relatorio.escrita.find((e) => e.ok && Math.abs(e.inicioS - inicioS) < 0.01)?.critica;
  return (
    <div className="detalhes-das-animacoes">
      {relatorio.analise && <span>O que a IA viu no vídeo: {relatorio.analise}.</span>}
      {design?.conceito && <span>Direção da IA para este vídeo: {design.conceito}</span>}
      <span>
        {relatorio.pedidos === 0
          ? design
            ? 'A direção achou que este vídeo fica melhor só com o rosto e a fala.'
            : 'A IA não viu na fala nada que pedisse um cartão (número, lista, comparação, passos).'
          : `A IA sugeriu ${relatorio.pedidos}; ${relatorio.aceitos.length} ${relatorio.aceitos.length === 1 ? 'passou' : 'passaram'} na conferência${falhas.length ? ` e ${falhas.length} não ${falhas.length === 1 ? 'saiu' : 'saíram'} na escrita` : ''}.`}
        {relatorio.cortada ? ' A resposta dela veio cortada: valeram só os cartões completos.' : ''}
        {relatorio.zoomsTirados ? ` O zoom de ${relatorio.zoomsTirados} ${relatorio.zoomsTirados === 1 ? 'trecho saiu (ficaria escondido' : 'trechos saiu (ficariam escondidos'} sob a animação).` : ''}
      </span>
      {relatorio.aceitos.length > 0 && (
        <ul>
          {relatorio.aceitos.map((a) => {
            const falhou = falhas.find((f) => Math.abs(f.inicioS - a.inicioS) < 0.01);
            const critica = nota(a.inicioS);
            return (
              <li key={`a${a.inicioS}`} data-ok={!falhou || undefined}>
                {s(a.inicioS)} · {tipo(a.tipo)} ({layout[a.layout] ?? a.layout}){falhou ? ` — não saiu: ${falhou.detalhe ?? 'erro'}` : ''}
                {critica ? ` — nota ${critica.nota.toLocaleString('pt-BR')} da revisão${critica.refeita ? `, refeita ${critica.refeita}x` : ''}` : ''}
              </li>
            );
          })}
        </ul>
      )}
      {relatorio.descartados.length > 0 && (
        <>
          <span>Ficaram de fora:</span>
          <ul>
            {relatorio.descartados.map((d, i) => (
              <li key={`d${i}`}>
                {s(d.inicioS)} · {tipo(d.tipo)} — {d.motivo}
              </li>
            ))}
          </ul>
        </>
      )}
      {relatorio.erro && <span>Erro: {relatorio.erro}</span>}
    </div>
  );
}
