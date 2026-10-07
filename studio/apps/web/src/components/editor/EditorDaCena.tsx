'use client';

// ============================================================
// Editar a cena de motion (clicar na animação na timeline abre isto):
//
//   - o MODELO da animação (qualquer cena pronta, no estilo do vídeo);
//   - os TEXTOS do modelo (os campos que ele usa, os obrigatórios marcados);
//   - o ELEMENTO: objeto animado, ícone, rabisco à mão, fundo atrás;
//   - atrás ou na frente da pessoa;
//   - POSIÇÃO e TAMANHO, na hora (sem remontar).
//
// Salvar remonta a cena no servidor, no mesmo visual (segundos, sem IA).
// A mesma conta do servidor (aplicarEdicaoDaCena) confere antes de mandar:
// faltou um campo obrigatório, o aviso aparece aqui, na hora.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import type { ComposicaoHtml, TextosDaCena } from '@makucho/studio-contracts';
import {
  ASSETS_DE_MOTION,
  FUNDOS_ATRAS,
  ICONES_DE_MOTION,
  ICONES_SUGERIDOS,
  PRESETS_DE_MOTION,
  PRESETS_EM_VOLTA,
  aplicarEdicaoDaCena,
  camposDoPreset,
  cenaDaComposicao,
  comAjuste,
  lerAjuste,
  presetDeMotion,
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
  icone: 'Ícone',
  icones: 'Ícones (um por linha, na ordem dos itens)',
  objeto: 'Objeto animado',
  rabisco: 'Rabisco à mão',
  fundo: 'Fundo atrás da pessoa',
};
const LISTAS = new Set(['itens', 'valores', 'icones']);
const NOME_DO_FUNDO: Record<string, string> = { escuro: 'Escurecer o ambiente', xadrez: 'Sem fundo (xadrez)', grade: 'Grade (blueprint)' };

type Formulario = Record<string, string>;

