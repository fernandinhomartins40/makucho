// ============================================================
// Compositor da prévia (WebGL2).
//
// Desenha o quadro do vídeo do jeito que o render monta, na MESMA ordem:
//
//   1. cada trecho visível vai para o quadro vertical (ajustar,
//      preencher ou desfoque) com o zoom dele -- um framebuffer por trecho;
//   2. a transição mistura os dois com a fórmula do `xfade`
//      (transicoesGlsl.ts);
//   3. os efeitos de tela (efeitosGlsl.ts), um passo cada, na ordem do
//      plano -- como no render, sobre o vídeo montado;
//   4. o resultado vai para a tela.
//
// A cor do trecho (filtro + ajustes) é a tabela 3D de contracts/cor.ts,
// aplicada no fim do passo 1 -- como o `lut3d` no fim do trecho no render.
//
// Os <video> continuam existindo (tocam o som e são a fonte das
// texturas), mas quem aparece é este canvas.
// ============================================================

import { shaderDeTransicao } from './transicoesGlsl';
import { INDICE_DO_EFEITO, SHADER_DE_EFEITO } from './efeitosGlsl';

export type Enquadramento = 'ajustar' | 'preencher' | 'desfoque';

/**
 * Um quadro que não vem de um <video> tocando: o quadro decodificado da
 * exportação (lib/exportacao). Quem o preenche aumenta a `versao` a cada
 * imagem nova -- é por ela que o compositor sabe que precisa subir a
 * textura de novo.
 */
export class QuadroExterno {
  imagem: TexImageSource | null = null;
  largura = 0;
  altura = 0;
  versao = 0;

  atualizar(imagem: TexImageSource, largura: number, altura: number): void {
    this.imagem = imagem;
    this.largura = largura;
    this.altura = altura;
    this.versao += 1;
  }
}

type FonteDeVideo = HTMLVideoElement | QuadroExterno;

export interface CamadaDoQuadro {
  fonte: FonteDeVideo | null;
  /** Zoom do trecho (punch_in, zoom_lento), sobre o quadro já montado. */
  zoom: number;
  /** Tabela de cor do trecho (`tabelaDeCor`), com a chave dela. */
  cor?: TabelaDeCor | null;
}

export interface TabelaDeCor {
  chave: string;
  lado: number;
  dados: Uint8Array;
}

/** Um efeito de tela no quadro: `j` é o quadro dentro dele, de `nf`. */
export interface EfeitoNoQuadro {
  tipo: string;
  intensidade: number;
  j: number;
  nf: number;
}

/** Uma camada de mídia (B-roll, PiP) no quadro, em pixels do canvas. */
export interface MidiaNoQuadro {
  fonte: HTMLImageElement | HTMLVideoElement | QuadroExterno;
  /** Canto superior esquerdo e tamanho (`caixaDaMidia` no tamanho do canvas). */
  caixa: { x: number; y: number; w: number; h: number; modo: 'cobrir' | 'conter' };
  /** Raio dos cantos, em pixels do canvas. */
  raio: number;
  /** Opacidade já com o fade do instante. */
  alfa: number;
  /** Giro em graus, no sentido horário (como o `rotate` do render). */
  giro?: number;
  /** Ken Burns: zoom e deslocamento (fração da caixa) sobre a caixa. */
  kenBurns?: { z: number; dx: number };
  /** Cortina: até onde (0 a 1 da caixa) a camada aparece, e de que lado. */
  cortina?: { borda: number; lado: 'esquerda' | 'direita' };
}

export interface QuadroParaDesenhar {
  camadas: CamadaDoQuadro[];
  /** Transição entre camadas[0] (sai) e camadas[1] (entra). */
  transicao?: { indice: number; progresso: number; quadros: number } | null;
  enquadramento: Enquadramento;
  efeitos?: readonly EfeitoNoQuadro[];
  /** Camadas de mídia, de baixo para cima, sobre o quadro já com os efeitos. */
  midias?: readonly MidiaNoQuadro[];
  /** Passa o quadro composto pelo framebuffer 2 mesmo sem efeitos (a máscara da pessoa lê de lá). */
  guardarQuadro?: boolean;
}

/**
 * Uma camada de mídia: a textura na caixa (cobrindo com corte, ou
 * inteira), cantos arredondados com 1 px de borda suave e alfa -- as
 * mesmas contas do render (`scale`/`crop`, máscara do `geq`, `overlay`).
 */
