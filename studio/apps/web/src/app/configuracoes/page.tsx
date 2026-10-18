'use client';

// ============================================================
// Configurações, em abas: cada assunto numa tela, com uma ação clara.
//
//   Inteligência artificial  a chave da FusAI (a IA roda só com os
//                            créditos de lá, em reais), o saldo, o gasto
//                            do mês e a recarga com Pix aqui mesmo;
//   Banco de mídia           a chave do Pexels (B-roll no editor);
//   Armazenamento            o espaço usado;
//   Aplicativo               ícone (com o editor de recorte), nome,
//                            cores, capturas e instalação.
//
// A aba aberta fica no endereço (#ia, #midia...), para voltar direto.
// ============================================================

import { reaisDeCentavos, reaisDeMicros } from '../../lib/dinheiro';
import { useEffect, useState } from 'react';
import { Topbar } from '../../components/shell/Topbar';
import { SecaoDoApp } from '../../components/pwa/SecaoDoApp';
import { useDados } from '../../lib/useDados';
import {
  bancoDeMidia,
  type ChaveDoBanco,
  armazenamento as apiArmazenamento,
  credencialDeIa,
  creditosDeIa,
  type Armazenamento,
  type CredencialDeIa,
  type CreditosDeIa,
  type RecargaDeIa,
} from '../../lib/api';
import { formatarBytes } from '../../lib/upload';
import { IconeAviso, IconeCelular, IconeCheck, IconeIA, IconeMidia, IconeNuvem, IconeOlho, IconeOlhoFechado } from '../../components/icones';

type Aba = 'ia' | 'midia' | 'armazenamento' | 'app';

const ABAS: ReadonlyArray<{ id: Aba; rotulo: string; ajuda: string; Icone: typeof IconeIA }> = [
  { id: 'ia', rotulo: 'IA', ajuda: 'Conexão e gasto do mês', Icone: IconeIA },
  { id: 'midia', rotulo: 'Imagens grátis', ajuda: 'Mais bancos de fotos e vídeos', Icone: IconeMidia },
  { id: 'armazenamento', rotulo: 'Espaço', ajuda: 'Quanto você já usou', Icone: IconeNuvem },
  { id: 'app', rotulo: 'App', ajuda: 'Ícone e instalação', Icone: IconeCelular },
];

export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<Aba>('ia');
  useEffect(() => {
    const h = window.location.hash.slice(1) as Aba;
    if (ABAS.some((a) => a.id === h)) setAba(h);
  }, []);
  const irPara = (a: Aba) => {
    setAba(a);
    try {
      window.history.replaceState(null, '', `#${a}`);
    } catch {
      // Sem histórico: só a aba muda.
    }
  };

  return (
    <>
      <Topbar trilha={['Configurações']} />
      <div className="conteudo">
        <div className="config">
          <header className="config__titulo">
            <h1>Configurações</h1>
          </header>
          <nav className="abas-da-pagina" role="tablist" aria-label="Partes das configurações">
            {ABAS.map(({ id, rotulo, ajuda, Icone }) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} className="abas-da-pagina__aba" onClick={() => irPara(id)}>
                <Icone size={18} weight={aba === id ? 'fill' : 'regular'} aria-hidden />
                <span>
                  <strong>{rotulo}</strong>
                  <small>{ajuda}</small>
                </span>
              </button>
            ))}
          </nav>
          <div role="tabpanel">
            {aba === 'ia' && <SecaoDeIa />}
            {aba === 'midia' && <SecaoDoBanco />}
            {aba === 'armazenamento' && <SecaoDeArmazenamento />}
            {aba === 'app' && <SecaoDoApp />}
          </div>
        </div>
      </div>
    </>
  );
}

function Aviso({ mensagem }: { mensagem: { tom: 'sucesso' | 'erro'; texto: string } | null }) {
  if (!mensagem) return null;
  return (
    <div className={`aviso ${mensagem.tom === 'erro' ? 'aviso--erro' : 'aviso--sucesso'}`} role={mensagem.tom === 'erro' ? 'alert' : 'status'}>
      {mensagem.tom === 'erro' ? <IconeAviso size={16} /> : <IconeCheck size={16} />}
      <span>{mensagem.texto}</span>
    </div>
  );
}

function Selo({ ativo, sim, nao }: { ativo: boolean; sim: string; nao: string }) {
  return (
    <span className={`selo ${ativo ? 'selo--sucesso' : 'selo--aviso'}`}>
      <span className="selo__ponto" aria-hidden />
      {ativo ? sim : nao}
    </span>
  );
}

