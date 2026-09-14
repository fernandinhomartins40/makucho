'use client';

import { useEffect, useState } from 'react';
import type { SocialProfileDto } from '@makucho/types';
import { ErroApi, painel, type Configuracao } from '@/lib/painel';
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
  AreaTexto,
  useRecado,
} from '@/components/painel/ui';

const GRUPOS: Record<string, string> = {
  general: 'Geral',
  seo: 'SEO',
  social: 'Redes sociais',
  ads: 'Publicidade',
  newsletter: 'Newsletter',
  contact: 'Contato',
};

const REDES = ['instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'facebook'];

function Configuracoes() {
  const recado = useRecado();
  const [itens, setItens] = useState<Configuracao[]>([]);
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [redes, setRedes] = useState<SocialProfileDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [rede, setRede] = useState<{
    platform: string;
    label: string;
    url: string;
    handle: string;
    followerCount: string;
  } | null>(null);
  const [excluirRede, setExcluirRede] = useState<SocialProfileDto | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [cfg, soc] = await Promise.all([
        painel.configuracoes(),
        painel.redes().catch(() => []),
      ]);
      setItens(cfg);
      setValores(Object.fromEntries(cfg.map((c) => [c.key, c.value])));
      setRedes(soc);
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvar() {
    setErro('');
    setSalvando(true);

    try {
      // Só mandamos o que mudou: o upsert do backend grava chave a chave.
      const alterados = itens
        .filter((c) => JSON.stringify(valores[c.key]) !== JSON.stringify(c.value))
        .map((c) => ({ key: c.key, value: valores[c.key] }));

      if (alterados.length === 0) {
        recado.ok('Nada para salvar.');
        setSalvando(false);
        return;
      }

      await painel.salvarConfiguracoes(alterados);
      recado.ok('Configurações salvas.');
      void carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarRede() {
    if (!rede) return;
    try {
      await painel.salvarRede({
        platform: rede.platform,
        label: rede.label.trim() || rede.platform,
        url: rede.url.trim(),
        handle: rede.handle.trim() || null,
        followerCount: rede.followerCount ? Number(rede.followerCount) : null,
      });
      recado.ok('Rede salva.');
      setRede(null);
      void carregar();
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível salvar a rede.');
    }
  }

  if (carregando) {
    return <Carregando />;
  }

  // Agrupa para a tela não virar uma lista solta de 30 campos.
  const porGrupo = itens.reduce<Record<string, Configuracao[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <>
      <TituloPagina
        titulo="Configurações"
        descricao="Nome do site, SEO e redes sociais."
        acoes={
          <Botao variante="primario" carregando={salvando} onClick={salvar}>
            Salvar alterações
          </Botao>
        }
      />

      <Aviso tipo="erro">{erro}</Aviso>

      {Object.entries(porGrupo).map(([grupo, campos]) => (
        <section key={grupo} className="pn-bloco">
          <h2 className="pn-bloco-h2">{GRUPOS[grupo] ?? grupo}</h2>

          {campos.map((c) => {
            const valor = valores[c.key];

            if (c.type === 'boolean') {
              return (
                <Alternador
                  key={c.key}
                  marcado={Boolean(valor)}
                  aoMudar={(v) => setValores((x) => ({ ...x, [c.key]: v }))}
                  rotulo={c.label ?? c.key}
                  descricao={c.description ?? undefined}
                />
              );
            }

            return (
              <Campo key={c.key} rotulo={c.label ?? c.key} dica={c.description ?? undefined}>
                {c.type === 'color' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      className="pn-cor"
                      value={String(valor ?? '#1a5fd4')}
                      onChange={(e) => setValores((x) => ({ ...x, [c.key]: e.target.value }))}
                      aria-label={c.label ?? c.key}
                    />
                    <Entrada
                      value={String(valor ?? '')}
                      onChange={(e) => setValores((x) => ({ ...x, [c.key]: e.target.value }))}
                    />
                  </div>
                ) : c.type === 'number' ? (
                  <Entrada
                    type="number"
                    value={String(valor ?? '')}
                    onChange={(e) =>
                      setValores((x) => ({ ...x, [c.key]: Number(e.target.value) }))
                    }
                  />
                ) : String(valor ?? '').length > 80 ? (
                  <AreaTexto
                    value={String(valor ?? '')}
                    onChange={(e) => setValores((x) => ({ ...x, [c.key]: e.target.value }))}
                  />
                ) : (
                  <Entrada
                    value={String(valor ?? '')}
                    onChange={(e) => setValores((x) => ({ ...x, [c.key]: e.target.value }))}
                  />
                )}
              </Campo>
            );
          })}
        </section>
      ))}

      <section className="pn-bloco">
        <div className="pn-bloco-topo">
          <h2>Perfis nas redes</h2>
          <Botao
            variante="neutro"
            onClick={() =>
              setRede({ platform: 'instagram', label: '', url: '', handle: '', followerCount: '' })
            }
          >
            + Adicionar rede
          </Botao>
        </div>

        {redes.length === 0 ? (
          <p className="pn-dica">Nenhuma rede cadastrada. Elas aparecem no topo e no rodapé.</p>
        ) : (
          <ul className="pn-lista-simples">
            {redes.map((r) => (
              <li key={r.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="pn-lista-titulo">{r.label}</span>
                  <span className="pn-lista-meta">{r.url}</span>
                </div>
                <Botao variante="fantasma" onClick={() => setExcluirRede(r)}>
                  Excluir
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        titulo="Adicionar rede social"
        aberto={rede !== null}
        aoFechar={() => setRede(null)}
        largura={460}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setRede(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={salvarRede}>
              Salvar
            </Botao>
          </>
        }
      >
        {rede && (
          <>
            <Campo rotulo="Plataforma" obrigatorio>
              <Selecao
                value={rede.platform}
                onChange={(e) => setRede({ ...rede, platform: e.target.value })}
              >
                {REDES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo rotulo="Nome exibido" obrigatorio>
              <Entrada
                value={rede.label}
                onChange={(e) => setRede({ ...rede, label: e.target.value })}
                placeholder="MAKUCHO no Instagram"
              />
            </Campo>

            <Campo rotulo="Endereço" obrigatorio>
              <Entrada
                value={rede.url}
                onChange={(e) => setRede({ ...rede, url: e.target.value })}
                placeholder="https://instagram.com/makucho"
              />
            </Campo>

            <div className="pn-linha">
              <Campo rotulo="Usuário">
                <Entrada
                  value={rede.handle}
                  onChange={(e) => setRede({ ...rede, handle: e.target.value })}
                  placeholder="@makucho"
                />
              </Campo>
              <Campo rotulo="Seguidores">
                <Entrada
                  type="number"
                  min={0}
                  value={rede.followerCount}
                  onChange={(e) => setRede({ ...rede, followerCount: e.target.value })}
                />
              </Campo>
            </div>
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluirRede !== null}
        titulo="Excluir rede"
        mensagem={`"${excluirRede?.label}" deixa de aparecer no site.`}
        aoConfirmar={async () => {
          if (!excluirRede) return;
          try {
            await painel.excluirRede(excluirRede.id);
            recado.ok('Rede excluída.');
            setExcluirRede(null);
            void carregar();
          } catch (e) {
            recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
          }
        }}
        aoCancelar={() => setExcluirRede(null)}
      />

      {recado.elemento}
    </>
  );
}

export default function PaginaConfiguracoes() {
  return (
    <MolduraPainel>
      <Configuracoes />
    </MolduraPainel>
  );
}