const CAMADA = `#version 300 es
precision highp float;
uniform sampler2D uM;
uniform vec4 uCaixa;
uniform vec2 uTamanho;
uniform float uProporcao;
uniform float uCobrir;
uniform float uRaio;
uniform float uAlfa;
uniform float uGiro;
uniform vec2 uKb;
uniform vec2 uCortina;
out vec4 cor;
void main() {
  float X = floor(gl_FragCoord.x);
  float Y = uTamanho.y - 1.0 - floor(gl_FragCoord.y);
  // Giro em volta do centro da caixa: o ponto da tela volta ao da mídia
  // pela rotação inversa (a mesma do rotate do FFmpeg).
  vec2 d = vec2(X, Y) + 0.5 - (uCaixa.xy + uCaixa.zw / 2.0);
  float cs = cos(uGiro), sn = sin(uGiro);
  vec2 p = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) + uCaixa.zw / 2.0;
  if (p.x < 0.0 || p.y < 0.0 || p.x > uCaixa.z || p.y > uCaixa.w) discard;
  vec2 uv = p / uCaixa.zw;
  // Cortina: fora da parte já revelada, nada (lado 1 = da esquerda, 2 = da direita).
  if (uCortina.y > 0.5 && (uCortina.y < 1.5 ? uv.x >= uCortina.x : uv.x < 1.0 - uCortina.x)) discard;
  // Ken Burns (o perspective do render): zoom no centro e deslocamento.
  uv = 0.5 + (uv - 0.5) / uKb.x + vec2(uKb.y, 0.0);
  if (uCobrir > 0.5) {
    // Cobrir: amplia até encher e corta o que sobra, centrado.
    float s = uProporcao / (uCaixa.z / uCaixa.w);
    if (s > 1.0) uv.x = 0.5 + (uv.x - 0.5) / s;
    else uv.y = 0.5 + (uv.y - 0.5) * s;
  }
  float a = uAlfa;
  if (uRaio > 0.0) {
    vec2 d = max(abs(p - uCaixa.zw / 2.0) - (uCaixa.zw / 2.0 - uRaio), 0.0);
    a *= clamp(uRaio - length(d) + 0.5, 0.0, 1.0);
  }
  // O alfa da própria mídia (PNG com transparência, como os stickers) conta.
  vec4 m = texture(uM, vec2(uv.x, 1.0 - uv.y));
  cor = vec4(m.rgb, a * m.a);
}`;

const VERTICES = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/**
 * Quadro vertical de um trecho: o vídeo ajustado ou preenchendo o quadro;
 * no desfoque, uma cópia ampliada e borrada dele no fundo (como o render,
 * que borra em 1/4 do tamanho e escurece 6%). O zoom vale para o quadro
 * todo, centrado -- o mesmo `crop`/`perspective` do render.
 */
const ENQUADRAR = `#version 300 es
precision highp float;
uniform sampler2D uVideo;
uniform vec2 uVideoTam;
uniform vec2 uQuadroTam;
uniform int uModo;
uniform float uZoom;
uniform highp sampler3D uLut;
uniform float uLado;
in vec2 vUv;
out vec4 cor;
vec3 video(vec2 uv, float escala, float lod) {
  // uv do quadro -> uv do vídeo, centrado, com a escala do enquadramento.
  vec2 tamanho = uVideoTam * escala;
  vec2 p = (uv * uQuadroTam - (uQuadroTam - tamanho) * 0.5) / tamanho;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec3(-1.0);
  return textureLod(uVideo, p, lod).rgb;
}
vec3 montar() {
  vec2 uv = 0.5 + (vUv - 0.5) / uZoom;
  float cabe = min(uQuadroTam.x / uVideoTam.x, uQuadroTam.y / uVideoTam.y);
  float cobre = max(uQuadroTam.x / uVideoTam.x, uQuadroTam.y / uVideoTam.y);
  if (uModo == 1) return max(video(uv, cobre, 0.0), 0.0);
  vec3 frente = video(uv, cabe, 0.0);
  if (frente.r >= 0.0) return frente;
  if (uModo == 2) return clamp(max(video(uv, cobre, 5.0), 0.0) - 0.06, 0.0, 1.0);
  return vec3(0.0);
}
void main() {
  vec3 c = montar();
  // Tabela 3D: o valor v cai entre os pontos v*(lado-1), como no lut3d.
  if (uLado > 1.0) c = texture(uLut, c * (uLado - 1.0) / uLado + 0.5 / uLado).rgb;
  cor = vec4(c, 1.0);
}`;

