'use client';

// ============================================================
// Kit de marca (plano, seção 10).
//
// Três colunas: identidade à esquerda (logo, cores, fontes), o
// preview ao centro e as escolhas de legenda e trilha à direita.
//
// O preview fica no meio porque é a única coisa que responde à
// pergunta real da tela: "como isso vai ficar no meu vídeo?". Cor em
// um quadradinho não responde; cor aplicada sobre um frame, sim.
// ============================================================

import { dolares } from '../../lib/dinheiro';
import { useEffect, useState } from 'react';
import type { PreferenciasDeVideo, SugestaoDeMarca, TipoDeTransicao } from '@makucho/studio-contracts';
import { FAMILIAS_DE_FONTE, PRESETS_DE_LEGENDA, PRESETS_DE_TEXTO, presetDaLegenda } from '@makucho/studio-contracts';
import { ConfigurarComIa } from '../../components/marca/ConfigurarComIa';
import { LogosDaMarca, VARIANTES_DA_LOGO } from '../../components/marca/LogosDaMarca';
import { BibliotecaDaMarca } from '../../components/marca/BibliotecaDaMarca';
import { medirDuracao } from '../../lib/paleta';
import { Topbar } from '../../components/shell/Topbar';
import { AmostraDeEstilo } from '../../components/editor/AmostraDeEstilo';
import { OpcoesDeTransicao } from '../../components/editor/Inspector';
import {
  marca as apiMarca,
  armazenamento as apiArmazenamento,
  assets as apiAssets,
  ia as apiIa,
  type Asset,
  type ConsumoDeIa,
} from '../../lib/api';
import { IconeAviso, IconeSalvo, IconeCelular } from '../../components/icones';

// ---------- Armazenamento ----------

interface UsoDeCota {
  usadoBytes: number;
  quotaBytes: number;
  percentual: number;
  mensagem: string | null;
}

interface Armazenamento {
  permanente: UsoDeCota;
  edicao: UsoDeCota;
}

// ---------- Cores ----------

interface Cor {
  id: string;
  rotulo: string;
  valor: string;
}

const CORES_INICIAIS: Cor[] = [
  { id: 'primaria', rotulo: 'Primária', valor: '#2F66FF' },
  { id: 'secundaria', rotulo: 'Secundária', valor: '#41C8FF' },
  { id: 'fundo', rotulo: 'Fundo', valor: '#07142F' },
  { id: 'superficie', rotulo: 'Superfície', valor: '#132A57' },
  { id: 'texto', rotulo: 'Texto', valor: '#F7FAFF' },
];

// ---------- Acabamento padrão ----------
//
// O que todo vídeo novo recebe sem ninguém pedir: é o "sem esforço" do
// produto. Os padrões aqui são os mesmos do acabamento automático
// (acabamento.ts) — mostrar um valor e aplicar outro seria mentir.
type Opcionais = 'captionPreset' | 'estilosSalvos' | 'textoPreset' | 'abertura' | 'encerramento' | 'itensDaMarca';
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

// As mesmas famílias que o render conhece (estilos-de-legenda.ts): uma
// fonte escolhida aqui e ausente no render cairia na Montserrat calada.
const FONTES_TITULO = FAMILIAS_DE_FONTE;
const FONTES_CORPO = FAMILIAS_DE_FONTE;
const TIPOS_DE_LOGO = VARIANTES_DA_LOGO.map((v) => v.kind as string);