const paraFormulario = (t: TextosDaCena | undefined): Formulario =>
  Object.fromEntries(Object.entries(t ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : String(v ?? '')]));

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
  const [preset, setPreset] = useState(cena?.preset ?? '');
  const [form, setForm] = useState<Formulario>(() => paraFormulario(cena?.textos));
  const [atras, setAtras] = useState<boolean | undefined>(cena?.atras);
  const [erro, setErro] = useState('');
  // Remontada (ou outra animação selecionada): o formulário volta ao que está no vídeo.
  useEffect(() => {
    setPreset(cena?.preset ?? '');
    setForm(paraFormulario(cena?.textos));
    setAtras(cena?.atras);
    setErro('');
  }, [composicao.briefing, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cena) return null;
  const campos = camposDoPreset(preset);
  // O rabisco vale para qualquer cena (o enfeite à mão por cima).
  const todos = campos.some((c) => c.campo === 'rabisco') ? campos : [...campos, { campo: 'rabisco' as const, obrigatorio: false }];
  const ajuste = cena.ajuste ?? { x: 0, y: 0, escala: 1 };
  const mudouAlgo = preset !== cena.preset || atras !== cena.atras || JSON.stringify(doFormulario(form)) !== JSON.stringify(doFormulario(paraFormulario(cena.textos)));
  const ajustar = (a: Partial<typeof ajuste>) => editar(comAjuste(composicao, lerAjuste({ ...ajuste, ...a })));
  const objetos = ASSETS_DE_MOTION.filter((a) => a.tipo === 'objeto');
  const rabiscos = ASSETS_DE_MOTION.filter((a) => a.tipo === 'rabisco');

  const salvar = () => {
    const edicao = { preset, textos: doFormulario(form), ...(atras !== undefined ? { atras } : {}) };
    const r = aplicarEdicaoDaCena(cena, edicao);
    if ('erro' in r) {
      setErro(r.erro);
      return;
    }
    setErro('');
    refazer([id], { cena: edicao });
  };

  const entrada = (campo: string, obrigatorio: boolean) => {
    const rotulo = `${NOME_DO_CAMPO[campo] ?? campo}${obrigatorio ? ' *' : ''}`;
    const valor = form[campo] ?? '';
    const mudar = (v: string) => setForm((f) => ({ ...f, [campo]: v }));
    const idDoCampo = `cena-${id}-${campo}`;
    if (campo === 'objeto' || campo === 'rabisco' || campo === 'fundo') {
      const opcoes = campo === 'objeto' ? objetos.map((o) => [o.chave, o.nome]) : campo === 'rabisco' ? [['nenhum', 'Nenhum (tira o enfeite)'], ...rabiscos.map((o) => [o.chave, o.nome])] : FUNDOS_ATRAS.map((f) => [f, NOME_DO_FUNDO[f] ?? f]);
      return (
        <label key={campo} className="campo" style={{ marginBottom: 0 }} htmlFor={idDoCampo}>
          <span className="campo__rotulo">{rotulo}</span>
          <select id={idDoCampo} className="campo__entrada" value={valor} disabled={ocupada} onChange={(e) => mudar(e.target.value)}>
            <option value="">{campo === 'rabisco' ? 'O do estilo' : campo === 'fundo' ? 'O do vídeo' : 'Nenhum'}</option>
            {opcoes.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
      );
    }
    const lista = LISTAS.has(campo);
    const comIcones = campo === 'icone' || campo === 'icones';
    return (
      <label key={campo} className="campo" style={{ marginBottom: 0 }} htmlFor={idDoCampo}>
        <span className="campo__rotulo">{rotulo}</span>
        {lista ? (
          <textarea id={idDoCampo} className="campo__entrada" rows={3} value={valor} disabled={ocupada} onChange={(e) => mudar(e.target.value)} />
        ) : (
          <input id={idDoCampo} className="campo__entrada" value={valor} disabled={ocupada} list={comIcones ? 'icones-da-cena' : undefined} onChange={(e) => mudar(e.target.value)} />
        )}
        {comIcones && <span className="campo__ajuda">Nomes em inglês do catálogo (ex.: rocket-launch, coins, robot). Nome que não existe cai no ícone padrão.</span>}
      </label>
    );
  };

  const doModelo = presetDeMotion(preset);
  return (
    <div className="campo" style={{ marginBottom: 0 }}>
      <span className="campo__rotulo">Editar a cena</span>
      <div className="pilha" style={{ gap: 'var(--e3)' }}>
        <label className="campo" style={{ marginBottom: 0 }} htmlFor={`cena-${id}-modelo`}>
          <span className="campo__rotulo">Modelo da animação</span>
          <select id={`cena-${id}-modelo`} className="campo__entrada" value={preset} disabled={ocupada} onChange={(e) => setPreset(e.target.value)}>
            <optgroup label="Em volta da pessoa">
              {PRESETS_DE_MOTION.filter((p) => PRESETS_EM_VOLTA.has(p.chave)).map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
            <optgroup label="Cenas">
              {PRESETS_DE_MOTION.filter((p) => !PRESETS_EM_VOLTA.has(p.chave) && (!p.interno || p.chave === cena.preset)).map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
          </select>
          {doModelo && <span className="campo__ajuda">Quando usar: {doModelo.quando}.</span>}
        </label>

        {todos.map((c) => entrada(c.campo, c.obrigatorio))}
        <datalist id="icones-da-cena">
          {[...new Set([...ICONES_SUGERIDOS, ...ICONES_DE_MOTION])].map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>

        {composicao.layout === 'cartao' && (
          <label className="biblioteca__opcao">
            <input type="checkbox" checked={atras ?? !!composicao.atras} disabled={ocupada} onChange={(e) => setAtras(e.target.checked)} /> Atrás da pessoa
          </label>
        )}

        {erro && (
          <p className="aviso aviso--erro" role="alert" style={{ margin: 0, fontSize: 12 }}>
            {erro}
          </p>
        )}
        <button type="button" className="botao botao--primario botao--pequeno" disabled={ocupada || !mudouAlgo} onClick={salvar}>
          Salvar e refazer a animação
        </button>
        <p className="campo__ajuda" style={{ margin: 0 }}>
          A cena é remontada no estilo do vídeo, em segundos.
        </p>

        <span className="campo__rotulo" style={{ marginTop: 'var(--e2)' }}>
          Posição e tamanho
        </span>
        <Ajuste rotulo="Para os lados" valor={ajuste.x} min={-500} max={500} passo={10} unidade="px" desabilitado={ocupada} onSoltar={(x) => ajustar({ x })} />
        <Ajuste rotulo="Para cima e para baixo" valor={ajuste.y} min={-900} max={900} passo={10} unidade="px" desabilitado={ocupada} onSoltar={(y) => ajustar({ y })} />
        <Ajuste rotulo="Tamanho" valor={Math.round(ajuste.escala * 100)} min={40} max={200} passo={5} unidade="%" desabilitado={ocupada} onSoltar={(v) => ajustar({ escala: v / 100 })} />
        {(ajuste.x !== 0 || ajuste.y !== 0 || ajuste.escala !== 1) && (
          <button type="button" className="botao-link" disabled={ocupada} onClick={() => editar(comAjuste(composicao, undefined))}>
            Voltar ao lugar e tamanho originais
          </button>
        )}
      </div>
    </div>
  );
}

/** Um deslizante que aplica ao soltar (cada mudança refaz a prévia da animação). */
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
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={v}
        disabled={desabilitado}
        aria-label={rotulo}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== valor && onSoltar(v)}
        onKeyUp={() => v !== valor && onSoltar(v)}
      />
    </label>
  );
}