const COPIAR = `#version 300 es
precision highp float;
uniform sampler2D uA;
in vec2 vUv;
out vec4 cor;
void main() { cor = vec4(texture(uA, vUv).rgb, 1.0); }`;

interface Programa {
  programa: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class Compositor {
  private gl: WebGL2RenderingContext;
  private enquadrar: Programa;
  private transicao: Programa;
  private copiar: Programa;
  private efeito: Programa;
  private camada: Programa;
  /** Textura de cada imagem/vídeo sobreposto (a imagem sobe uma vez só). */
  private texDaMidia = new Map<HTMLImageElement | HTMLVideoElement | QuadroExterno, { tex: WebGLTexture; t: number }>();
  private texVideo: WebGLTexture[] = [];
  /** A textura de cada player: guarda o último quadro bom dele. */
  private texDoPlayer = new Map<FonteDeVideo, { tex: WebGLTexture; w: number; h: number; t: number }>();
  /** As fontes das camadas do quadro sendo desenhado (não podem perder a textura). */
  private emUso = new Set<FonteDeVideo>();
  /** Camadas do último quadro desenhado que saíram pretas (sem imagem do vídeo). */
  camadasSemImagem = 0;
  private fbos: Array<{ fb: WebGLFramebuffer; tex: WebGLTexture }> = [];
  private largura = 0;
  private altura = 0;
  /** Máscara da pessoa (256x256), para os efeitos que mudam só o fundo. */
  private texMascara: WebGLTexture | null = null;
  private temMascara = false;
  private amostra: { fb: WebGLFramebuffer; tex: WebGLTexture; pixels: Uint8Array } | null = null;
  /** Tabelas de cor já na placa, por chave (as mais recentes). */
  private luts = new Map<string, WebGLTexture>();

  static criar(canvas: HTMLCanvasElement): Compositor | null {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return null;
    try {
      return new Compositor(gl);
    } catch (e) {
      console.warn('[prévia] compositor WebGL indisponível:', e);
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.enquadrar = this.compilar(ENQUADRAR, ['uVideo', 'uVideoTam', 'uQuadroTam', 'uModo', 'uZoom', 'uLut', 'uLado']);
    this.transicao = this.compilar(shaderDeTransicao(), ['uA', 'uB', 'P', 'uTipo', 'uTamanho', 'uN']);
    this.copiar = this.compilar(COPIAR, ['uA']);
    this.efeito = this.compilar(SHADER_DE_EFEITO, ['uC', 'uTipo', 'uK', 'uJ', 'uNf', 'uTamanho', 'uDir', 'uMascara', 'uOrig', 'uTemMascara']);
    this.camada = this.compilar(CAMADA, ['uM', 'uCaixa', 'uTamanho', 'uProporcao', 'uCobrir', 'uRaio', 'uAlfa', 'uGiro', 'uKb', 'uCortina']);
    gl.useProgram(this.efeito.programa);
    gl.uniform1i(this.efeito.uniforms.uOrig!, 1);
    gl.uniform1i(this.efeito.uniforms.uMascara!, 3);
    // A tabela de cor mora sempre na unidade 2: um sampler3D na unidade 0,
    // onde fica a textura 2D do vídeo, faria a placa recusar o desenho.
    gl.useProgram(this.enquadrar.programa);
    gl.uniform1i(this.enquadrar.uniforms.uLut!, 2);
    for (let i = 0; i < 2; i += 1) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.texVideo.push(t);
    }
  }

  private compilar(fragmento: string, nomes: string[]): Programa {
    const gl = this.gl;
    const sombreador = (tipo: number, fonte: string) => {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, fonte);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const programa = gl.createProgram()!;
    gl.attachShader(programa, sombreador(gl.VERTEX_SHADER, VERTICES));
    gl.attachShader(programa, sombreador(gl.FRAGMENT_SHADER, fragmento));
    gl.bindAttribLocation(programa, 0, 'aPos');
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programa) ?? 'programa');
    return { programa, uniforms: Object.fromEntries(nomes.map((n) => [n, gl.getUniformLocation(programa, n)])) };
  }

  /** Framebuffers no tamanho do canvas (recriados quando ele muda). */
  private garantirTamanho(largura: number, altura: number) {
    if (largura === this.largura && altura === this.altura && this.fbos.length) return;
    const gl = this.gl;
    for (const f of this.fbos) {
      gl.deleteFramebuffer(f.fb);
      gl.deleteTexture(f.tex);
    }
    // 0 e 1: um por trecho; 2 e 3: o pós-processamento (efeitos).
    this.fbos = [0, 1, 2, 3].map(() => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, largura, altura, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex };
    });
    this.largura = largura;
    this.altura = altura;
  }

  private desenharRetangulo() {
    const gl = this.gl;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Monta o quadro de uma camada num framebuffer. Enquanto o player busca
   * (sem quadro pronto), repete o último quadro dele -- nunca pisca preto.
   * Devolve false só quando o player ainda não mostrou quadro nenhum.
   */
  private montarCamada(i: number, c: CamadaDoQuadro, enquadramento: Enquadramento): boolean {
    const gl = this.gl;
    const v = c.fonte;
    const alvo = this.fbos[i]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, alvo.fb);
    gl.viewport(0, 0, this.largura, this.altura);
    const guardada = v ? this.guardarQuadro(v) : undefined;
    if (!guardada || !guardada.w) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return false;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, guardada.tex);
    const p = this.enquadrar;
    gl.useProgram(p.programa);
    gl.uniform1i(p.uniforms.uVideo!, 0);
    gl.uniform2f(p.uniforms.uVideoTam!, guardada.w, guardada.h);
    gl.uniform2f(p.uniforms.uQuadroTam!, this.largura, this.altura);
    gl.uniform1i(p.uniforms.uModo!, enquadramento === 'preencher' ? 1 : enquadramento === 'desfoque' ? 2 : 0);
    gl.uniform1f(p.uniforms.uZoom!, c.zoom);
    this.usarCor(c.cor);
    this.desenharRetangulo();
    return true;
  }

  /** Liga a tabela de cor (unidade 2) ou desliga (`uLado` = 0). */
  private usarCor(cor: TabelaDeCor | null | undefined) {
    const gl = this.gl;
    const p = this.enquadrar;
    if (!cor) {
      gl.uniform1f(p.uniforms.uLado!, 0);
      return;
    }
    let tex = this.luts.get(cor.chave);
    if (!tex) {
      tex = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, cor.lado, cor.lado, cor.lado, 0, gl.RGBA, gl.UNSIGNED_BYTE, cor.dados);
      for (const eixo of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, eixo, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.luts.set(cor.chave, tex);
      // Guarda só as 16 mais recentes.
      if (this.luts.size > 16) {
        const [velha, t] = this.luts.entries().next().value!;
        gl.deleteTexture(t);
        this.luts.delete(velha);
      }
    } else {
      // Recente de novo: vai para o fim da fila.
      this.luts.delete(cor.chave);
      this.luts.set(cor.chave, tex);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.uniform1i(p.uniforms.uLut!, 2);
    gl.uniform1f(p.uniforms.uLado!, cor.lado);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Uma imagem com a cor aplicada, sem enquadrar (banco de paridade e
   * miniaturas dos filtros). O canvas fica do tamanho da imagem.
   */
  desenharImagemComCor(img: HTMLImageElement | HTMLCanvasElement, cor: TabelaDeCor | null): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = img.width;
    const h = img.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const tex = this.texVideo[this.texVideo.length - 1]!;
    // A textura deixa de ser de um player: ele sobe o quadro de novo.
    for (const [v, g] of this.texDoPlayer) if (g.tex === tex) this.texDoPlayer.delete(v);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const p = this.enquadrar;
    gl.useProgram(p.programa);
    gl.uniform1i(p.uniforms.uVideo!, 0);
    gl.uniform2f(p.uniforms.uVideoTam!, w, h);
    gl.uniform2f(p.uniforms.uQuadroTam!, w, h);
    gl.uniform1i(p.uniforms.uModo!, 1);
    gl.uniform1f(p.uniforms.uZoom!, 1);
    this.usarCor(cor);
    this.desenharRetangulo();
  }

  /**
   * Sobe o quadro atual do player para a textura dele, se estiver pronto
   * e for novo. Chamado também para o player que só espera o próximo
   * trecho: quando a transição começa, o quadro dele já está guardado.
   */
  guardarQuadro(v: FonteDeVideo) {
    const gl = this.gl;
    let guardada = this.texDoPlayer.get(v);
    if (!guardada) {
      let livre = this.texVideo.find((t) => ![...this.texDoPlayer.values()].some((g) => g.tex === t));
      if (!livre) {
        // São só duas texturas de vídeo. Na prévia, os dois players; na
        // exportação, cada trecho traz uma fonte nova (QuadroExterno) -- e
        // sem devolver a textura, do terceiro trecho em diante o vídeo
        // saía preto. A fonte mais antiga que não está no quadro cede a sua.
        const velha = [...this.texDoPlayer.keys()].find((k) => k !== v && !this.emUso.has(k));
        if (!velha) return undefined;
        livre = this.texDoPlayer.get(velha)!.tex;
        this.texDoPlayer.delete(velha);
      }
      guardada = { tex: livre, w: 0, h: 0, t: -1 };
      this.texDoPlayer.set(v, guardada);
    }
    if (v instanceof QuadroExterno) {
      if (v.imagem && v.largura > 0 && v.versao !== guardada.t) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, guardada.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v.imagem);
        gl.generateMipmap(gl.TEXTURE_2D);
        guardada.w = v.largura;
        guardada.h = v.altura;
        guardada.t = v.versao;
      }
      return guardada;
    }
    if (v.readyState >= 2 && v.videoWidth > 0 && !v.seeking && (v.currentTime !== guardada.t || !v.paused)) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, guardada.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.generateMipmap(gl.TEXTURE_2D);
      guardada.w = v.videoWidth;
      guardada.h = v.videoHeight;
      guardada.t = v.currentTime;
    }
    return guardada;
  }

  desenhar(quadro: QuadroParaDesenhar): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    this.garantirTamanho(canvas.width, canvas.height);
    this.emUso = new Set(quadro.camadas.slice(0, 2).flatMap((c) => (c.fonte ? [c.fonte] : [])));
    this.camadasSemImagem = quadro.camadas.slice(0, 2).filter((c, i) => !this.montarCamada(i, c, quadro.enquadramento)).length;

    const passos = this.passosDosEfeitos(quadro.efeitos ?? []);
    // Com efeitos (ou pedido de guardar), o quadro composto vai para um framebuffer, não para a tela.
    const viaFramebuffer = passos.length > 0 || Boolean(quadro.guardarQuadro);
    gl.bindFramebuffer(gl.FRAMEBUFFER, viaFramebuffer ? this.fbos[2]!.fb : null);
    gl.viewport(0, 0, this.largura, this.altura);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[0]!.tex);
    if (quadro.transicao && quadro.camadas.length > 1) {
      const p = this.transicao;
      gl.useProgram(p.programa);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos[1]!.tex);
      gl.uniform1i(p.uniforms.uA!, 0);
      gl.uniform1i(p.uniforms.uB!, 1);
      gl.uniform1f(p.uniforms.P!, quadro.transicao.progresso);
      gl.uniform1i(p.uniforms.uTipo!, quadro.transicao.indice);
      gl.uniform2f(p.uniforms.uTamanho!, this.largura, this.altura);
      gl.uniform1f(p.uniforms.uN!, quadro.transicao.quadros);
    } else {
      const p = this.copiar;
      gl.useProgram(p.programa);
      gl.uniform1i(p.uniforms.uA!, 0);
    }
    this.desenharRetangulo();
    if (passos.length) this.aplicarEfeitos(this.fbos[2]!.tex, passos);
    else if (viaFramebuffer) {
      // Sem efeitos: só copia o quadro guardado para a tela.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.largura, this.altura);
      gl.useProgram(this.copiar.programa);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos[2]!.tex);
      gl.uniform1i(this.copiar.uniforms.uA!, 0);
      this.desenharRetangulo();
    }
    this.desenharMidias(quadro.midias ?? []);
  }

  /** As camadas de mídia, por cima do que já está na tela, com transparência. */
  private desenharMidias(midias: readonly MidiaNoQuadro[]) {
    if (!midias.length) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.largura, this.altura);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    const p = this.camada;
    gl.useProgram(p.programa);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.uniforms.uM!, 0);
    for (const m of midias) {
      const f = m.fonte;
      const externo = f instanceof QuadroExterno;
      const largura = externo ? f.largura : f instanceof HTMLVideoElement ? f.videoWidth : f.naturalWidth;
      const altura = externo ? f.altura : f instanceof HTMLVideoElement ? f.videoHeight : f.naturalHeight;
      const pronta = externo ? Boolean(f.imagem) : f instanceof HTMLVideoElement ? f.readyState >= 2 : f.complete;
      if (!largura || !altura) continue;
      let g = this.texDaMidia.get(f);
      if (!g) {
        g = { tex: gl.createTexture()!, t: -1 };
        gl.bindTexture(gl.TEXTURE_2D, g.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.texDaMidia.set(f, g);
      }
      gl.bindTexture(gl.TEXTURE_2D, g.tex);
      // Imagem: sobe uma vez; vídeo: a cada quadro novo (buscando, fica o último).
      const agora = externo ? f.versao : f instanceof HTMLVideoElement ? f.currentTime : 0;
      if (pronta && (g.t < 0 || (externo && agora !== g.t) || (f instanceof HTMLVideoElement && !f.seeking && agora !== g.t))) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, externo ? f.imagem! : f);
        g.t = agora;
      }
      if (g.t < 0) continue;
      gl.uniform4f(p.uniforms.uCaixa!, m.caixa.x, m.caixa.y, m.caixa.w, m.caixa.h);
      gl.uniform2f(p.uniforms.uTamanho!, this.largura, this.altura);
      gl.uniform1f(p.uniforms.uProporcao!, largura / altura);
      gl.uniform1f(p.uniforms.uCobrir!, m.caixa.modo === 'cobrir' ? 1 : 0);
      gl.uniform1f(p.uniforms.uRaio!, m.raio);
      gl.uniform1f(p.uniforms.uAlfa!, m.alfa);
      gl.uniform1f(p.uniforms.uGiro!, ((m.giro ?? 0) * Math.PI) / 180);
      gl.uniform2f(p.uniforms.uKb!, m.kenBurns?.z ?? 1, m.kenBurns?.dx ?? 0);
      gl.uniform2f(p.uniforms.uCortina!, m.cortina?.borda ?? 1, m.cortina ? (m.cortina.lado === 'esquerda' ? 1 : 2) : 0);
      this.desenharRetangulo();
    }
    gl.disable(gl.BLEND);
  }

  /** Esquece a textura de uma mídia que saiu do plano. */
  /** A fonte saiu de cena (um trecho que acabou na exportação): devolve a textura. */
  soltarPlayer(v: FonteDeVideo): void {
    this.texDoPlayer.delete(v);
  }

  esquecerMidia(f: HTMLImageElement | HTMLVideoElement | QuadroExterno): void {
    const g = this.texDaMidia.get(f);
    if (g) this.gl.deleteTexture(g.tex);
    this.texDaMidia.delete(f);
  }

  /** Cada efeito vira um passo; o desfoque, dois (horizontal e vertical). */
  private passosDosEfeitos(efeitos: readonly EfeitoNoQuadro[]) {
    const passos: Array<EfeitoNoQuadro & { indice: number; dir: [number, number] }> = [];
    for (const e of efeitos) {
      const indice = INDICE_DO_EFEITO[e.tipo];
      if (!indice) continue;
      passos.push({ ...e, indice, dir: [1, 0] });
      if (e.tipo === 'desfoque' || e.tipo === 'fundo_desfocado') passos.push({ ...e, indice, dir: [0, 1] });
    }
    return passos;
  }

  /**
   * Passa `origem` por cada passo, alternando os framebuffers 2 e 3; o
   * último vai para a tela.
   */
  private aplicarEfeitos(origem: WebGLTexture, passos: ReturnType<Compositor['passosDosEfeitos']>) {
    const gl = this.gl;
    const p = this.efeito;
    let fonte = origem;
    let entradaDoEfeito = origem;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texMascara);
    passos.forEach((passo, n) => {
      // O primeiro passo de cada efeito guarda a entrada dele (uOrig).
      if (passo.dir[0] === 1) entradaDoEfeito = fonte;
      const ultimo = n === passos.length - 1;
      const destino = this.fbos[fonte === this.fbos[2]!.tex ? 3 : 2]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, ultimo ? null : destino.fb);
      gl.viewport(0, 0, this.largura, this.altura);
      gl.useProgram(p.programa);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fonte);
      gl.uniform1i(p.uniforms.uC!, 0);
      gl.uniform1i(p.uniforms.uTipo!, passo.indice);
      gl.uniform1f(p.uniforms.uK!, passo.intensidade);
      gl.uniform1f(p.uniforms.uJ!, passo.j);
      gl.uniform1f(p.uniforms.uNf!, passo.nf);
      gl.uniform2f(p.uniforms.uTamanho!, this.largura, this.altura);
      gl.uniform2f(p.uniforms.uDir!, passo.dir[0], passo.dir[1]);
      gl.uniform1f(p.uniforms.uTemMascara!, this.temMascara ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, entradaDoEfeito);
      gl.activeTexture(gl.TEXTURE0);
      this.desenharRetangulo();
      fonte = destino.tex;
    });
  }

  /**
   * A máscara da pessoa (0-255, `lado` x `lado`, linha 0 em cima), ou
   * `null` para tirar -- os efeitos de fundo passam a valer no quadro todo.
   */
  definirMascara(dados: Uint8Array | null, lado = 256): void {
    const gl = this.gl;
    if (!dados) {
      this.temMascara = false;
      return;
    }
    if (!this.texMascara) {
      this.texMascara = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.texMascara);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texMascara);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, lado, lado, 0, gl.RED, gl.UNSIGNED_BYTE, dados);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
    this.temMascara = true;
  }

  /**
   * O último quadro composto ANTES dos efeitos, reduzido a `lado` x `lado`
   * (a entrada do modelo da pessoa), em `destino`. Só vale quando o último
   * desenho teve efeitos -- é quando o quadro passa pelo framebuffer 2.
   */
  amostraSemEfeitos(destino: HTMLCanvasElement, lado = 256): boolean {
    const gl = this.gl;
    if (!this.fbos[2] || !this.largura) return false;
    if (!this.amostra) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, lado, lado, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.amostra = { fb, tex, pixels: new Uint8Array(lado * lado * 4) };
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbos[2]!.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.amostra.fb);
    gl.blitFramebuffer(0, 0, this.largura, this.altura, 0, 0, lado, lado, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.amostra.fb);
    gl.readPixels(0, 0, lado, lado, gl.RGBA, gl.UNSIGNED_BYTE, this.amostra.pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // A leitura vem de baixo para cima; a imagem, de cima para baixo.
    destino.width = lado;
    destino.height = lado;
    const img = new ImageData(lado, lado);
    const linha = lado * 4;
    for (let y = 0; y < lado; y += 1) img.data.set(this.amostra.pixels.subarray((lado - 1 - y) * linha, (lado - y) * linha), y * linha);
    destino.getContext('2d')!.putImageData(img, 0, 0);
    return true;
  }

  /**
   * Um efeito sobre uma imagem pronta (banco de paridade): a imagem entra
   * como o quadro composto.
   */
  desenharEfeitoNaImagem(img: HTMLImageElement | HTMLCanvasElement, efeito: EfeitoNoQuadro): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }
    this.garantirTamanho(canvas.width, canvas.height);
    // A imagem vai para o framebuffer 2, como se fosse o quadro composto.
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[2]!.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.aplicarEfeitos(this.fbos[2]!.tex, this.passosDosEfeitos([efeito]));
  }

  /**
   * Só a transição, entre duas imagens já prontas (teste de paridade e
   * miniaturas da biblioteca).
   */
  desenharTransicaoEntreImagens(a: TexImageSource, b: TexImageSource, indice: number, progresso: number, quadros = 12): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    this.garantirTamanho(canvas.width, canvas.height);
    [a, b].forEach((img, i) => {
      gl.bindTexture(gl.TEXTURE_2D, this.fbos[i]!.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.largura, this.altura, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.largura, this.altura);
    const p = this.transicao;
    gl.useProgram(p.programa);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[0]!.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[1]!.tex);
    gl.uniform1i(p.uniforms.uA!, 0);
    gl.uniform1i(p.uniforms.uB!, 1);
    gl.uniform1f(p.uniforms.P!, progresso);
    gl.uniform1i(p.uniforms.uTipo!, indice);
    gl.uniform2f(p.uniforms.uTamanho!, this.largura, this.altura);
    gl.uniform1f(p.uniforms.uN!, quadros);
    this.desenharRetangulo();
    gl.activeTexture(gl.TEXTURE0);
  }
}
