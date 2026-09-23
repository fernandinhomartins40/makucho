'use client';

import { useEffect, useRef, useState } from 'react';
import type { TagDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
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
}

function Tags() {
  const recado = useRecado();
  const [itens, setItens] = useState<TagDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<TagDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);

  async function carregar() {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const tags = await painel.tags();
      if (requisicao !== requisicaoAtual.current) return;
      setItens(tags);
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar as tags.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lista pequena: filtrar no cliente evita uma ida ao servidor por tecla.
  const visiveis = busca.trim()
    ? itens.filter((t) => t.name.toLowerCase().includes(busca.trim().toLowerCase()))
    : itens;

  async function salvar() {
    if (!form || salvando) return;
    setErro('');

    if (!form.name.trim()) {
      setErro('Informe o nome da tag.');
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        name: form.name.trim(),
        slug: form.slug.trim() || gerarSlug(form.name),
        description: form.description.trim() || null,
      };

      if (form.id) await painel.atualizarTag(form.id, corpo);
      else await painel.criarTag(corpo);

      recado.ok(form.id ? 'Tag atualizada.' : 'Tag criada.');
      setForm(null);
      void carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function abrir(t?: TagDto) {
    setErro('');
    setSlugTocado(Boolean(t));
    setForm(
      t
        ? { id: t.id, name: t.name, slug: t.slug, description: t.description ?? '' }
        : { name: '', slug: '', description: '' },
    );
  }

  return (
    <>
      <TituloPagina
        titulo="Tags"
        descricao={dadosCarregados ? `${itens.length} cadastrada${itens.length === 1 ? '' : 's'}` : 'Aguardando dados do painel'}
        acoes={
          <Botao variante="primario" onClick={() => abrir()}>
            + Nova tag
          </Botao>
        }
      />

      <div className="pn-filtros">
        <Entrada
          className="pn-busca"
          aria-label="Filtrar tags"
          placeholder="Filtrar tags…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="pn-bloco">
        {erroLista && (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista} {dadosCarregados ? 'A lista anterior permanece abaixo.' : 'Nenhuma tag foi carregada.'}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        )}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : visiveis.length === 0 ? (
          <Vazio
            titulo={busca ? 'Nenhuma tag encontrada' : 'Nenhuma tag'}
            descricao={busca ? 'Tente outro termo.' : 'As tags ajudam a agrupar assuntos.'}
            acao={busca ? <Botao variante="neutro" onClick={() => setBusca('')}>Limpar filtro</Botao> : undefined}
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Endereço</th>
                  <th>Artigos</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <button type="button" className="pn-link" onClick={() => abrir(t)}>
                        {t.name}
                      </button>
                    </td>
                    <td style={{ color: 'var(--pn-suave)' }}>/{t.slug}</td>
                    <td>{t.postCount ?? 0}</td>
                    <td>
                      <div className="pn-acoes">
                        <Botao variante="fantasma" onClick={() => abrir(t)}>
                          Editar
                        </Botao>
                        <Botao variante="perigo-suave" onClick={() => setExcluir(t)}>
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
        titulo={form?.id ? 'Editar tag' : 'Nova tag'}
        aberto={form !== null}
        aoFechar={() => { if (!salvando) setForm(null); }}
        largura={460}
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
                  setForm({ ...form, name, slug: slugTocado ? form.slug : gerarSlug(name) });
                }}
                autoFocus
                maxLength={80}
              />
            </Campo>

            <Campo rotulo="Endereço (slug)" dica={`makucho.com.br/tag/${form.slug || '…'}`}>
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
                maxLength={400}
              />
            </Campo>
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir tag"
        mensagem={`"${excluir?.name}" será removida dos artigos que a usam.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirTag(excluir.id);
            recado.ok('Tag excluída.');
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

export default function PaginaTags() {
  return (
    <MolduraPainel>
      <Tags />
    </MolduraPainel>
  );
}
