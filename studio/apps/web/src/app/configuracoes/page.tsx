'use client';

// ============================================================
// Configurações, em abas: cada assunto numa tela, com uma ação clara.
//
//   Inteligência artificial  a chave da DeepSeek (o campo só aparece
//                            para colocar ou trocar) e o consumo do mês;
//   Banco de mídia           a chave do Pexels (B-roll no editor);
//   Armazenamento            o espaço usado;
//   Aplicativo               ícone (com o editor de recorte), nome,
//                            cores, capturas e instalação.
//
// A aba aberta fica no endereço (#ia, #midia...), para voltar direto.
// ============================================================

import { dolares } from '../../lib/dinheiro';
import { useEffect, useState } from 'react';
import { Topbar } from '../../components/shell/Topbar';
import { SecaoDoApp } from '../../components/pwa/SecaoDoApp';
import { useDados } from '../../lib/useDados';
import {
  bancoDeMidia,
  type ChaveDoBanco,
  armazenamento as apiArmazenamento,
  credencialDeIa,
  ia as apiIa,
  type Armazenamento,
  type ConsumoDeIa,
  type CredencialDeIa,
} from '../../lib/api';
import { formatarBytes } from '../../lib/upload';
import { IconeAviso, IconeCelular, IconeCheck, IconeIA, IconeMidia, IconeNuvem, IconeOlho, IconeOlhoFechado } from '../../components/icones';

type Aba = 'ia' | 'midia' | 'armazenamento' | 'app';

