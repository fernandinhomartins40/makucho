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
// A pessoa envia UMA imagem qualquer e ajusta no editor de ícone
// (EditorDeIcone): recorte, fundo e tamanho no Android, com prévia de
// cada destino. O servidor gera todos os tamanhos, comprimidos, e a
// lista do que foi gerado aparece aqui com o peso de cada arquivo.
// As capturas de tela ativam a instalação "rica" do Android e do Chrome
// (o diálogo com fotos do app, como numa loja).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { app as apiApp, type ArquivoDoApp, type ConfigDoApp } from '../../lib/api';
import { useDados } from '../../lib/useDados';
import { IconeAviso, IconeCheck, IconeEnviar, IconeInstalar, IconeLixeira, IconeLinkExterno } from '../icones';
import { PassoAPasso, useGuiaDeInstalacao } from './GuiaDeInstalacao';
import { EditorDeIcone } from './EditorDeIcone';

type Onde = 'icone' | 'identidade' | 'captura';
type Mensagem = { onde: Onde; tom: 'sucesso' | 'erro'; texto: string } | null;

export function SecaoDoApp() {
  const config = useDados<ConfigDoApp>(() => apiApp.obter());
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const executar = async (onde: Onde, rotulo: string, acao: () => Promise<ConfigDoApp>, sucesso: string) => {
    setOcupado(rotulo);
    setMensagem(null);
    try {
      config.definir(await acao());
      setMensagem({ onde, tom: 'sucesso', texto: sucesso });
    } catch (e) {
      setMensagem({ onde, tom: 'erro', texto: e instanceof Error ? e.message : 'não deu certo.' });
    } finally {
      setOcupado(null);
    }
  };

  const aviso = (onde: Onde) =>
    mensagem?.onde === onde ? (
      <div className={`aviso aviso--${mensagem.tom === 'sucesso' ? 'sucesso' : 'erro'}`} role="status" aria-live="polite">
        {mensagem.tom === 'sucesso' ? <IconeCheck size={16} /> : <IconeAviso size={16} />}
        <span>{mensagem.texto}</span>
      </div>
    ) : null;

  if (config.carregando) return <span className="esqueleto" style={{ height: 220 }} />;
  if (config.erro || !config.dados)
    return (
      <div className="aviso aviso--erro" role="alert">
        <IconeAviso size={16} />
        <span>{config.erro ?? 'não foi possível ler a configuração do app.'}</span>
      </div>
    );
  const dados = config.dados;

  return (
    <div className="config__pilha">
      <Icone
        config={dados}
        aviso={aviso('icone')}
        ocupado={ocupado === 'icone'}
        onAplicar={async (principal, mascaravel) => {
          setMensagem(null);
          await apiApp.enviarIcone('icone', principal);
          config.definir(await apiApp.enviarIcone('maskable', mascaravel));
          setMensagem({ onde: 'icone', tom: 'sucesso', texto: 'Ícone atualizado. Os arquivos de todos os aparelhos foram gerados.' });
        }}
        onPadrao={() =>
          void executar(
            'icone',
            'icone',
            async () => {
              await apiApp.removerIcone('maskable');
              return apiApp.removerIcone('icone');
            },
            'Voltou ao ícone padrão do Studio.',
          )
        }
      />

      <Identidade
        config={dados}
        aviso={aviso('identidade')}
        salvando={ocupado === 'identidade'}
        onSalvar={(d) => void executar('identidade', 'identidade', () => apiApp.salvar(d), 'Nome e cores salvos.')}
      />

      <Capturas
        config={dados}
        aviso={aviso('captura')}
        ocupado={ocupado === 'captura'}
        onEnviar={(arquivo, formFactor, rotulo) =>
          void executar('captura', 'captura', () => apiApp.enviarCaptura(arquivo, formFactor, rotulo), 'Captura adicionada.')
        }
        onRemover={(indice) => void executar('captura', 'captura', () => apiApp.removerCaptura(indice), 'Captura removida.')}
      />

      <InstalarAqui />
    </div>
  );
}

