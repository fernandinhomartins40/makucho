'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [carregandoRedes, setCarregandoRedes] = useState(true);
  const [erroRedes, setErroRedes] = useState<string | null>(null);
  const requisicaoRedes = useRef(0);
  const [salvando, setSalvando] = useState(false);
  const [salvandoRede, setSalvandoRede] = useState(false);
  const [erro, setErro] = useState('');
  const [erroRede, setErroRede] = useState('');

  const [rede, setRede] = useState<{
    id?: string;
    platform: string;
    label: string;
    url: string;
    handle: string;
    followerCount: string;
  } | null>(null);
  const [excluirRede, setExcluirRede] = useState<SocialProfileDto | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const cfg = await painel.configuracoes();
      setItens(cfg);
      setValores(Object.fromEntries(cfg.map((c) => [c.key, c.value])));
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : 'Não foi possível carregar as configurações.');
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarRedes = useCallback(async () => {
    const requisicao = ++requisicaoRedes.current;
    setCarregandoRedes(true);
    setErroRedes(null);
    try {
      const perfis = await painel.redes();
      if (requisicao !== requisicaoRedes.current) return;
      setRedes(perfis);
    } catch (e) {
      if (requisicao !== requisicaoRedes.current) return;
      setErroRedes(e instanceof ErroApi ? e.message : 'Não foi possível carregar as redes sociais.');
    } finally {
      if (requisicao === requisicaoRedes.current) setCarregandoRedes(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarRedes();
  }, [carregar, carregarRedes]);

  async function salvar() {
    if (salvando || carregando || erroCarga) return;
    setErro('');
    setSalvando(true);

    try {
      // Só mandamos o que mudou: o upsert do backend grava chave a chave.
      const alterados = itens
        .filter((c) => JSON.stringify(valores[c.key]) !== JSON.stringify(c.value))
        .map((c) => ({ key: c.key, value: valores[c.key] }));

      if (alterados.length === 0) {
        recado.ok('Nada para salvar.');
        return;
      }

      await painel.salvarConfiguracoes(alterados);
      const gravados = new Map(alterados.map((item) => [item.key, item.value]));
      setItens((atuais) => atuais.map((item) => gravados.has(item.key) ? { ...item, value: gravados.get(item.key) } : item));
      recado.ok('Configurações salvas.');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarRede() {
    if (!rede || salvandoRede) return;
    setErroRede('');
    if (!/^https?:\/\//i.test(rede.url.trim())) {
      setErroRede('O endereço deve começar com http:// ou https://.');
      return;
    }
    try {
      new URL(rede.url.trim());
    } catch {
      setErroRede('Informe um endereço válido.');
      return;
    }
    if (rede.followerCount && (!Number.isInteger(Number(rede.followerCount)) || Number(rede.followerCount) < 0)) {
      setErroRede('Seguidores deve ser um número inteiro não negativo.');
      return;
    }
    setSalvandoRede(true);
    try {
      const perfis = await painel.salvarRede({
        platform: rede.platform,
        label: rede.label.trim() || rede.platform,
        url: rede.url.trim(),
        handle: rede.handle.trim() || null,
        followerCount: rede.followerCount ? Number(rede.followerCount) : null,
      });
      setRedes(perfis);
      recado.ok('Rede salva.');
      setRede(null);
    } catch (e) {
      setErroRede(e instanceof ErroApi ? e.message : 'Não foi possível salvar a rede.');
    } finally {
      setSalvandoRede(false);
    }
  }

  if (carregando) {
    return <Carregando />;
  }

  if (erroCarga) {
    return <div className="pn-bloco pn-erro-lista"><Aviso tipo="erro">{erroCarga}</Aviso><Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao></div>;
  }

  // Agrupa para a tela não virar uma lista solta de 30 campos.
  const porGrupo = itens.reduce<Record<string, Configuracao[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});
  const proximaRede = REDES.find((plataforma) => !redes.some((perfil) => perfil.platform === plataforma));

  return (
    <>
      <TituloPagina
        titulo="Configurações"
        fixo
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
            disabled={!proximaRede || carregandoRedes || Boolean(erroRedes)}
            onClick={() => {
              if (!proximaRede) return;
              setErroRede('');
              setRede({ platform: proximaRede, label: '', url: '', handle: '', followerCount: '' });
            }}
          >
            + Adicionar rede
          </Botao>
        </div>

        {erroRedes && <div className="pn-erro-lista"><Aviso tipo="erro">{erroRedes} {redes.length ? 'As redes já carregadas permanecem abaixo.' : 'Nenhuma rede foi carregada.'}</Aviso><Botao variante="neutro" onClick={() => void carregarRedes()}>Tentar novamente</Botao></div>}

        {carregandoRedes && redes.length === 0 ? <Carregando /> : erroRedes && redes.length === 0 ? null : redes.length === 0 ? (
          <p className="pn-dica">Nenhuma rede cadastrada. Elas aparecem no topo e no rodapé.</p>
        ) : (
          <ul className="pn-lista-simples">
            {redes.map((r) => (
              <li key={r.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="pn-lista-titulo">{r.label}</span>
                  <span className="pn-lista-meta">{r.url}</span>
                </div>
                <Botao variante="fantasma" onClick={() => {
                  setErroRede('');
                  setRede({ id: r.id, platform: r.platform, label: r.label, url: r.url, handle: r.handle ?? '', followerCount: r.followerCount?.toString() ?? '' });
                }}>Editar</Botao>
                <Botao variante="perigo-suave" onClick={() => setExcluirRede(r)}>
                  Excluir
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        titulo={rede?.id ? 'Editar rede social' : 'Adicionar rede social'}
        aberto={rede !== null}
        aoFechar={() => { if (!salvandoRede) setRede(null); }}
        largura={460}
        rodape={
          <>
            <Botao variante="fantasma" disabled={salvandoRede} onClick={() => setRede(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvandoRede} onClick={salvarRede}>
              Salvar
            </Botao>
          </>
        }
      >
        {rede && (
          <>
            <Aviso tipo="erro">{erroRede}</Aviso>
            <Campo rotulo="Plataforma" obrigatorio>
              <Selecao
                value={rede.platform}
                onChange={(e) => setRede({ ...rede, platform: e.target.value })}
                disabled={Boolean(rede.id)}
              >
                {REDES.filter((p) => p === rede.platform || !redes.some((perfil) => perfil.platform === p)).map((p) => (
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
            setRedes((atuais) => atuais.filter((r) => r.id !== excluirRede.id));
            setExcluirRede(null);
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