export default function MarcaPage() {
  const [uso, setUso] = useState<Armazenamento | null>(null);
  const [consumo, setConsumo] = useState<ConsumoDeIa | null>(null);
  const [cores, setCores] = useState<Cor[]>(CORES_INICIAIS);
  const [estilo, setEstilo] = useState<string>('padrao');
  const [prefs, setPrefs] = useState(PREFERENCIAS_PADRAO);
  const [fonteTitulo, setFonteTitulo] = useState('Poppins');
  const [fonteCorpo, setFonteCorpo] = useState('Inter');
  // Tudo o que a marca guarda (logos e biblioteca), do servidor.
  const [arquivos, setArquivos] = useState<Asset[]>([]);
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    // O armazenamento é informativo: falhar nele não impede editar a
    // marca, então o erro fica silencioso.
    void apiArmazenamento.obter().then(setUso).catch(() => undefined);

    // Mesmo tratamento: sem credencial de IA cadastrada a rota
    // responde normalmente com gasto zero, e uma falha aqui não pode
    // impedir de editar a marca.
    void apiIa.consumo().then(setConsumo).catch(() => undefined);

    void apiMarca
      .obter()
      .then((perfil) => {
        if (!perfil) return;

        setCores([
          { id: 'primaria', rotulo: 'Primária', valor: perfil.colors.primary },
          { id: 'secundaria', rotulo: 'Secundária', valor: perfil.colors.secondary },
          { id: 'fundo', rotulo: 'Fundo', valor: perfil.colors.textDark },
          { id: 'superficie', rotulo: 'Superfície', valor: perfil.colors.accent },
          { id: 'texto', rotulo: 'Texto', valor: perfil.colors.textLight },
        ]);

        if (perfil.name && perfil.name !== 'Kit de marca') setNome(perfil.name);
        if (perfil.fontPrimary) setFonteTitulo(perfil.fontPrimary);
        if (perfil.fontSecond) setFonteCorpo(perfil.fontSecond);
        const salvas = perfil.videoDefaults ?? {};
        // Ids antigos ("moderno"...) viram o preset equivalente.
        setEstilo(presetDaLegenda(salvas.captionPreset)?.id ?? 'padrao');
        setPrefs({ ...PREFERENCIAS_PADRAO, ...salvas } as typeof PREFERENCIAS_PADRAO);
      })
      .catch((e) => setAviso(e instanceof Error ? e.message : 'não foi possível carregar a marca.'));

    void carregarAssets();
  }, []);

  /**
   * Busca o logo e a trilha ativos.
   *
   * `listar` devolve do mais recente para o mais antigo, e o primeiro
   * e o que vale: substituir a logo nao apaga a anterior -- ela fica
   * desativada, para que um video antigo continue explicavel.
   */
  const carregarAssets = async () => {
    setArquivos(await apiAssets.listar().catch(() => []));
  };

  const logo = arquivos.find((a) => a.kind === 'LOGO') ?? null;
  const trilha = arquivos.find((a) => a.kind === 'MUSIC') ?? null;

  /**
   * Envia um arquivo e recarrega a lista.
   *
   * O servidor valida pelos BYTES, entao a tela nao precisa repetir a
   * checagem de tipo -- e nao deve: duas validacoes divergem com o
   * tempo, e a que vale e a do servidor. A tela so mostra o motivo da
   * recusa.
   */
  const enviarAsset = async (kind: string, lista: File | File[]) => {
    setEnviando(kind);
    setAviso(null);

    try {
      for (const arquivo of Array.isArray(lista) ? lista : [lista]) {
        // A duração (áudio e vídeo) é medida aqui: a API não tem ffprobe,
        // e a vinheta precisa dela para entrar no vídeo.
        const enviado = await apiAssets.enviar(kind, arquivo, await medirDuracao(arquivo));
        // Cada variação de logo tem UMA versão valendo: a anterior sai da
        // tela (desativada, não apagada -- um vídeo antigo continua
        // explicável).
        if (TIPOS_DE_LOGO.includes(kind)) {
          for (const antiga of arquivos.filter((a) => a.kind === kind && a.id !== enviado.id)) await apiAssets.remover(antiga.id).catch(() => undefined);
        }
      }
      await carregarAssets();
      // O armazenamento muda com o upload: recarregar mantem o painel
      // de cota honesto.
      void apiArmazenamento.obter().then(setUso).catch(() => undefined);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não foi possível enviar o arquivo.');
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
      setAviso(e instanceof Error ? e.message : 'não foi possível remover.');
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);

    try {
      await apiMarca.salvar({
        name: nome.trim() || 'Kit de marca',
        colors: {
          primary: corDe('primaria'),
          secondary: corDe('secundaria'),
          accent: corDe('superficie'),
          textLight: corDe('texto'),
          textDark: corDe('fundo'),
        },
        fontPrimary: fonteTitulo,
        fontSecond: fonteCorpo,
        videoDefaults: { ...prefs, captionPreset: estilo as PreferenciasDeVideo['captionPreset'] },
      });

      setSujo(false);
      setAviso('Salvo. O kit passa a valer nos próximos vídeos.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const corDe = (id: string) => cores.find((c) => c.id === id)?.valor ?? '#2F66FF';

  const mudarPrefs = (mudanca: Partial<typeof PREFERENCIAS_PADRAO>) => {
    setPrefs((atual) => ({ ...atual, ...mudanca }));
    setSujo(true);
  };

  const presetEscolhido = presetDaLegenda(estilo) ?? PRESETS_DE_LEGENDA[0];
  const marcaDoVideo = {
    cores: {
      primary: corDe('primaria'),
      secondary: corDe('secundaria'),
      accent: corDe('superficie'),
      textLight: corDe('texto'),
      textDark: corDe('fundo'),
    },
    fonteTitulo,
    fonteCorpo,
  };

  const mudarCor = (id: string, valor: string) => {
    setCores((atual) => atual.map((c) => (c.id === id ? { ...c, valor } : c)));
    setSujo(true);
  };

  /** A sugestão da IA vira o formulário; quem salva é a pessoa. */
  const aplicarSugestao = (s: SugestaoDeMarca) => {
    setCores([
      { id: 'primaria', rotulo: 'Primária', valor: s.cores.primary },
      { id: 'secundaria', rotulo: 'Secundária', valor: s.cores.secondary },
      { id: 'fundo', rotulo: 'Fundo', valor: s.cores.textDark },
      { id: 'superficie', rotulo: 'Superfície', valor: s.cores.accent },
      { id: 'texto', rotulo: 'Texto', valor: s.cores.textLight },
    ]);
    setFonteTitulo(s.fonteTitulo);
    setFonteCorpo(s.fonteCorpo);
    setEstilo(presetDaLegenda(s.captionPreset)?.id ?? estilo);
    setPrefs((atual) => ({ ...atual, textoPreset: s.textoPreset, transicaoPadrao: s.transicaoPadrao as TipoDeTransicao }));
    setSujo(true);
    setAviso('Kit aplicado. Confira a prévia e clique em "Salvar alterações" para valer nos próximos vídeos.');
  };

  const itensDaMarca = prefs.itensDaMarca ?? [];
  const temAbertura = arquivos.some((a) => a.kind === 'INTRO');
  const temEncerramento = arquivos.some((a) => a.kind === 'OUTRO');

  return (
    <>
      <Topbar
        titulo={
          <div>
            <strong style={{ fontSize: 15, display: 'block' }}>Kit de marca</strong>
            <span className="texto-secundario" style={{ fontSize: 12 }}>
              Mantenha todos os seus vídeos consistentes.
            </span>
          </div>
        }
      >
        <button
          type="button"
          className="botao auto"
          disabled={!sujo || salvando}
          onClick={salvar}
        >
          <IconeSalvo size={16} />
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </Topbar>

      <div className="conteudo">
        {aviso && (
          <div className="aviso aviso--info" role="status" style={{ marginBottom: 'var(--e4)' }}>
            <IconeAviso size={16} />
            <span>{aviso}</span>
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
        />

        <div className="marca">
          {/* ---------- Identidade ---------- */}
          <div className="pilha">
            <section className="cartao">
              <h2>Logos</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                Envie as versões da sua logo. A IA usa a certa em cada vídeo: a clara sobre imagem escura, o ícone em espaço pequeno.
              </p>
              <LogosDaMarca
                assets={arquivos}
                enviando={enviando}
                onEnviar={(kind, arquivo) => void enviarAsset(kind, arquivo)}
                onRemover={(id) => void removerAsset(id)}
              />
            </section>

            <section className="cartao">
              <h2>Cores da marca</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                Defina as cores que serão usadas nos seus vídeos, legendas e elementos visuais.
              </p>

              <div className="marca__cores">
                {cores.map((cor) => (
                  <div key={cor.id}>
                    {/* O seletor nativo é o campo: clicar na amostra abre
                        a paleta do sistema, que é onde as pessoas já
                        sabem escolher cor. */}
                    <input
                      type="color"
                      className="marca__amostra"
                      value={cor.valor}
                      aria-label={`Cor ${cor.rotulo}`}
                      onChange={(e) => mudarCor(cor.id, e.target.value)}
                    />
                    <p className="texto-secundario" style={{ fontSize: 12, margin: '6px 0 4px' }} title={cor.rotulo}>
                      {cor.rotulo}
                    </p>
                    <input
                      type="text"
                      className="campo__entrada"
                      value={cor.valor.toUpperCase()}
                      aria-label={`${cor.rotulo} em hexadecimal`}
                      onChange={(e) => mudarCor(cor.id, e.target.value)}
                      style={{ fontSize: 12, minHeight: 34, textAlign: 'center' }}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="cartao">
              <h2>Tipografia</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                Escolha as fontes que serão usadas nos seus vídeos.
              </p>

              <div className="marca__fontes">
                <div className="campo" style={{ margin: 0 }}>
                  <label className="campo__rotulo" htmlFor="fonte-titulo">
                    Fonte dos títulos
                  </label>
                  <select
                    id="fonte-titulo"
                    className="campo__selecao"
                    value={fonteTitulo}
                    onChange={(e) => {
                      setFonteTitulo(e.target.value);
                      setSujo(true);
                    }}
                  >
                    {FONTES_TITULO.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <p className="campo__ajuda">Usada em títulos, destaques e chamadas.</p>
                </div>

                <div className="campo" style={{ margin: 0 }}>
                  <label className="campo__rotulo" htmlFor="fonte-corpo">
                    Fonte do corpo
                  </label>
                  <select
                    id="fonte-corpo"
                    className="campo__selecao"
                    value={fonteCorpo}
                    onChange={(e) => {
                      setFonteCorpo(e.target.value);
                      setSujo(true);
                    }}
                  >
                    {FONTES_CORPO.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <p className="campo__ajuda">Usada em legendas, descrições e textos de apoio.</p>
                </div>
              </div>
            </section>
          </div>

          {/* ---------- Preview ---------- */}
          <section className="cartao">
            <h2 className="linha" style={{ gap: 'var(--e2)' }}>
              <IconeCelular size={18} />
              Pré-visualização (9:16)
            </h2>
            <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
              Veja como sua marca fica nos vídeos.
            </p>

            <div className="marca__preview">
              {/* O logo aparece onde o render o põe, se estiver ligado. */}
              {logo && prefs.logo.mostrar && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={apiAssets.url(logo.id)}
                  alt=""
                  className={`palco__logo palco__logo--${prefs.logo.posicao}`}
                />
              )}

              <span className="marca__zona-logo" aria-hidden />

              <p className="marca__legenda" style={{ transform: 'scale(1.35)' }}>
                <AmostraDeEstilo preset={presetEscolhido} marca={marcaDoVideo} texto={['vídeos', 'que', 'engajam']} />
              </p>

              <p
                className="marca__assinatura"
                style={{ fontFamily: `${fonteCorpo}, Inter, sans-serif` }}
              >
                Simples. Criativo. MAKUCHO.
              </p>
            </div>

            <p className="campo__ajuda" style={{ textAlign: 'center' }}>
              O resultado final usa a gravação real, com estas cores e fontes.
            </p>
          </section>

          {/* ---------- Legendas e trilha ---------- */}
          <div className="pilha">
            <section className="cartao">
              <h2>Estilo das legendas</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                Escolha o estilo que mais combina com a sua marca.
              </p>

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
              <h2>Acabamento dos vídeos novos</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                O que todo vídeo recebe automaticamente, com ou sem IA. Dá para mudar em cada vídeo no editor.
              </p>

              <Interruptor
                rotulo="Logo no vídeo"
                ajuda={logo ? undefined : 'Envie o logotipo acima para usar.'}
                ligado={prefs.logo.mostrar}
                onTrocar={(v) => mudarPrefs({ logo: { ...prefs.logo, mostrar: v } })}
              />
              {prefs.logo.mostrar && (
                <div className="campo">
                  <label className="campo__rotulo" htmlFor="posicao-logo">
                    Posição do logo
                  </label>
                  <select
                    id="posicao-logo"
                    className="campo__selecao"
                    value={prefs.logo.posicao}
                    onChange={(e) =>
                      mudarPrefs({ logo: { ...prefs.logo, posicao: e.target.value as 'sd' | 'se' | 'id' | 'ie' } })
                    }
                  >
                    <option value="sd">Canto superior direito</option>
                    <option value="se">Canto superior esquerdo</option>
                    <option value="id">Canto inferior direito</option>
                    <option value="ie">Canto inferior esquerdo</option>
                  </select>
                </div>
              )}

              <Interruptor
                rotulo="Trilha padrão nos vídeos"
                ajuda={trilha ? 'Abaixa sozinha enquanto você fala.' : 'Envie uma trilha abaixo para usar.'}
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
                      {prefs.musica.volumeDb} dB
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

              <div className="campo">
                <label className="campo__rotulo" htmlFor="texto-padrao">
                  Estilo dos textos na tela
                </label>
                <select
                  id="texto-padrao"
                  className="campo__selecao"
                  value={prefs.textoPreset ?? ''}
                  onChange={(e) => mudarPrefs({ textoPreset: e.target.value || undefined })}
                >
                  <option value="">Padrão de cada texto</option>
                  {PRESETS_DE_TEXTO.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rotulo}: {p.descricao}
                    </option>
                  ))}
                </select>
                <p className="campo__ajuda">Vale para o título de abertura e a chamada final que a IA escreve.</p>
              </div>

              <Interruptor
                rotulo="Vinheta de abertura"
                ajuda={temAbertura ? 'Entra antes de todo vídeo novo (a padrão da Biblioteca da marca).' : 'Envie uma abertura na Biblioteca da marca, abaixo.'}
                ligado={Boolean(prefs.abertura?.usar)}
                onTrocar={(v) => mudarPrefs({ abertura: { ...prefs.abertura, usar: v } })}
              />
              <Interruptor
                rotulo="Vinheta de encerramento"
                ajuda={temEncerramento ? 'Entra depois de todo vídeo novo.' : 'Envie um encerramento na Biblioteca da marca, abaixo.'}
                ligado={Boolean(prefs.encerramento?.usar)}
                onTrocar={(v) => mudarPrefs({ encerramento: { ...prefs.encerramento, usar: v } })}
              />

              <Interruptor
                rotulo="Zoom automático"
                ajuda="Aproximação lenta na abertura e zoom seco em cortes alternados."
                ligado={prefs.autoZoom}
                onTrocar={(v) => mudarPrefs({ autoZoom: v })}
              />
              <Interruptor
                rotulo="Efeitos sonoros"
                ajuda={'"Whoosh" nas transições e "pop" nos títulos. Gerados pelo Studio, sem licença.'}
                ligado={prefs.efeitosSonoros}
                onTrocar={(v) => mudarPrefs({ efeitosSonoros: v })}
              />
              <Interruptor
                rotulo="Barra de progresso"
                ajuda="Uma linha no topo que avança até o fim."
                ligado={prefs.barraDeProgresso}
                onTrocar={(v) => mudarPrefs({ barraDeProgresso: v })}
              />
              <Interruptor
                rotulo="Voz limpa"
                ajuda="Menos ruído de fundo, voz mais presente."
                ligado={prefs.voiceEnhance}
                onTrocar={(v) => mudarPrefs({ voiceEnhance: v })}
              />

              <div className="campo">
                <label className="campo__rotulo" htmlFor="transicao-padrao">
                  Transição entre os cortes
                </label>
                <select
                  id="transicao-padrao"
                  className="campo__selecao"
                  value={prefs.transicaoPadrao}
                  onChange={(e) => mudarPrefs({ transicaoPadrao: e.target.value as TipoDeTransicao })}
                >
                  <OpcoesDeTransicao />
                </select>
              </div>

              <div className="campo">
                <label className="campo__rotulo" htmlFor="enquadramento-padrao">
                  Gravação horizontal
                </label>
                <select
                  id="enquadramento-padrao"
                  className="campo__selecao"
                  value={prefs.fit}
                  onChange={(e) => mudarPrefs({ fit: e.target.value as 'ajustar' | 'preencher' | 'desfoque' })}
                >
                  <option value="desfoque">Inteira, com fundo desfocado</option>
                  <option value="preencher">Preencher a tela (corta as laterais)</option>
                  <option value="ajustar">Inteira, com faixas pretas</option>
                </select>
              </div>
            </section>

            {uso && (
              <section className="cartao">
                <h2 style={{ marginBottom: 'var(--e4)' }}>Armazenamento</h2>

                <BarraDeCota
                  rotulo="Materiais de apoio"
                  descricao="Logo, trilhas e imagens — guardados enquanto você quiser."
                  cota={uso.permanente}
                />
                <BarraDeCota
                  rotulo="Vídeos em edição"
                  descricao="Gravações e cortes dos projetos abertos."
                  cota={uso.edicao}
                />

                {/* O aviso aparece ANTES de qualquer perda: quem grava
                    precisa saber que os antigos cedem lugar. */}
                {uso.edicao.mensagem && (
                  <div className="aviso aviso--atencao">
                    <IconeAviso size={16} />
                    <span>{uso.edicao.mensagem}</span>
                  </div>
                )}
              </section>
            )}

            {/* O teto de IA precisa ser visto ANTES de ser atingido:
                um limite que só aparece quando bloqueia é
                indistinguível de um defeito. */}
            {consumo && (
              <section className="cartao">
                <h2 style={{ marginBottom: 'var(--e4)' }}>Uso de IA</h2>

                <BarraDeCota
                  rotulo="Gasto deste mês"
                  descricao={
                    consumo.chamadas === 0
                      ? 'Nenhuma chamada de IA ainda neste mês.'
                      : `${consumo.chamadas} ${consumo.chamadas === 1 ? 'chamada' : 'chamadas'} até agora.`
                  }
                  cota={{
                    usadoBytes: consumo.gastoCentavos,
                    quotaBytes: consumo.limiteCentavos,
                    percentual: Math.min(
                      100,
                      Math.round((consumo.gastoCentavos / consumo.limiteCentavos) * 100),
                    ),
                    mensagem: null,
                  }}
                  formatar={dolares}
                />

                {consumo.detalhe.length > 0 && (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 'var(--e3) 0 0',
                      padding: 0,
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    {consumo.detalhe.map((d) => (
                      <li
                        key={d.chamada}
                        className="linha entre"
                        style={{ fontSize: 12, color: 'var(--texto-2)' }}
                      >
                        <span>{d.rotulo}</span>
                        <span>{dolares(d.centavos)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {consumo.aviso && (
                  <div
                    className={
                      consumo.estado === 'bloqueado' ? 'aviso aviso--erro' : 'aviso aviso--atencao'
                    }
                  >
                    <IconeAviso size={16} />
                    <span>{consumo.aviso}</span>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        <section className="cartao" style={{ marginTop: 'var(--e5)' }}>
          <h2>Biblioteca da marca</h2>
          <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
            Tudo o que é da sua marca, pronto para os vídeos: trilhas, sons, aberturas, encerramentos, imagens e vídeos. Diga em uma frase
            para que serve cada um: é o que a IA lê para usar o arquivo certo quando você pede.
          </p>
          <BibliotecaDaMarca
            assets={arquivos}
            itens={itensDaMarca}
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
          />
        </section>
      </div>
    </>
  );
}

function Interruptor({
  rotulo,
  ajuda,
  ligado,
  onTrocar,
}: {
  rotulo: string;
  ajuda?: string;
  ligado: boolean;
  onTrocar: (v: boolean) => void;
}) {
  return (
    <div className="campo">
      <div className="linha entre" style={{ gap: 'var(--e3)' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{rotulo}</span>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label={rotulo}
          className="chave"
          onClick={() => onTrocar(!ligado)}
        >
          <span className="chave__bola" aria-hidden />
        </button>
      </div>
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
    </div>
  );
}

const GB = 1024 ** 3;
const gb = (bytes: number) => (bytes / GB).toFixed(1).replace('.', ',');

function BarraDeCota({
  rotulo,
  descricao,
  cota,
  formatar,
}: {
  rotulo: string;
  descricao: string;
  cota: UsoDeCota;
  /** Bytes por padrão; o uso de IA passa centavos e formata em dólar. */
  formatar?: (valor: number) => string;
}) {
  // Cheio demais muda de cor E ganha texto: a seção 13 não aceita
  // estado transmitido só por cor.
  const apertado = cota.percentual >= 90;

  return (
    <div style={{ marginBottom: 'var(--e4)' }}>
      <div className="linha entre" style={{ fontSize: 13, marginBottom: 'var(--e1)' }}>
        <span>{rotulo}</span>
        <span
          className="texto-secundario"
          style={{
            fontVariantNumeric: 'tabular-nums',
            color: apertado ? 'var(--danger)' : undefined,
          }}
        >
          {formatar
            ? `${formatar(cota.usadoBytes)} / ${formatar(cota.quotaBytes)}`
            : `${gb(cota.usadoBytes)} / ${gb(cota.quotaBytes)} GB`}
        </span>
      </div>

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={Math.round(cota.percentual)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${rotulo}: ${Math.round(cota.percentual)}% usado`}
      >
        <div
          className="barra__preenchida"
          style={{
            width: `${Math.min(100, cota.percentual)}%`,
            background: apertado ? 'var(--danger)' : undefined,
          }}
        />
      </div>

      <p className="campo__ajuda">{descricao}</p>
    </div>
  );
}
