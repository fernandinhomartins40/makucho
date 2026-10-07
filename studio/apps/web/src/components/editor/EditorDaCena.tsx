'use client';

// ============================================================
// O painel da animação, visual (clicar na animação na timeline abre):
//
//   - MODELOS em miniatura: cada cena pronta desenhada de verdade, no
//     estilo do vídeo e com os textos desta cena (ou o exemplo, com o que
//     falta preencher). Tocar troca -- a cena é remontada em segundos;
//   - ELEMENTOS em grade, com o desenho: objetos animados, ícones e
//     rabiscos, nas cores do vídeo. Tocar troca;
//   - TEXTOS e a posição da cena inteira ficam recolhidos: o jeito
//     principal de mexer nas peças é no próprio vídeo (EdicaoNoPalco).
//
// Remontar é no servidor, no MESMO estilo, sem IA. A mesma conta do
// servidor (aplicarEdicaoDaCena) confere antes de mandar.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComposicaoHtml, TextosDaCena } from '@makucho/studio-contracts';
import {
  ASSETS_DE_MOTION,
  CSS_DOS_ASSETS,
  FUNDOS_ATRAS,
  ICONES_SUGERIDOS,
  PRESETS_DE_MOTION,
  PRESETS_EM_VOLTA,
  amostraDoModelo,
  aplicarEdicaoDaCena,
  assetAnimado,
  camposDoPreset,
  cenaDaComposicao,
  comAjuste,
  composicaoDoPreset,
  documentoDaComposicao,
  lerAjuste,
  presetDeMotion,
  temaDaAnimacao,
  type CenaDeMotion,
} from '@makucho/studio-contracts';
import type { OpcoesDeRefazerAnimacao } from './animacoesDaIa';

const NOME_DO_CAMPO: Record<string, string> = {
  kicker: 'Chamada de cima',
  titulo: 'Título',
  detalhe: 'Detalhe',
  numero: 'Número',
  prefixo: 'Antes do número (R$)',
  unidade: 'Depois do número (%, mil)',
  antes: 'Antes',
  depois: 'Depois',
  a: 'Primeiro (A)',
  b: 'Segundo (B)',
  itens: 'Itens (um por linha)',
  valores: 'Valores (um por linha, na ordem dos itens)',
  enfase: 'Palavra em destaque',
};
const LISTAS = new Set(['itens', 'valores', 'icones']);
/** Os campos que se escolhem nas grades (e não se digitam). */
const DAS_GRADES = new Set(['icone', 'icones', 'objeto', 'rabisco', 'fundo']);
const NOME_DO_FUNDO: Record<string, string> = { escuro: 'Escurecer', xadrez: 'Sem fundo', grade: 'Grade' };

type Formulario = Record<string, string>;
const paraFormulario = (t: TextosDaCena | undefined): Formulario => Object.fromEntries(Object.entries(t ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : String(v ?? '')]));
const doFormulario = (f: Formulario): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(f).map(([k, v]) =>
      LISTAS.has(k)
        ? [
            k,
            v
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          ]
        : [k, v.trim()],
    ),
  );

/** Os ícones duotone (o catálogo pesa ~230 KB): carregados só quando a grade de ícones abre. */
let catalogoDeIcones: Promise<Record<string, readonly [string, string]>> | null = null;
function carregarIcones() {
  catalogoDeIcones ??= import('@makucho/studio-contracts/icones-phosphor').then((m) => m.ICONES_PHOSPHOR);
  return catalogoDeIcones;
}

