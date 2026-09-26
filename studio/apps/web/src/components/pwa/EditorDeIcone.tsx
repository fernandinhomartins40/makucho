'use client';

// ============================================================
// Editor do ícone do app: uma imagem qualquer vira o ícone de todos os
// destinos do PWA.
//
// A pessoa envia a imagem que tiver (logo retangular, foto, arte
// pequena), enquadra no quadrado arrastando e com zoom, escolhe o fundo
// e o tamanho no Android, e vê AO VIVO como fica em cada lugar: Android
// (que recorta em círculo, gota ou squircle), iPhone, aba do navegador
// e tela de abertura.
//
// Daqui saem duas artes em 1024 px, desenhadas no navegador:
//   - a principal: o recorte, com fundo transparente ou na cor escolhida
//     (vira os ícones "any" e o favicon);
//   - a mascarável: o recorte sobre a cor de fundo, reduzido para caber
//     na zona segura do Android (o círculo central de 80%) -- vira os
//     ícones "maskable" e o do iPhone.
// O servidor gera cada tamanho a partir delas, com PNG comprimido.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconeAviso, IconeCheck, IconeFechar, IconeZoomMais, IconeZoomMenos } from '../icones';

const LADO_DA_SAIDA = 1024;
/** Abaixo disto, o recorte esticado para 512 px (o maior ícone) borra. */
const MINIMO_NITIDO = 512;
/** Área visível do editor, e o quadrado do recorte dentro dela. */
const VISTA = 360;
const RECORTE = 280;

type Fundo = 'transparente' | 'cor';

interface Enquadramento {
  zoom: number;
  cx: number;
  cy: number;
}

interface Props {
  arquivo: File;
  corDeFundo: string;
  nomeCurto: string;
  onAplicar: (principal: Blob, mascaravel: Blob) => Promise<void>;
  onFechar: () => void;
}

/** Desenha o recorte num quadrado `lado`, com o conteúdo ocupando `escala` dele. */
function desenhar(
  ctx: CanvasRenderingContext2D,
  lado: number,
  img: HTMLImageElement,
  dim: { w: number; h: number },
  e: Enquadramento,
  opcoes: { fundo: string | null; escala: number },
) {
  ctx.clearRect(0, 0, lado, lado);
  if (opcoes.fundo) {
    ctx.fillStyle = opcoes.fundo;
    ctx.fillRect(0, 0, lado, lado);
  }
  const S = Math.max(dim.w, dim.h) / e.zoom;
  const area = lado * opcoes.escala;
  const inicio = (lado - area) / 2;
  const k = area / S;
  ctx.save();
  ctx.beginPath();
  ctx.rect(inicio, inicio, area, area);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, inicio + (0 - (e.cx - S / 2)) * k, inicio + (0 - (e.cy - S / 2)) * k, dim.w * k, dim.h * k);
  ctx.restore();
}

/** A imagem tem pixels transparentes? (decide o fundo e a margem iniciais) */
function temTransparencia(img: HTMLImageElement, dim: { w: number; h: number }): boolean {
  const c = document.createElement('canvas');
  const lado = 64;
  c.width = lado;
  c.height = lado;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, lado, (lado * dim.h) / dim.w);
  const dados = ctx.getImageData(0, 0, lado, Math.max(1, Math.round((lado * dim.h) / dim.w))).data;
  for (let i = 3; i < dados.length; i += 4) if (dados[i]! < 250) return true;
  return false;
}

