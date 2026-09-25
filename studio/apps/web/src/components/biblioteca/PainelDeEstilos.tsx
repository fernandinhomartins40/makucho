'use client';

// ============================================================
// Pacotes de estilo: um clique aplica legenda, transições, zoom, cor,
// efeitos e sons -- cada um vira item separado, que se desfaz (Ctrl+Z)
// ou se ajusta depois. "Salvar o estilo deste vídeo" guarda os
// ingredientes no Kit de marca, para os próximos vídeos.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import type { EditPlanV1, PacoteSalvo, TimelineOperation } from '@makucho/studio-contracts';
import { CORES_PADRAO_DA_MARCA, PACOTES_DE_ESTILO, ingredientesDoPlano, operacoesDoPacote, palavrasNaTimeline } from '@makucho/studio-contracts';
import { marca as apiMarca, type PerfilDeMarca, type Transcricao } from '../../lib/api';

interface Props {
  plan: EditPlanV1;
  onOperacoes: (ops: TimelineOperation[]) => void;
  transcricao?: Transcricao | null;
  /** O pacote que combina com o vídeo (pelo que a IA entendeu dele). */
  recomendado?: string;
}

export function PainelDeEstilos({ plan, onOperacoes, transcricao, recomendado }: Props) {
  const [perfil, setPerfil] = useState<PerfilDeMarca | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const fala = useMemo(() => palavrasNaTimeline(plan, transcricao?.segmentos.flatMap((s) => s.palavras) ?? []), [plan, transcricao]);

  useEffect(() => {
    apiMarca
      .obter()
      .then(setPerfil)
      .catch(() => setPerfil(null));
  }, []);
  const salvos = perfil?.videoDefaults?.estilosSalvos ?? [];

  const aplicar = (p: PacoteSalvo) => {
    const ops = operacoesDoPacote(plan, p.ingredientes, fala);
    onOperacoes(ops);
    setAviso({ tom: 'ok', texto: `“${p.rotulo}” aplicado: ${ops.length} ajustes, cada um editável na timeline. Ctrl+Z desfaz tudo de uma vez.` });
  };

  const gravar = async (lista: PacoteSalvo[], texto: string) => {
    setSalvando(true);
    setAviso(null);
    try {
      const salvo = await apiMarca.salvar({
        name: perfil?.name ?? 'Minha marca',
        colors: perfil?.colors ?? CORES_PADRAO_DA_MARCA,
        ...(perfil?.fontPrimary ? { fontPrimary: perfil.fontPrimary } : {}),
        ...(perfil?.fontSecond ? { fontSecond: perfil.fontSecond } : {}),
        videoDefaults: { ...(perfil?.videoDefaults ?? {}), estilosSalvos: lista },
      });
      setPerfil(salvo);
      setAviso({ tom: 'ok', texto });
    } catch (e) {
      setAviso({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar o estilo.' });
    } finally {
      setSalvando(false);
    }
  };

  const salvarAtual = () => {
    const rotulo = nome.trim().slice(0, 40);
    if (!rotulo) return;
    const novo: PacoteSalvo = { id: `meu${Date.now().toString(36)}`, rotulo, ingredientes: ingredientesDoPlano(plan) };
    void gravar([...salvos.filter((s) => s.rotulo !== rotulo), novo].slice(-12), `Estilo “${rotulo}” salvo no Kit de marca.`).then(() => setNome(''));
  };

  const cartao = (p: PacoteSalvo & { descricao?: string }, meu: boolean) => (
    <div key={p.id} className="pacote-cartao" data-recomendado={p.id === recomendado || undefined}>
      <div className="linha entre" style={{ gap: 6 }}>
        <strong>{p.rotulo}</strong>
        {p.id === recomendado && <span className="demo-cartao__selo">recomendado</span>}
      </div>
      {p.descricao && <p className="pacote-cartao__texto">{p.descricao}</p>}
      <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="botao botao--primario botao--pequeno" onClick={() => aplicar(p)}>
          Aplicar
        </button>
        {meu && (
          <button
            type="button"
            className="botao botao--fantasma botao--pequeno"
            disabled={salvando}
            onClick={() => void gravar(salvos.filter((s) => s.id !== p.id), `Estilo “${p.rotulo}” removido.`)}
          >
            Remover
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <p className="biblioteca__alvo">
        Um estilo aplica legenda, transições, zoom, cor, efeitos e sons de uma vez. Tudo vira item separado: dá para ajustar ou tirar cada
        um depois.
      </p>
      {aviso && (
        <p className={aviso.tom === 'erro' ? 'campo__erro' : 'biblioteca__alvo'} role="status">
          {aviso.texto}
        </p>
      )}
      <div className="grade-de-pacotes">{PACOTES_DE_ESTILO.map((p) => cartao(p, false))}</div>

      <h3 className="biblioteca__subtitulo">Meus estilos</h3>
      {perfil === undefined ? (
        <p className="texto-secundario">Carregando…</p>
      ) : salvos.length ? (
        <div className="grade-de-pacotes">{salvos.map((p) => cartao(p, true))}</div>
      ) : (
        <p className="texto-secundario" style={{ fontSize: 13 }}>
          Nenhum ainda. Deixe este vídeo do seu jeito e salve o estilo para usar nos próximos.
        </p>
      )}
      <form
        className="linha"
        style={{ gap: 6, marginTop: 'var(--e2)' }}
        onSubmit={(e) => {
          e.preventDefault();
          salvarAtual();
        }}
      >
        <input className="campo__entrada crescer" placeholder="Nome do estilo (ex.: Meu podcast)" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} aria-label="Nome do estilo" />
        <button type="submit" className="botao botao--secundario" disabled={salvando || !nome.trim()}>
          {salvando ? 'Salvando…' : 'Salvar o estilo deste vídeo'}
        </button>
      </form>
    </>
  );
}
