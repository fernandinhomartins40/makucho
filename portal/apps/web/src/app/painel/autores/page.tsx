'use client';

import { useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import type { AuthorDto, MediaDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { CampoImagem, miniatura } from '@/components/painel/seletor-midia';
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
  role: string;
  bio: string;
  avatar: MediaDto | null;
  instagram: string;
  tiktok: string;
  youtube: string;
  twitter: string;
  linkedin: string;
  website: string;
}

const NOVO: Formulario = {
  name: '',
  slug: '',
  role: '',
  bio: '',
  avatar: null,
  instagram: '',
  tiktok: '',
  youtube: '',
  twitter: '',
  linkedin: '',
  website: '',
};

const REDES = [
  { chave: 'instagram', rotulo: 'Instagram' },
  { chave: 'tiktok', rotulo: 'TikTok' },
  { chave: 'youtube', rotulo: 'YouTube' },
  { chave: 'twitter', rotulo: 'X (Twitter)' },
  { chave: 'linkedin', rotulo: 'LinkedIn' },
  { chave: 'website', rotulo: 'Site' },
] as const;

function Autores() {
  const recado = useRecado();
  const [itens, setItens] = useState<AuthorDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<AuthorDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);

  async function carregar() {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const autores = await painel.autores();
      if (requisicao !== requisicaoAtual.current) return;
      setItens(autores);
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar os autores.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrir(a?: AuthorDto) {
    setErro('');
    setSlugTocado(Boolean(a));
    setForm(
      a
        ? {
            id: a.id,
            name: a.name,
            slug: a.slug,
            role: a.role ?? '',
            bio: a.bio ?? '',
            avatar: a.avatar,
            instagram: a.instagram ?? '',
            tiktok: a.tiktok ?? '',
            youtube: a.youtube ?? '',
            twitter: a.twitter ?? '',
            linkedin: a.linkedin ?? '',
            website: a.website ?? '',
          }
        : { ...NOVO },
    );
  }

  async function salvar() {
    if (!form || salvando) return;
    setErro('');

    if (form.name.trim().length < 2) {
      setErro('Informe o nome do autor.');
      return;
    }

    setSalvando(true);
    try {
      // Campo de URL vazio precisa ir como null: string vazia nao passa
      // na validacao de URL do backend.
      const limpo = (v: string) => (v.trim() ? v.trim() : null);

      const corpo = {
        name: form.name.trim(),
        slug: form.slug.trim() || gerarSlug(form.name),
        role: limpo(form.role),
        bio: limpo(form.bio),
        avatarMediaId: form.avatar?.id ?? null,
        instagram: limpo(form.instagram),
        tiktok: limpo(form.tiktok),
        youtube: limpo(form.youtube),
        twitter: limpo(form.twitter),
        linkedin: limpo(form.linkedin),
        website: limpo(form.website),
      };

      if (form.id) await painel.atualizarAutor(form.id, corpo);
      else await painel.criarAutor(corpo);

      recado.ok(form.id ? 'Autor atualizado.' : 'Autor criado.');
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
        titulo="Autores"
        descricao="Quem assina as publicações do portal."
        acoes={
          <Botao variante="primario" onClick={() => abrir()}>
            + Novo autor
          </Botao>
        }
      />

      <div className="pn-bloco">
        {erroLista && (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista} {dadosCarregados ? 'A lista anterior permanece abaixo.' : 'Nenhum autor foi carregado.'}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        )}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
          <Vazio
            titulo="Nenhum autor"
            descricao="Cadastre quem assina as matérias."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Novo autor
              </Botao>
            }
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th style={{ width: 52 }} />
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Endereço</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.avatar ? (
                        <NextImage
                          src={miniatura(a.avatar)}
                          alt=""
                          width={34}
                          height={34}
                          unoptimized
                          style={{ borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span className="pn-avatar-vazio">{a.name.charAt(0).toUpperCase()}</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="pn-link" onClick={() => abrir(a)}>
                        {a.name}
                      </button>
                    </td>
                    <td style={{ color: 'var(--pn-suave)' }}>{a.role ?? '—'}</td>
                    <td style={{ color: 'var(--pn-suave)' }}>/{a.slug}</td>
                    <td>
                      <div className="pn-acoes">
                        <Botao variante="fantasma" onClick={() => abrir(a)}>
                          Editar
                        </Botao>
                        <Botao variante="fantasma" onClick={() => setExcluir(a)}>
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
        titulo={form?.id ? 'Editar autor' : 'Novo autor'}
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

            <CampoImagem
              rotulo="Foto"
              midia={form.avatar}
              aoMudar={(m) => setForm({ ...form, avatar: m })}
              dica="Use o formato Avatar ao enviar."
            />

            <Campo rotulo="Nome" obrigatorio>
              <Entrada
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm({ ...form, name, slug: slugTocado ? form.slug : gerarSlug(name) });
                }}
                autoFocus
                maxLength={160}
              />
            </Campo>

            <div className="pn-linha">
              <Campo rotulo="Função" dica="Ex.: Editor de mercado">
                <Entrada
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  maxLength={120}
                />
              </Campo>

              <Campo rotulo="Endereço (slug)">
                <Entrada
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTocado(true);
                    setForm({ ...form, slug: e.target.value });
                  }}
                />
              </Campo>
            </div>

            <Campo rotulo="Biografia">
              <AreaTexto
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                maxLength={2000}
              />
            </Campo>

            <details className="pn-detalhes pn-detalhes-simples">
              <summary>Redes sociais</summary>
              <div className="pn-linha">
                {REDES.map((r) => (
                  <Campo key={r.chave} rotulo={r.rotulo}>
                    <Entrada
                      value={form[r.chave]}
                      onChange={(e) => setForm({ ...form, [r.chave]: e.target.value })}
                      placeholder="https://"
                    />
                  </Campo>
                ))}
              </div>
            </details>
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir autor"
        mensagem={`"${excluir?.name}" será removido. Autores com artigos publicados não podem ser excluídos.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirAutor(excluir.id);
            recado.ok('Autor excluído.');
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

export default function PaginaAutores() {
  return (
    <MolduraPainel>
      <Autores />
    </MolduraPainel>
  );
}
