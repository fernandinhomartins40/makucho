'use client';

// ============================================================
// Configurações > Aplicativo: como o Studio aparece instalado.
//
// Cada sistema recorta o ícone de um jeito, e é aqui que se confere
// ANTES de instalar:
//
//   - Android usa o ícone "maskable" e o recorta em círculo, gota ou
//     squircle, conforme o fabricante: o que importa precisa caber na
//     zona segura (o círculo central de 80%);
//   - iPhone/iPad usam o apple-touch-icon, sem transparência, com os
//     cantos arredondados pelo próprio iOS;
//   - a aba do navegador usa o favicon de 16–32px.
//
// O servidor gera todos os tamanhos a partir de UMA imagem de 512px
// ou mais. As capturas de tela ativam a instalação "rica" do Android
// e do Chrome (o diálogo com fotos do app, como numa loja).
// ============================================================

import { useRef, useState } from 'react';
import { app as apiApp, type ConfigDoApp } from '../../lib/api';
import { useDados } from '../../lib/useDados';
import { IconeAviso, IconeCelular, IconeEnviar, IconeInstalar, IconeLixeira } from '../icones';
import { PassoAPasso, useGuiaDeInstalacao } from './GuiaDeInstalacao';

type Mensagem = { tom: 'sucesso' | 'erro'; texto: string } | null;

