'use client';

// ============================================================
// Configurações — chave de IA, teto de gasto e armazenamento.
//
// A API tinha as rotas desde a Fase 5a, mas nenhuma tela as usava: a
// chave de IA só entrava por linha de comando, e sem ela a análise
// nunca rodava. É daqui que a IA passa a funcionar.
// ============================================================

import { useState } from 'react';
import { Topbar } from '../../components/shell/Topbar';
import { useDados } from '../../lib/useDados';
import {
  armazenamento as apiArmazenamento,
  credencialDeIa,
  ia as apiIa,
  type Armazenamento,
  type ConsumoDeIa,
  type CredencialDeIa,
} from '../../lib/api';
import { formatarBytes } from '../../lib/upload';
import { IconeAviso, IconeCheck, IconeIA, IconeNuvem, IconeOlho, IconeOlhoFechado } from '../../components/icones';

export default function ConfiguracoesPage() {
  return (
    <>
      <Topbar trilha={['Configurações']} />
      <div className="conteudo">
        <div style={{ maxWidth: 820, display: 'grid', gap: 'var(--e5)' }}>
          <h1>Configurações</h1>
          <SecaoDeIa />
          <SecaoDeArmazenamento />
        </div>
      </div>
    </>
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
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [limite, setLimite] = useState('');
  const [salvandoLimite, setSalvandoLimite] = useState(false);

  const atual = credencial.dados;
  const chaveValida = chave.trim().length >= 16;

  const salvar = async () => {
    setSalvando(true);
    setMensagem(null);
    try {
      const salvo = await credencialDeIa.salvar({
        provider: 'deepseek',
        apiKey: chave.trim(),
      });
      credencial.definir(salvo);
      setChave('');
      setMensagem({
        tom: 'sucesso',
        texto: 'Chave salva. As próximas análises já usam a IA — vídeos montados sem IA podem ser analisados de novo no editor.',
      });
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
    const dolares = Number(limite.replace(',', '.'));
    if (!Number.isFinite(dolares) || dolares < 1 || dolares > 500) {
      setMensagem({ tom: 'erro', texto: 'o limite precisa ficar entre US$ 1 e US$ 500 por mês.' });
      return;
    }
    setSalvandoLimite(true);
    try {
      const r = await apiIa.definirLimite(Math.round(dolares * 100));
      if (!r.ok) setMensagem({ tom: 'erro', texto: r.motivo ?? 'não foi possível salvar o limite.' });
      else {
        setMensagem({ tom: 'sucesso', texto: 'Limite mensal atualizado.' });
        setLimite('');
        consumo.recarregar();
      }
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar o limite.' });
    } finally {
      setSalvandoLimite(false);
    }
  };

  const uso = consumo.dados;

  return (
    <section className="cartao" style={{ display: 'grid', gap: 'var(--e4)' }} aria-labelledby="titulo-ia">
      <div className="linha entre" style={{ flexWrap: 'wrap', gap: 'var(--e3)' }}>
        <h2 id="titulo-ia" className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeIA size={20} weight="fill" color="var(--accent)" />
          Inteligência artificial
        </h2>
        {atual && (
          <span className={`selo ${atual.configured ? 'selo--sucesso' : 'selo--aviso'}`}>
            <span className="selo__ponto" aria-hidden />
            {atual.configured ? 'Ativa' : 'Sem chave'}
          </span>
        )}
      </div>

      <p className="texto-secundario" style={{ fontSize: 14 }}>
        A IA escolhe os melhores trechos da gravação, sugere cortes e ajuda a escrever roteiros. Sem
        chave, o Studio continua funcionando: o vídeo é montado com toda a fala, sem as pausas
        longas, e você corta na timeline.
      </p>

      {mensagem && (
        <div className={`aviso ${mensagem.tom === 'erro' ? 'aviso--erro' : 'aviso--info'}`} role={mensagem.tom === 'erro' ? 'alert' : 'status'}>
          {mensagem.tom === 'erro' ? <IconeAviso size={16} /> : <IconeCheck size={16} />}
          <span>{mensagem.texto}</span>
        </div>
      )}

      {credencial.carregando ? (
        <span className="esqueleto" style={{ height: 48 }} />
      ) : credencial.erro ? (
        <div className="aviso aviso--erro" role="alert">
          <IconeAviso size={16} />
          <span>{credencial.erro}</span>
        </div>
      ) : atual?.configured ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 14 }}>
          <dt className="texto-secundario">Provedor</dt>
          <dd>DeepSeek</dd>
          <dt className="texto-secundario">Chave</dt>
          <dd style={{ fontFamily: 'monospace' }}>{atual.keyPrefix}••••••••</dd>
          <dt className="texto-secundario">Modelo</dt>
          <dd>{atual.model || 'padrão'}</dd>
          <dt className="texto-secundario">Último uso</dt>
          <dd>{atual.lastUsedAt ? new Date(atual.lastUsedAt).toLocaleString('pt-BR') : 'ainda não usada'}</dd>
        </dl>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (chaveValida) void salvar();
        }}
        style={{ display: 'grid', gap: 'var(--e3)' }}
      >
        <label className="campo">
          <span className="campo__rotulo">{atual?.configured ? 'Trocar a chave da API DeepSeek' : 'Chave da API DeepSeek'}</span>
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
            <button
              type="button"
              className="botao-icone"
              aria-label={mostrar ? 'Esconder a chave' : 'Mostrar a chave'}
              onClick={() => setMostrar((v) => !v)}
            >
              {mostrar ? <IconeOlhoFechado size={18} /> : <IconeOlho size={18} />}
            </button>
          </span>
          <span id="ajuda-chave" className="campo__ajuda">
            Crie em platform.deepseek.com → API keys. A chave é guardada cifrada e nunca volta para a
            tela; só os primeiros caracteres aparecem para você reconhecê-la.
          </span>
        </label>

        {/* Sem campo de modelo: o Studio escolhe o modelo e o nível de
            raciocínio de cada função (o mais barato que dá conta dela),
            e um modelo digitado aqui era salvo e ignorado. */}
        <p className="campo__ajuda" style={{ maxWidth: 520 }}>
          O Studio usa o DeepSeek V4.1 Flash e só liga o raciocínio (mais caro) na escolha dos trechos e no
          acabamento dos cortes.
        </p>

        <div className="linha" style={{ gap: 'var(--e3)', flexWrap: 'wrap' }}>
          <button type="submit" className="botao" disabled={!chaveValida || salvando}>
            {salvando ? 'Salvando…' : 'Salvar chave'}
          </button>
          {atual?.configured && (
            <button type="button" className="botao botao--fantasma" onClick={() => void remover()}>
              Remover chave
            </button>
          )}
          {chave && !chaveValida && (
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              A chave tem pelo menos 16 caracteres.
            </span>
          )}
        </div>
      </form>

      <hr className="separador" />

      <div style={{ display: 'grid', gap: 'var(--e3)' }}>
        <h3>Consumo deste mês</h3>
        {consumo.carregando ? (
          <span className="esqueleto" style={{ height: 32 }} />
        ) : uso ? (
          <>
            <div
              className="barra"
              role="progressbar"
              aria-valuenow={uso.gastoCentavos}
              aria-valuemin={0}
              aria-valuemax={uso.limiteCentavos}
              aria-label="Gasto de IA no mês"
            >
              <div
                className="barra__preenchida"
                style={{
                  width: `${Math.min(100, (uso.gastoCentavos / Math.max(1, uso.limiteCentavos)) * 100)}%`,
                  background: uso.estado === 'bloqueado' ? 'var(--danger)' : uso.estado === 'aviso' ? 'var(--warning)' : undefined,
                }}
              />
            </div>
            <p style={{ fontSize: 14 }}>
              US$ {(uso.gastoCentavos / 100).toFixed(2)} de US$ {(uso.limiteCentavos / 100).toFixed(2)} ·{' '}
              {uso.chamadas} {uso.chamadas === 1 ? 'chamada' : 'chamadas'}
            </p>
            {uso.aviso && (
              <div className="aviso aviso--atencao">
                <IconeAviso size={16} />
                <span>{uso.aviso}</span>
              </div>
            )}
            {(uso.economiaCentavos ?? 0) > 0 && (
              <p className="texto-secundario" style={{ fontSize: 13 }}>
                Economia no mês: <strong>US$ {((uso.economiaCentavos ?? 0) / 100).toFixed(2)}</strong>
                {uso.acertosDoCache ? ` · ${uso.acertosDoCache} respostas reaproveitadas sem custo` : ''}
                {' '}(cache e horário fora do pico).
              </p>
            )}
            {uso.qualidade && uso.qualidade.videos > 0 && uso.qualidade.aproveitamentoMedio !== null && (
              <p className="texto-secundario" style={{ fontSize: 13 }}>
                A seleção da IA foi mantida em{' '}
                <strong>{Math.round(uso.qualidade.aproveitamentoMedio * 100)}%</strong> nos{' '}
                {uso.qualidade.videos} {uso.qualidade.videos === 1 ? 'vídeo exportado' : 'vídeos exportados'} dos
                últimos 90 dias.
                {uso.qualidade.aproveitamentoMedio < 0.6 &&
                  ' Abaixo de 60%: você está refazendo muito do que a IA escolhe; vale ajustar o roteiro ou o perfil de comunicação.'}
              </p>
            )}
            {uso.detalhe.length > 0 && (
              <ul style={{ listStyle: 'none', display: 'grid', gap: 4, fontSize: 13 }}>
                {uso.detalhe.map((d) => (
                  <li key={d.chamada} className="linha entre">
                    <span className="texto-secundario">{d.rotulo}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>US$ {(d.centavos / 100).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="texto-secundario">Sem dados de consumo.</p>
        )}

        {atual?.configured && (
          <form
            className="linha"
            style={{ gap: 'var(--e2)', flexWrap: 'wrap', alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              void salvarLimite();
            }}
          >
            <label className="campo" style={{ maxWidth: 220 }}>
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
              {salvandoLimite ? 'Salvando…' : 'Salvar limite'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Armazenamento
// ============================================================

function SecaoDeArmazenamento() {
  const { dados, carregando, erro } = useDados<Armazenamento>(() => apiArmazenamento.obter());

  return (
    <section className="cartao" style={{ display: 'grid', gap: 'var(--e4)' }} aria-labelledby="titulo-armazenamento">
      <h2 id="titulo-armazenamento" className="linha" style={{ gap: 'var(--e2)' }}>
        <IconeNuvem size={20} />
        Armazenamento
      </h2>

      {carregando && <span className="esqueleto" style={{ height: 60 }} />}
      {erro && (
        <div className="aviso aviso--erro" role="alert">
          <IconeAviso size={16} />
          <span>{erro}</span>
        </div>
      )}

      {dados && (
        <>
          <Cota
            titulo="Vídeos em edição"
            texto="Gravações, prévias e vídeos exportados. Arquive projetos antigos para liberar espaço."
            uso={dados.edicao}
          />
          <Cota
            titulo="Material da marca"
            texto="Logo, fontes e trilhas. Não expira."
            uso={dados.permanente}
          />
        </>
      )}
    </section>
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