export function EditorDaCena({
  id,
  composicao,
  editar,
  ocupada,
  refazer,
}: {
  id: string;
  composicao: ComposicaoHtml;
  editar: (c: ComposicaoHtml) => void;
  ocupada: boolean;
  refazer: (camadas: string[], o: OpcoesDeRefazerAnimacao) => void;
}) {
  const cena = useMemo(() => cenaDaComposicao(composicao), [composicao]);
  const [form, setForm] = useState<Formulario>(() => paraFormulario(cena?.textos));
  const [pendente, setPendente] = useState<{ preset: string; faltam: string } | null>(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'objetos' | 'icones' | 'rabiscos'>('objetos');
  useEffect(() => {
    setForm(paraFormulario(cena?.textos));
    setPendente(null);
    setErro('');
  }, [composicao.briefing, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tema = temaDaAnimacao(composicao.estilo, composicao.paleta);
  const varsDoTema = tema
    ? ({ '--cor-fundo': tema.fundo, '--cor-texto': tema.texto, '--cor-destaque': tema.destaque, '--cor-destaque-2': tema.destaque2, '--cor-destaque-3': tema.destaque3, '--cor-apagado': tema.apagado } as React.CSSProperties)
    : {};
  if (!cena) return null;

  const preset = pendente?.preset ?? cena.preset;
  const campos = camposDoPreset(preset);
  const usa = (campo: string) => campos.some((c) => c.campo === campo);
  const aplicar = (edicao: { preset?: string; textos?: Record<string, unknown>; atras?: boolean }) => {
    const r = aplicarEdicaoDaCena(cena, edicao);
    if ('erro' in r) {
      setErro(r.erro);
      return false;
    }
    setErro('');
    refazer([id], { cena: edicao });
    return true;
  };
  const trocarModelo = (chave: string, faltam: string | null) => {
    if (chave === cena.preset) return;
    if (!faltam) {
      setPendente(null);
      aplicar({ preset: chave });
      return;
    }
    // Faltam textos que esta cena não tem: os campos abrem para preencher.
    setPendente({ preset: chave, faltam });
    setErro('');
  };
  const elemento = (campo: string, valor: string | string[]) => aplicar({ ...(pendente ? { preset: pendente.preset } : {}), textos: { [campo]: valor } });
  const ajuste = cena.ajuste ?? { x: 0, y: 0, escala: 1 };

  const camposDeTexto = campos.filter((c) => !DAS_GRADES.has(c.campo));
  return (
    <div className="editor-da-cena" style={varsDoTema}>
      <style>{`${CSS_DOS_ASSETS}\n.miniatura-asset .ast .tr { stroke-dashoffset: 0; }\n.miniatura-asset .ast * { opacity: 1 !important; visibility: visible !important; }`}</style>

      <p className="campo__ajuda" style={{ margin: 0 }}>
        Toque nos textos e peças da animação no vídeo para mover, aumentar (pinça ou canto) e editar.
      </p>

      <section aria-label="Modelos da animação">
        <span className="campo__rotulo">Modelo da animação</span>
        <Modelos cena={cena} atual={preset} composicao={composicao} desabilitado={ocupada} onEscolher={trocarModelo} />
      </section>

      {pendente && (
        <p className="aviso aviso--info" role="status" style={{ margin: 0, fontSize: 12 }}>
          Para usar “{presetDeMotion(pendente.preset)?.nome}”, preencha: {pendente.faltam.replace(/^.* sem /, '')}.
        </p>
      )}

      {(
        <section aria-label="Elementos">
          <span className="campo__rotulo">Elemento</span>
          <div className="biblioteca__chips" role="tablist" aria-label="Tipo de elemento">
            {(
              [
                ['objetos', 'Objetos animados'],
                ['icones', 'Ícones'],
                ['rabiscos', 'Rabiscos'],
              ] as const
            ).map(([k, n]) => (
              <button key={k} type="button" role="tab" aria-selected={aba === k} className="biblioteca__chip" onClick={() => setAba(k)}>
                {n}
              </button>
            ))}
          </div>
          {aba === 'objetos' && (
            <>
              {!usa('objeto') && <p className="campo__ajuda">Este modelo não usa objeto: escolher um troca para “Objeto animado”.</p>}
              <div className="grade-de-elementos">
                {ASSETS_DE_MOTION.filter((a) => a.tipo === 'objeto').map((a) => (
                  <button
                    key={a.chave}
                    type="button"
                    className="grade-de-elementos__item"
                    aria-pressed={cena.textos.objeto === a.chave}
                    title={`${a.nome}: ${a.quando}`}
                    disabled={ocupada}
                    onClick={() => (usa('objeto') ? elemento('objeto', a.chave) : aplicar({ preset: 'objeto', textos: { objeto: a.chave, titulo: cena.textos.titulo ?? cena.textos.a ?? cena.textos.depois ?? a.nome } }))}
                  >
                    <Desenho chave={a.chave} />
                    <span>{a.nome}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {aba === 'icones' && <Icones cena={cena} usaIcone={usa('icone')} usaIcones={usa('icones')} desabilitado={ocupada} onEscolher={(v) => (usa('icones') ? elemento('icones', v) : usa('icone') ? elemento('icone', v[0]!) : aplicar({ preset: 'icone', textos: { icone: v[0]!, titulo: cena.textos.titulo ?? 'Título' } }))} />}
          {aba === 'rabiscos' && (
            <div className="grade-de-elementos">
              <button type="button" className="grade-de-elementos__item" aria-pressed={cena.textos.rabisco === 'nenhum'} disabled={ocupada} onClick={() => elemento('rabisco', 'nenhum')}>
                <span className="grade-de-elementos__vazio">∅</span>
                <span>Nenhum</span>
              </button>
              {ASSETS_DE_MOTION.filter((a) => a.tipo === 'rabisco').map((a) => (
                <button key={a.chave} type="button" className="grade-de-elementos__item" aria-pressed={cena.textos.rabisco === a.chave} title={a.quando} disabled={ocupada} onClick={() => elemento('rabisco', a.chave)}>
                  <Desenho chave={a.chave} />
                  <span>{a.nome}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {composicao.layout === 'cartao' && (
        <section aria-label="Atrás da pessoa">
          <div className="biblioteca__chips" role="radiogroup" aria-label="Atrás ou na frente da pessoa">
            {[
              [false, 'Na frente da pessoa'],
              [true, 'Atrás da pessoa'],
            ].map(([v, n]) => (
              <button key={String(v)} type="button" role="radio" aria-checked={!!composicao.atras === v} className="biblioteca__chip" disabled={ocupada} onClick={() => !!composicao.atras !== v && aplicar({ atras: v as boolean })}>
                {n as string}
              </button>
            ))}
          </div>
          {composicao.atras && usa('fundo') && (
            <div className="biblioteca__chips" role="radiogroup" aria-label="Fundo atrás da pessoa">
              {['', ...FUNDOS_ATRAS].map((f) => (
                <button key={f || 'nenhum'} type="button" role="radio" aria-checked={(cena.textos.fundo ?? '') === f} className="biblioteca__chip" disabled={ocupada} onClick={() => elemento('fundo', f)}>
                  {f ? NOME_DO_FUNDO[f] : 'O do vídeo'}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <details className="editor-da-cena__mais" open={!!pendente}>
        <summary>Textos</summary>
        <div className="pilha" style={{ gap: 'var(--e2)', marginTop: 'var(--e2)' }}>
          {camposDeTexto.map(({ campo, obrigatorio }) => (
            <label key={campo} className="campo" style={{ marginBottom: 0 }}>
              <span className="campo__rotulo">
                {NOME_DO_CAMPO[campo] ?? campo}
                {obrigatorio ? ' *' : ''}
              </span>
              {LISTAS.has(campo) ? (
                <textarea className="campo__entrada" rows={3} value={form[campo] ?? ''} disabled={ocupada} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} />
              ) : (
                <input className="campo__entrada" value={form[campo] ?? ''} disabled={ocupada} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} />
              )}
            </label>
          ))}
          <button
            type="button"
            className="botao botao--primario botao--pequeno"
            disabled={ocupada}
            onClick={() => {
              if (aplicar({ ...(pendente ? { preset: pendente.preset } : {}), textos: doFormulario(form) })) setPendente(null);
            }}
          >
            {pendente ? `Usar “${presetDeMotion(pendente.preset)?.nome}”` : 'Salvar os textos'}
          </button>
        </div>
      </details>

      {erro && (
        <p className="aviso aviso--erro" role="alert" style={{ margin: 0, fontSize: 12 }}>
          {erro}
        </p>
      )}

      <details className="editor-da-cena__mais">
        <summary>Cena inteira: posição e tamanho</summary>
        <div className="pilha" style={{ gap: 'var(--e2)', marginTop: 'var(--e2)' }}>
          <Ajuste rotulo="Para os lados" valor={ajuste.x} min={-500} max={500} passo={10} unidade="px" desabilitado={ocupada} onSoltar={(x) => editar(comAjuste(composicao, lerAjuste({ ...ajuste, x })))} />
          <Ajuste rotulo="Para cima e para baixo" valor={ajuste.y} min={-900} max={900} passo={10} unidade="px" desabilitado={ocupada} onSoltar={(y) => editar(comAjuste(composicao, lerAjuste({ ...ajuste, y })))} />
          <Ajuste rotulo="Tamanho" valor={Math.round(ajuste.escala * 100)} min={40} max={200} passo={5} unidade="%" desabilitado={ocupada} onSoltar={(v) => editar(comAjuste(composicao, lerAjuste({ ...ajuste, escala: v / 100 })))} />
          {cena.ajuste && (
            <button type="button" className="botao-link" disabled={ocupada} onClick={() => editar(comAjuste(composicao, undefined))}>
              Voltar tudo ao lugar e tamanho originais
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

/** As miniaturas dos modelos: cada uma é a cena de verdade (num iframe pequeno, carregado quando aparece). */
function Modelos({ cena, atual, composicao, desabilitado, onEscolher }: { cena: CenaDeMotion; atual: string; composicao: ComposicaoHtml; desabilitado: boolean; onEscolher: (preset: string, faltam: string | null) => void }) {
  const lista = [...PRESETS_DE_MOTION.filter((p) => PRESETS_EM_VOLTA.has(p.chave)), ...PRESETS_DE_MOTION.filter((p) => !PRESETS_EM_VOLTA.has(p.chave) && (!p.interno || p.chave === cena.preset))];
  const faixa = useRef<HTMLDivElement>(null);
  // A roda do mouse comum rola a faixa para o lado (ouvinte nativo: precisa impedir a rolagem do painel).
  useEffect(() => {
    const el = faixa.current;
    if (!el) return;
    const rolar = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.ctrlKey) return;
      const fim = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= fim - 1)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', rolar, { passive: false });
    return () => el.removeEventListener('wheel', rolar);
  }, []);
  // A marcada fica à vista quando o painel abre.
  useEffect(() => {
    const el = faixa.current;
    const marcada = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el && marcada) el.scrollLeft = Math.max(0, marcada.offsetLeft - (el.clientWidth - marcada.offsetWidth) / 2);
  }, [atual]);
  return (
    <div ref={faixa} className="modelos-da-cena" role="radiogroup" aria-label="Modelos">
      {lista.map((p) => (
        <Miniatura key={p.chave} cena={cena} preset={p.chave} nome={p.nome} marcada={p.chave === atual} composicao={composicao} desabilitado={desabilitado} onEscolher={onEscolher} />
      ))}
    </div>
  );
}

function Miniatura({ cena, preset, nome, marcada, composicao, desabilitado, onEscolher }: { cena: CenaDeMotion; preset: string; nome: string; marcada: boolean; composicao: ComposicaoHtml; desabilitado: boolean; onEscolher: (preset: string, faltam: string | null) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisivel(true), { rootMargin: '120px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const amostra = useMemo(() => amostraDoModelo(cena, preset), [cena, preset]);
  const doc = useMemo(() => {
    if (!visivel) return '';
    const origem = window.location.origin;
    // A cena como ficaria: o modelo no visual e nas cores deste vídeo (o ajuste da cena atual não entra).
    const c = composicaoDoPreset(amostra.cena, composicao.estilo ?? 'mg-keynote', 4, [], composicao.paleta ? { paleta: composicao.paleta } : {});
    return documentoDaComposicao(c, { duracaoMs: 4000, gsap: `${origem}/hyperframes/gsap.min.js`, fontes: `${origem}/fonts/`, origens: origem, previa: true });
  }, [visivel, amostra, composicao.estilo, composicao.paleta]);
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={marcada}
      className="modelos-da-cena__item"
      title={`${nome}${amostra.faltam ? ` (precisa de: ${amostra.faltam.replace(/^.* sem /, '')})` : ''}`}
      disabled={desabilitado}
      onClick={() => onEscolher(preset, amostra.faltam)}
    >
      <span className="modelos-da-cena__quadro" aria-hidden>
        {doc && <iframe ref={quadro} title={nome} sandbox="allow-scripts" srcDoc={doc} tabIndex={-1} onLoad={() => quadro.current?.contentWindow?.postMessage({ hfT: 2.6 }, '*')} />}
      </span>
      <span className="modelos-da-cena__nome">{nome}</span>
      {amostra.faltam && <span className="modelos-da-cena__falta">+ texto</span>}
    </button>
  );
}

/** Um asset desenhado parado (objeto ou rabisco), nas cores do vídeo. */
function Desenho({ chave }: { chave: string }) {
  const html = useMemo(() => assetAnimado(chave, `mini-${chave}`, 0, 'ast').html, [chave]);
  return <span className="miniatura-asset" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A grade dos ícones (duotone, nas cores do vídeo). Nos modelos com um ícone por item, toque na ordem dos itens. */
function Icones({ cena, usaIcone, usaIcones, desabilitado, onEscolher }: { cena: CenaDeMotion; usaIcone: boolean; usaIcones: boolean; desabilitado: boolean; onEscolher: (v: string[]) => void }) {
  const [catalogo, setCatalogo] = useState<Record<string, readonly [string, string]> | null>(null);
  const [fila, setFila] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    void carregarIcones().then((c) => vivo && setCatalogo(c));
    return () => {
      vivo = false;
    };
  }, []);
  const itens = cena.textos.itens?.length ?? (cena.preset === 'ladeando' ? 2 : 0);
  if (!catalogo) return <p className="campo__ajuda">Carregando os ícones…</p>;
  return (
    <>
      {usaIcones && (
        <p className="campo__ajuda">
          Toque um ícone para cada item, na ordem ({fila.length}/{itens || '?'}).{' '}
          {fila.length > 0 && (
            <button type="button" className="botao-link" onClick={() => setFila([])}>
              Recomeçar
            </button>
          )}
        </p>
      )}
      {!usaIcone && !usaIcones && <p className="campo__ajuda">Este modelo não usa ícone: escolher um troca para “Ícone grande”.</p>}
      <div className="grade-de-elementos grade-de-elementos--icones">
        {ICONES_SUGERIDOS.filter((n) => catalogo[n]).map((n) => {
          const [fundo, linha] = catalogo[n]!;
          const marcado = cena.textos.icone === n || cena.textos.icones?.includes(n);
          return (
            <button
              key={n}
              type="button"
              className="grade-de-elementos__item"
              aria-pressed={marcado}
              title={n}
              disabled={desabilitado}
              onClick={() => {
                if (!usaIcones) return onEscolher([n]);
                const nova = [...fila, n];
                setFila(nova);
                if (!itens || nova.length >= itens) {
                  onEscolher(nova);
                  setFila([]);
                }
              }}
            >
              <svg viewBox="0 0 256 256" aria-hidden>
                {fundo && <path d={fundo} fill="var(--cor-destaque)" opacity={0.9} />}
                <path d={linha} fill="var(--cor-texto)" />
              </svg>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Um deslizante que aplica ao soltar. */
function Ajuste({ rotulo, valor, min, max, passo, unidade, desabilitado, onSoltar }: { rotulo: string; valor: number; min: number; max: number; passo: number; unidade: string; desabilitado: boolean; onSoltar: (v: number) => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <label className="campo" style={{ marginBottom: 0 }}>
      <span className="campo__rotulo" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{rotulo}</span>
        <span>
          {v}
          {unidade}
        </span>
      </span>
      <input type="range" min={min} max={max} step={passo} value={v} disabled={desabilitado} aria-label={rotulo} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => v !== valor && onSoltar(v)} onKeyUp={() => v !== valor && onSoltar(v)} />
    </label>
  );
}
