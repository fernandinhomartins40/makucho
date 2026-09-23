'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MarketIndicatorDto } from '@makucho/types';
import { ErroApi, painel, pode, type IntegracaoMercado } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
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

/**
 * Indicadores do Radar do mercado (faixa abaixo do cabecalho do site).
 * A API atualiza os valores sozinha a cada 10 minutos (fontes publicas);
 * aqui a redacao acompanha, oculta ou corrige.
 */

interface Formulario {
  symbol: string;
  label: string;
  unit: string;
  value: string;
  changePercent: string;
  position: string;
  isActive: boolean;
  existente: boolean;
}

const UNIDADES = [
  { valor: 'pts', rotulo: 'Pontos (índices)' },
  { valor: 'R$', rotulo: 'R$ (moeda)' },
  { valor: 'US$', rotulo: 'US$ (moeda)' },
  { valor: '%', rotulo: '% (percentual)' },
  { valor: 'a.a.', rotulo: '% a.a. (taxa anual)' },
];

/** Aceita "5,12", "5.12" e "134.280,55". */
function numero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}

function formatar(i: MarketIndicatorDto) {
  const valor = i.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (i.unit === 'R$' || i.unit === 'US$') return `${i.unit} ${valor}`;
  if (i.unit === '%' || i.unit === 'a.a.') return `${valor}%${i.unit === 'a.a.' ? ' a.a.' : ''}`;
  return valor;
}

/**
 * Token da brapi (Ibovespa). Fica guardado como segredo na API: a tela só
 * recebe se está configurado e os 4 últimos caracteres.
 */
