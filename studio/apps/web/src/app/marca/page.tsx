'use client';

// ============================================================
// Kit de marca.
//
// Organizado pelo que a pessoa quer fazer, em quatro abas:
//
//   Identidade   logos, cores e fontes -- o que É a marca;
//   Vídeos       como todo vídeo novo sai: legendas, textos na tela e
//                o acabamento em grupos (marca no vídeo, som, movimento);
//   Biblioteca   os arquivos da marca (trilhas, sons, vinhetas, imagens);
//   Criar com IA os pedidos prontos para gerar esses arquivos no Suno,
//                no editor de vídeo, no GPT Image e em geradores de vídeo.
//
// "Configure tudo com IA" fica no topo e preenche as quatro de uma vez.
// A prévia 9:16 acompanha as abas de Identidade e Vídeos, fixa ao lado:
// é a resposta para "como isso vai ficar no meu vídeo?". Nada salva
// sozinho (cada salvamento é uma versão do kit): a barra de salvar
// aparece presa embaixo quando há alteração.
// ============================================================

import { useEffect, useState } from 'react';
import type { PreferenciasDeVideo, SugestaoDeMarca, TipoDeTransicao } from '@makucho/studio-contracts';
import { FAMILIAS_DE_FONTE, PRESETS_DE_LEGENDA, PRESETS_DE_TEXTO, presetDaLegenda } from '@makucho/studio-contracts';
import { ConfigurarComIa } from '../../components/marca/ConfigurarComIa';
import { LogosDaMarca, VARIANTES_DA_LOGO } from '../../components/marca/LogosDaMarca';
import { BibliotecaDaMarca, type TipoDaBiblioteca } from '../../components/marca/BibliotecaDaMarca';
import { KitCriativo } from '../../components/marca/KitCriativo';
import { medirDuracao } from '../../lib/paleta';
import { Topbar } from '../../components/shell/Topbar';
import { AmostraDeEstilo } from '../../components/editor/AmostraDeEstilo';
import { AmostraDeTexto } from '../../components/editor/AmostraDeTexto';
import { OpcoesDeTransicao } from '../../components/editor/Inspector';
import { marca as apiMarca, assets as apiAssets, type Asset } from '../../lib/api';
import { IconeAviso, IconeSalvo, IconeCelular, IconeMarca, IconeVideo, IconeBiblioteca, IconeIA } from '../../components/icones';

// ---------- Cores ----------

interface Cor {
  id: string;
  rotulo: string;
  ajuda: string;
  valor: string;
}

const COR_PADRAO: Record<string, string> = { primaria: '#2F66FF', secundaria: '#41C8FF', fundo: '#07142F', superficie: '#132A57', texto: '#F7FAFF' };

function coresDe(c: { primary: string; secondary: string; textDark: string; accent: string; textLight: string }): Cor[] {
  return [
    { id: 'primaria', rotulo: 'Principal', ajuda: 'A cor que mais aparece: destaques e fundos de texto', valor: c.primary },
    { id: 'secundaria', rotulo: 'Secundária', ajuda: 'Detalhes e a palavra falada na legenda', valor: c.secondary },
    { id: 'fundo', rotulo: 'Fundo', ajuda: 'Fundo escuro de cartões e vinhetas', valor: c.textDark },
    { id: 'superficie', rotulo: 'Superfície', ajuda: 'Entre o fundo e a principal', valor: c.accent },
    { id: 'texto', rotulo: 'Texto', ajuda: 'Texto claro sobre o fundo', valor: c.textLight },
  ];
}

// ---------- Acabamento padrão ----------
//
// O que todo vídeo novo recebe sem ninguém pedir. Os padrões aqui são os
// mesmos do acabamento automático (acabamento.ts).
type Opcionais = 'captionPreset' | 'estilosSalvos' | 'textoPreset' | 'abertura' | 'encerramento' | 'itensDaMarca' | 'kitCriativo';
type Preferencias = Required<Omit<PreferenciasDeVideo, Opcionais>> & Pick<PreferenciasDeVideo, Exclude<Opcionais, 'captionPreset'>>;

