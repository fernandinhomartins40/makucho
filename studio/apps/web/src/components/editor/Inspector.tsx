'use client';

// ============================================================
// Inspector — "Propriedades", à direita do editor.
//
// Três abas, e cada controle é uma OPERAÇÃO da timeline — a mesma que
// a IA devolve no comando em linguagem natural. Nada aqui mexe no
// plano por fora: o servidor aplica a mesma função, valida e cria uma
// versão, que o Ctrl+Z desfaz.
//
//   - Vídeo: enquadramento, voz limpa, refazer o acabamento da marca;
//   - Legendas: estilo (com amostra real), posição, tamanho, destaque;
//   - Efeitos: transições, título, chamada, logo, trilha, sons.
//
// Com um trecho selecionado, ele assume o lugar e mostra as
// propriedades do trecho — incluindo o efeito e a transição dele.
//
// "Remover" desativa em vez de apagar: a seção 13 do contexto mestre
// exige poder restaurar um trecho descartado.
// ============================================================

import { PainelDoItem, Cor } from './PainelDoItem';
import type { ItemDaTimeline } from '../timeline/camadas';
import { useEffect, useMemo, useState } from 'react';
import type { EditPlanV1, MarcaDoVideo, TimelineOperation, TipoDeTransicao } from '@makucho/studio-contracts';
import { CATEGORIAS_DE_TRANSICAO, FONTES_DE_VIDEO, PRESETS_DE_LEGENDA, TRANSICOES_DO_CATALOGO, agendaDoPlano, duracaoNaTimeline, velocidadeDoTrecho, VELOCIDADES_DO_TRECHO } from '@makucho/studio-contracts';
import { NOME_DO_EFEITO, NOME_DO_SOM } from '../biblioteca/catalogo';
import { NOME_DO_ELEMENTO } from '../timeline/camadas';
import { AmostraDeEstilo } from './AmostraDeEstilo';
import { EscolhaDeFonte } from './EscolhaDeFonte';
import { assDeLegenda, useAmostrasReais } from './amostrasReais';
import { nomeDaFuncao, corDaFuncao, tempo } from './funcoes';
import {
  IconeIA,
  IconeAviso,
  IconeLixeira,
  IconeAvancar,
  IconeVoltar,
  IconeConfiguracoes,
} from '../icones';

export type AbaDoInspector = 'video' | 'legendas' | 'efeitos';

const NOME_DO_FRAMEWORK: Record<string, string> = {
  authority_education: 'Autoridade educacional',
  viral_education: 'Viral educativo',
  storytelling: 'Storytelling',
  pas: 'Problema → Agitação → Solução',
  sales: 'Venda',
};

/** O nome de cada transição na tela (do catálogo único). */
export const NOME_DA_TRANSICAO = Object.fromEntries(TRANSICOES_DO_CATALOGO.map((t) => [t.id, t.rotulo])) as Record<TipoDeTransicao, string>;

