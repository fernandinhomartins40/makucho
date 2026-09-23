'use client';

import { useEffect, useRef, useState } from 'react';
import type { CategoryDto, MediaDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { CampoImagem } from '@/components/painel/seletor-midia';
import {
  Alternador,
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Modal,
  AreaTexto,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

interface Formulario {
  id?: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  showInMenu: boolean;
  showInHomepage: boolean;
  coverImage: MediaDto | null;
}

const NOVA: Formulario = {
  name: '',
  slug: '',
  description: '',
  color: '#1a5fd4',
  showInMenu: true,
  showInHomepage: true,
  coverImage: null,
};

function Categorias() {
  const recado = useRecado();
  const [itens, setItens] = useState<CategoryDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [reordenando, setReordenando] = useState(false);
  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<CategoryDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);

  async function carregar() {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const categorias = await painel.categorias();
      if (requisicao !== requisicaoAtual.current) return;
      setItens(categorias);
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar as categorias.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrir(c?: CategoryDto) {
    setErro('');
    setSlugTocado(Boolean(c));
    setForm(
      c
        ? {
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description ?? '',
            color: c.color ?? '#1a5fd4',
            showInMenu: c.showInMenu,
            showInHomepage: c.showInHomepage,
            coverImage: c.coverImage,
          }
        : { ...NOVA },
    );
  }

  async function salvar() {
    if (!form || salvando) return;
    setErro('');

    if (!form.name.trim()) {
      setErro('Informe o nome da categoria.');
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        name: form.name.trim(),
        slug: form.slug.trim() || gerarSlug(form.name),
        description: form.description.trim() || null,
        color: form.color,
        showInMenu: form.showInMenu,
        showInHomepage: form.showInHomepage,
        coverImageId: form.coverImage?.id ?? null,
      };

      if (form.id) await painel.atualizarCategoria(form.id, corpo);
      else await painel.criarCategoria(corpo);

      recado.ok(form.id ? 'Categoria atualizada.' : 'Categoria criada.');
      setForm(null);
      void carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  /** Move uma posição e grava a ordem inteira; a home lê essa sequência. */
  async function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (reordenando || carregando || erroLista || destino < 0 || destino >= itens.length) return;

    const atual = itens[indice];
    const outro = itens[destino];
    if (!atual || !outro) return;

    const anteriores = [...itens];
    const novos = [...itens];
    novos[indice] = outro;
    novos[destino] = atual;
    setItens(novos);
    setReordenando(true);

    try {
      await painel.reordenarCategorias(novos.map((c, i) => ({ id: c.id, position: i })));
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível reordenar.');
      setItens(anteriores);
    } finally {
      setReordenando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Categorias"
        descricao="As editorias do portal. A ordem aqui é a ordem do menu e do rodapé."
        acoes={
          <Botao variante="primario" onClick={() => abrir()}>
            + Nova categoria
          </Botao>
        }
      />

      <div className="pn-bloco">
        {erroLista && (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista} {dadosCarregados ? 'A lista anterior permanece abaixo.' : 'Nenhuma categoria foi carregada.'}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        )}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
          <Vazio
            titulo="Nenhuma categoria"
            descricao="Crie a primeira editoria do portal."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Nova categoria
              </Botao>
            }
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th style={{ width: 72 }}>Ordem</th>
                  <th>Nome</th>
                  <th>Endereço</th>
                  <th>Artigos</th>
                  <th>Exibição</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((c, i) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button
                          type="button"
                          className="pn-mover"
                          onClick={() => void mover(i, -1)}
                          disabled={reordenando || Boolean(erroLista) || i === 0}
                          aria-label={`Mover ${c.name} para cima`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="pn-mover"
                          onClick={() => void mover(i, 1)}
                          disabled={reordenando || Boolean(erroLista) || i === itens.length - 1}
                          aria-label={`Mover ${c.name} para baixo`}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 3,
                            background: c.color ?? '#cbd5e1',
                            flex: '0 0 auto',
                          }}
                        />
                        <button type="button" className="pn-link" onClick={() => abrir(c)}>
                          {c.name}
                        </button>
                      </span>
                    </td>
                    <td style={{ color: 'var(--pn-suave)' }}>/{c.slug}</td>
                    <td>{c.postCount ?? 0}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--pn-suave)' }}>
                      {[c.showInMenu && 'menu', c.showInHomepage && 'home']
                        .filter(Boolean)
                        .join(' · ') || 'oculta'}
                    </td>
                    <td>
                      <div className="pn-acoes">
                        <Botao variante="fantasma" onClick={() => abrir(c)}>
                          Editar
                        </Botao>
                        <Botao variante="perigo-suave" onClick={() => setExcluir(c)}>
                          Excluir
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        titulo={form?.id ? 'Editar categoria' : 'Nova categoria'}
        aberto={form !== null}
        aoFechar={() => { if (!salvando) setForm(null); }}
        rodape={
          <>
            <Botao variante="fantasma" disabled={salvando} onClick={() => setForm(null)}>
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

            <Campo rotulo="Nome" obrigatorio>
              <Entrada
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm({
                    ...form,
                    name,
                    slug: slugTocado ? form.slug : gerarSlug(name),
                  });
                }}
                autoFocus
                maxLength={120}
              />
            </Campo>

            <Campo rotulo="Endereço (slug)" dica={`makucho.com.br/categoria/${form.slug || '…'}`}>
              <Entrada
                value={form.slug}
                onChange={(e) => {
                  setSlugTocado(true);
                  setForm({ ...form, slug: e.target.value });
                }}
              />
            </Campo>

            <Campo rotulo="Descrição">
              <AreaTexto
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={500}
              />
            </Campo>

            <Campo rotulo="Cor" dica="Usada na etiqueta dos cards.">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="pn-cor"
                  aria-label="Escolher a cor"
                />
                <Entrada
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  maxLength={7}
                />
              </div>
            </Campo>

            <CampoImagem
              rotulo="Capa da categoria"
              preset="CATEGORY"
              midia={form.coverImage}
              aoMudar={(m) => setForm({ ...form, coverImage: m })}
            />

            <Alternador
              marcado={form.showInMenu}
              aoMudar={(v) => setForm({ ...form, showInMenu: v })}
              rotulo="Exibir no menu"
            />
            <Alternador
              marcado={form.showInHomepage}
              aoMudar={(v) => setForm({ ...form, showInHomepage: v })}
              rotulo="Exibir na home"
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir categoria"
        mensagem={`"${excluir?.name}" será removida. Categorias com artigos não podem ser excluídas.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirCategoria(excluir.id);
            recado.ok('Categoria excluída.');
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

export default function PaginaCategorias() {
  return (
    <MolduraPainel>
      <Categorias />
    </MolduraPainel>
  );
}
