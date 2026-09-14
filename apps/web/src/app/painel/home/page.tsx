'use client';

import { useEffect, useState } from 'react';
import type { HomepageSectionDto, HomepageSectionType } from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
  Alternador,
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Modal,
  Selecao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

/** Cada tipo explica o que renderiza, para a escolha não ser adivinhação. */
const TIPOS: Record<HomepageSectionType, { rotulo: string; descricao: string }> = {
  HERO: { rotulo: 'Destaque principal', descricao: 'O bloco grande do topo, com a manchete.' },
  LATEST_POSTS: { rotulo: 'Últimas publicações', descricao: 'Os artigos mais recentes.' },
  TRENDING: { rotulo: 'Em alta', descricao: 'Artigos marcados como “em alta”.' },
  VIDEOS: { rotulo: 'Vídeos', descricao: 'Grade com os vídeos publicados.' },
  CATEGORIES: { rotulo: 'Editorias', descricao: 'Atalhos para as categorias.' },
  MOST_READ: { rotulo: 'Mais lidas', descricao: 'Ranking por número de leituras.' },
  NEWSLETTER: { rotulo: 'Newsletter', descricao: 'Formulário de inscrição.' },
  AD_SLOT: { rotulo: 'Espaço de anúncio', descricao: 'Faixa publicitária.' },
  CUSTOM_POSTS: { rotulo: 'Seleção manual', descricao: 'Artigos escolhidos a dedo.' },
};

interface Formulario {
  id?: string;
  type: HomepageSectionType;
  title: string;
  subtitle: string;
  isVisible: boolean;
  limite: string;
}

