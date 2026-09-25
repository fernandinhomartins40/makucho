// ============================================================
// Compositor da prévia (WebGL2).
//
// Desenha o quadro do vídeo do jeito que o render monta, na MESMA ordem:
//
//   1. cada trecho visível vai para o quadro vertical (ajustar,
//      preencher ou desfoque) com o zoom dele -- um framebuffer por trecho;
//   2. a transição mistura os dois com a fórmula do `xfade`
//      (transicoesGlsl.ts);
//   3. o resultado vai para a tela.
//
// Os <video> continuam existindo (tocam o som e são a fonte das
// texturas), mas quem aparece é este canvas.
// ============================================================

import { shaderDeTransicao } from './transicoesGlsl';

export type Enquadramento = 'ajustar' | 'preencher' | 'desfoque';

export interface CamadaDoQuadro {
  fonte: HTMLVideoElement | null;
  /** Zoom do trecho (punch_in, zoom_lento), sobre o quadro já montado. */
  zoom: number;
}

export interface QuadroParaDesenhar {
  camadas: CamadaDoQuadro[];
  /** Transição entre camadas[0] (sai) e camadas[1] (entra). */
  transicao?: { indice: number; progresso: number; quadros: number } | null;
  enquadramento: Enquadramento;
}

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
in vec2 vUv;
out vec4 cor;
vec3 video(vec2 uv, float escala, float lod) {
  // uv do quadro -> uv do vídeo, centrado, com a escala do enquadramento.
  vec2 tamanho = uVideoTam * escala;
  vec2 p = (uv * uQuadroTam - (uQuadroTam - tamanho) * 0.5) / tamanho;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec3(-1.0);
  return textureLod(uVideo, p, lod).rgb;
}
void main() {
  vec2 uv = 0.5 + (vUv - 0.5) / uZoom;
  float cabe = min(uQuadroTam.x / uVideoTam.x, uQuadroTam.y / uVideoTam.y);
  float cobre = max(uQuadroTam.x / uVideoTam.x, uQuadroTam.y / uVideoTam.y);
  if (uModo == 1) { cor = vec4(max(video(uv, cobre, 0.0), 0.0), 1.0); return; }
  vec3 frente = video(uv, cabe, 0.0);
  if (frente.r >= 0.0) { cor = vec4(frente, 1.0); return; }
  if (uModo == 2) {
    vec3 fundo = max(video(uv, cobre, 5.0), 0.0);
    cor = vec4(clamp(fundo - 0.06, 0.0, 1.0), 1.0);
    return;
  }
  cor = vec4(0.0, 0.0, 0.0, 1.0);
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
  private texVideo: WebGLTexture[] = [];
  /** A textura de cada player: guarda o último quadro bom dele. */
  private texDoPlayer = new Map<HTMLVideoElement, { tex: WebGLTexture; w: number; h: number; t: number }>();
  private fbos: Array<{ fb: WebGLFramebuffer; tex: WebGLTexture }> = [];
  private largura = 0;
  private altura = 0;

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
    this.enquadrar = this.compilar(ENQUADRAR, ['uVideo', 'uVideoTam', 'uQuadroTam', 'uModo', 'uZoom']);
    this.transicao = this.compilar(shaderDeTransicao(), ['uA', 'uB', 'P', 'uTipo', 'uTamanho', 'uN']);
    this.copiar = this.compilar(COPIAR, ['uA']);
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
    this.fbos = [0, 1].map(() => {
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
    this.desenharRetangulo();
    return true;
  }

  /**
   * Sobe o quadro atual do player para a textura dele, se estiver pronto
   * e for novo. Chamado também para o player que só espera o próximo
   * trecho: quando a transição começa, o quadro dele já está guardado.
   */
  guardarQuadro(v: HTMLVideoElement) {
    const gl = this.gl;
    let guardada = this.texDoPlayer.get(v);
    if (!guardada) {
      const livre = this.texVideo.find((t) => ![...this.texDoPlayer.values()].some((g) => g.tex === t));
      if (!livre) return undefined;
      guardada = { tex: livre, w: 0, h: 0, t: -1 };
      this.texDoPlayer.set(v, guardada);
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
    quadro.camadas.slice(0, 2).forEach((c, i) => this.montarCamada(i, c, quadro.enquadramento));

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