// ---------- Ícone ----------

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace('.', ',')} KB`);

function Icone({
  config,
  aviso,
  ocupado,
  onAplicar,
  onPadrao,
}: {
  config: ConfigDoApp;
  aviso: React.ReactNode;
  ocupado: boolean;
  onAplicar: (principal: Blob, mascaravel: Blob) => Promise<void>;
  onPadrao: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arquivos, setArquivos] = useState<ArquivoDoApp[] | null>(null);
  const v = config.versao;
  const personalizado = config.iconePersonalizado || config.mascaravelPersonalizado;

  // A lista do que foi gerado acompanha a versão (cada troca gera de novo).
  useEffect(() => {
    let vivo = true;
    apiApp
      .arquivos()
      .then((l) => vivo && setArquivos(l))
      .catch(() => vivo && setArquivos(null));
    return () => {
      vivo = false;
    };
  }, [v]);
  const total = arquivos?.reduce((t, a) => t + a.bytes, 0) ?? 0;

  return (
    <section className="cartao config__cartao" aria-labelledby="titulo-icone">
      <header className="config__cabeca">
        <div>
          <h3 id="titulo-icone">Ícone do app</h3>
          <p>O que aparece na tela inicial do celular, no computador e na aba do navegador.</p>
        </div>
        <span className={`selo ${personalizado ? 'selo--sucesso' : ''}`}>{personalizado ? 'Seu ícone' : 'Ícone padrão'}</span>
      </header>
      {aviso}

      <div className="config__icone">
        <div className="config__previas">
          <figure>
            <span className="config__mascara" style={{ borderRadius: '50%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apiApp.urlDoIcone('maskable-512', v)} alt="" />
            </span>
            <figcaption>Android</figcaption>
          </figure>
          <figure>
            <span className="config__mascara" style={{ borderRadius: '22.5%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apiApp.urlDoIcone('apple-touch-icon', v)} alt="" />
            </span>
            <figcaption>iPhone</figcaption>
          </figure>
          <figure>
            <span className="config__aba-navegador">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apiApp.urlDoIcone('favicon-32', v)} alt="" width={16} height={16} />
              <span>{config.shortName}</span>
            </span>
            <figcaption>Navegador</figcaption>
          </figure>
        </div>

        <div className="config__icone-acoes">
          <p className="texto-secundario">
            Envie qualquer imagem (PNG, JPG, WebP ou SVG): você enquadra, escolhe o fundo e vê como fica em cada aparelho antes de usar.
          </p>
          <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
            <button type="button" className="botao botao--primario" disabled={ocupado} onClick={() => entrada.current?.click()}>
              <IconeEnviar size={16} /> {personalizado ? 'Trocar o ícone' : 'Enviar um ícone'}
            </button>
            {personalizado && (
              <button type="button" className="botao botao--fantasma" disabled={ocupado} onClick={onPadrao}>
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
              if (f) setArquivo(f);
            }}
          />
        </div>
      </div>

      {arquivos && arquivos.length > 0 && (
        <details className="config__arquivos">
          <summary>
            {arquivos.length} arquivos gerados · {kb(total)} no total
          </summary>
          <ul>
            {arquivos.map((a) => (
              <li key={a.nome}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={apiApp.urlDoIcone(a.nome.replace(/\.png$/, ''), v)} alt="" width={28} height={28} />
                <span>
                  <strong>{a.nome}</strong>
                  <small>{a.uso}</small>
                </span>
                <span className="config__arquivo-medida">
                  {a.lado}×{a.lado} · {kb(a.bytes)}
                </span>
                <a className="botao-icone botao-icone--pequeno" href={apiApp.urlDoIcone(a.nome.replace(/\.png$/, ''), v)} target="_blank" rel="noreferrer" aria-label={`Abrir ${a.nome}`}>
                  <IconeLinkExterno size={14} />
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      {arquivo && (
        <EditorDeIcone
          arquivo={arquivo}
          corDeFundo={config.backgroundColor}
          nomeCurto={config.shortName}
          onFechar={() => setArquivo(null)}
          onAplicar={async (principal, mascaravel) => {
            await onAplicar(principal, mascaravel);
            setArquivo(null);
          }}
        />
      )}
    </section>
  );
}

// ---------- Nome e cores ----------

function Identidade({
  config,
  aviso,
  salvando,
  onSalvar,
}: {
  config: ConfigDoApp;
  aviso: React.ReactNode;
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
    nome !== config.name || curto !== config.shortName || descricao !== config.description || tema !== config.themeColor || fundo !== config.backgroundColor;

  return (
    <section className="cartao config__cartao" aria-labelledby="titulo-identidade">
      <header className="config__cabeca">
        <div>
          <h3 id="titulo-identidade">Nome e cores</h3>
          <p>Como o app se chama no aparelho e as cores enquanto ele abre.</p>
        </div>
      </header>
      {aviso}
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
            <CampoDeCor rotulo="Fundo da abertura e do ícone" valor={fundo} onTrocar={setFundo} />
          </div>
          <button
            type="button"
            className="botao botao--primario"
            disabled={!valido || !mudou || salvando}
            onClick={() => onSalvar({ name: nome.trim(), shortName: curto.trim(), description: descricao.trim(), themeColor: tema, backgroundColor: fundo })}
          >
            {salvando ? 'Salvando…' : mudou ? 'Salvar nome e cores' : 'Salvo'}
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
    </section>
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

// ---------- Capturas ----------

function Capturas({
  config,
  aviso,
  ocupado,
  onEnviar,
  onRemover,
}: {
  config: ConfigDoApp;
  aviso: React.ReactNode;
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
    <section className="cartao config__cartao" aria-labelledby="titulo-capturas">
      <header className="config__cabeca">
        <div>
          <h3 id="titulo-capturas">Capturas de tela (opcional)</h3>
          <p>Aparecem na janela de instalação, como numa loja de apps. Em pé vão para o celular; deitadas, para o computador. Até 8.</p>
        </div>
        <span className="selo">{config.capturas.length}/8</span>
      </header>
      {aviso}

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
    </section>
  );
}

// ---------- Instalar neste aparelho ----------

function InstalarAqui() {
  const { plataforma, instalado, podeInstalarNativo, instalar, guia } = useGuiaDeInstalacao();
  if (!plataforma) return null;

  return (
    <section className="cartao config__cartao" aria-labelledby="titulo-instalar">
      <header className="config__cabeca">
        <div>
          <h3 id="titulo-instalar" className="linha" style={{ gap: 'var(--e2)' }}>
            <IconeInstalar size={17} /> Instalar neste aparelho
          </h3>
          <p>
            O Studio abre como um app, em tela própria.{' '}
            <a href="/api/pwa/manifest.webmanifest" target="_blank" rel="noreferrer">
              Ver o manifesto
            </a>
          </p>
        </div>
      </header>
      {instalado ? (
        <p className="texto-secundario">Você já está usando o Studio instalado.</p>
      ) : podeInstalarNativo ? (
        <div>
          <button type="button" className="botao botao--primario" onClick={() => void instalar()}>
            <IconeInstalar size={16} /> Instalar o Studio
          </button>
        </div>
      ) : guia ? (
        <>
          <p style={{ fontWeight: 600 }}>{guia.titulo}</p>
          <PassoAPasso guia={guia} />
        </>
      ) : null}
    </section>
  );
}