/** As opções de um <select> de transição, agrupadas como na biblioteca. */
export function OpcoesDeTransicao() {
  return (
    <>
      {Object.entries(CATEGORIAS_DE_TRANSICAO).map(([categoria, rotulo]) => (
        <optgroup key={categoria} label={rotulo}>
          {TRANSICOES_DO_CATALOGO.filter((t) => t.categoria === categoria).map((t) => (
            <option key={t.id} value={t.id}>
              {t.rotulo}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Recursos do Kit de marca que os controles oferecem. */
export interface RecursosDaMarca {
  logoAssetId?: string | null;
  musicaAssetId?: string | null;
}

interface Props {
  plan: EditPlanV1;
  clipId: string | null;
  /** Legenda, corte, elemento ou som selecionado na timeline. */
  item?: ItemDaTimeline | null;
  onFecharItem?: () => void;
  /** Abre um recurso do trecho (transição, texto, som...) no painel. */
  onSelecionarItem?: (item: ItemDaTimeline) => void;
  onOperacao: (op: TimelineOperation) => void;
  /** Várias operações de uma vez, numa versão só (zoom em todos, sons). */
  onOperacoes: (ops: TimelineOperation[]) => void;
  marca?: MarcaDoVideo;
  recursos?: RecursosDaMarca;
  onRefazerAcabamento?: () => void;
  refazendoAcabamento?: boolean;
  /** Onde está o cursor da timeline (keyframes do texto). */
  posicaoMs?: number;
  onSeek?: (ms: number) => void;
  /** Abre numa aba (o "Recorte" do celular vai direto ao enquadramento). */
  abaPedida?: { aba: AbaDoInspector; n: number } | null;
}

export function Inspector({
  plan,
  clipId,
  onOperacao,
  onOperacoes,
  marca,
  recursos,
  onRefazerAcabamento,
  refazendoAcabamento,
  item,
  onFecharItem,
  onSelecionarItem,
  posicaoMs = 0,
  onSeek,
  abaPedida,
}: Props) {
  const [aba, setAba] = useState<AbaDoInspector>('legendas');
  useEffect(() => {
    if (abaPedida) setAba(abaPedida.aba);
  }, [abaPedida]);
  const clipe = plan.clips.find((c) => c.id === clipId);

  return (
    <>
      <header className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeConfiguracoes size={19} />
          <strong style={{ fontSize: 17 }}>Propriedades</strong>
        </span>
      </header>

      <div className="painel__corpo">
        {item ? (
          <PainelDoItem
            plan={plan}
            item={item}
            onOperacao={onOperacao}
            onOperacoes={onOperacoes}
            onFechar={() => onFecharItem?.()}
            marca={marca}
            posicaoMs={posicaoMs}
            onSeek={onSeek}
          />
        ) : clipe ? (
          <PropriedadesDoTrecho plan={plan} clipe={clipe} onOperacao={onOperacao} onSelecionarItem={onSelecionarItem} />
        ) : (
          <>
            <div className="abas" role="tablist">
              {(
                [
                  ['legendas', 'Legendas'],
                  ['efeitos', 'Efeitos'],
                  ['video', 'Vídeo'],
                ] as const
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  className="abas__item"
                  aria-selected={aba === id}
                  onClick={() => setAba(id)}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {aba === 'video' && (
              <AbaDeVideo
                plan={plan}
                onOperacao={onOperacao}
                onRefazerAcabamento={onRefazerAcabamento}
                refazendo={refazendoAcabamento}
              />
            )}
            {aba === 'legendas' && <AbaDeLegendas plan={plan} marca={marca} onOperacao={onOperacao} />}
            {aba === 'efeitos' && (
              <AbaDeEfeitos plan={plan} recursos={recursos} onOperacao={onOperacao} onOperacoes={onOperacoes} />
            )}
          </>
        )}
      </div>
    </>
  );
}

// ============================================================
// Aba Vídeo
// ============================================================

function AbaDeVideo({
  plan,
  onOperacao,
  onRefazerAcabamento,
  refazendo,
}: {
  plan: EditPlanV1;
  onOperacao: (op: TimelineOperation) => void;
  onRefazerAcabamento?: () => void;
  refazendo?: boolean;
}) {
  const duracao = plan.clips.reduce((t, c) => t + duracaoNaTimeline(c), 0);
  const reducao = Math.round((1 - duracao / plan.sourceDurationMs) * 100);
  const fit = plan.render.fit ?? 'ajustar';

  return (
    <>
      <div className="campo">
        <span className="campo__rotulo">Enquadramento</span>
        <Segmentado
          rotulo="Enquadramento"
          valor={fit}
          opcoes={[
            ['desfoque', 'Fundo desfocado'],
            ['preencher', 'Preencher'],
            ['ajustar', 'Faixas pretas'],
          ]}
          onTrocar={(v) => onOperacao({ op: 'configurar_video', fit: v as 'ajustar' | 'preencher' | 'desfoque' })}
        />
        <p className="campo__ajuda">
          Como uma gravação horizontal ocupa o vídeo vertical. &quot;Preencher&quot; corta as laterais.
        </p>
      </div>

      <Chave
        rotulo="Voz limpa"
        ajuda="Reduz ruído de fundo e o grave de manuseio, e deixa a voz mais presente."
        ligada={Boolean(plan.render.voiceEnhance)}
        onTrocar={(v) => onOperacao({ op: 'configurar_video', voiceEnhance: v })}
      />

      <div className="separador" />

      <Propriedade rotulo="Formato" valor="1080 × 1920 (9:16), 30 fps" />
      <Propriedade rotulo="Duração" valor={`${(duracao / 1000).toFixed(1)}s`} />
      <Propriedade rotulo="Gravação original" valor={`${Math.round(plan.sourceDurationMs / 60_000)} min`} />
      <Propriedade rotulo="Redução" valor={`${reducao}%`} />
      <Propriedade rotulo="Trechos" valor={String(plan.clips.length)} />
      <Propriedade rotulo="Estrutura" valor={NOME_DO_FRAMEWORK[plan.framework] ?? plan.framework} />

      {onRefazerAcabamento && (
        <>
          <div className="separador" />
          <button
            type="button"
            className="botao botao--secundario botao--largo"
            disabled={refazendo}
            onClick={onRefazerAcabamento}
          >
            <IconeIA size={16} weight="fill" />
            {refazendo ? 'Aplicando…' : 'Refazer acabamento da marca'}
          </button>
          <p className="campo__ajuda">
            Legenda, zoom, logo e trilha de novo, como definidos no Kit de marca. Não usa IA; dá para desfazer.
          </p>
        </>
      )}
    </>
  );
}

// ============================================================
// Aba Legendas
// ============================================================

function AbaDeLegendas({
  plan,
  marca,
  onOperacao,
}: {
  plan: EditPlanV1;
  marca?: MarcaDoVideo;
  onOperacao: (op: TimelineOperation) => void;
}) {
  const c = plan.captions;
  const escala = c.sizeScale ?? 1;
  // Os cartões são desenhados pelo libass, com as escolhas da pessoa por
  // cima de cada estilo -- exatamente o que sai ao escolher o cartão.
  const pedidos = useMemo(
    () =>
      PRESETS_DE_LEGENDA.map((preset) =>
        assDeLegenda(preset.id, marca, {
          sizeScale: c.sizeScale,
          fontId: c.fontId,
          color: c.color,
          highlightColor: c.highlightColor,
          highlightActiveWord: c.highlightActiveWord,
        }),
      ),
    [marca, c.sizeScale, c.fontId, c.color, c.highlightColor, c.highlightActiveWord],
  );
  const reais = useAmostrasReais(pedidos);

  return (
    <>
      <Chave
        rotulo="Legendas no vídeo"
        ligada={c.enabled}
        onTrocar={(v) => onOperacao({ op: 'configurar_legenda', enabled: v })}
      />

      <div className="campo" style={{ opacity: c.enabled ? 1 : 0.5 }}>
        <span className="campo__rotulo">Estilo</span>
        <div className="estilos" role="radiogroup" aria-label="Estilo das legendas">
          {PRESETS_DE_LEGENDA.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={c.styleId === preset.id}
              className="estilo"
              title={preset.descricao}
              disabled={!c.enabled}
              onClick={() => onOperacao({ op: 'trocar_estilo_legenda', styleId: preset.id })}
            >
              <span className="estilo__amostra" data-real={reais?.get(preset.id) ? '' : undefined}>
                {reais?.get(preset.id) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={reais.get(preset.id)} alt="" className="estilo__imagem" />
                ) : (
                  <AmostraDeEstilo preset={preset} marca={marca} />
                )}
              </span>
              <span className="estilo__rotulo">{preset.rotulo}</span>
            </button>
          ))}
        </div>
        <p className="campo__ajuda">
          {PRESETS_DE_LEGENDA.find((p) => p.id === c.styleId)?.descricao ?? 'As cores vêm do Kit de marca.'}
        </p>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Posição</span>
        <Segmentado
          rotulo="Posição da legenda"
          valor={c.y !== undefined ? 'livre' : c.position}
          opcoes={[
            ['top', 'Topo'],
            ['center', 'Meio'],
            ['bottom', 'Embaixo'],
            ...(c.y !== undefined ? ([['livre', 'Livre']] as const) : []),
          ]}
          onTrocar={(v) => v !== 'livre' && onOperacao({ op: 'configurar_legenda', position: v as 'top' | 'center' | 'bottom', y: null })}
        />
        <p className="campo__ajuda">Ou arraste a legenda na prévia para qualquer altura; o canto muda o tamanho.</p>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Tamanho</span>
        <Segmentado
          rotulo="Tamanho da legenda"
          valor={escala <= 0.9 ? 'p' : escala >= 1.1 ? 'g' : 'm'}
          opcoes={[
            ['p', 'Pequeno'],
            ['m', 'Médio'],
            ['g', 'Grande'],
          ]}
          onTrocar={(v) => onOperacao({ op: 'configurar_legenda', sizeScale: v === 'p' ? 0.85 : v === 'g' ? 1.2 : 1 })}
        />
      </div>

      <div className="campo">
        <EscolhaDeFonte rotulo="Fonte" valor={c.fontId} rotuloPadrao="A do estilo" onTrocar={(v) => onOperacao({ op: 'configurar_legenda', fontId: v })} />
      </div>

      <div className="linha" style={{ gap: 'var(--e3)', marginBottom: 'var(--e4)' }}>
        <Cor
          rotulo="Cor do texto"
          valor={c.color ?? '#FFFFFF'}
          onTrocar={(v) => onOperacao({ op: 'configurar_legenda', color: v })}
        />
        <Cor
          rotulo="Palavra falada"
          valor={c.highlightColor ?? '#FFD400'}
          onTrocar={(v) => onOperacao({ op: 'configurar_legenda', highlightColor: v })}
        />
      </div>
      {(c.fontId || c.color || c.highlightColor) && (
        <button
          type="button"
          className="botao botao--fantasma botao--pequeno"
          style={{ marginTop: 'calc(-1 * var(--e2))', marginBottom: 'var(--e3)' }}
          onClick={() => onOperacao({ op: 'configurar_legenda', fontId: null, color: null, highlightColor: null })}
        >
          Voltar à fonte e às cores do estilo
        </button>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="palavras-por-bloco">
          Palavras por vez
        </label>
        <select
          id="palavras-por-bloco"
          className="campo__selecao"
          value={String(c.wordsPerBlock)}
          onChange={(e) => onOperacao({ op: 'configurar_legenda', wordsPerBlock: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'palavra' : 'palavras'}
            </option>
          ))}
        </select>
      </div>

      <Chave
        rotulo="Destacar a palavra falada"
        ajuda="A palavra acende no instante em que é dita."
        ligada={c.highlightActiveWord}
        onTrocar={(v) => onOperacao({ op: 'configurar_legenda', highlightActiveWord: v })}
      />

      <div className="campo" style={{ marginTop: 'var(--e3)', marginBottom: 0 }}>
        <label className="campo__rotulo" htmlFor="entrada-do-bloco">
          Entrada de cada bloco
        </label>
        <select
          id="entrada-do-bloco"
          className="campo__selecao"
          value={c.blockEntrance ?? 'nenhuma'}
          onChange={(e) =>
            onOperacao({ op: 'configurar_legenda', blockEntrance: e.target.value === 'nenhuma' ? null : (e.target.value as 'pop') })
          }
        >
          <option value="nenhuma">Sem animação</option>
          <option value="surgir">Surgir</option>
          <option value="pop">Pop</option>
          <option value="subir">Subir</option>
          <option value="zoom">Zoom</option>
          <option value="desfocar">Desfocar</option>
        </select>
      </div>

      <p className="campo__ajuda" style={{ marginTop: 'var(--e3)' }}>
        Clique numa legenda na linha do tempo para reescrever ou excluir, ou use &quot;+ Legenda&quot; para incluir uma.
      </p>
    </>
  );
}

// ============================================================
// Aba Efeitos
// ============================================================

const DURACAO_DO_TITULO = 3200;
const DURACAO_DA_CHAMADA = 3500;

function AbaDeEfeitos({
  plan,
  recursos,
  onOperacao,
  onOperacoes,
}: {
  plan: EditPlanV1;
  recursos?: RecursosDaMarca;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
}) {
  const duracao = plan.clips.reduce((t, c) => t + duracaoNaTimeline(c), 0);
  const titulo = plan.overlays.find((o) => o.component === 'HookTitle');
  const chamada = plan.overlays.find((o) => o.component === 'CTA');
  const logo = plan.overlays.find((o) => o.component === 'LogoBug');
  const barra = plan.overlays.find((o) => o.component === 'ProgressBar');
  const tiposUsados = new Set(plan.transitions.map((t) => t.type));
  const transicaoAtual = plan.transitions.length === 0 ? 'cut' : tiposUsados.size === 1 ? [...tiposUsados][0]! : 'misto';
  const comZoom = plan.clips.some((c) => c.effect);
  const sons = plan.soundEffects.length;

  return (
    <>
      <div className="campo">
        <label className="campo__rotulo" htmlFor="transicao-todos">
          Transição nos cortes
        </label>
        <select
          id="transicao-todos"
          className="campo__selecao"
          value={transicaoAtual}
          disabled={plan.clips.length < 2}
          onChange={(e) => onOperacao({ op: 'transicao_em_todos', type: e.target.value as TipoDeTransicao })}
        >
          {transicaoAtual === 'misto' && <option value="misto">Cada corte com a sua</option>}
          <OpcoesDeTransicao />
        </select>
        <p className="campo__ajuda">Vídeo falado costuma funcionar melhor com corte seco. Para um corte só, selecione o trecho.</p>
      </div>

      <Chave
        rotulo="Zoom nos cortes"
        ajuda="Aproximação lenta na abertura e zoom seco em cortes alternados — o ritmo dos vídeos curtos."
        ligada={comZoom}
        onTrocar={(v) =>
          onOperacoes(
            plan.clips.flatMap((c, i): TimelineOperation[] => {
              const efeito = !v ? 'nenhum' : i === 0 ? 'zoom_lento' : i % 2 === 1 ? 'punch_in' : 'nenhum';
              return (c.effect ?? 'nenhum') !== efeito ? [{ op: 'definir_efeito', clipId: c.id, effect: efeito }] : [];
            }),
          )
        }
      />

      <div className="separador" />

      <TextoDeTela
        rotulo="Título de abertura"
        ajuda="Aparece nos primeiros segundos, no topo."
        exemplo="O erro que custa clientes"
        atual={titulo}
        onSalvar={(texto) =>
          titulo
            ? onOperacao({ op: 'editar_overlay', overlayId: titulo.id, text: texto })
            : onOperacao({
                op: 'adicionar_overlay',
                component: 'HookTitle',
                text: texto,
                timelineStartMs: 0,
                durationMs: Math.min(DURACAO_DO_TITULO, duracao),
              })
        }
        onRemover={() => titulo && onOperacao({ op: 'remover_overlay', overlayId: titulo.id })}
      />

      <TextoDeTela
        rotulo="Chamada final"
        ajuda="Aparece nos últimos segundos."
        exemplo="Siga para a parte 2"
        atual={chamada}
        onSalvar={(texto) =>
          chamada
            ? onOperacao({ op: 'editar_overlay', overlayId: chamada.id, text: texto })
            : onOperacao({
                op: 'adicionar_overlay',
                component: 'CTA',
                text: texto,
                timelineStartMs: Math.max(0, duracao - DURACAO_DA_CHAMADA),
                durationMs: Math.min(DURACAO_DA_CHAMADA, duracao),
              })
        }
        onRemover={() => chamada && onOperacao({ op: 'remover_overlay', overlayId: chamada.id })}
      />

      <div className="separador" />

      <Chave
        rotulo="Logo no vídeo"
        ajuda={recursos?.logoAssetId ? undefined : 'Envie o logo no Kit de marca para usar aqui.'}
        ligada={Boolean(logo)}
        desabilitada={!recursos?.logoAssetId && !logo}
        onTrocar={(v) =>
          v && recursos?.logoAssetId
            ? onOperacao({
                op: 'adicionar_overlay',
                component: 'LogoBug',
                assetId: recursos.logoAssetId,
                variant: 'sd',
                timelineStartMs: 0,
                durationMs: duracao,
              })
            : logo && onOperacao({ op: 'remover_overlay', overlayId: logo.id })
        }
      />
      {logo && (
        <div className="campo">
          <Segmentado
            rotulo="Posição do logo"
            valor={logo.variant ?? 'sd'}
            opcoes={[
              ['se', '↖'],
              ['sd', '↗'],
              ['ie', '↙'],
              ['id', '↘'],
            ]}
            onTrocar={(v) => onOperacao({ op: 'editar_overlay', overlayId: logo.id, variant: v })}
          />
        </div>
      )}

      <Chave
        rotulo="Trilha sonora"
        ajuda={recursos?.musicaAssetId ? undefined : 'Envie uma trilha no Kit de marca para usar aqui.'}
        ligada={Boolean(plan.music)}
        desabilitada={!recursos?.musicaAssetId && !plan.music}
        onTrocar={(v) =>
          onOperacao({ op: 'trocar_musica', assetId: v ? (recursos?.musicaAssetId ?? null) : null, duckUnderVoice: true })
        }
      />
      {plan.music && (
        <div className="campo">
          <div className="linha entre">
            <label className="campo__rotulo" htmlFor="volume-trilha" style={{ marginBottom: 0 }}>
              Volume da trilha
            </label>
            <span className="texto-secundario" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
              {plan.music.gainDb} dB
            </span>
          </div>
          <input
            id="volume-trilha"
            type="range"
            className="deslizante"
            min={-32}
            max={-8}
            step={2}
            defaultValue={plan.music.gainDb}
            key={plan.music.gainDb}
            onChange={() => undefined}
            onPointerUp={(e) =>
              onOperacao({ op: 'trocar_musica', assetId: plan.music!.assetId, gainDb: Number((e.target as HTMLInputElement).value) })
            }
            onKeyUp={(e) =>
              onOperacao({ op: 'trocar_musica', assetId: plan.music!.assetId, gainDb: Number((e.target as HTMLInputElement).value) })
            }
          />
          <p className="campo__ajuda">A trilha abaixa sozinha enquanto você fala.</p>
        </div>
      )}

      <Chave
        rotulo="Barra de progresso"
        ajuda="Uma linha no topo que avança até o fim do vídeo."
        ligada={Boolean(barra)}
        onTrocar={(v) =>
          v
            ? onOperacao({ op: 'adicionar_overlay', component: 'ProgressBar', timelineStartMs: 0, durationMs: duracao })
            : barra && onOperacao({ op: 'remover_overlay', overlayId: barra.id })
        }
      />

      <Chave
        rotulo="Efeitos sonoros"
        ajuda={sons ? `${sons} no vídeo: "whoosh" nas transições e "pop" nos textos.` : 'Nas transições e nos textos de tela.'}
        ligada={sons > 0}
        onTrocar={(v) => {
          if (!v) {
            onOperacao({ op: 'remover_efeito_sonoro', soundEffectId: 'todos' });
            return;
          }
          let inicio = 0;
          const inicios = plan.clips.map((c) => {
            const i = inicio;
            inicio += duracaoNaTimeline(c);
            return i;
          });
          onOperacoes([
            ...plan.transitions.map(
              (t): TimelineOperation => ({
                op: 'adicionar_efeito_sonoro',
                assetId: 'sfx-whoosh',
                timelineStartMs: Math.max(0, (inicios[t.beforeClipIndex] ?? 0) - 180),
                gainDb: -12,
              }),
            ),
            ...plan.overlays
              .filter((o) => o.component === 'HookTitle' || o.component === 'CTA')
              .map(
                (o): TimelineOperation => ({
                  op: 'adicionar_efeito_sonoro',
                  assetId: 'sfx-pop',
                  timelineStartMs: o.timelineStartMs + 40,
                  gainDb: -10,
                }),
              ),
          ]);
        }}
        desabilitada={sons === 0 && plan.transitions.length === 0 && !titulo && !chamada}
      />
    </>
  );
}

/** Um texto de tela (título, chamada): digita e salva ao sair do campo. */
function TextoDeTela({
  rotulo,
  ajuda,
  exemplo,
  atual,
  onSalvar,
  onRemover,
}: {
  rotulo: string;
  ajuda: string;
  exemplo: string;
  atual?: EditPlanV1['overlays'][number];
  onSalvar: (texto: string) => void;
  onRemover: () => void;
}) {
  const [texto, setTexto] = useState(atual?.text ?? '');
  useEffect(() => setTexto(atual?.text ?? ''), [atual?.text]);
  const id = `texto-${rotulo.toLowerCase().replace(/\W+/g, '-')}`;

  const salvar = () => {
    const limpo = texto.trim();
    if (!limpo) {
      if (atual) onRemover();
      return;
    }
    if (limpo !== atual?.text) onSalvar(limpo);
  };

  return (
    <div className="campo">
      <div className="linha entre">
        <label className="campo__rotulo" htmlFor={id} style={{ marginBottom: 0 }}>
          {rotulo}
        </label>
        {atual && (
          <button type="button" className="botao-icone botao-icone--pequeno" aria-label={`Remover ${rotulo.toLowerCase()}`} onClick={onRemover}>
            <IconeLixeira size={14} />
          </button>
        )}
      </div>
      <input
        id={id}
        className="campo__entrada"
        value={texto}
        maxLength={70}
        placeholder={exemplo}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <p className="campo__ajuda">{ajuda}</p>
    </div>
  );
}

// ============================================================
// Propriedades do trecho selecionado
// ============================================================

function PropriedadesDoTrecho({
  plan,
  clipe,
  onOperacao,
  onSelecionarItem,
}: {
  plan: EditPlanV1;
  clipe: EditPlanV1['clips'][number];
  onOperacao: (op: TimelineOperation) => void;
  onSelecionarItem?: (item: ItemDaTimeline) => void;
}) {
  const duracaoMs = duracaoNaTimeline(clipe);
  const velocidade = velocidadeDoTrecho(clipe);
  const posicao = plan.clips.findIndex((c) => c.id === clipe.id);
  const ultimo = plan.clips.length === 1;
  const transicao = plan.transitions.find((t) => t.beforeClipIndex === posicao);

  const trocarCom = (outro: number) => {
    const ordem = plan.clips.map((c) => c.id);
    const a = ordem[posicao];
    const b = ordem[outro];
    if (!a || !b) return;
    ordem[posicao] = b;
    ordem[outro] = a;
    onOperacao({ op: 'reordenar', clipIds: ordem });
  };

  // Passos de meio segundo: ajuste quadro a quadro exigiria uma
  // precisão que o mouse não entrega numa timeline compacta.
  const ajustar = (ladoInicio: boolean, deltaMs: number) => {
    const inicio = ladoInicio ? clipe.sourceStartMs + deltaMs : clipe.sourceStartMs;
    const fim = ladoInicio ? clipe.sourceEndMs : clipe.sourceEndMs + deltaMs;

    // Abaixo de 1s não é um trecho: é um tique.
    if (fim - inicio < 1000) return;
    if (inicio < 0 || fim > plan.sourceDurationMs) return;

    onOperacao({
      op: 'ajustar_corte',
      clipId: clipe.id,
      sourceStartMs: Math.round(inicio),
      sourceEndMs: Math.round(fim),
    });
  };

  return (
    <>
      <span className="rotulo-secao">
        Trecho {posicao + 1} de {plan.clips.length}
      </span>

      <div className="linha" style={{ gap: 'var(--e2)', margin: 'var(--e2) 0 var(--e4)' }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: corDaFuncao(clipe.role),
            flexShrink: 0,
          }}
        />
        <strong style={{ fontSize: 16 }}>{nomeDaFuncao(clipe.role)}</strong>
      </div>

      {/* Por que a IA escolheu. Sem o motivo, não há como discordar. */}
      <div className="cartao" style={{ padding: 'var(--e3)', marginBottom: 'var(--e4)' }}>
        <span className="rotulo-secao linha" style={{ gap: 'var(--e1)', marginBottom: 'var(--e2)' }}>
          <IconeIA size={12} weight="fill" color="var(--accent)" />
          Por que este trecho
        </span>
        <p style={{ fontSize: 13, lineHeight: 1.45 }}>{clipe.reason}</p>
      </div>

      <RecursosDoTrecho plan={plan} clipe={clipe} onSelecionarItem={onSelecionarItem} />

      {clipe.semanticRisk === 'high' && (
        <div className="aviso aviso--atencao" style={{ marginBottom: 'var(--e4)' }}>
          <IconeAviso size={16} />
          <span>Fora do contexto original, este trecho pode mudar de sentido.</span>
        </div>
      )}

      <Propriedade rotulo="Duração" valor={`${(duracaoMs / 1000).toFixed(1)}s${velocidade !== 1 ? ` (${velocidade}x)` : ''}`} />
      <Propriedade rotulo="No original" valor={`${tempo(clipe.sourceStartMs)} – ${tempo(clipe.sourceEndMs)}`} />

      <ControleDeVelocidade clipe={clipe} onOperacao={onOperacao} />

      <div className="campo" style={{ marginTop: 'var(--e4)' }}>
        <span className="campo__rotulo">Efeito</span>
        <Segmentado
          rotulo="Efeito do trecho"
          valor={clipe.effect ?? 'nenhum'}
          opcoes={[
            ['nenhum', 'Nenhum'],
            ['punch_in', 'Zoom seco'],
            ['zoom_lento', 'Zoom lento'],
          ]}
          onTrocar={(v) =>
            onOperacao({ op: 'definir_efeito', clipId: clipe.id, effect: v as 'nenhum' | 'punch_in' | 'zoom_lento' })
          }
        />
      </div>

      {posicao > 0 && (
        <div className="campo">
          <label className="campo__rotulo" htmlFor="transicao-trecho">
            Transição de entrada
          </label>
          <select
            id="transicao-trecho"
            className="campo__selecao"
            value={transicao?.type ?? 'cut'}
            onChange={(e) =>
              onOperacao({ op: 'definir_transicao', clipId: clipe.id, type: e.target.value as TipoDeTransicao })
            }
          >
            <OpcoesDeTransicao />
          </select>
        </div>
      )}

      <div className="campo">
        <span className="campo__rotulo">Início</span>
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <Ajuste onClick={() => ajustar(true, -500)}>−0,5s</Ajuste>
          <Ajuste onClick={() => ajustar(true, 500)}>+0,5s</Ajuste>
        </div>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Fim</span>
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <Ajuste onClick={() => ajustar(false, -500)}>−0,5s</Ajuste>
          <Ajuste onClick={() => ajustar(false, 500)}>+0,5s</Ajuste>
        </div>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Posição</span>
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <Ajuste disabled={posicao === 0} onClick={() => trocarCom(posicao - 1)}>
            <IconeVoltar size={13} />
            Antes
          </Ajuste>
          <Ajuste disabled={posicao === plan.clips.length - 1} onClick={() => trocarCom(posicao + 1)}>
            Depois
            <IconeAvancar size={13} />
          </Ajuste>
        </div>
      </div>

      <button
        type="button"
        className="botao botao--perigo botao--largo"
        disabled={ultimo}
        onClick={() => onOperacao({ op: 'alternar_clipe', clipId: clipe.id, enabled: false })}
        style={{ marginTop: 'var(--e5)' }}
      >
        <IconeLixeira size={16} />
        Remover trecho
      </button>
      {ultimo && <p className="campo__ajuda">O vídeo precisa de ao menos um trecho.</p>}
    </>
  );
}

/**
 * Velocidade do trecho: câmera lenta a 4x. A duração na timeline muda e
 * a voz continua no mesmo tom (prévia, exportação e render).
 */
export function ControleDeVelocidade({ clipe, onOperacao }: { clipe: EditPlanV1['clips'][number]; onOperacao: (op: TimelineOperation) => void }) {
  const atual = velocidadeDoTrecho(clipe);
  const original = clipe.sourceEndMs - clipe.sourceStartMs;
  return (
    <div className="campo velocidade" id="velocidade-do-trecho">
      <span className="campo__rotulo">Velocidade</span>
      <div className="velocidade__opcoes" role="radiogroup" aria-label="Velocidade do trecho">
        {VELOCIDADES_DO_TRECHO.map((v) => {
          const curto = original / v < 500;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={Math.abs(atual - v) < 0.001}
              className="velocidade__opcao"
              disabled={curto}
              title={curto ? 'Rápido demais para este trecho' : `${(original / v / 1000).toFixed(1)} s na timeline`}
              onClick={() => onOperacao({ op: 'definir_velocidade', clipId: clipe.id, speed: v })}
            >
              {String(v).replace('.', ',')}x
            </button>
          );
        })}
      </div>
      <p className="campo__ajuda">
        {atual === 1 ? 'Normal.' : atual > 1 ? 'Mais rápido' : 'Câmera lenta'}
        {atual !== 1 && `: ${(original / 1000).toFixed(1)} s viram ${(original / atual / 1000).toFixed(1)} s`}. A voz mantém o tom.
      </p>
    </div>
  );
}

/**
 * Tudo o que está aplicado neste trecho, com um clique para abrir cada
 * coisa: o que a IA fez fica à vista e ao alcance.
 */
function RecursosDoTrecho({
  plan,
  clipe,
  onSelecionarItem,
}: {
  plan: EditPlanV1;
  clipe: EditPlanV1['clips'][number];
  onSelecionarItem?: (item: ItemDaTimeline) => void;
}) {
  const agenda = agendaDoPlano(plan);
  const t = agenda.trechos.find((x) => x.clip.id === clipe.id);
  if (!t) return null;
  const ini = t.inicioMs;
  const fim = t.inicioMs + t.duracaoMs;
  const indice = plan.clips.findIndex((c) => c.id === clipe.id);
  const transicao = plan.transitions.find((x) => x.beforeClipIndex === indice && x.type !== 'cut');
  const textos = plan.overlays.filter((o) => Math.min(fim, o.timelineStartMs + o.durationMs) - Math.max(ini, o.timelineStartMs) > 0);
  const sons = plan.soundEffects.filter((e) => e.timelineStartMs >= ini && e.timelineStartMs < fim);
  const a = clipe.audio;
  const itens: Array<{ chave: string; rotulo: string; detalhe: string; abrir?: () => void }> = [];
  if (transicao) {
    itens.push({
      chave: 'tr',
      rotulo: 'Transição de entrada',
      detalhe: `${NOME_DA_TRANSICAO[transicao.type] ?? transicao.type}, ${transicao.durationMs} ms`,
      abrir: () => onSelecionarItem?.({ tipo: 'corte', id: clipe.id, clipId: clipe.id, ms: ini }),
    });
  }
  if (clipe.effect) itens.push({ chave: 'fx', rotulo: 'Efeito', detalhe: NOME_DO_EFEITO[clipe.effect] ?? clipe.effect });
  itens.push({
    chave: 'au',
    rotulo: 'Som do trecho',
    detalhe: a?.muted ? 'Mudo' : [a?.gainDb ? `${a.gainDb} dB` : 'Original', a?.leadMs ? `entra ${a.leadMs} ms antes` : '', a?.tailMs ? `segue ${a.tailMs} ms depois` : ''].filter(Boolean).join(', '),
    abrir: () => onSelecionarItem?.({ tipo: 'audio', id: clipe.id }),
  });
  for (const o of textos) {
    itens.push({
      chave: o.id,
      rotulo: NOME_DO_ELEMENTO[o.component] ?? o.component,
      detalhe: o.text ?? '',
      abrir: () => onSelecionarItem?.({ tipo: 'elemento', id: o.id }),
    });
  }
  for (const e of sons) {
    itens.push({
      chave: e.id,
      rotulo: 'Efeito sonoro',
      detalhe: `${NOME_DO_SOM[e.assetId] ?? 'Som'} em ${tempo(e.timelineStartMs)}`,
      abrir: () => onSelecionarItem?.({ tipo: 'som', id: e.id }),
    });
  }

  return (
    <div className="campo" style={{ marginBottom: 'var(--e4)' }}>
      <span className="campo__rotulo">Neste trecho</span>
      <ul className="recursos-do-trecho">
        {itens.map((i) => (
          <li key={i.chave}>
            {i.abrir ? (
              <button type="button" className="recursos-do-trecho__item" onClick={i.abrir}>
                <strong>{i.rotulo}</strong>
                <span>{i.detalhe}</span>
              </button>
            ) : (
              <span className="recursos-do-trecho__item">
                <strong>{i.rotulo}</strong>
                <span>{i.detalhe}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// Controles
// ============================================================

function Propriedade({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="linha entre" style={{ fontSize: 13, padding: '5px 0' }}>
      <span className="texto-secundario">{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

function Ajuste({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="botao botao--secundario botao--pequeno"
      style={{ flex: 1 }}
    >
      {children}
    </button>
  );
}

/** Um interruptor com rótulo e ajuda. */
export function Chave({
  rotulo,
  ajuda,
  ligada,
  desabilitada,
  onTrocar,
}: {
  rotulo: string;
  ajuda?: string;
  ligada: boolean;
  desabilitada?: boolean;
  onTrocar: (v: boolean) => void;
}) {
  return (
    <div className="campo">
      <div className="linha entre" style={{ gap: 'var(--e3)' }}>
        <span style={{ fontSize: 14, fontWeight: 600, opacity: desabilitada ? 0.55 : 1 }}>{rotulo}</span>
        <button
          type="button"
          role="switch"
          aria-checked={ligada}
          aria-label={rotulo}
          className="chave"
          disabled={desabilitada}
          onClick={() => onTrocar(!ligada)}
        >
          <span className="chave__bola" aria-hidden />
        </button>
      </div>
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
    </div>
  );
}

/** Botões lado a lado, um escolhido (radiogroup). */
export function Segmentado({
  rotulo,
  valor,
  opcoes,
  onTrocar,
}: {
  rotulo: string;
  valor: string;
  opcoes: ReadonlyArray<readonly [string, string]>;
  onTrocar: (v: string) => void;
}) {
  return (
    <div className="segmentado" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([id, texto]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={valor === id}
          className="segmentado__item"
          onClick={() => valor !== id && onTrocar(id)}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}