const PREFERENCIAS_PADRAO: Preferencias = {
  fit: 'desfoque',
  voiceEnhance: true,
  autoZoom: true,
  transicaoPadrao: 'cut',
  logo: { mostrar: true, posicao: 'sd' },
  musica: { usar: true, volumeDb: -20 },
  efeitosSonoros: true,
  barraDeProgresso: false,
};

const TIPOS_DE_LOGO = VARIANTES_DA_LOGO.map((v) => v.kind as string);

type Aba = 'identidade' | 'videos' | 'biblioteca' | 'criar';

const ABAS: ReadonlyArray<{ id: Aba; rotulo: string; ajuda: string; Icone: typeof IconeMarca }> = [
  { id: 'identidade', rotulo: 'Identidade', ajuda: 'Logos, cores e fontes', Icone: IconeMarca },
  { id: 'videos', rotulo: 'Vídeos', ajuda: 'Legendas, textos e acabamento', Icone: IconeVideo },
  { id: 'biblioteca', rotulo: 'Biblioteca', ajuda: 'Trilhas, sons, vinhetas', Icone: IconeBiblioteca },
  { id: 'criar', rotulo: 'Criar com IA', ajuda: 'Prompts prontos para copiar', Icone: IconeIA },
];

const POSICOES = [
  { id: 'se', rotulo: 'Em cima, à esquerda' },
  { id: 'sd', rotulo: 'Em cima, à direita' },
  { id: 'ie', rotulo: 'Embaixo, à esquerda' },
  { id: 'id', rotulo: 'Embaixo, à direita' },
] as const;

