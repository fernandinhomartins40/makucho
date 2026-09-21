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

import { useEffect, useState } from 'react';
import { Topbar } from '../../components/shell/Topbar';
import { marca as apiMarca, armazenamento as apiArmazenamento } from '../../lib/api';
import {
  IconeAviso,
  IconeEnviar,
  IconeAudio,
  IconeLixeira,
  IconeSalvo,
  IconeTocar,
  IconeMenu,
  IconeAvancar,
  IconeCelular,
} from '../../components/icones';

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

// ---------- Estilos de legenda ----------

const ESTILOS = [
  { id: 'moderno', rotulo: 'Moderno', descricao: 'Destaque com cor da marca e fundo suave.' },
  { id: 'impacto', rotulo: 'Impacto', descricao: 'Caixa alta e forte contraste para maior destaque.' },
  { id: 'minimalista', rotulo: 'Minimalista', descricao: 'Visual limpo e elegante com fundo translúcido.' },
] as const;

const FONTES_TITULO = ['Poppins', 'Inter', 'Montserrat', 'Archivo'];
const FONTES_CORPO = ['Inter', 'Roboto', 'Open Sans', 'Source Sans 3'];

export default function MarcaPage() {
  const [uso, setUso] = useState<Armazenamento | null>(null);
  const [cores, setCores] = useState<Cor[]>(CORES_INICIAIS);
  const [estilo, setEstilo] = useState<string>('moderno');
  const [fonteTitulo, setFonteTitulo] = useState('Poppins');
  const [fonteCorpo, setFonteCorpo] = useState('Inter');
  const [temLogo, setTemLogo] = useState(true);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    // O armazenamento é informativo: falhar nele não impede editar a
    // marca, então o erro fica silencioso.
    void apiArmazenamento.obter().then(setUso).catch(() => undefined);

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

        if (perfil.fontPrimary) setFonteTitulo(perfil.fontPrimary);
        if (perfil.fontSecond) setFonteCorpo(perfil.fontSecond);
      })
      .catch((e) => setAviso(e instanceof Error ? e.message : 'não foi possível carregar a marca.'));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);

    try {
      await apiMarca.salvar({
        name: 'Kit de marca',
        colors: {
          primary: corDe('primaria'),
          secondary: corDe('secundaria'),
          accent: corDe('superficie'),
          textLight: corDe('texto'),
          textDark: corDe('fundo'),
        },
        fontPrimary: fonteTitulo,
        fontSecond: fonteCorpo,
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

  const mudarCor = (id: string, valor: string) => {
    setCores((atual) => atual.map((c) => (c.id === id ? { ...c, valor } : c)));
    setSujo(true);
  };

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

        <div className="marca">
          {/* ---------- Identidade ---------- */}
          <div className="pilha">
            <section className="cartao">
              <h2>Logotipo</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                Seu logotipo será exibido nos vídeos, capas e outros materiais.
              </p>

              <div className="marca__logo">
                <div className="marca__moldura">
                  {temLogo ? (
                    <span className="linha" style={{ gap: 'var(--e3)' }}>
                      <span
                        aria-hidden
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 11,
                          display: 'grid',
                          placeItems: 'center',
                          background: `linear-gradient(135deg, ${corDe('primaria')}, ${corDe('secundaria')})`,
                          color: '#fff',
                          fontSize: 24,
                          fontWeight: 800,
                        }}
                      >
                        M
                      </span>
                      <span style={{ lineHeight: 1.15 }}>
                        <span style={{ fontSize: 19, fontWeight: 700, display: 'block' }}>
                          MAKUCHO
                        </span>
                        <span style={{ fontSize: 15, color: corDe('secundaria') }}>Studio</span>
                      </span>
                    </span>
                  ) : (
                    <p className="texto-secundario" style={{ fontSize: 13 }}>
                      Nenhum logotipo enviado
                    </p>
                  )}
                </div>

                <div className="pilha">
                  <button type="button" className="botao botao--secundario botao--largo">
                    <IconeEnviar size={16} />
                    Substituir logotipo
                  </button>
                  <button
                    type="button"
                    className="botao botao--secundario botao--largo"
                    disabled={!temLogo}
                    onClick={() => {
                      setTemLogo(false);
                      setSujo(true);
                    }}
                  >
                    <IconeLixeira size={16} />
                    Remover
                  </button>
                  <p className="campo__ajuda">
                    PNG, SVG ou JPG. Máximo de 5 MB.
                    <br />
                    Recomendado: fundo transparente.
                  </p>
                </div>
              </div>
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
                    <p className="texto-secundario" style={{ fontSize: 12, margin: '6px 0 4px' }}>
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
              {/* O logo aparece dentro da área segura: é onde ele
                  sobrevive à interface do Reels. */}
              <span className="marca__logo-no-video">
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    display: 'grid',
                    placeItems: 'center',
                    background: `linear-gradient(135deg, ${corDe('primaria')}, ${corDe('secundaria')})`,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  M
                </span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>MAKUCHO</span>
              </span>

              <span className="marca__zona-logo" aria-hidden />

              <p
                className="marca__legenda"
                style={{
                  fontFamily: `${fonteTitulo}, Inter, sans-serif`,
                  color: corDe('texto'),
                }}
              >
                Ideias em vídeos
                <br />
                que geram{' '}
                <mark
                  style={{
                    background:
                      estilo === 'minimalista' ? 'rgb(255 255 255 / 20%)' : corDe('primaria'),
                    color: estilo === 'minimalista' ? corDe('texto') : '#fff',
                    padding: '0 6px',
                    borderRadius: 4,
                    textTransform: estilo === 'impacto' ? 'uppercase' : 'none',
                  }}
                >
                  resultados.
                </mark>
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

              <div className="pilha" role="radiogroup" aria-label="Estilo das legendas">
                {ESTILOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={estilo === item.id}
                    className="opcao"
                    onClick={() => {
                      setEstilo(item.id);
                      setSujo(true);
                    }}
                  >
                    <span className="opcao__marca" aria-hidden />

                    <span className="opcao__amostra">
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: item.id === 'minimalista' ? 500 : 800,
                          textTransform: item.id === 'impacto' ? 'uppercase' : 'none',
                          lineHeight: 1.3,
                        }}
                      >
                        Texto que{' '}
                        <mark
                          style={{
                            background:
                              item.id === 'minimalista'
                                ? 'rgb(255 255 255 / 22%)'
                                : corDe('primaria'),
                            color: '#fff',
                            padding: '0 3px',
                            borderRadius: 3,
                          }}
                        >
                          engaja
                        </mark>{' '}
                        de verdade.
                      </span>
                    </span>

                    <span style={{ textAlign: 'left', minWidth: 0 }}>
                      <strong style={{ fontSize: 14, display: 'block' }}>{item.rotulo}</strong>
                      <span className="texto-secundario" style={{ fontSize: 12 }}>
                        {item.descricao}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="cartao">
              <h2>Trilha padrão</h2>
              <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                Essa música será usada como padrão nos seus novos vídeos.
              </p>

              <div className="faixa">
                <span className="faixa__capa" aria-hidden>
                  <IconeAudio size={20} />
                </span>

                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14, display: 'block' }}>Energia Criativa</strong>
                  <span className="texto-secundario" style={{ fontSize: 12 }}>
                    MAKUCHO Studio
                  </span>
                </span>

                <button type="button" className="faixa__play" aria-label="Ouvir Energia Criativa">
                  <IconeTocar size={17} weight="fill" />
                </button>

                <span
                  className="texto-secundario"
                  style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
                >
                  0:00 / 2:18
                </span>

                <button
                  type="button"
                  className="botao-icone botao-icone--pequeno"
                  aria-label="Mais opções da trilha"
                >
                  <IconeMenu size={16} />
                </button>
              </div>

              <div className="linha entre" style={{ marginTop: 'var(--e4)', gap: 'var(--e3)' }}>
                <button type="button" className="botao botao--secundario botao--pequeno">
                  <IconeEnviar size={15} />
                  Substituir trilha
                </button>
                <span
                  className="linha"
                  style={{ gap: 4, fontSize: 13, color: 'var(--accent)' }}
                >
                  Ouça mais faixas na biblioteca
                  <IconeAvancar size={13} />
                </span>
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
          </div>
        </div>
      </div>
    </>
  );
}

const GB = 1024 ** 3;
const gb = (bytes: number) => (bytes / GB).toFixed(1).replace('.', ',');

function BarraDeCota({
  rotulo,
  descricao,
  cota,
}: {
  rotulo: string;
  descricao: string;
  cota: UsoDeCota;
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
          {gb(cota.usadoBytes)} / {gb(cota.quotaBytes)} GB
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