const ABAS: ReadonlyArray<{ id: Aba; rotulo: string; ajuda: string; Icone: typeof IconeIA }> = [
  { id: 'ia', rotulo: 'Inteligência artificial', ajuda: 'Chave e consumo do mês', Icone: IconeIA },
  { id: 'midia', rotulo: 'Banco de mídia', ajuda: 'Fotos e vídeos do Pexels', Icone: IconeMidia },
  { id: 'armazenamento', rotulo: 'Armazenamento', ajuda: 'Espaço usado', Icone: IconeNuvem },
  { id: 'app', rotulo: 'Aplicativo', ajuda: 'Ícone, nome e instalação', Icone: IconeCelular },
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
            <p className="texto-secundario">Chaves, consumo, espaço e o app instalado.</p>
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
  const consumo = useDados<ConsumoDeIa>(() => apiIa.consumo());

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

  const [limite, setLimite] = useState('');
  const [salvandoLimite, setSalvandoLimite] = useState(false);
  const [mensagemDoLimite, setMensagemDoLimite] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const atual = credencial.dados;
  const chaveValida = chave.trim().length >= 16;
  const mostrarFormulario = !atual?.configured || trocando;

  const salvar = async () => {
    setSalvando(true);
    setMensagem(null);
    try {
      const salvo = await credencialDeIa.salvar({ provider: 'deepseek', apiKey: chave.trim() });
      credencial.definir(salvo);
      setChave('');
      setTrocando(false);
      setMensagem({ tom: 'sucesso', texto: 'Chave salva. As próximas análises já usam a IA; vídeos montados sem IA podem ser analisados de novo no editor.' });
      consumo.recarregar();
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar a chave.' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!window.confirm('Remover a chave de IA? Os próximos vídeos serão montados sem IA.')) return;
    try {
      credencial.definir(await credencialDeIa.remover());
      setMensagem({ tom: 'sucesso', texto: 'Chave removida.' });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível remover.' });
    }
  };

  const salvarLimite = async () => {
    const valor = Number(limite.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 1 || valor > 500) {
      setMensagemDoLimite({ tom: 'erro', texto: 'o limite precisa ficar entre US$ 1 e US$ 500 por mês.' });
      return;
    }
    setSalvandoLimite(true);
    try {
      const r = await apiIa.definirLimite(Math.round(valor * 100));
      if (!r.ok) setMensagemDoLimite({ tom: 'erro', texto: r.motivo ?? 'não foi possível salvar o limite.' });
      else {
        setMensagemDoLimite({ tom: 'sucesso', texto: 'Limite mensal atualizado.' });
        setLimite('');
        consumo.recarregar();
      }
    } catch (e) {
      setMensagemDoLimite({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar o limite.' });
    } finally {
      setSalvandoLimite(false);
    }
  };

  const uso = consumo.dados;
  const pct = uso ? Math.min(100, (uso.gastoCentavos / Math.max(1, uso.limiteCentavos)) * 100) : 0;

  return (
    <div className="config__pilha">
      {/* ---------- Chave ---------- */}
      <section className="cartao config__cartao" aria-labelledby="titulo-ia">
        <header className="config__cabeca">
          <div>
            <h3 id="titulo-ia">Chave da IA (DeepSeek)</h3>
            <p>
              A IA escolhe os melhores trechos, sugere cortes e escreve roteiros. Sem chave, o Studio monta o vídeo com toda a fala, sem as pausas
              longas, e você corta na timeline.
            </p>
          </div>
          {atual && <Selo ativo={atual.configured} sim="Ativa" nao="Sem chave" />}
        </header>
        <Aviso mensagem={mensagem} />

        {credencial.carregando ? (
          <span className="esqueleto" style={{ height: 48 }} />
        ) : credencial.erro ? (
          <Aviso mensagem={{ tom: 'erro', texto: credencial.erro }} />
        ) : atual?.configured ? (
          <div className="config__chave">
            <dl>
              <div>
                <dt>Chave</dt>
                <dd style={{ fontFamily: 'ui-monospace, monospace' }}>{atual.keyPrefix}••••••••</dd>
              </div>
              <div>
                <dt>Último uso</dt>
                <dd>{atual.lastUsedAt ? new Date(atual.lastUsedAt).toLocaleString('pt-BR') : 'ainda não usada'}</dd>
              </div>
            </dl>
            <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
              {/* O teste separa "a chave não funciona" de "a IA ainda não foi
                  chamada": uma chamada mínima, e o resultado exato da DeepSeek. */}
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
              <span className="campo__rotulo">{atual?.configured ? 'Nova chave da DeepSeek' : 'Cole a chave da DeepSeek'}</span>
              <span className="linha" style={{ gap: 'var(--e2)' }}>
                <input
                  className="campo__entrada crescer"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-…"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  aria-describedby="ajuda-chave"
                />
                <button type="button" className="botao-icone" aria-label={mostrar ? 'Esconder a chave' : 'Mostrar a chave'} onClick={() => setMostrar((v) => !v)}>
                  {mostrar ? <IconeOlhoFechado size={18} /> : <IconeOlho size={18} />}
                </button>
              </span>
              <span id="ajuda-chave" className="campo__ajuda">
                Crie em platform.deepseek.com → API keys. A chave é guardada cifrada e nunca volta para a tela.
                {chave && !chaveValida && ' A chave tem pelo menos 16 caracteres.'}
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

        {/* Sem campo de modelo: o Studio escolhe o modelo e o nível de
            raciocínio de cada função (o mais barato que dá conta dela). */}
        <p className="campo__ajuda" style={{ margin: 0 }}>
          O Studio usa o DeepSeek V4.1 Flash e só liga o raciocínio (mais caro) na escolha dos trechos e no acabamento dos cortes.
        </p>
      </section>

      {/* ---------- Consumo ---------- */}
      <section className="cartao config__cartao" aria-labelledby="titulo-consumo">
        <header className="config__cabeca">
          <div>
            <h3 id="titulo-consumo">Consumo deste mês</h3>
            <p>Quanto a IA gastou e o limite que a trava. Ao chegar no limite, o Studio segue funcionando sem IA até o mês virar.</p>
          </div>
        </header>
        {consumo.carregando ? (
          <span className="esqueleto" style={{ height: 32 }} />
        ) : uso ? (
          <>
            <div className="config__gasto">
              <strong>{dolares(uso.gastoCentavos)}</strong>
              <span className="texto-secundario">
                de {dolares(uso.limiteCentavos)} · {uso.chamadas} {uso.chamadas === 1 ? 'chamada' : 'chamadas'}
              </span>
            </div>
            <div className="barra" role="progressbar" aria-valuenow={uso.gastoCentavos} aria-valuemin={0} aria-valuemax={uso.limiteCentavos} aria-label="Gasto de IA no mês">
              <div
                className="barra__preenchida"
                style={{
                  width: `${pct}%`,
                  background: uso.estado === 'bloqueado' ? 'var(--danger)' : uso.estado === 'aviso' ? 'var(--warning)' : undefined,
                }}
              />
            </div>
            {uso.aviso && (
              <div className="aviso aviso--atencao">
                <IconeAviso size={16} />
                <span>{uso.aviso}</span>
              </div>
            )}
            {(uso.economiaCentavos ?? 0) > 0 && (
              <p className="texto-secundario" style={{ fontSize: 13, margin: 0 }}>
                Economia no mês: <strong>{dolares(uso.economiaCentavos ?? 0)}</strong>
                {uso.acertosDoCache ? ` · ${uso.acertosDoCache} respostas reaproveitadas sem custo` : ''} (cache e horário fora do pico).
              </p>
            )}
            {uso.qualidade && uso.qualidade.videos > 0 && uso.qualidade.aproveitamentoMedio !== null && (
              <p className="texto-secundario" style={{ fontSize: 13, margin: 0 }}>
                A seleção da IA foi mantida em <strong>{Math.round(uso.qualidade.aproveitamentoMedio * 100)}%</strong> nos {uso.qualidade.videos}{' '}
                {uso.qualidade.videos === 1 ? 'vídeo exportado' : 'vídeos exportados'} dos últimos 90 dias.
                {uso.qualidade.aproveitamentoMedio < 0.6 &&
                  ' Abaixo de 60%: você está refazendo muito do que a IA escolhe; vale ajustar o roteiro ou o perfil de comunicação.'}
              </p>
            )}
            {uso.detalhe.length > 0 && (
              <details className="config__detalhe">
                <summary>Gasto por função</summary>
                <ul>
                  {uso.detalhe.map((d) => (
                    <li key={d.chamada}>
                      <span>{d.rotulo}</span>
                      <span>{dolares(d.centavos)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="texto-secundario">Sem dados de consumo.</p>
        )}

        {atual?.configured && (
          <form
            className="config__limite"
            onSubmit={(e) => {
              e.preventDefault();
              void salvarLimite();
            }}
          >
            <label className="campo" style={{ margin: 0 }}>
              <span className="campo__rotulo">Limite mensal (US$)</span>
              <input
                className="campo__entrada"
                inputMode="decimal"
                placeholder={uso ? (uso.limiteCentavos / 100).toFixed(2) : '20.00'}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </label>
            <button type="submit" className="botao botao--secundario" disabled={!limite || salvandoLimite}>
              {salvandoLimite ? 'Salvando…' : 'Mudar o limite'}
            </button>
          </form>
        )}
        <Aviso mensagem={mensagemDoLimite} />
      </section>
    </div>
  );
}

// ============================================================
// Banco de mídia
// ============================================================

/** A chave do Pexels: busca de B-roll e fotos dentro do editor. */
function SecaoDoBanco() {
  const chave = useDados<ChaveDoBanco>(() => bancoDeMidia.chave());
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);
  const atual = chave.dados;

  const salvar = async () => {
    setSalvando(true);
    setMensagem(null);
    try {
      chave.definir(await bancoDeMidia.salvarChave(valor.trim()));
      setValor('');
      setMensagem({ tom: 'sucesso', texto: 'Chave salva. No editor, Biblioteca > Mídia já busca no Pexels.' });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar a chave.' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!window.confirm('Remover a chave do Pexels? A busca de imagens e vídeos deixa de funcionar.')) return;
    try {
      chave.definir(await bancoDeMidia.removerChave());
      setMensagem({ tom: 'sucesso', texto: 'Chave removida.' });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível remover.' });
    }
  };

  return (
    <div className="config__pilha">
      <section className="cartao config__cartao" aria-labelledby="titulo-banco">
        <header className="config__cabeca">
          <div>
            <h3 id="titulo-banco">Banco de fotos e vídeos (Pexels)</h3>
            <p>
              Com uma chave gratuita do Pexels, o editor busca vídeos e fotos para cobrir a fala (B-roll). O arquivo escolhido vira mídia do Studio, com
              o crédito do autor guardado.
            </p>
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
            <span className="campo__rotulo">{atual?.configured ? 'Trocar a chave do Pexels' : 'Cole a chave do Pexels'}</span>
            <input className="campo__entrada" type="password" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} />
            <span className="campo__ajuda">
              Crie de graça em{' '}
              <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">
                pexels.com/api
              </a>{' '}
              (entre, clique em &ldquo;Your API key&rdquo; e copie).
            </span>
          </label>
          <div>
            <button type="submit" className="botao botao--primario" disabled={salvando || valor.trim().length < 20}>
              {salvando ? 'Salvando…' : 'Salvar a chave'}
            </button>
          </div>
        </form>
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