// ============================================================
// Inteligência artificial
// ============================================================

function SecaoDeIa() {
  const credencial = useDados<CredencialDeIa>(() => credencialDeIa.obter());

  const [chave, setChave] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const testar = async () => {
    setTestando(true);
    setTeste(null);
    try {
      setTeste(await credencialDeIa.testar());
      credencial.recarregar();
    } catch (e) {
      setTeste({ ok: false, mensagem: e instanceof Error ? e.message : 'o teste falhou' });
    } finally {
      setTestando(false);
    }
  };

  const atual = credencial.dados;
  // A IA do Studio roda só com os créditos da FusAI: uma chave de outro
  // provedor (uma conta pessoal) cadastrada antes não vale mais.
  const usaFusai = atual?.configured === true && atual.provider === 'fusai';
  const chaveAntiga = atual?.configured === true && atual.provider !== 'fusai';
  // A chave do projeto: fai_live_ (ou fai_test_). A de agente (MCP) não serve.
  const chaveDeAgente = /^fai_agent_/.test(chave.trim());
  const chaveValida = /^fai_(live|test)_[A-Za-z0-9]{8,}$/.test(chave.trim());
  const mostrarFormulario = !usaFusai || trocando;

  const salvar = async () => {
    setSalvando(true);
    setMensagem(null);
    try {
      const salvo = await credencialDeIa.salvar({ provider: 'fusai', apiKey: chave.trim() });
      credencial.definir(salvo);
      setChave('');
      setTrocando(false);
      setMensagem({ tom: 'sucesso', texto: 'Chave salva. A IA do Studio já usa os créditos da FusAI.' });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar a chave.' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!window.confirm('Remover a chave da FusAI? As funções com IA param até uma chave nova ser cadastrada.')) return;
    try {
      credencial.definir(await credencialDeIa.remover());
      setMensagem({ tom: 'sucesso', texto: 'Chave removida.' });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível remover.' });
    }
  };

  return (
    <div className="config__pilha">
      {/* ---------- Chave ---------- */}
      <section className="cartao config__cartao" aria-labelledby="titulo-ia">
        <header className="config__cabeca">
          <div>
            <h3 id="titulo-ia">Conexão com a IA</h3>
            <p className="dica">
              A IA escolhe os melhores trechos, sugere cortes, cria as animações e escreve roteiros. Ela roda com os créditos da FusAI, em reais: coloque
              créditos com Pix logo abaixo.
            </p>
          </div>
          {atual && <Selo ativo={usaFusai} sim="Ativa" nao="Sem chave" />}
        </header>
        <Aviso mensagem={mensagem} />
        {chaveAntiga && (
          <Aviso mensagem={{ tom: 'erro', texto: 'A chave cadastrada não é da FusAI e não vale mais: cadastre a chave da FusAI para usar a IA.' }} />
        )}

        {credencial.carregando ? (
          <span className="esqueleto" style={{ height: 48 }} />
        ) : credencial.erro ? (
          <Aviso mensagem={{ tom: 'erro', texto: credencial.erro }} />
        ) : usaFusai ? (
          <div className="config__chave">
            <dl>
              <div>
                <dt>Chave da FusAI</dt>
                <dd style={{ fontFamily: 'ui-monospace, monospace' }}>{atual.keyPrefix}••••••••</dd>
              </div>
              <div>
                <dt>Último uso</dt>
                <dd>{atual.lastUsedAt ? new Date(atual.lastUsedAt).toLocaleString('pt-BR') : 'ainda não usada'}</dd>
              </div>
            </dl>
            <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
              {/* O teste separa "a chave não funciona" de "a IA ainda não foi
                  chamada": uma chamada mínima, e o resultado exato da FusAI. */}
              <button type="button" className="botao botao--secundario botao--pequeno" disabled={testando} onClick={() => void testar()}>
                {testando ? 'Testando…' : 'Testar a chave'}
              </button>
              {!trocando && (
                <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setTrocando(true)}>
                  Trocar a chave
                </button>
              )}
              <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => void remover()}>
                Remover
              </button>
            </div>
            {teste && <Aviso mensagem={{ tom: teste.ok ? 'sucesso' : 'erro', texto: teste.ok ? `Funcionando. ${teste.mensagem}` : teste.mensagem }} />}
          </div>
        ) : null}

        {mostrarFormulario && !credencial.carregando && (
          <form
            className="config__formulario"
            onSubmit={(e) => {
              e.preventDefault();
              if (chaveValida) void salvar();
            }}
          >
            <label className="campo" style={{ margin: 0 }}>
              <span className="campo__rotulo">{usaFusai ? 'Nova chave da FusAI' : 'Cole a chave da FusAI'}</span>
              <span className="linha" style={{ gap: 'var(--e2)' }}>
                <input
                  className="campo__entrada crescer"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="fai_live_…"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  aria-describedby="ajuda-chave"
                />
                <button type="button" className="botao-icone" aria-label={mostrar ? 'Esconder a chave' : 'Mostrar a chave'} onClick={() => setMostrar((v) => !v)}>
                  {mostrar ? <IconeOlhoFechado size={18} /> : <IconeOlho size={18} />}
                </button>
              </span>
              <span id="ajuda-chave" className="campo__ajuda">
                Crie em fusai.com.br → Projetos → Chaves de API (começa com fai_live_). A chave é guardada cifrada e nunca volta para a tela.
                {chaveDeAgente && ' Esta é a chave de agente (MCP), que não serve aqui: use a chave do projeto, fai_live_.'}
                {chave && !chaveDeAgente && !chaveValida && ' A chave da FusAI começa com fai_live_.'}
              </span>
            </label>
            <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
              <button type="submit" className="botao botao--primario" disabled={!chaveValida || salvando}>
                {salvando ? 'Salvando…' : 'Salvar a chave'}
              </button>
              {trocando && (
                <button
                  type="button"
                  className="botao botao--fantasma"
                  onClick={() => {
                    setTrocando(false);
                    setChave('');
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}

        {/* Sem campo de modelo: o Studio escolhe o modelo de cada função. */}
        <p className="dica" style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          O Studio usa o DeepSeek Chat e o DeepSeek Reasoner (no raciocínio) pela FusAI, e o gasto sai do saldo em reais. As etapas que olham imagens (a
          crítica visual das animações) ficam de fora: esses modelos não enxergam.
        </p>
      </section>

      {usaFusai && <CartaoDeCreditos />}
    </div>
  );
}

// ============================================================
// Créditos de IA (FusAI): saldo e recarga com Pix sem sair do Studio
// ============================================================

const VALORES_DA_RECARGA = [2000, 5000, 10000, 20000] as const;
const PAGO = ['RECEIVED', 'CONFIRMED'];
const ENCERRADO = ['EXPIRED', 'CANCELED', 'CANCELLED', 'FAILED'];

function CartaoDeCreditos() {
  const creditos = useDados<CreditosDeIa>(() => creditosDeIa.obter());
  const [valor, setValor] = useState<number>(5000);
  const [outro, setOutro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [recarga, setRecarga] = useState<RecargaDeIa | null>(null);
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const dados = creditos.dados;
  const minimo = dados?.minimoCentavos ?? 500;
  const maximo = dados?.maximoCentavos ?? 1_000_000;
  // "1.234,56" ou "50": milhar com ponto, centavos com vírgula.
  const valorDeOutro = Math.round(Number(outro.trim().split('.').join('').replace(',', '.')) * 100);
  const escolhido = outro ? valorDeOutro : valor;
  const valorValido = Number.isInteger(escolhido) && escolhido >= minimo && escolhido <= maximo;
  const esperando = recarga !== null && !PAGO.includes(recarga.status) && !ENCERRADO.includes(recarga.status);

  // Acompanha o Pix até o saldo entrar (a cada 3 s, como a FusAI orienta; o Pix vale 60 min).
  const pendente = esperando ? recarga.id : null;
  const recarregarSaldo = creditos.recarregar;
  useEffect(() => {
    if (!pendente) return;
    let vivo = true;
    let relogio = 0;
    const limite = Date.now() + 61 * 60_000;
    const consultar = async () => {
      if (!vivo || Date.now() > limite) return;
      try {
        const r = await creditosDeIa.recarga(pendente);
        if (!vivo) return;
        setRecarga((atual) => (atual ? { ...atual, ...r, copiaECola: r.copiaECola ?? atual.copiaECola, qrBase64: r.qrBase64 ?? atual.qrBase64 } : r));
        if (PAGO.includes(r.status)) {
          setMensagem({ tom: 'sucesso', texto: 'Pagamento recebido: os créditos já estão no saldo.' });
          recarregarSaldo();
          return;
        }
        if (ENCERRADO.includes(r.status)) {
          setMensagem({ tom: 'erro', texto: 'O Pix expirou sem pagamento. Gere outro quando quiser.' });
          return;
        }
      } catch {
        // Uma consulta que falha não encerra o acompanhamento.
      }
      if (vivo) relogio = window.setTimeout(() => void consultar(), 3000);
    };
    relogio = window.setTimeout(() => void consultar(), 3000);
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
    };
  }, [pendente, recarregarSaldo]);

  const gerar = async () => {
    setGerando(true);
    setMensagem(null);
    setCopiado(false);
    try {
      setRecarga(await creditosDeIa.recarregar(escolhido));
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível gerar o Pix.' });
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    if (!recarga?.copiaECola) return;
    try {
      await navigator.clipboard.writeText(recarga.copiaECola);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <section className="cartao config__cartao" aria-labelledby="titulo-creditos">
      <header className="config__cabeca">
        <div>
          <h3 id="titulo-creditos">Créditos de IA</h3>
          <p className="dica">
            A IA do Studio sai deste saldo, em reais. Coloque créditos com Pix: o saldo cai em segundos. Sem saldo, as funções com IA param e voltam assim
            que você recarrega.
          </p>
        </div>
      </header>
      <Aviso mensagem={mensagem} />

      {creditos.carregando ? (
        <span className="esqueleto" style={{ height: 48 }} />
      ) : creditos.erro || dados?.erro ? (
        <Aviso mensagem={{ tom: 'erro', texto: creditos.erro ?? dados?.erro ?? 'não foi possível ler o saldo.' }} />
      ) : (
        <>
          <div className="config__gasto">
            <strong>{reaisDeMicros(dados?.saldoMicros)}</strong>
            <span className="texto-secundario">disponível na FusAI</span>
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => creditos.recarregar()}>
              Atualizar
            </button>
          </div>
          {dados?.gastoDoMesMicros !== undefined && (
            <p className="texto-secundario" style={{ fontSize: 13, margin: 0 }}>
              Gasto neste mês: <strong>{reaisDeMicros(dados.gastoDoMesMicros)}</strong>
              {dados.chamadasDoMes !== undefined && ` · ${dados.chamadasDoMes} ${dados.chamadasDoMes === 1 ? 'chamada' : 'chamadas'} à IA`}
            </p>
          )}
        </>
      )}

      {esperando ? (
        <div style={{ display: 'grid', gap: 'var(--e2)', justifyItems: 'start' }}>
          <p style={{ margin: 0 }}>
            Pague o Pix de <strong>{reaisDeCentavos(recarga.valorCentavos)}</strong> no app do seu banco. Esperando o pagamento…
          </p>
          {recarga.qrBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${recarga.qrBase64}`} alt="QR Code do Pix" width={220} height={220} style={{ borderRadius: 8, background: '#fff', padding: 8 }} />
          )}
          {recarga.copiaECola && (
            <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap', width: '100%' }}>
              <input className="campo__entrada crescer" readOnly value={recarga.copiaECola} aria-label="Pix copia e cola" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => void copiar()}>
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          )}
          <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
            {recarga.urlDePagamento && (
              <a className="botao botao--fantasma botao--pequeno" href={recarga.urlDePagamento} target="_blank" rel="noopener noreferrer">
                Abrir a página do Pix
              </a>
            )}
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setRecarga(null)}>
              Fechar
            </button>
          </div>
          {recarga.expiraEm && (
            <span className="texto-secundario" style={{ fontSize: 12.5 }}>
              Vale até {new Date(recarga.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            </span>
          )}
        </div>
      ) : (
        dados?.usaFusai &&
        !dados.erro && (
          <form
            className="config__formulario"
            onSubmit={(e) => {
              e.preventDefault();
              if (valorValido) void gerar();
            }}
          >
            <span className="campo__rotulo">Adicionar créditos</span>
            <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }} role="radiogroup" aria-label="Valor da recarga">
              {VALORES_DA_RECARGA.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!outro && valor === v}
                  className={`botao botao--pequeno ${!outro && valor === v ? 'botao--primario' : 'botao--secundario'}`}
                  onClick={() => {
                    setValor(v);
                    setOutro('');
                  }}
                >
                  {reaisDeCentavos(v)}
                </button>
              ))}
              <input
                className="campo__entrada"
                style={{ width: 130 }}
                inputMode="decimal"
                placeholder="Outro valor"
                aria-label="Outro valor, em reais"
                value={outro}
                onChange={(e) => setOutro(e.target.value)}
              />
            </div>
            {outro && !valorValido && (
              <span className="campo__ajuda">
                De {reaisDeCentavos(minimo)} a {reaisDeCentavos(maximo)}.
              </span>
            )}
            {(dados.taxaPct ?? 0) > 0 && <span className="campo__ajuda">A recarga tem taxa de {dados.taxaPct}% (o Pix): o crédito é o valor menos a taxa.</span>}
            {dados.recargaDisponivel === false && (
              <span className="campo__ajuda">A recarga pede o CPF ou CNPJ da organização no painel da FusAI (Configurações).</span>
            )}
            <div>
              <button type="submit" className="botao botao--primario" disabled={!valorValido || gerando || dados.recargaDisponivel === false}>
                {gerando ? 'Gerando o Pix…' : `Gerar Pix de ${valorValido ? reaisDeCentavos(escolhido) : '…'}`}
              </button>
            </div>
          </form>
        )
      )}
    </section>
  );
}

// ============================================================
// Banco de mídia
// ============================================================

const BANCOS = {
  pexels: {
    nome: 'Pexels',
    titulo: 'Fotos e vídeos (Pexels)',
    texto: 'Vídeos e fotos verticais de ótima qualidade para cobrir a fala (B-roll).',
    link: 'https://www.pexels.com/api/',
    rotuloDoLink: 'pexels.com/api',
    passo: 'entre, clique em “Your API key” e copie',
  },
  pixabay: {
    nome: 'Pixabay',
    titulo: 'Fotos, ilustrações, vetores e vídeos (Pixabay)',
    texto: 'Mais de 6 milhões de itens, com ilustrações e vetores em PNG transparente, ótimos para ilustrar conceitos.',
    link: 'https://pixabay.com/api/docs/',
    rotuloDoLink: 'pixabay.com/api/docs',
    passo: 'entre na conta e a chave aparece na própria página, em “key”',
  },
  pollinations: {
    nome: 'Pollinations',
    titulo: 'Imagens criadas por IA (Pollinations)',
    texto: 'Quando o banco de fotos não tem a cena, a IA cria a imagem (cerca de 0,004 pollen cada; a conta vem com crédito grátis).',
    link: 'https://enter.pollinations.ai/keys',
    rotuloDoLink: 'enter.pollinations.ai',
    passo: 'entre, crie uma chave secreta (começa com sk_) e copie',
  },
} as const;

/** A chave de um banco de mídia com chave (Pexels, Pixabay). */
function CartaoDoBanco({ provider }: { provider: 'pexels' | 'pixabay' | 'pollinations' }) {
  const b = BANCOS[provider];
  const chave = useDados<ChaveDoBanco>(() => bancoDeMidia.chave(provider));
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);
  const atual = chave.dados;

  const salvar = async () => {
    setSalvando(true);
    setMensagem(null);
    try {
      chave.definir(await bancoDeMidia.salvarChave(valor.trim(), provider));
      setValor('');
      setMensagem({ tom: 'sucesso', texto: `Chave salva. No editor, Biblioteca > Mídia e as mídias da IA já buscam no ${b.nome}.` });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar a chave.' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!window.confirm(`Remover a chave do ${b.nome}? As buscas deixam de incluir o ${b.nome}.`)) return;
    try {
      chave.definir(await bancoDeMidia.removerChave(provider));
      setMensagem({ tom: 'sucesso', texto: 'Chave removida.' });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível remover.' });
    }
  };

  return (
    <section className="cartao config__cartao" aria-labelledby={`titulo-banco-${provider}`}>
      <header className="config__cabeca">
        <div>
          <h3 id={`titulo-banco-${provider}`}>{b.titulo}</h3>
          <p>{b.texto} O arquivo escolhido vira mídia do Studio, com a licença e o crédito do autor guardados.</p>
        </div>
        {atual && <Selo ativo={atual.configured} sim="Ativo" nao="Sem chave" />}
      </header>
      <Aviso mensagem={mensagem} />
      {atual?.configured && (
        <div className="config__chave">
          <dl>
            <div>
              <dt>Chave</dt>
              <dd style={{ fontFamily: 'ui-monospace, monospace' }}>{atual.keyPrefix}••••••••</dd>
            </div>
          </dl>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => void remover()}>
            Remover
          </button>
        </div>
      )}
      <form
        className="config__formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (valor.trim().length >= 20) void salvar();
        }}
      >
        <label className="campo" style={{ margin: 0 }}>
          <span className="campo__rotulo">{atual?.configured ? `Trocar a chave do ${b.nome}` : `Cole a chave do ${b.nome}`}</span>
          <input className="campo__entrada" type="password" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} />
          <span className="campo__ajuda">
            Grátis em{' '}
            <a href={b.link} target="_blank" rel="noreferrer">
              {b.rotuloDoLink}
            </a>{' '}
            ({b.passo}).
          </span>
        </label>
        <div>
          <button type="submit" className="botao botao--primario" disabled={salvando || valor.trim().length < 20}>
            {salvando ? 'Salvando…' : 'Salvar a chave'}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Os bancos de mídia: dois com chave e as fontes abertas (sem chave). */
function SecaoDoBanco() {
  return (
    <div className="config__pilha">
      <CartaoDoBanco provider="pexels" />
      <CartaoDoBanco provider="pixabay" />
      <CartaoDoBanco provider="pollinations" />
      <section className="cartao config__cartao" aria-labelledby="titulo-abertas">
        <header className="config__cabeca">
          <div>
            <h3 id="titulo-abertas">Já funcionando, sem cadastro</h3>
            <p>A busca do editor e as mídias sugeridas pela IA também usam estas fontes, todas de licença livre para uso comercial:</p>
          </div>
          <Selo ativo sim="Ativas" nao="" />
        </header>
        <ul className="config__fontes">
          <li>
            <strong>Openverse</strong> — mais de 800 milhões de imagens Creative Commons (só CC0, domínio público e CC-BY, com o crédito guardado).
          </li>
          <li>
            <strong>Iconify</strong> — mais de 300 mil ícones e logos de marcas, só de coleções MIT, Apache, ISC ou CC0/CC-BY.
          </li>
          <li>
            <strong>3dicons</strong> — ícones 3D (CC0) em PNG transparente.
          </li>
          <li>
            <strong>Microsoft Fluent Emoji 3D</strong> — cerca de 1.300 emojis 3D (MIT) em PNG transparente.
          </li>
        </ul>
        <p className="campo__ajuda" style={{ margin: 0 }}>
          O Google Imagens não entra: a API foi fechada e as imagens de lá não têm licença de uso. Logos de marcas são para uso informativo (falar do
          Bitcoin, do Instagram), nunca como se fossem a marca do seu cliente.
        </p>
      </section>
    </div>
  );
}

// ============================================================
// Armazenamento
// ============================================================

function SecaoDeArmazenamento() {
  const { dados, carregando, erro } = useDados<Armazenamento>(() => apiArmazenamento.obter());

  return (
    <div className="config__pilha">
      <section className="cartao config__cartao" aria-labelledby="titulo-armazenamento">
        <header className="config__cabeca">
          <div>
            <h3 id="titulo-armazenamento">Espaço usado</h3>
            <p>O Studio guarda as gravações enquanto você edita, e o material da marca para sempre.</p>
          </div>
        </header>
        {carregando && <span className="esqueleto" style={{ height: 60 }} />}
        {erro && <Aviso mensagem={{ tom: 'erro', texto: erro }} />}
        {dados && (
          <>
            <Cota titulo="Vídeos em edição" texto="Gravações, prévias e vídeos exportados. Exclua projetos antigos para liberar espaço." uso={dados.edicao} />
            <Cota titulo="Material da marca" texto="Logo, fontes e trilhas. Não expira." uso={dados.permanente} />
          </>
        )}
      </section>
    </div>
  );
}

function Cota({ titulo, texto, uso }: { titulo: string; texto: string; uso: Armazenamento['edicao'] }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="linha entre">
        <strong style={{ fontSize: 14 }}>{titulo}</strong>
        <span className="texto-secundario" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {formatarBytes(uso.usadoBytes)} de {formatarBytes(uso.quotaBytes)}
        </span>
      </div>
      <div className="barra" role="progressbar" aria-valuenow={uso.percentual} aria-valuemin={0} aria-valuemax={100} aria-label={titulo}>
        <div className="barra__preenchida" style={{ width: `${Math.min(100, uso.percentual)}%`, background: uso.percentual >= 90 ? 'var(--danger)' : undefined }} />
      </div>
      <span className="texto-secundario" style={{ fontSize: 12 }}>
        {uso.mensagem ?? texto}
      </span>
    </div>
  );
}