const paraBlob = (c: HTMLCanvasElement) => new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('não foi possível gerar a imagem'))), 'image/png'));

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function EditorDeIcone({ arquivo, corDeFundo, nomeCurto, onAplicar, onFechar }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [dim, setDim] = useState({ w: 1, h: 1 });
  const [erro, setErro] = useState<string | null>(null);
  const [enq, setEnq] = useState<Enquadramento>({ zoom: 1, cx: 0.5, cy: 0.5 });
  const [fundo, setFundo] = useState<Fundo>('cor');
  const [cor, setCor] = useState(/^#[0-9a-f]{6}$/i.test(corDeFundo) ? corDeFundo : '#06132d');
  const [escalaAndroid, setEscalaAndroid] = useState(0.8);
  const [aplicando, setAplicando] = useState(false);
  const ehSvg = arquivo.type === 'image/svg+xml' || /\.svg$/i.test(arquivo.name);

  // ---------- Carregar a imagem ----------
  useEffect(() => {
    const url = URL.createObjectURL(arquivo);
    const nova = new Image();
    nova.onload = () => {
      // SVG sem tamanho próprio: desenha como 1024 (é vetor, fica nítido).
      const w = nova.naturalWidth || LADO_DA_SAIDA;
      const h = nova.naturalHeight || LADO_DA_SAIDA;
      const d = { w, h };
      setDim(d);
      const transparente = temTransparencia(nova, d);
      // Logo com transparência: fundo na cor e margem para o Android.
      // Arte cheia (foto, quadrado pintado): preenche o quadro todo.
      setFundo(transparente ? 'transparente' : 'cor');
      setEscalaAndroid(transparente ? 0.72 : 1);
      setEnq({ zoom: transparente ? 1 : Math.max(w, h) / Math.min(w, h), cx: w / 2, cy: h / 2 });
      setImg(nova);
    };
    nova.onerror = () => setErro('não foi possível abrir esta imagem. Use PNG, JPG, WebP ou SVG.');
    nova.src = url;
    return () => {
      // Solta os handlers antes de revogar: senão a carga cancelada dispara
      // o onerror e mostra "não foi possível abrir" com a imagem aberta.
      nova.onload = null;
      nova.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [arquivo]);

  // ---------- Enquadrar ----------
  const S = Math.max(dim.w, dim.h) / enq.zoom;
  const limitar = useCallback(
    (e: Enquadramento): Enquadramento => {
      const zoom = Math.min(12, Math.max(0.4, e.zoom));
      return { zoom, cx: Math.min(dim.w, Math.max(0, e.cx)), cy: Math.min(dim.h, Math.max(0, e.cy)) };
    },
    [dim],
  );
  const zoomPara = (z: number) => setEnq((e) => limitar({ ...e, zoom: z }));
  const encaixar = () => setEnq(limitar({ zoom: 1, cx: dim.w / 2, cy: dim.h / 2 }));
  const preencher = () => setEnq(limitar({ zoom: Math.max(dim.w, dim.h) / Math.min(dim.w, dim.h), cx: dim.w / 2, cy: dim.h / 2 }));

  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<number | null>(null);
  const aoPressionar = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ponteiros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    pinca.current = null;
  };
  const aoMover = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const antes = ponteiros.current.get(ev.pointerId);
    if (!antes) return;
    const agora = { x: ev.clientX, y: ev.clientY };
    ponteiros.current.set(ev.pointerId, agora);
    const lista = [...ponteiros.current.values()];
    if (lista.length >= 2) {
      // Pinça: a distância entre os dedos muda o zoom.
      const d = Math.hypot(lista[0]!.x - lista[1]!.x, lista[0]!.y - lista[1]!.y);
      if (pinca.current) setEnq((e) => limitar({ ...e, zoom: e.zoom * (d / pinca.current!) }));
      pinca.current = d;
      return;
    }
    // Arrastar move a imagem (o quadrado fica parado, como nos apps de foto).
    // A vista encolhe no celular: o passo acompanha o tamanho na tela.
    const naTela = ev.currentTarget.clientWidth / VISTA || 1;
    const escala = S / (RECORTE * naTela);
    setEnq((e) => limitar({ ...e, cx: e.cx - (agora.x - antes.x) * escala, cy: e.cy - (agora.y - antes.y) * escala }));
  };
  const aoSoltar = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    ponteiros.current.delete(ev.pointerId);
    pinca.current = null;
  };

  // A roda do mouse precisa de listener não passivo para não rolar a página.
  const vista = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = vista.current;
    if (!c) return;
    const roda = (ev: WheelEvent) => {
      ev.preventDefault();
      setEnq((e) => limitar({ ...e, zoom: e.zoom * Math.exp(-ev.deltaY * 0.0015) }));
    };
    c.addEventListener('wheel', roda, { passive: false });
    return () => c.removeEventListener('wheel', roda);
  }, [limitar, img]);

  const aoTeclar = (ev: React.KeyboardEvent) => {
    const passo = S * 0.03;
    const mapa: Record<string, () => void> = {
      ArrowLeft: () => setEnq((e) => limitar({ ...e, cx: e.cx - passo })),
      ArrowRight: () => setEnq((e) => limitar({ ...e, cx: e.cx + passo })),
      ArrowUp: () => setEnq((e) => limitar({ ...e, cy: e.cy - passo })),
      ArrowDown: () => setEnq((e) => limitar({ ...e, cy: e.cy + passo })),
      '+': () => zoomPara(enq.zoom * 1.1),
      '=': () => zoomPara(enq.zoom * 1.1),
      '-': () => zoomPara(enq.zoom / 1.1),
    };
    const acao = mapa[ev.key];
    if (acao) {
      ev.preventDefault();
      acao();
    }
  };

  // ---------- Desenhar a vista e as prévias ----------
  const corDaPrincipal = fundo === 'cor' ? cor : null;
  const previaPrincipal = useRef<HTMLCanvasElement>(null);
  const previaMascaravel = useRef<HTMLCanvasElement>(null);
  const previaFavicon = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!img) return;
    const quadro = requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // A vista: a imagem inteira apagada em volta, o recorte aceso no meio.
      const c = vista.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        c.width = VISTA * dpr;
        c.height = VISTA * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, VISTA, VISTA);
        const k = RECORTE / S;
        const m = (VISTA - RECORTE) / 2;
        if (corDaPrincipal) {
          ctx.fillStyle = corDaPrincipal;
          ctx.fillRect(m, m, RECORTE, RECORTE);
        }
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, m - (enq.cx - S / 2) * k, m - (enq.cy - S / 2) * k, dim.w * k, dim.h * k);
        // Fora do recorte: escurecido.
        ctx.fillStyle = 'rgba(4, 10, 24, 0.66)';
        ctx.beginPath();
        ctx.rect(0, 0, VISTA, VISTA);
        ctx.rect(m, m, RECORTE, RECORTE);
        ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(m, m, RECORTE, RECORTE);
        // A zona segura do Android, no tamanho em que o conteúdo vai entrar.
        const raio = Math.min(1, 0.8 / escalaAndroid) * (RECORTE / 2);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(65, 200, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(VISTA / 2, VISTA / 2, raio, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const pintar = (alvo: HTMLCanvasElement | null, lado: number, opcoes: { fundo: string | null; escala: number }) => {
        const x = alvo?.getContext('2d');
        if (!alvo || !x) return;
        alvo.width = lado;
        alvo.height = lado;
        desenhar(x, lado, img, dim, enq, opcoes);
      };
      pintar(previaPrincipal.current, 192, { fundo: corDaPrincipal, escala: 1 });
      pintar(previaMascaravel.current, 192, { fundo: cor, escala: escalaAndroid });
      pintar(previaFavicon.current, 32, { fundo: corDaPrincipal, escala: 1 });
    });
    return () => cancelAnimationFrame(quadro);
  }, [img, dim, enq, S, corDaPrincipal, cor, escalaAndroid]);

  // As prévias pequenas são cópias das três telas pintadas acima.
  const [urls, setUrls] = useState<{ principal: string; mascaravel: string; favicon: string } | null>(null);
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => {
      const p = previaPrincipal.current;
      const mk = previaMascaravel.current;
      const f = previaFavicon.current;
      if (p && mk && f) setUrls({ principal: p.toDataURL(), mascaravel: mk.toDataURL(), favicon: f.toDataURL() });
    }, 60);
    return () => clearTimeout(t);
  }, [img, dim, enq, corDaPrincipal, cor, escalaAndroid]);

  const pixelsNoRecorte = Math.round(Math.min(S, Math.max(dim.w, dim.h)));
  const vaiBorrar = !ehSvg && img !== null && pixelsNoRecorte < MINIMO_NITIDO;

  // ---------- Aplicar ----------
  const [pesos, setPesos] = useState<{ principal: number; mascaravel: number } | null>(null);
  const aplicar = async () => {
    if (!img) return;
    setAplicando(true);
    setErro(null);
    try {
      const gerar = async (opcoes: { fundo: string | null; escala: number }) => {
        const c = document.createElement('canvas');
        c.width = LADO_DA_SAIDA;
        c.height = LADO_DA_SAIDA;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('o navegador não conseguiu desenhar o ícone');
        desenhar(ctx, LADO_DA_SAIDA, img, dim, enq, opcoes);
        return paraBlob(c);
      };
      const principal = await gerar({ fundo: corDaPrincipal, escala: 1 });
      const mascaravel = await gerar({ fundo: cor, escala: escalaAndroid });
      setPesos({ principal: principal.size, mascaravel: mascaravel.size });
      await onAplicar(principal, mascaravel);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível gerar o ícone.');
      setAplicando(false);
    }
  };

  // Esc fecha; o fundo não rola.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !aplicando && onFechar();
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [aplicando, onFechar]);

  return (
    <div className="editor-icone__fundo" onClick={() => !aplicando && onFechar()}>
      <div className="editor-icone" role="dialog" aria-modal="true" aria-labelledby="editor-icone-titulo" onClick={(e) => e.stopPropagation()}>
        <header className="editor-icone__topo">
          <div>
            <h2 id="editor-icone-titulo">Ajustar o ícone do app</h2>
            <p>Arraste para enquadrar e use o zoom. As prévias mostram como fica em cada aparelho.</p>
          </div>
          <button type="button" className="botao-icone" aria-label="Fechar" disabled={aplicando} onClick={onFechar}>
            <IconeFechar size={18} />
          </button>
        </header>

        {erro && (
          <div className="aviso aviso--erro" role="alert">
            <IconeAviso size={16} />
            <span>{erro}</span>
          </div>
        )}

        <div className="editor-icone__corpo">
          {/* ---------- Recorte ---------- */}
          <div className="editor-icone__recorte">
            <div className="editor-icone__vista">
              <canvas
                ref={vista}
                style={{ width: '100%', maxWidth: VISTA, aspectRatio: '1' }}
                tabIndex={0}
                aria-label="Área de recorte: arraste para mover, use as setas para ajustar e + ou - para o zoom"
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onKeyDown={aoTeclar}
              />
              {!img && !erro && <span className="editor-icone__carregando">Abrindo a imagem…</span>}
            </div>
            <div className="editor-icone__zoom">
              <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Diminuir o zoom" onClick={() => zoomPara(enq.zoom / 1.15)}>
                <IconeZoomMenos size={16} />
              </button>
              <input
                type="range"
                min={Math.log(0.4)}
                max={Math.log(12)}
                step={0.01}
                value={Math.log(enq.zoom)}
                aria-label="Zoom"
                onChange={(e) => zoomPara(Math.exp(Number(e.target.value)))}
              />
              <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Aumentar o zoom" onClick={() => zoomPara(enq.zoom * 1.15)}>
                <IconeZoomMais size={16} />
              </button>
            </div>
            <div className="editor-icone__atalhos">
              <button type="button" className="botao botao--fantasma botao--pequeno" onClick={encaixar}>
                Imagem inteira
              </button>
              <button type="button" className="botao botao--fantasma botao--pequeno" onClick={preencher}>
                Preencher o quadrado
              </button>
            </div>
            <p className="editor-icone__legenda">
              <span className="editor-icone__zona" aria-hidden /> Fora do círculo tracejado, o Android pode cortar.
            </p>
            {vaiBorrar && (
              <p className="editor-icone__alerta" role="status">
                <IconeAviso size={14} /> Neste recorte a imagem tem só {pixelsNoRecorte} px de lado e pode ficar borrada nos ícones grandes. Use uma
                imagem maior ou diminua o zoom.
              </p>
            )}
          </div>

          {/* ---------- Opções e prévias ---------- */}
          <div className="editor-icone__lado">
            <fieldset className="editor-icone__grupo">
              <legend>Fundo do ícone</legend>
              <div className="editor-icone__fundos">
                <label>
                  <input type="radio" name="fundo" checked={fundo === 'transparente'} onChange={() => setFundo('transparente')} />
                  Transparente
                </label>
                <label>
                  <input type="radio" name="fundo" checked={fundo === 'cor'} onChange={() => setFundo('cor')} />
                  Cor
                </label>
                <input type="color" value={cor} aria-label="Cor do fundo" onChange={(e) => setCor(e.target.value)} className="app-config__cor" />
              </div>
              <small>No Android e no iPhone o fundo é sempre a cor: esses sistemas não aceitam transparência.</small>
            </fieldset>

            <fieldset className="editor-icone__grupo">
              <legend>Tamanho no Android: {Math.round(escalaAndroid * 100)}%</legend>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={escalaAndroid}
                aria-label="Tamanho do desenho no ícone do Android"
                onChange={(e) => setEscalaAndroid(Number(e.target.value))}
              />
              <small>Diminua se o círculo tracejado corta parte do desenho. Arte que ocupa o quadro todo pode ficar em 100%.</small>
            </fieldset>

            <div className="editor-icone__previas" aria-label="Prévias">
              <Previa legenda="Android · círculo">
                <span className="editor-icone__icone" style={{ borderRadius: '50%' }}>
                  {urls && <img src={urls.mascaravel} alt="" />}
                </span>
              </Previa>
              <Previa legenda="Android · squircle">
                <span className="editor-icone__icone" style={{ borderRadius: '30%' }}>
                  {urls && <img src={urls.mascaravel} alt="" />}
                </span>
              </Previa>
              <Previa legenda="iPhone e iPad">
                <span className="editor-icone__icone" style={{ borderRadius: '22.5%' }}>
                  {urls && <img src={urls.mascaravel} alt="" />}
                </span>
              </Previa>
              <Previa legenda="Instalação no computador">
                <span className="editor-icone__icone editor-icone__icone--xadrez">{urls && <img src={urls.principal} alt="" />}</span>
              </Previa>
              <Previa legenda="Aba do navegador">
                <span className="editor-icone__aba">
                  {urls && <img src={urls.favicon} alt="" width={16} height={16} />}
                  <span>{nomeCurto || 'Studio'}</span>
                </span>
              </Previa>
              <Previa legenda="Abertura do app">
                <span className="editor-icone__abertura" style={{ background: cor }}>
                  {urls && <img src={urls.principal} alt="" />}
                </span>
              </Previa>
            </div>
            {/* Telas de desenho das prévias (fora da vista). */}
            <div hidden>
              <canvas ref={previaPrincipal} />
              <canvas ref={previaMascaravel} />
              <canvas ref={previaFavicon} />
            </div>
          </div>
        </div>

        <footer className="editor-icone__rodape">
          <p>
            Gera 7 arquivos: Android (192 e 512, normal e recortável), iPhone (180), aba do navegador (16 e 32), além das telas de abertura.
            {pesos && ` Artes enviadas: ${kb(pesos.principal)} e ${kb(pesos.mascaravel)}.`}
          </p>
          <div className="editor-icone__acoes">
            <button type="button" className="botao botao--fantasma" disabled={aplicando} onClick={onFechar}>
              Cancelar
            </button>
            <button type="button" className="botao botao--primario" disabled={!img || aplicando} onClick={() => void aplicar()}>
              <IconeCheck size={16} /> {aplicando ? 'Gerando os ícones…' : 'Usar este ícone'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Previa({ legenda, children }: { legenda: string; children: React.ReactNode }) {
  return (
    <figure className="editor-icone__previa">
      {children}
      <figcaption>{legenda}</figcaption>
    </figure>
  );
}