function FonteIbovespa({ aoMudar }: { aoMudar: () => void }) {
  const recado = useRecado();
  const [status, setStatus] = useState<IntegracaoMercado | null>(null);
  const [token, setToken] = useState('');
  const [visivel, setVisivel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setStatus(await painel.integracaoMercado());
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível ler a configuração.');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      setErro('Cole o token gerado em brapi.dev/dashboard.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      setStatus(await painel.salvarIntegracaoMercado(token.trim()));
      setToken('');
      setVisivel(false);
      recado.ok('Token válido e salvo. A brapi fica de reserva caso o Yahoo Finance falhe.');
      aoMudar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível salvar o token.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setRemovendo(true);
    setErro('');
    try {
      setStatus(await painel.salvarIntegracaoMercado(null));
      recado.ok('Token removido do painel.');
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível remover o token.');
    } finally {
      setRemovendo(false);
    }
  }

  const brapi = status?.brapi;
  const ibov = status?.ibovespa;

  return (
    <section className="pn-bloco pn-integracao" aria-labelledby="fonte-ibovespa">
      <div className="pn-bloco-topo">
        <h2 id="fonte-ibovespa">Fonte do Ibovespa</h2>
        {brapi && (
          <span
            className="pn-selo"
            style={{ '--selo': brapi.configurado ? '#16a34a' : '#b45309' } as React.CSSProperties}
          >
            {brapi.configurado ? `Reserva brapi ativa ${brapi.final ?? ''}` : 'Sem reserva: só Yahoo Finance'}
          </span>
        )}
      </div>

      <p className="pn-dica">
        O Ibovespa vem do Yahoo Finance, que tem o menor atraso. Com um token gratuito da{' '}
        <a href="https://brapi.dev/dashboard" target="_blank" rel="noopener noreferrer">brapi.dev</a>, a brapi entra
        automaticamente como reserva se o Yahoo falhar (plano grátis: 15 mil consultas por mês, cerca de 30 min de atraso).
        {ibov && (
          <>
            {' '}Último valor: <strong>{ibov.valor.toLocaleString('pt-BR')}</strong> via {ibov.fonte},{' '}
            {new Date(ibov.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
          </>
        )}
        {brapi?.origem === 'ambiente' && ' O token atual vem da configuração do servidor; salvar aqui passa a valer o do painel.'}
      </p>

      <Aviso tipo="erro">{erro}</Aviso>

      <form className="pn-integracao-form" onSubmit={salvar}>
        <Campo rotulo={brapi?.origem === 'painel' ? 'Trocar token' : 'Token da brapi'}>
          <div className="pn-senha">
            <Entrada
              type={visivel ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cole aqui o token de brapi.dev/dashboard"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={() => setVisivel((v) => !v)} aria-label={visivel ? 'Ocultar o token' : 'Mostrar o token'} aria-pressed={visivel}>
              {visivel ? 'ocultar' : 'mostrar'}
            </button>
          </div>
        </Campo>
        <div className="pn-acoes">
          <Botao type="submit" variante="primario" carregando={salvando} disabled={removendo}>
            Salvar e testar
          </Botao>
          {brapi?.origem === 'painel' && (
            <Botao type="button" variante="perigo-suave" carregando={removendo} disabled={salvando} onClick={() => void remover()}>
              Remover token
            </Botao>
          )}
        </div>
      </form>

      {recado.elemento}
    </section>
  );
}

function Mercado() {
  const { usuario } = useSessao();
  const recado = useRecado();
  const [itens, setItens] = useState<MarketIndicatorDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<MarketIndicatorDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState('');
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroLista(null);
    try {
      setItens(await painel.indicadores());
    } catch (e) {
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar os indicadores.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(i?: MarketIndicatorDto) {
    setErro('');
    setErrosCampo({});
    setForm(
      i
        ? {
            symbol: i.symbol,
            label: i.label,
            unit: i.unit ?? 'pts',
            value: String(i.value).replace('.', ','),
            changePercent: i.changePercent === null ? '' : String(i.changePercent).replace('.', ','),
            position: String(i.position),
            isActive: i.isActive ?? true,
            existente: true,
          }
        : {
            symbol: '',
            label: '',
            unit: 'pts',
            value: '',
            changePercent: '',
            position: String(itens.length),
            isActive: true,
            existente: false,
          },
    );
  }

  async function salvar() {
    if (!form) return;
    const valor = numero(form.value);
    const variacao = numero(form.changePercent);
    const erros: Record<string, string> = {};
    if (!form.symbol.trim()) erros.symbol = 'Informe o código, por exemplo IBOVESPA.';
    if (!form.label.trim()) erros.label = 'Informe o nome exibido.';
    if (valor === null || Number.isNaN(valor)) erros.value = 'Informe um número, por exemplo 5,12.';
    if (Number.isNaN(variacao)) erros.changePercent = 'Use um número, por exemplo -0,43.';
    if (Object.keys(erros).length) {
      setErrosCampo(erros);
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      await painel.salvarIndicador({
        symbol: form.symbol.trim(),
        label: form.label.trim(),
        unit: form.unit,
        value: valor,
        changePercent: variacao,
        position: Number(form.position) || 0,
        isActive: form.isActive,
      });
      setForm(null);
      recado.ok('Indicador salvo. O Radar do site já usa o novo valor.');
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
      if (e instanceof ErroApi && e.fields) setErrosCampo(e.fields);
    } finally {
      setSalvando(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await painel.sincronizarMercado();
      if (r.updated > 0) {
        recado.ok(`${r.updated} indicador(es) atualizados pela fonte externa.`);
      } else {
        recado.erro('Nenhuma cotação atualizada agora: as fontes podem estar fora do ar. O Radar mantém os últimos valores.');
      }
      await carregar();
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível sincronizar.');
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Mercado"
        descricao="Indicadores do Radar do mercado, exibido abaixo do cabeçalho do site."
        acoes={
          <>
            {pode(usuario, 'ADMIN') && (
              <Botao variante="neutro" carregando={sincronizando} onClick={() => void sincronizar()}>
                Sincronizar
              </Botao>
            )}
            <Botao variante="primario" onClick={() => abrir()}>
              + Novo indicador
            </Botao>
          </>
        }
      />

      <Aviso tipo="info">
        Atualização automática a cada 10 minutos: Dólar, Euro e Bitcoin pela AwesomeAPI, Ibovespa pelo
        Yahoo Finance (com a brapi de reserva), Selic e IPCA pelo Banco Central. Não é preciso cadastrar nada — valores
        editados aqui são substituídos na próxima atualização. O Radar mostra Ibovespa, Dólar e Bitcoin.
      </Aviso>

      {pode(usuario, 'ADMIN') && <FonteIbovespa aoMudar={() => void carregar()} />}

      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : erroLista ? (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        ) : itens.length === 0 ? (
          <Vazio
            titulo="Nenhum indicador"
            descricao="Cadastre o Ibovespa, o Dólar e o Bitcoin para o Radar aparecer no site."
            acao={<Botao variante="primario" onClick={() => abrir()}>+ Novo indicador</Botao>}
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th>Valor</th>
                  <th>Variação</th>
                  <th>Atualizado</th>
                  <th>Situação</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const v = i.changePercent ?? 0;
                  return (
                    <tr key={i.id}>
                      <td>
                        <button type="button" className="pn-link pn-tabela-titulo" onClick={() => abrir(i)}>
                          {i.label}
                        </button>
                        <small className="pn-tabela-sub">{i.symbol} · fonte {i.source}</small>
                      </td>
                      <td>{formatar(i)}</td>
                      <td className={v > 0 ? 'pn-sobe' : v < 0 ? 'pn-desce' : undefined}>
                        {i.changePercent === null
                          ? '—'
                          : `${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`}
                      </td>
                      <td>{new Date(i.lastUpdatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>
                        <span className="pn-selo" style={{ '--selo': i.isActive === false ? '#64748b' : '#16a34a' } as React.CSSProperties}>
                          {i.isActive === false ? 'Oculto' : 'Ativo'}
                        </span>
                      </td>
                      <td>
                        <div className="pn-acoes">
                          <Botao variante="fantasma" onClick={() => abrir(i)}>Editar</Botao>
                          <Botao variante="perigo-suave" onClick={() => setExcluir(i)}>Excluir</Botao>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        titulo={form?.existente ? 'Editar indicador' : 'Novo indicador'}
        aberto={form !== null}
        aoFechar={() => { if (!salvando) setForm(null); }}
        largura={480}
        rodape={
          <>
            <Botao variante="fantasma" disabled={salvando} onClick={() => setForm(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvando} onClick={() => void salvar()}>Salvar</Botao>
          </>
        }
      >
        {form && (
          <>
            <Aviso tipo="erro">{erro}</Aviso>
            <Campo rotulo="Código" obrigatorio erro={errosCampo.symbol} dica={form.existente ? 'O código identifica o indicador e não pode mudar.' : 'Ex.: IBOVESPA, USD, BTC, SELIC.'}>
              <Entrada
                value={form.symbol}
                disabled={form.existente}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                autoFocus={!form.existente}
              />
            </Campo>
            <Campo rotulo="Nome exibido" obrigatorio erro={errosCampo.label}>
              <Entrada value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Dólar" />
            </Campo>
            <div className="pn-linha">
              <Campo rotulo="Valor" obrigatorio erro={errosCampo.value}>
                <Entrada inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="5,12" autoFocus={form.existente} />
              </Campo>
              <Campo rotulo="Unidade">
                <Selecao value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
                </Selecao>
              </Campo>
            </div>
            <div className="pn-linha">
              <Campo rotulo="Variação no dia (%)" erro={errosCampo.changePercent} dica="Negativo para queda. Vazio se não houver.">
                <Entrada inputMode="decimal" value={form.changePercent} onChange={(e) => setForm({ ...form, changePercent: e.target.value })} placeholder="-0,43" />
              </Campo>
              <Campo rotulo="Ordem">
                <Entrada type="number" min={0} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </Campo>
            </div>
            <Alternador
              marcado={form.isActive}
              aoMudar={(v) => setForm({ ...form, isActive: v })}
              rotulo="Exibir no site"
              descricao="Desligado, o indicador some do Radar sem perder o histórico."
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir indicador"
        mensagem={`Excluir “${excluir?.label}”? Ele deixa de aparecer no site. Para só esconder, use “Exibir no site”.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirIndicador(excluir.id);
            recado.ok('Indicador excluído.');
            setExcluir(null);
            await carregar();
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

export default function PaginaMercado() {
  return (
    <MolduraPainel>
      <Mercado />
    </MolduraPainel>
  );
}