export default function MarcaPage() {
  const [aba, setAba] = useState<Aba>(() => {
    if (typeof window === 'undefined') return 'identidade';
    const h = window.location.hash.slice(1) as Aba;
    return ABAS.some((a) => a.id === h) ? h : 'identidade';
  });
  const [abaDaBiblioteca, setAbaDaBiblioteca] = useState<TipoDaBiblioteca>('MUSIC');
  const [cores, setCores] = useState<Cor[]>(() =>
    coresDe({ primary: COR_PADRAO.primaria!, secondary: COR_PADRAO.secundaria!, textDark: COR_PADRAO.fundo!, accent: COR_PADRAO.superficie!, textLight: COR_PADRAO.texto! }),
  );
  const [estilo, setEstilo] = useState<string>('padrao');
  const [prefs, setPrefs] = useState(PREFERENCIAS_PADRAO);
  const [fonteTitulo, setFonteTitulo] = useState('Poppins');
  const [fonteCorpo, setFonteCorpo] = useState('Inter');
  const [arquivos, setArquivos] = useState<Asset[]>([]);
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'info' | 'erro'; texto: string } | null>(null);

  const irPara = (a: Aba) => {
    setAba(a);
    try {
      window.history.replaceState(null, '', `#${a}`);
    } catch {
      // Sem histórico: só a aba muda.
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    void apiMarca
      .obter()
      .then((perfil) => {
        if (!perfil) return;
        setCores(coresDe(perfil.colors));
        if (perfil.name && perfil.name !== 'Kit de marca') setNome(perfil.name);
        if (perfil.fontPrimary) setFonteTitulo(perfil.fontPrimary);
        if (perfil.fontSecond) setFonteCorpo(perfil.fontSecond);
        const salvas = perfil.videoDefaults ?? {};
        setEstilo(presetDaLegenda(salvas.captionPreset)?.id ?? 'padrao');
        setPrefs({ ...PREFERENCIAS_PADRAO, ...salvas } as Preferencias);
      })
      .catch((e) => setAviso({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível carregar a marca.' }));
    void carregarAssets();
  }, []);

  // Sair com alteração sem salvar pede confirmação.
  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [sujo]);

  const carregarAssets = async () => {
    setArquivos(await apiAssets.listar().catch(() => []));
  };

  const logo = arquivos.find((a) => a.kind === 'LOGO') ?? null;
  const trilha = arquivos.find((a) => a.kind === 'MUSIC') ?? null;

  const enviarAsset = async (kind: string, lista: File | File[]) => {
    setEnviando(kind);
    setAviso(null);
    try {
      for (const arquivo of Array.isArray(lista) ? lista : [lista]) {
        // A duração (áudio e vídeo) é medida aqui: a API não tem ffprobe,
        // e a vinheta precisa dela para entrar no vídeo.
        const enviado = await apiAssets.enviar(kind, arquivo, await medirDuracao(arquivo));
        // Cada variação de logo tem UMA versão valendo.
        if (TIPOS_DE_LOGO.includes(kind)) {
          for (const antiga of arquivos.filter((a) => a.kind === kind && a.id !== enviado.id)) await apiAssets.remover(antiga.id).catch(() => undefined);
        }
      }
      await carregarAssets();
    } catch (e) {
      setAviso({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível enviar o arquivo.' });
    } finally {
      setEnviando(null);
    }
  };

  const removerAsset = async (id: string) => {
    setAviso(null);
    try {
      await apiAssets.remover(id);
      await carregarAssets();
    } catch (e) {
      setAviso({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível remover.' });
    }
  };

  const corDe = (id: string) => cores.find((c) => c.id === id)?.valor ?? COR_PADRAO[id] ?? '#2F66FF';
  const coresDaMarca = {
    primary: corDe('primaria'),
    secondary: corDe('secundaria'),
    accent: corDe('superficie'),
    textLight: corDe('texto'),
    textDark: corDe('fundo'),
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    try {
      await apiMarca.salvar({
        name: nome.trim() || 'Kit de marca',
        colors: coresDaMarca,
        fontPrimary: fonteTitulo,
        fontSecond: fonteCorpo,
        videoDefaults: { ...prefs, captionPreset: estilo as PreferenciasDeVideo['captionPreset'] },
      });
      setSujo(false);
      setAviso({ tom: 'info', texto: 'Salvo. O kit passa a valer nos próximos vídeos.' });
    } catch (e) {
      setAviso({ tom: 'erro', texto: e instanceof Error ? e.message : 'não foi possível salvar.' });
    } finally {
      setSalvando(false);
    }
  };

  const mudarPrefs = (mudanca: Partial<Preferencias>) => {
    setPrefs((atual) => ({ ...atual, ...mudanca }));
    setSujo(true);
  };
  const mudarCor = (id: string, valor: string) => {
    setCores((atual) => atual.map((c) => (c.id === id ? { ...c, valor } : c)));
    setSujo(true);
  };

  /** A sugestão da IA vira o kit inteiro; quem salva é a pessoa. */
  const aplicarSugestao = (s: SugestaoDeMarca) => {
    setCores(coresDe(s.cores));
    setFonteTitulo(s.fonteTitulo);
    setFonteCorpo(s.fonteCorpo);
    setEstilo(presetDaLegenda(s.captionPreset)?.id ?? estilo);
    setPrefs((atual) => ({
      ...atual,
      textoPreset: s.textoPreset,
      transicaoPadrao: s.transicaoPadrao as TipoDeTransicao,
      autoZoom: s.preferencias.autoZoom,
      efeitosSonoros: s.preferencias.efeitosSonoros,
      barraDeProgresso: s.preferencias.barraDeProgresso,
      voiceEnhance: s.preferencias.voiceEnhance,
      logo: { ...atual.logo, posicao: s.preferencias.logoPosicao },
      musica: { ...atual.musica, volumeDb: s.preferencias.volumeTrilhaDb },
      kitCriativo: s.kit,
    }));
    setSujo(true);
    setAviso({ tom: 'info', texto: 'Kit aplicado em todas as abas. Confira e clique em "Salvar alterações". Os pedidos para criar trilhas, sons e vinhetas estão em "Criar com IA".' });
  };

  const presetEscolhido = presetDaLegenda(estilo) ?? PRESETS_DE_LEGENDA[0];
  const marcaDoVideo = { cores: coresDaMarca, fonteTitulo, fonteCorpo };
  const temAbertura = arquivos.some((a) => a.kind === 'INTRO');
  const temEncerramento = arquivos.some((a) => a.kind === 'OUTRO');
  const comPrevia = aba === 'identidade' || aba === 'videos';

  return (
    <>
      <Topbar
        titulo={
          <div>
            <strong style={{ fontSize: 15, display: 'block' }}>Kit de marca</strong>
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              A cara de todos os seus vídeos, num lugar só.
            </span>
          </div>
        }
      >
        <button type="button" className="botao auto" disabled={!sujo || salvando} onClick={() => void salvar()}>
          <IconeSalvo size={16} />
          {salvando ? 'Salvando…' : sujo ? 'Salvar alterações' : 'Tudo salvo'}
        </button>
      </Topbar>

      <div className="conteudo kit-de-marca">
        {aviso && (
          <div className={`aviso ${aviso.tom === 'erro' ? 'aviso--erro' : 'aviso--info'}`} role="status">
            <IconeAviso size={16} />
            <span>{aviso.texto}</span>
          </div>
        )}

        <ConfigurarComIa
          logos={arquivos.filter((a) => TIPOS_DE_LOGO.includes(a.kind))}
          nome={nome}
          onNome={(v) => {
            setNome(v);
            setSujo(true);
          }}
          onAplicar={aplicarSugestao}
          onEnviarLogo={() => irPara('identidade')}
        />

        <nav className="kit-de-marca__abas" role="tablist" aria-label="Partes do kit de marca">
          {ABAS.map(({ id, rotulo, ajuda, Icone }) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className="kit-de-marca__aba" onClick={() => irPara(id)}>
              <Icone size={18} />
              <span>
                <strong>{rotulo}</strong>
                <small>{ajuda}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="kit-de-marca__corpo" data-com-previa={comPrevia || undefined}>
          <div className="kit-de-marca__principal">
            {/* ---------- Identidade ---------- */}
            {aba === 'identidade' && (
              <>
                <section className="cartao">
                  <h2>Logos</h2>
                  <p className="texto-secundario kit-de-marca__ajuda">
                    Envie as versões da sua logo. A IA usa a certa em cada vídeo: a clara sobre imagem escura, o ícone em espaço pequeno.
                  </p>
                  <LogosDaMarca assets={arquivos} enviando={enviando} onEnviar={(kind, arquivo) => void enviarAsset(kind, arquivo)} onRemover={(id) => void removerAsset(id)} />
                </section>

                <section className="cartao">
                  <h2>Cores</h2>
                  <p className="texto-secundario kit-de-marca__ajuda">Toque numa cor para trocar. O &ldquo;Configurar com IA&rdquo; tira estas cores das suas logos.</p>
                  <div className="cores-da-marca">
                    {cores.map((cor) => (
                      <label key={cor.id} className="cor-da-marca">
                        <input type="color" className="cor-da-marca__amostra" value={cor.valor} aria-label={`Cor ${cor.rotulo}`} onChange={(e) => mudarCor(cor.id, e.target.value)} />
                        <span className="cor-da-marca__texto">
                          <strong>{cor.rotulo}</strong>
                          <small>{cor.ajuda}</small>
                        </span>
                        <input
                          type="text"
                          className="campo__entrada cor-da-marca__hex"
                          value={cor.valor.toUpperCase()}
                          maxLength={7}
                          aria-label={`${cor.rotulo} em hexadecimal`}
                          onChange={(e) => mudarCor(cor.id, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="cartao">
                  <h2>Fontes</h2>
                  <div className="marca__fontes">
                    <label className="campo" style={{ margin: 0 }}>
                      <span className="campo__rotulo">Títulos, destaques e chamadas</span>
                      <select
                        className="campo__selecao"
                        value={fonteTitulo}
                        style={{ fontFamily: `${fonteTitulo}, sans-serif` }}
                        onChange={(e) => {
                          setFonteTitulo(e.target.value);
                          setSujo(true);
                        }}
                      >
                        {FAMILIAS_DE_FONTE.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className="campo" style={{ margin: 0 }}>
                      <span className="campo__rotulo">Legendas e textos de apoio</span>
                      <select
                        className="campo__selecao"
                        value={fonteCorpo}
                        style={{ fontFamily: `${fonteCorpo}, sans-serif` }}
                        onChange={(e) => {
                          setFonteCorpo(e.target.value);
                          setSujo(true);
                        }}
                      >
                        {FAMILIAS_DE_FONTE.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
              </>
            )}

            {/* ---------- Vídeos ---------- */}
            {aba === 'videos' && (
              <>
                <section className="cartao">
                  <h2>Legendas</h2>
                  <p className="texto-secundario kit-de-marca__ajuda">O jeito que a fala aparece escrita em todo vídeo novo.</p>
                  <div className="estilos" role="radiogroup" aria-label="Estilo das legendas">
                    {PRESETS_DE_LEGENDA.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={estilo === item.id}
                        className="estilo"
                        title={item.descricao}
                        onClick={() => {
                          setEstilo(item.id);
                          setSujo(true);
                        }}
                      >
                        <span className="estilo__amostra">
                          <AmostraDeEstilo preset={item} marca={marcaDoVideo} />
                        </span>
                        <span className="estilo__rotulo">{item.rotulo}</span>
                      </button>
                    ))}
                  </div>
                  <p className="campo__ajuda">{presetEscolhido.descricao}</p>
                </section>

                <section className="cartao">
                  <h2>Textos na tela</h2>
                  <p className="texto-secundario kit-de-marca__ajuda">O estilo do título de abertura e da chamada final que a IA escreve.</p>
                  <div className="estilos" role="radiogroup" aria-label="Estilo dos textos na tela">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!prefs.textoPreset}
                      className="estilo"
                      onClick={() => mudarPrefs({ textoPreset: undefined })}
                    >
                      <span className="estilo__amostra estilo__amostra--texto">Padrão</span>
                      <span className="estilo__rotulo">Padrão</span>
                    </button>
                    {PRESETS_DE_TEXTO.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={prefs.textoPreset === p.id}
                        className="estilo"
                        title={p.descricao}
                        onClick={() => mudarPrefs({ textoPreset: p.id })}
                      >
                        <span className="estilo__amostra estilo__amostra--texto">
                          <AmostraDeTexto estilo={p.estilo} marca={marcaDoVideo} texto="Oferta" />
                        </span>
                        <span className="estilo__rotulo">{p.rotulo}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="cartao">
                  <h2>A marca no vídeo</h2>
                  <Interruptor
                    rotulo="Logo no canto do vídeo"
                    ajuda={logo ? undefined : 'Envie a logo principal na aba Identidade.'}
                    ligado={prefs.logo.mostrar}
                    onTrocar={(v) => mudarPrefs({ logo: { ...prefs.logo, mostrar: v } })}
                  />
                  {prefs.logo.mostrar && (
                    <div className="posicao-do-logo" role="radiogroup" aria-label="Posição do logo">
                      {POSICOES.map((p) => (
                        <button key={p.id} type="button" role="radio" aria-checked={prefs.logo.posicao === p.id} title={p.rotulo} aria-label={p.rotulo} onClick={() => mudarPrefs({ logo: { ...prefs.logo, posicao: p.id } })}>
                          <span data-pos={p.id} />
                        </button>
                      ))}
                      <span className="campo__ajuda">{POSICOES.find((p) => p.id === prefs.logo.posicao)?.rotulo}</span>
                    </div>
                  )}
                  <Interruptor
                    rotulo="Vinheta de abertura"
                    ajuda={temAbertura ? 'Entra antes de todo vídeo novo.' : 'Crie em "Criar com IA" e envie na Biblioteca.'}
                    ligado={Boolean(prefs.abertura?.usar)}
                    onTrocar={(v) => mudarPrefs({ abertura: { ...prefs.abertura, usar: v } })}
                  />
                  <Interruptor
                    rotulo="Vinheta de encerramento"
                    ajuda={temEncerramento ? 'Entra depois de todo vídeo novo.' : 'Crie em "Criar com IA" e envie na Biblioteca.'}
                    ligado={Boolean(prefs.encerramento?.usar)}
                    onTrocar={(v) => mudarPrefs({ encerramento: { ...prefs.encerramento, usar: v } })}
                  />
                </section>

                <section className="cartao">
                  <h2>Som</h2>
                  <Interruptor
                    rotulo="Trilha de fundo"
                    ajuda={trilha ? 'Abaixa sozinha enquanto você fala.' : 'Envie uma trilha na Biblioteca (ou crie em "Criar com IA").'}
                    ligado={prefs.musica.usar}
                    onTrocar={(v) => mudarPrefs({ musica: { ...prefs.musica, usar: v } })}
                  />
                  {prefs.musica.usar && (
                    <div className="campo">
                      <div className="linha entre">
                        <label className="campo__rotulo" htmlFor="volume-padrao" style={{ marginBottom: 0 }}>
                          Volume da trilha
                        </label>
                        <span className="texto-secundario" style={{ fontSize: 12 }}>
                          {prefs.musica.volumeDb <= -26 ? 'bem baixa' : prefs.musica.volumeDb <= -18 ? 'baixa' : 'presente'} ({prefs.musica.volumeDb} dB)
                        </span>
                      </div>
                      <input
                        id="volume-padrao"
                        type="range"
                        className="deslizante"
                        min={-32}
                        max={-8}
                        step={2}
                        value={prefs.musica.volumeDb}
                        onChange={(e) => mudarPrefs({ musica: { ...prefs.musica, volumeDb: Number(e.target.value) } })}
                      />
                    </div>
                  )}
                  <Interruptor rotulo="Efeitos sonoros" ajuda={'"Whoosh" nas transições e "pop" nos títulos.'} ligado={prefs.efeitosSonoros} onTrocar={(v) => mudarPrefs({ efeitosSonoros: v })} />
                  <Interruptor rotulo="Voz limpa" ajuda="Menos ruído de fundo, voz mais presente." ligado={prefs.voiceEnhance} onTrocar={(v) => mudarPrefs({ voiceEnhance: v })} />
                </section>

                <section className="cartao">
                  <h2>Movimento e cortes</h2>
                  <Interruptor rotulo="Zoom automático" ajuda="Aproximação lenta na abertura e zoom seco em cortes alternados." ligado={prefs.autoZoom} onTrocar={(v) => mudarPrefs({ autoZoom: v })} />
                  <Interruptor rotulo="Barra de progresso" ajuda="Uma linha no topo que avança até o fim." ligado={prefs.barraDeProgresso} onTrocar={(v) => mudarPrefs({ barraDeProgresso: v })} />
                  <div className="marca__fontes">
                    <label className="campo" style={{ margin: 0 }}>
                      <span className="campo__rotulo">Passagem entre os cortes</span>
                      <select className="campo__selecao" value={prefs.transicaoPadrao} onChange={(e) => mudarPrefs({ transicaoPadrao: e.target.value as TipoDeTransicao })}>
                        <OpcoesDeTransicao />
                      </select>
                    </label>
                    <label className="campo" style={{ margin: 0 }}>
                      <span className="campo__rotulo">Vídeo gravado deitado</span>
                      <select className="campo__selecao" value={prefs.fit} onChange={(e) => mudarPrefs({ fit: e.target.value as 'ajustar' | 'preencher' | 'desfoque' })}>
                        <option value="desfoque">Inteiro, com fundo desfocado</option>
                        <option value="preencher">Preenchendo a tela (corta as laterais)</option>
                        <option value="ajustar">Inteiro, com faixas pretas</option>
                      </select>
                    </label>
                  </div>
                </section>
              </>
            )}

            {/* ---------- Biblioteca ---------- */}
            {aba === 'biblioteca' && (
              <section className="cartao">
                <h2>Biblioteca da marca</h2>
                <p className="texto-secundario kit-de-marca__ajuda">
                  Os arquivos da marca, prontos para os vídeos. Diga em uma frase para que serve cada um: é o que a IA do editor lê para usar o
                  arquivo certo quando você pede. Não tem os arquivos? Crie em &ldquo;Criar com IA&rdquo;.
                </p>
                <BibliotecaDaMarca
                  assets={arquivos}
                  itens={prefs.itensDaMarca ?? []}
                  onItens={(itens) => mudarPrefs({ itensDaMarca: itens })}
                  padroes={{ MUSIC: prefs.musica.assetId, INTRO: prefs.abertura?.assetId, OUTRO: prefs.encerramento?.assetId }}
                  onPadrao={(kind, id) =>
                    mudarPrefs(
                      kind === 'MUSIC'
                        ? { musica: { ...prefs.musica, assetId: id } }
                        : kind === 'INTRO'
                          ? { abertura: { usar: prefs.abertura?.usar ?? true, assetId: id } }
                          : { encerramento: { usar: prefs.encerramento?.usar ?? true, assetId: id } },
                    )
                  }
                  enviando={enviando}
                  onEnviar={(kind, lista) => void enviarAsset(kind, lista)}
                  onRemover={(id) => void removerAsset(id)}
                  aba={abaDaBiblioteca}
                  onAba={setAbaDaBiblioteca}
                />
              </section>
            )}

            {/* ---------- Criar com IA ---------- */}
            {aba === 'criar' && (
              <KitCriativo
                kit={prefs.kitCriativo}
                logos={Object.fromEntries(arquivos.filter((a) => TIPOS_DE_LOGO.includes(a.kind)).map((a) => [a.kind, apiAssets.url(a.id)]))}
                onEnviar={(tipo) => {
                  setAbaDaBiblioteca(tipo);
                  irPara('biblioteca');
                }}
                onGerar={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              />
            )}
          </div>

          {/* ---------- Prévia ---------- */}
          {comPrevia && (
            <aside className="kit-de-marca__previa">
              <section className="cartao">
                <h2 className="linha" style={{ gap: 'var(--e2)', fontSize: 15 }}>
                  <IconeCelular size={16} />
                  Como fica no vídeo
                </h2>
                <div className="marca__preview">
                  {logo && prefs.logo.mostrar && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={apiAssets.url(logo.id)} alt="" className={`palco__logo palco__logo--${prefs.logo.posicao}`} />
                  )}
                  {prefs.textoPreset && (
                    <p className="marca__titulo-previa">
                      <AmostraDeTexto estilo={PRESETS_DE_TEXTO.find((p) => p.id === prefs.textoPreset)!.estilo} marca={marcaDoVideo} texto={nome.trim() || 'Sua marca'} />
                    </p>
                  )}
                  <p className="marca__legenda" style={{ transform: 'scale(1.35)' }}>
                    <AmostraDeEstilo preset={presetEscolhido} marca={marcaDoVideo} texto={['vídeos', 'que', 'engajam']} />
                  </p>
                  <p className="marca__assinatura" style={{ fontFamily: `${fonteCorpo}, Inter, sans-serif` }}>
                    {nome.trim() || 'Sua marca'}
                  </p>
                </div>
                <p className="campo__ajuda" style={{ textAlign: 'center', margin: 0 }}>
                  O vídeo final usa a sua gravação, com estas cores e fontes.
                </p>
              </section>
            </aside>
          )}
        </div>
      </div>

      {sujo && (
        <div className="kit-de-marca__salvar" role="status">
          <span>Você tem alterações que ainda não valem para os vídeos.</span>
          <button type="button" className="botao botao--primario" disabled={salvando} onClick={() => void salvar()}>
            <IconeSalvo size={16} />
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      )}
    </>
  );
}

function Interruptor({ rotulo, ajuda, ligado, onTrocar }: { rotulo: string; ajuda?: string; ligado: boolean; onTrocar: (v: boolean) => void }) {
  return (
    <div className="interruptor">
      <span>
        <strong>{rotulo}</strong>
        {ajuda && <small>{ajuda}</small>}
      </span>
      <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} className="chave" onClick={() => onTrocar(!ligado)}>
        <span className="chave__bola" aria-hidden />
      </button>
    </div>
  );
}