function Home() {
  const recado = useRecado();
  const [secoes, setSecoes] = useState<HomepageSectionDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<HomepageSectionDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      const s = await painel.secoesHome();
      setSecoes([...s].sort((a, b) => a.position - b.position));
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar as seções.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= secoes.length) return;

    const atual = secoes[indice];
    const outro = secoes[destino];
    if (!atual || !outro) return;

    const novas = [...secoes];
    novas[indice] = outro;
    novas[destino] = atual;
    setSecoes(novas);

    try {
      await painel.reordenarSecoes(novas.map((s, i) => ({ id: s.id, position: i })));
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível reordenar.');
      void carregar();
    }
  }

  /** A visibilidade é o botão mais usado: alterna direto na lista. */
  async function alternarVisivel(s: HomepageSectionDto) {
    setSecoes((atuais) =>
      atuais.map((x) => (x.id === s.id ? { ...x, isVisible: !x.isVisible } : x)),
    );
    try {
      await painel.atualizarSecao(s.id, { isVisible: !s.isVisible });
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
      void carregar();
    }
  }

  function abrir(s?: HomepageSectionDto) {
    setErro('');
    setForm(
      s
        ? {
            id: s.id,
            type: s.type,
            title: s.title ?? '',
            subtitle: s.subtitle ?? '',
            isVisible: s.isVisible,
            limite: String((s.config?.limit as number) ?? ''),
          }
        : {
            type: 'LATEST_POSTS',
            title: '',
            subtitle: '',
            isVisible: true,
            limite: '',
          },
    );
  }

  async function salvar() {
    if (!form) return;
    setErro('');
    setSalvando(true);

    try {
      const limite = Number(form.limite);
      const corpo = {
        type: form.type,
        title: form.title.trim() || null,
        subtitle: form.subtitle.trim() || null,
        isVisible: form.isVisible,
        config: Number.isFinite(limite) && limite > 0 ? { limit: limite } : null,
        position: form.id
          ? secoes.find((s) => s.id === form.id)?.position ?? 0
          : secoes.length,
      };

      if (form.id) await painel.atualizarSecao(form.id, corpo);
      else await painel.criarSecao(corpo);

      recado.ok(form.id ? 'Seção atualizada.' : 'Seção criada.');
      setForm(null);
      void carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Montagem da home"
        descricao="A ordem destas seções é a ordem da página inicial do site."
        acoes={
          <>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Botao variante="fantasma">Ver a home</Botao>
            </a>
            <Botao variante="primario" onClick={() => abrir()}>
              + Nova seção
            </Botao>
          </>
        }
      />

      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : secoes.length === 0 ? (
          <Vazio
            titulo="Nenhuma seção"
            descricao="Monte a home adicionando as seções na ordem que quiser."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Nova seção
              </Botao>
            }
          />
        ) : (
          <ul className="pn-secoes">
            {secoes.map((s, i) => (
              <li key={s.id} className={s.isVisible ? '' : 'pn-secao-oculta'}>
                <div className="pn-secao-ordem">
                  <button
                    type="button"
                    className="pn-mover"
                    onClick={() => void mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Mover para cima"
                  >
                    ↑
                  </button>
                  <span>{i + 1}</span>
                  <button
                    type="button"
                    className="pn-mover"
                    onClick={() => void mover(i, 1)}
                    disabled={i === secoes.length - 1}
                    aria-label="Mover para baixo"
                  >
                    ↓
                  </button>
                </div>

                <div className="pn-secao-corpo">
                  <strong>{s.title || TIPOS[s.type].rotulo}</strong>
                  <small>
                    {TIPOS[s.type].descricao}
                    {s.config?.limit ? ` · ${String(s.config.limit)} itens` : ''}
                  </small>
                </div>

                <div className="pn-acoes">
                  <Botao variante="fantasma" onClick={() => void alternarVisivel(s)}>
                    {s.isVisible ? 'Ocultar' : 'Mostrar'}
                  </Botao>
                  <Botao variante="fantasma" onClick={() => abrir(s)}>
                    Editar
                  </Botao>
                  <Botao variante="fantasma" onClick={() => setExcluir(s)}>
                    Excluir
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        titulo={form?.id ? 'Editar seção' : 'Nova seção'}
        aberto={form !== null}
        aoFechar={() => setForm(null)}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setForm(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>
              Salvar
            </Botao>
          </>
        }
      >
        {form && (
          <>
            <Aviso tipo="erro">{erro}</Aviso>

            <Campo rotulo="Tipo" obrigatorio dica={TIPOS[form.type].descricao}>
              <Selecao
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as HomepageSectionType })
                }
                // Trocar o tipo de uma seção existente mudaria o que ela
                // renderiza sem aviso; melhor criar outra.
                disabled={Boolean(form.id)}
              >
                {(Object.keys(TIPOS) as HomepageSectionType[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS[t].rotulo}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo
              rotulo="Título exibido"
              dica="Deixe vazio para usar o nome padrão do tipo."
            >
              <Entrada
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={160}
                placeholder={TIPOS[form.type].rotulo}
              />
            </Campo>

            <Campo rotulo="Subtítulo">
              <Entrada
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                maxLength={320}
              />
            </Campo>

            <Campo rotulo="Quantidade de itens" dica="Deixe vazio para usar o padrão.">
              <Entrada
                type="number"
                min={1}
                max={24}
                value={form.limite}
                onChange={(e) => setForm({ ...form, limite: e.target.value })}
              />
            </Campo>

            <Alternador
              marcado={form.isVisible}
              aoMudar={(v) => setForm({ ...form, isVisible: v })}
              rotulo="Visível no site"
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir seção"
        mensagem="A seção sai da home. Os artigos e vídeos continuam publicados."
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirSecao(excluir.id);
            recado.ok('Seção excluída.');
            setExcluir(null);
            void carregar();
          } catch (e) {
            recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
          }
        }}
        aoCancelar={() => setExcluir(null)}
      />

      {recado.elemento}
    </>
  );
}

export default function PaginaHome() {
  return (
    <MolduraPainel>
      <Home />
    </MolduraPainel>
  );
}