export function SecaoDoApp() {
  const config = useDados<ConfigDoApp>(() => apiApp.obter());
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const executar = async (rotulo: string, acao: () => Promise<ConfigDoApp>, sucesso: string) => {
    setOcupado(rotulo);
    setMensagem(null);
    try {
      config.definir(await acao());
      setMensagem({ tom: 'sucesso', texto: sucesso });
    } catch (e) {
      setMensagem({ tom: 'erro', texto: e instanceof Error ? e.message : 'não deu certo.' });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="cartao" style={{ display: 'grid', gap: 'var(--e5)' }} aria-labelledby="titulo-app">
      <div>
        <h2 id="titulo-app" className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeCelular size={20} />
          Aplicativo
        </h2>
        <p className="texto-secundario">
          Nome, cores e ícones do Studio instalado no celular e no computador. As mudanças chegam a
          quem instalar a partir de agora; quem já instalou recebe o ícone novo quando o sistema
          atualizar o app (no Android, em até um dia).
        </p>
      </div>

      {config.carregando && <span className="esqueleto" style={{ height: 120 }} />}
      {config.erro && (
        <div className="aviso aviso--erro" role="alert">
          <IconeAviso size={16} />
          <span>{config.erro}</span>
        </div>
      )}

      {mensagem && (
        <div className={`aviso aviso--${mensagem.tom === 'sucesso' ? 'sucesso' : 'erro'}`} role="status" aria-live="polite">
          <span>{mensagem.texto}</span>
        </div>
      )}

      {config.dados && (
        <>
          <Identidade
            config={config.dados}
            salvando={ocupado === 'identidade'}
            onSalvar={(dados) => void executar('identidade', () => apiApp.salvar(dados), 'Nome e cores salvos.')}
          />
          <Icones
            config={config.dados}
            ocupado={ocupado}
            onEnviar={(tipo, arquivo) =>
              void executar(tipo, () => apiApp.enviarIcone(tipo, arquivo), 'Ícone atualizado. Todos os tamanhos foram gerados.')
            }
            onRemover={(tipo) => void executar(tipo, () => apiApp.removerIcone(tipo), 'Voltou ao ícone padrão.')}
          />
          <Capturas
            config={config.dados}
            ocupado={ocupado === 'captura'}
            onEnviar={(arquivo, formFactor, rotulo) =>
              void executar('captura', () => apiApp.enviarCaptura(arquivo, formFactor, rotulo), 'Captura adicionada.')
            }
            onRemover={(indice) => void executar('captura', () => apiApp.removerCaptura(indice), 'Captura removida.')}
          />
          <InstalarAqui />
          <p className="campo__ajuda">
            O manifesto que os navegadores leem:{' '}
            <a href="/api/pwa/manifest.webmanifest" target="_blank" rel="noreferrer">
              manifest.webmanifest
            </a>
          </p>
        </>
      )}
    </section>
  );
}

// ---------- Nome e cores ----------

function Identidade({
  config,
  salvando,
  onSalvar,
}: {
  config: ConfigDoApp;
  salvando: boolean;
  onSalvar: (dados: Partial<ConfigDoApp>) => void;
}) {
  const [nome, setNome] = useState(config.name);
  const [curto, setCurto] = useState(config.shortName);
  const [descricao, setDescricao] = useState(config.description);
  const [tema, setTema] = useState(config.themeColor);
  const [fundo, setFundo] = useState(config.backgroundColor);

  const hex = /^#[0-9a-f]{6}$/i;
  const valido = nome.trim() && curto.trim() && hex.test(tema) && hex.test(fundo);
  const mudou =
    nome !== config.name ||
    curto !== config.shortName ||
    descricao !== config.description ||
    tema !== config.themeColor ||
    fundo !== config.backgroundColor;

  return (
    <div className="app-config__identidade">
      <div>
        <label className="campo">
          <span className="campo__rotulo">Nome completo</span>
          <input className="campo__entrada" value={nome} maxLength={45} onChange={(e) => setNome(e.target.value)} />
          <span className="campo__ajuda">Aparece ao instalar e nas configurações do aparelho.</span>
        </label>
        <label className="campo">
          <span className="campo__rotulo">Nome sob o ícone ({curto.length}/12)</span>
          <input className="campo__entrada" value={curto} maxLength={12} onChange={(e) => setCurto(e.target.value)} />
          <span className="campo__ajuda">Curto: a tela inicial corta nomes longos com &quot;…&quot;.</span>
        </label>
        <label className="campo">
          <span className="campo__rotulo">Descrição</span>
          <input className="campo__entrada" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <div className="app-config__cores">
          <CampoDeCor rotulo="Cor da barra do sistema" valor={tema} onTrocar={setTema} />
          <CampoDeCor rotulo="Fundo da abertura" valor={fundo} onTrocar={setFundo} />
        </div>
        <button type="button" className="botao" disabled={!valido || !mudou || salvando} onClick={() => onSalvar({ name: nome.trim(), shortName: curto.trim(), description: descricao.trim(), themeColor: tema, backgroundColor: fundo })}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {/* Prévia da abertura: o que aparece enquanto o app carrega. */}
      <figure className="app-config__abertura" aria-label="Prévia da tela de abertura">
        <div className="app-config__aparelho" style={{ background: fundo }}>
          <span className="app-config__barra-sistema" style={{ background: tema }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={apiApp.urlDoIcone('icon-192', config.versao)} alt="" />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{curto || 'Studio'}</span>
        </div>
        <figcaption className="campo__ajuda">Abertura do app</figcaption>
      </figure>
    </div>
  );
}

function CampoDeCor({ rotulo, valor, onTrocar }: { rotulo: string; valor: string; onTrocar: (v: string) => void }) {
  return (
    <label className="campo">
      <span className="campo__rotulo">{rotulo}</span>
      <span className="linha" style={{ gap: 'var(--e2)' }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : '#000000'} onChange={(e) => onTrocar(e.target.value)} aria-label={rotulo} className="app-config__cor" />
        <input className="campo__entrada" value={valor} maxLength={7} onChange={(e) => onTrocar(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace' }} />
      </span>
    </label>
  );
}

// ---------- Ícones ----------

function Icones({
  config,
  ocupado,
  onEnviar,
  onRemover,
}: {
  config: ConfigDoApp;
  ocupado: string | null;
  onEnviar: (tipo: 'icone' | 'maskable', arquivo: File) => void;
  onRemover: (tipo: 'icone' | 'maskable') => void;
}) {
  const [zona, setZona] = useState(true);
  const v = config.versao;

  return (
    <div style={{ display: 'grid', gap: 'var(--e4)' }}>
      <h3>Ícone</h3>

      <div className="app-config__previas">
        <Previa legenda="Android · círculo">
          <span className="app-config__mascara" style={{ borderRadius: '50%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiApp.urlDoIcone('maskable-512', v)} alt="" />
            {zona && <span className="app-config__zona" aria-hidden />}
          </span>
        </Previa>
        <Previa legenda="Android · squircle">
          <span className="app-config__mascara" style={{ borderRadius: '32%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiApp.urlDoIcone('maskable-512', v)} alt="" />
            {zona && <span className="app-config__zona" aria-hidden />}
          </span>
        </Previa>
        <Previa legenda="iPhone e iPad">
          <span className="app-config__mascara" style={{ borderRadius: '22.5%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiApp.urlDoIcone('apple-touch-icon', v)} alt="" />
          </span>
        </Previa>
        <Previa legenda="Aba do navegador">
          <span className="app-config__aba">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiApp.urlDoIcone('favicon-32', v)} alt="" width={16} height={16} />
            <span>{config.shortName}</span>
          </span>
        </Previa>
      </div>

      <label className="linha" style={{ gap: 'var(--e2)', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={zona} onChange={(e) => setZona(e.target.checked)} />
        Mostrar a zona segura do Android (o que fica fora do círculo pode ser cortado)
      </label>

      <div className="app-config__envios">
        <EnvioDeIcone
          titulo="Ícone principal"
          texto="PNG, JPG, WebP ou SVG quadrado, de 512px ou mais. Vira todos os tamanhos, o ícone do iPhone e o favicon."
          personalizado={config.iconePersonalizado}
          ocupado={ocupado === 'icone'}
          onEnviar={(f) => onEnviar('icone', f)}
          onRemover={() => onRemover('icone')}
        />
        <EnvioDeIcone
          titulo="Ícone do Android (opcional)"
          texto="Arte própria para o recorte do Android: ocupe o quadro todo, com o símbolo dentro do círculo central de 80%. Sem ela, usamos o principal."
          personalizado={config.mascaravelPersonalizado}
          ocupado={ocupado === 'maskable'}
          onEnviar={(f) => onEnviar('maskable', f)}
          onRemover={() => onRemover('maskable')}
        />
      </div>
    </div>
  );
}

function Previa({ legenda, children }: { legenda: string; children: React.ReactNode }) {
  return (
    <figure className="app-config__previa">
      {children}
      <figcaption>{legenda}</figcaption>
    </figure>
  );
}

function EnvioDeIcone({
  titulo,
  texto,
  personalizado,
  ocupado,
  onEnviar,
  onRemover,
}: {
  titulo: string;
  texto: string;
  personalizado: boolean;
  ocupado: boolean;
  onEnviar: (arquivo: File) => void;
  onRemover: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className="cartao" style={{ display: 'grid', gap: 'var(--e2)', background: 'var(--bg-canvas)' }}>
      <strong style={{ fontSize: 14 }}>{titulo}</strong>
      <p className="texto-secundario" style={{ fontSize: 12 }}>
        {texto}
      </p>
      <span className="texto-secundario" style={{ fontSize: 12 }}>
        {personalizado ? 'Usando a sua imagem.' : 'Usando o ícone padrão do Studio.'}
      </span>
      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
        <button type="button" className="botao botao--secundario botao--pequeno" disabled={ocupado} onClick={() => entrada.current?.click()}>
          <IconeEnviar size={15} />
          {ocupado ? 'Gerando…' : personalizado ? 'Trocar' : 'Enviar imagem'}
        </button>
        {personalizado && (
          <button type="button" className="botao botao--fantasma botao--pequeno" disabled={ocupado} onClick={onRemover}>
            Voltar ao padrão
          </button>
        )}
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onEnviar(f);
        }}
      />
    </div>
  );
}

// ---------- Capturas ----------

function Capturas({
  config,
  ocupado,
  onEnviar,
  onRemover,
}: {
  config: ConfigDoApp;
  ocupado: boolean;
  onEnviar: (arquivo: File, formFactor: 'narrow' | 'wide', rotulo: string) => void;
  onRemover: (indice: number) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [rotulo, setRotulo] = useState('');
  const cheio = config.capturas.length >= 8;

  // Deitada = computador, em pé = celular: decidido pela própria imagem.
  const enviar = (arquivo: File) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      onEnviar(arquivo, img.naturalWidth > img.naturalHeight ? 'wide' : 'narrow', rotulo.trim());
      setRotulo('');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--e3)' }}>
      <div>
        <h3>Capturas de tela</h3>
        <p className="texto-secundario">
          Aparecem no diálogo de instalação do Android e do Chrome, como numa loja de apps. Capturas
          em pé vão para o celular; deitadas, para o computador. Até 8.
        </p>
      </div>

      {config.capturas.length > 0 && (
        <div className="app-config__capturas">
          {config.capturas.map((c) => (
            <figure key={c.indice} className="app-config__captura">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apiApp.urlDaCaptura(c.indice, config.versao)} alt={c.rotulo || `Captura ${c.indice + 1}`} style={{ aspectRatio: `${c.largura} / ${c.altura}` }} />
              <figcaption className="linha entre" style={{ gap: 'var(--e1)' }}>
                <span className="texto-secundario" style={{ fontSize: 11 }}>
                  {c.formFactor === 'wide' ? 'Computador' : 'Celular'} · {c.largura}×{c.altura}
                </span>
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Remover captura" disabled={ocupado} onClick={() => onRemover(c.indice)}>
                  <IconeLixeira size={15} />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="campo crescer" style={{ marginBottom: 0, minWidth: 200 }}>
          <span className="campo__rotulo">Legenda da próxima captura (opcional)</span>
          <input className="campo__entrada" value={rotulo} maxLength={80} placeholder="Ex.: Editor com IA" onChange={(e) => setRotulo(e.target.value)} />
        </label>
        <button type="button" className="botao botao--secundario" disabled={ocupado || cheio} onClick={() => entrada.current?.click()}>
          <IconeEnviar size={16} />
          {ocupado ? 'Enviando…' : 'Adicionar captura'}
        </button>
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) enviar(f);
        }}
      />
    </div>
  );
}

// ---------- Instalar neste aparelho ----------

function InstalarAqui() {
  const { plataforma, instalado, podeInstalarNativo, instalar, guia } = useGuiaDeInstalacao();
  if (!plataforma) return null;

  return (
    <div className="cartao" style={{ display: 'grid', gap: 'var(--e3)', background: 'var(--bg-canvas)' }}>
      <strong className="linha" style={{ gap: 'var(--e2)', fontSize: 14 }}>
        <IconeInstalar size={17} />
        Instalar neste aparelho
      </strong>
      {instalado ? (
        <p className="texto-secundario">Você já está usando o Studio instalado.</p>
      ) : podeInstalarNativo ? (
        <div>
          <button type="button" className="botao" onClick={() => void instalar()}>
            Instalar o Studio
          </button>
        </div>
      ) : guia ? (
        <>
          <p style={{ fontWeight: 600 }}>{guia.titulo}</p>
          <PassoAPasso guia={guia} />
        </>
      ) : null}
    </div>
  );
}
