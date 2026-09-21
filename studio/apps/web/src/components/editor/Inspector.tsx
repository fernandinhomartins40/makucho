'use client';

// ============================================================
// Inspector — "Propriedades", à direita do editor.
//
// Duas abas: Vídeo (formato, fps, aprimoramento) e Legendas
// (estilo, cor, intensidade). Com um trecho selecionado, ele assume
// o lugar e mostra as propriedades dele — é aqui que o usuário
// discorda da IA.
//
// "Remover" desativa em vez de apagar: a seção 13 do contexto mestre
// exige poder restaurar um trecho descartado.
// ============================================================

import { useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { nomeDaFuncao, corDaFuncao, tempo } from './funcoes';
import {
  IconeIA,
  IconeAviso,
  IconeLixeira,
  IconeAvancar,
  IconeVoltar,
  IconeConfiguracoes,
} from '../icones';

type AbaDoInspector = 'video' | 'legendas';

/**
 * Estilos de legenda.
 *
 * A amostra mostra a aparência real de cada um, não o nome: quem
 * escolhe legenda escolhe pelo olho.
 */
const ESTILOS = [
  { id: 'padrao', rotulo: 'Padrão', amostra: { color: '#ff4d8f', fontWeight: 800 } },
  { id: 'minimal', rotulo: 'Minimal', amostra: { color: '#f7faff', fontWeight: 400 } },
  {
    id: 'destaque',
    rotulo: 'Destaque',
    amostra: { color: '#06132d', fontWeight: 800, background: '#ffd43b', padding: '1px 7px' },
  },
  {
    id: 'caixa',
    rotulo: 'Caixa',
    amostra: { color: '#06132d', fontWeight: 600, background: '#f7faff', padding: '1px 7px' },
  },
  { id: 'karaoke', rotulo: 'Karaokê', amostra: { color: '#ff4d8f', fontWeight: 700, fontSize: 13 } },
] as const;

const NOME_DO_FRAMEWORK: Record<string, string> = {
  authority_education: 'Autoridade educacional',
  viral_education: 'Viral educativo',
  storytelling: 'Storytelling',
  pas: 'Problema → Agitação → Solução',
  sales: 'Venda',
};

interface Props {
  plan: EditPlanV1;
  clipId: string | null;
  onOperacao: (op: TimelineOperation) => void;
}

export function Inspector({ plan, clipId, onOperacao }: Props) {
  const [aba, setAba] = useState<AbaDoInspector>('video');
  const [aprimoramento, setAprimoramento] = useState(true);
  const [intensidade, setIntensidade] = useState(100);

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
        {clipe ? (
          <PropriedadesDoTrecho plan={plan} clipe={clipe} onOperacao={onOperacao} />
        ) : (
          <>
            <div className="abas" role="tablist">
              <button
                role="tab"
                type="button"
                className="abas__item"
                aria-selected={aba === 'video'}
                onClick={() => setAba('video')}
              >
                Vídeo
              </button>
              <button
                role="tab"
                type="button"
                className="abas__item"
                aria-selected={aba === 'legendas'}
                onClick={() => setAba('legendas')}
              >
                Legendas
              </button>
            </div>

            {aba === 'video' ? (
              <AbaDeVideo
                plan={plan}
                aprimoramento={aprimoramento}
                onAprimoramento={setAprimoramento}
              />
            ) : (
              <AbaDeLegendas
                plan={plan}
                intensidade={intensidade}
                onIntensidade={setIntensidade}
                onOperacao={onOperacao}
              />
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
  aprimoramento,
  onAprimoramento,
}: {
  plan: EditPlanV1;
  aprimoramento: boolean;
  onAprimoramento: (v: boolean) => void;
}) {
  const duracao = plan.clips.reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0);
  const reducao = Math.round((1 - duracao / plan.sourceDurationMs) * 100);

  return (
    <>
      <div className="campo">
        <span className="campo__rotulo">Formato</span>
        <select className="campo__selecao" defaultValue="9:16">
          <option value="9:16">1080 × 1920 (9:16)</option>
        </select>
        <p className="campo__ajuda">Ideal para Reels, TikTok e Shorts.</p>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Taxa de quadros</span>
        <select className="campo__selecao" defaultValue="30">
          <option value="24">24 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </div>

      <div className="separador" />

      <Propriedade rotulo="Duração" valor={`${(duracao / 1000).toFixed(1)}s`} />
      <Propriedade
        rotulo="Gravação original"
        valor={`${Math.round(plan.sourceDurationMs / 60_000)} min`}
      />
      <Propriedade rotulo="Redução" valor={`${reducao}%`} />
      <Propriedade rotulo="Trechos" valor={String(plan.clips.length)} />
      <Propriedade
        rotulo="Estrutura"
        valor={NOME_DO_FRAMEWORK[plan.framework] ?? plan.framework}
      />

      <div className="separador" />

      {/* O aprimoramento diz exatamente o que faz. "Melhorar com IA"
          sem dizer o quê deixa a pessoa sem saber o que mudou no
          vídeo dela. */}
      <div className="linha entre" style={{ gap: 'var(--e3)' }}>
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeIA size={17} weight="fill" color="var(--accent)" />
          <strong style={{ fontSize: 14 }}>Aprimoramento com IA</strong>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={aprimoramento}
          aria-label="Aprimoramento com IA"
          className="chave"
          onClick={() => onAprimoramento(!aprimoramento)}
        >
          <span className="chave__bola" aria-hidden />
        </button>
      </div>
      <p className="campo__ajuda">
        Melhora cortes, remove silêncios e gera legendas automaticamente.
      </p>
    </>
  );
}

// ============================================================
// Aba Legendas
// ============================================================

function AbaDeLegendas({
  plan,
  intensidade,
  onIntensidade,
  onOperacao,
}: {
  plan: EditPlanV1;
  intensidade: number;
  onIntensidade: (v: number) => void;
  onOperacao: (op: TimelineOperation) => void;
}) {
  return (
    <>
      <div className="campo">
        <span className="campo__rotulo">Estilo das legendas</span>
        <div className="estilos" role="radiogroup" aria-label="Estilo das legendas">
          {ESTILOS.map((estilo) => (
            <button
              key={estilo.id}
              type="button"
              role="radio"
              aria-checked={plan.captions.styleId === estilo.id}
              className="estilo"
              onClick={() => onOperacao({ op: 'trocar_estilo_legenda', styleId: estilo.id })}
            >
              <span className="estilo__amostra">
                <span style={{ borderRadius: 3, ...estilo.amostra }}>
                  {estilo.id === 'karaoke' ? 'Karaokê' : 'Aa'}
                </span>
              </span>
              <span className="estilo__rotulo">{estilo.rotulo}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Cor da marca</span>
        <div className="campo__cor">
          <span aria-hidden className="campo__amostra" style={{ background: '#3dd6d0' }} />
          <input
            type="text"
            className="campo__entrada"
            defaultValue="#3DD6D0"
            aria-label="Cor da marca em hexadecimal"
          />
        </div>
        <p className="campo__ajuda">Usada na palavra em destaque de cada bloco.</p>
      </div>

      <div className="campo">
        <div className="linha entre">
          <span className="campo__rotulo" style={{ marginBottom: 0 }}>
            Intensidade das legendas
          </span>
          <span className="texto-secundario" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {intensidade}%
          </span>
        </div>
        <input
          type="range"
          className="deslizante"
          min={0}
          max={100}
          value={intensidade}
          aria-label="Intensidade das legendas"
          onChange={(e) => onIntensidade(Number(e.target.value))}
        />
      </div>

      <div className="campo">
        <span className="campo__rotulo">Palavras por bloco</span>
        <select
          className="campo__selecao"
          defaultValue={String(plan.captions.wordsPerBlock)}
        >
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} palavras
            </option>
          ))}
        </select>
        <p className="campo__ajuda">Cada palavra acende no instante em que é falada.</p>
      </div>
    </>
  );
}

// ============================================================
// Propriedades do trecho selecionado
// ============================================================

function PropriedadesDoTrecho({
  plan,
  clipe,
  onOperacao,
}: {
  plan: EditPlanV1;
  clipe: EditPlanV1['clips'][number];
  onOperacao: (op: TimelineOperation) => void;
}) {
  const duracaoMs = clipe.sourceEndMs - clipe.sourceStartMs;
  const posicao = plan.clips.findIndex((c) => c.id === clipe.id);
  const ultimo = plan.clips.length === 1;

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
        <span
          className="rotulo-secao linha"
          style={{ gap: 'var(--e1)', marginBottom: 'var(--e2)' }}
        >
          <IconeIA size={12} weight="fill" color="var(--accent)" />
          Por que este trecho
        </span>
        <p style={{ fontSize: 13, lineHeight: 1.45 }}>{clipe.reason}</p>
      </div>

      {clipe.semanticRisk === 'high' && (
        <div className="aviso aviso--atencao" style={{ marginBottom: 'var(--e4)' }}>
          <IconeAviso size={16} />
          <span>Fora do contexto original, este trecho pode mudar de sentido.</span>
        </div>
      )}

      <Propriedade rotulo="Duração" valor={`${(duracaoMs / 1000).toFixed(1)}s`} />
      <Propriedade
        rotulo="No original"
        valor={`${tempo(clipe.sourceStartMs)} – ${tempo(clipe.sourceEndMs)}`}
      />

      <div className="campo" style={{ marginTop: 'var(--e4)' }}>
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
          <Ajuste
            disabled={posicao === plan.clips.length - 1}
            onClick={() => trocarCom(posicao + 1)}
          >
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
