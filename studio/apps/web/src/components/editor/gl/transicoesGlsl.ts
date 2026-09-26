// ============================================================
// Transições em GLSL -- as MESMAS fórmulas do render.
//
// As nativas foram portadas do código-fonte do `xfade` do FFmpeg 5.1
// (libavfilter/vf_xfade.c), linha a linha:
//   - `ffmix(a, b, m)` é o `mix` do FFmpeg: a*m + b*(1-m) (invertido em
//     relação ao `mix` do GLSL);
//   - P (progresso) vai de 1 no primeiro quadro até perto de 0;
//   - X, Y são pixels inteiros com a origem no canto SUPERIOR esquerdo;
//   - divisões inteiras (width/2) e truncamentos (int) foram mantidos.
// As próprias (chicote, flash, glitch...) seguem as expressões do
// catálogo (contracts/transicoes.ts), com as cores em 0..1 (255 -> 1).
//
// Aproximações conhecidas (documentadas no teste de paridade):
//   - o render faz as nativas em YUV e a prévia em RGB: "fadegrays",
//     "distance" e "dissolve" diferem um pouco na cor/grão;
//   - "blur" usa 32 amostras no lugar da média completa da linha.
// ============================================================

import { TRANSICOES_DO_CATALOGO } from '@makucho/studio-contracts';
import type { ReceitaDeTransicao } from '@makucho/studio-contracts';

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

/**
 * O GLSL de uma receita (contracts/transicoes.ts), na MESMA ordem do
 * render: zoom/giro de cada lado -> mistura -> faixas/ondas -> RGB ->
 * desfoque -> luz. Valores em pixels escalam com a largura (1080 = 1).
 */
function corpoDaReceita(id: string, r: ReceitaDeTransicao): { funcoes: string; corpo: string } {
  const funcoes: string[] = [];
  // Lado A/B deformado: perspective (zoom) e rotate, com o quadro k = q*n.
  const lado = (nome: 'A' | 'B', zoom?: readonly [number, number], giro?: readonly [number, number]) => {
    const z = zoom ? `(${f(zoom[0])} + ${f(zoom[1] - zoom[0])} * q)` : '1.0';
    const g = giro ? `(${f(giro[0])} + ${f(giro[1] - giro[0])} * q)` : '0.0';
    funcoes.push(`vec3 ${id}_${nome}(float x, float y, float q) {
  float z = ${z}; float g = ${g};
  // rotate (horário, como o FFmpeg): a origem do pixel de saída.
  float dx = x - W / 2.0; float dy = y - H / 2.0;
  float rx = W / 2.0 + dx * cos(g) + dy * sin(g);
  float ry = H / 2.0 - dx * sin(g) + dy * cos(g);
  if (g != 0.0 && (rx < 0.0 || rx > W - 1.0 || ry < 0.0 || ry > H - 1.0)) return vec3(0.0);
  // perspective (zoom centrado), com interpolação linear.
  float m = (1.0 - 1.0 / z) / 2.0;
  return suave${nome}(W * m + rx * (1.0 - 2.0 * m), H * m + ry * (1.0 - 2.0 * m));
}`);
  };
  lado('A', r.zoomA, r.giroA);
  lado('B', r.zoomB, r.giroB);

  // Mistura (o `xfade` nativo ou a troca no meio).
  let mistura: string;
  if (r.mistura === 'fade') {
    mistura = `return ffmix(${id}_A(x, y, q), ${id}_B(x, y, q), P);`;
  } else if (r.mistura === 'slideleft') {
    mistura =
      'float z = float(int(-P * W)); float zx = z + x; float zz = zx < 0.0 ? zx + W : (zx >= W ? zx - W : zx);' +
      ` return (zx >= 0.0 && zx < W) ? ${id}_B(zz, y, q) : ${id}_A(zz, y, q);`;
  } else {
    mistura = `return q < floor(uN / 2.0) / uN ? ${id}_A(x, y, q) : ${id}_B(x, y, q);`;
  }
  funcoes.push(`vec3 ${id}_mix(float x, float y) { float q = 1.0 - P; ${mistura} }`);

  // Faixas / ondas (displace): deslocamento pela linha do mapa 270x480.
  const escala = 'min(W, H) / 1080.0';
  let dcodigo = 'return 0.0;';
  if (r.faixas) {
    dcodigo = `float yl = floor(y * 480.0 / H); float q = 1.0 - P; float e = 1.0 - abs(1.0 - 2.0 * q);
  float bruto = (floor(yl / 20.0) * 37.0 + floor(q * 12.0) * 101.0) * 0.618034;
  return round((bruto - floor(bruto) - 0.5) * 2.0 * ${f(r.faixas)} * e) * ${escala};`;
  } else if (r.ondas) {
    dcodigo = `float yl = floor(y * 480.0 / H); float q = 1.0 - P; float e = 1.0 - abs(1.0 - 2.0 * q);
  return round(${f(r.ondas)} * e * sin(yl / 480.0 * 20.0 + q * 10.0)) * ${escala};`;
  }
  funcoes.push(`float ${id}_d(float y) { ${dcodigo} }`);
  funcoes.push(`vec3 ${id}_dp(float x, float y) { return ${id}_mix(clamp(x + ${id}_d(y), 0.0, W - 1.0), y); }`);

  // Separação RGB: vermelho vem de x - d, azul de x + d.
  const rgb = r.rgb ? `${f(r.rgb)} * ${escala}` : '';
  funcoes.push(
    rgb
      ? `vec3 ${id}_rgb(float x, float y) { float d = ${rgb}; return vec3(${id}_dp(clamp(x - d, 0.0, W - 1.0), y).r, ${id}_dp(x, y).g, ${id}_dp(clamp(x + d, 0.0, W - 1.0), y).b); }`
      : `vec3 ${id}_rgb(float x, float y) { return ${id}_dp(x, y); }`,
  );

  // Desfoque horizontal gaussiano (gblur).
  funcoes.push(
    r.desfoque
      ? `vec3 ${id}_bl(float x, float y) { float sg = ${f(r.desfoque)} * ${escala}; vec3 soma = vec3(0.0); float peso = 0.0;
  for (int i = -24; i <= 24; i++) { float o = float(i) * sg / 8.0; float w = exp(-0.5 * (o / sg) * (o / sg));
    soma += ${id}_rgb(clamp(x + o, 0.0, W - 1.0), y) * w; peso += w; }
  return soma / peso; }`
      : `vec3 ${id}_bl(float x, float y) { return ${id}_rgb(x, y); }`,
  );

  // Luz: faixa quente em "tela".
  const luz = r.luz
    ? `float q = 1.0 - P; float e = 1.0 - abs(1.0 - 2.0 * q);
  float l = max(0.0, 1.0 - abs((X / W + Y / H * 0.3) - (2.2 * q - 0.6)) * 2.5) * e;
  vec3 lz = vec3(1.0, 170.0 / 255.0, 80.0 / 255.0) * l; return 1.0 - (1.0 - c) * (1.0 - lz);`
    : 'return c;';
  return { funcoes: funcoes.join('\n'), corpo: `vec3 c = ${id}_bl(X, Y); ${luz}` };
}


/** Corpo GLSL de cada transição: devolve `vec3` (0..1). */
const CORPOS: Record<string, string> = {
  fade: 'return ffmix(a, b, P);',
  dissolve: 'float s = frand(X, Y) * 2.0 + P * 2.0 - 1.5; return s >= 0.5 ? a : b;',
  // O FFmpeg mistura em YUV com o "preto" em Y=0 (abaixo do preto de
  // vídeo, 16): a imagem fica mais preta que o preto e é cortada.
  fadeblack:
    'vec3 ya = yuv(a); vec3 yb = yuv(b); vec3 bg = vec3(0.0, 128.0, 128.0);' +
    ' return rgb(ffmix(ffmix(ya, bg, ffsmooth(0.8, 1.0, P)), ffmix(bg, yb, ffsmooth(0.2, 1.0, P)), P));',
  fadewhite:
    'vec3 ya = yuv(a); vec3 yb = yuv(b); vec3 bg = vec3(255.0, 128.0, 128.0);' +
    ' return rgb(ffmix(ffmix(ya, bg, ffsmooth(0.8, 1.0, P)), ffmix(bg, yb, ffsmooth(0.2, 1.0, P)), P));',
  fadegrays:
    'vec3 ya = yuv(a); vec3 yb = yuv(b); vec3 ga = vec3(ya.x, 128.0, 128.0); vec3 gb = vec3(yb.x, 128.0, 128.0);' +
    ' return rgb(ffmix(ffmix(ya, ga, ffsmooth(0.8, 1.0, P)), ffmix(gb, yb, ffsmooth(0.2, 1.0, P)), P));',
  distance:
    'vec3 ya = yuv(a); vec3 yb = yuv(b); vec3 d = vec3(lessThanEqual(abs(ya - yb) / 255.0, vec3(P)));' +
    ' return rgb(ffmix(mix(yb, ya, d), yb, P));',
  slide:
    'float z = float(int(-P * W)); float zx = z + X; float zz = zx < 0.0 ? zx + W : (zx >= W ? zx - W : zx);' +
    ' return (zx >= 0.0 && zx < W) ? amostraB(zz, Y) : amostraA(zz, Y);',
  slideright:
    'float z = float(int(P * W)); float zx = z + X; float zz = zx < 0.0 ? zx + W : (zx >= W ? zx - W : zx);' +
    ' return (zx >= 0.0 && zx < W) ? amostraB(zz, Y) : amostraA(zz, Y);',
  slideup:
    'float z = float(int(-P * H)); float zy = z + Y; float zz = zy < 0.0 ? zy + H : (zy >= H ? zy - H : zy);' +
    ' return (zy >= 0.0 && zy < H) ? amostraB(X, zz) : amostraA(X, zz);',
  slidedown:
    'float z = float(int(P * H)); float zy = z + Y; float zz = zy < 0.0 ? zy + H : (zy >= H ? zy - H : zy);' +
    ' return (zy >= 0.0 && zy < H) ? amostraB(X, zz) : amostraA(X, zz);',
  smooth: 'float s = 1.0 + X / W - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  smoothright: 'float s = 1.0 + (W - 1.0 - X) / W - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  smoothup: 'float s = 1.0 + Y / H - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  smoothdown: 'float s = 1.0 + (H - 1.0 - Y) / H - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  squeezeh:
    'float z = 0.5 + (Y / H - 0.5) / P; if (z < 0.0 || z > 1.0) return b; return amostraA(X, float(int(round(z * (H - 1.0)))));',
  squeezev:
    'float z = 0.5 + (X / W - 0.5) / P; if (z < 0.0 || z > 1.0) return b; return amostraA(float(int(round(z * (W - 1.0)))), Y);',
  wipe: 'float z = float(int(W * P)); return X > z ? b : a;',
  wiperight: 'float z = float(int(W * (1.0 - P))); return X > z ? a : b;',
  wipeup: 'float z = float(int(H * P)); return Y > z ? b : a;',
  wipedown: 'float z = float(int(H * (1.0 - P))); return Y > z ? a : b;',
  wipetl: 'float zw = float(int(W * P)); float zh = float(int(H * P)); return (Y <= zh && X <= zw) ? a : b;',
  wipebr: 'float zh = float(int(H * (1.0 - P))); float zw = float(int(W * (1.0 - P))); return (Y > zh && X > zw) ? a : b;',
  diagtl: 'float s = 1.0 + X / W * Y / H - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  diagbr: 'float s = 1.0 + (W - 1.0 - X) / W * (H - 1.0 - Y) / H - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  circle:
    'float z = length(vec2(W2, H2)); float p = (P - 0.5) * 3.0; float s = length(vec2(X - W2, Y - H2)) / z + p;' +
    ' return ffmix(a, b, ffsmooth(0.0, 1.0, s));',
  circleclose:
    'float z = length(vec2(W2, H2)); float p = (1.0 - P - 0.5) * 3.0; float s = length(vec2(X - W2, Y - H2)) / z + p;' +
    ' return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  circlecrop:
    'float z = pow(2.0 * abs(P - 0.5), 3.0) * length(vec2(W2, H2)); float dist = length(vec2(X - W2, Y - H2));' +
    ' vec3 val = P < 0.5 ? b : a; return z < dist ? vec3(0.0) : val;',
  rectcrop:
    'float zh = float(int(abs(P - 0.5) * H)); float zw = float(int(abs(P - 0.5) * W));' +
    ' bool dentro = abs(X - W2) < zw && abs(Y - H2) < zh; vec3 val = P < 0.5 ? b : a; return dentro ? val : vec3(0.0);',
  vertopen: 'float s = 2.0 - abs((X - W2) / W2) - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  vertclose: 'float s = 1.0 + abs((X - W2) / W2) - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  horzopen: 'float s = 2.0 - abs((Y - H2) / H2) - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  horzclose: 'float s = 1.0 + abs((Y - H2) / H2) - P * 2.0; return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  radial:
    'float s = atan(X - W2, Y - H2) - (P - 0.5) * (3.14159265 * 2.5); return ffmix(b, a, ffsmooth(0.0, 1.0, s));',
  hlslice:
    'float s = ffsmooth(-0.5, 0.0, X / W - P * 1.5); float ss = s <= fract(10.0 * X / W) ? 0.0 : 1.0; return ffmix(b, a, ss);',
  hrslice:
    'float xx = (W - 1.0 - X) / W; float s = ffsmooth(-0.5, 0.0, xx - P * 1.5); float ss = s <= fract(10.0 * xx) ? 0.0 : 1.0; return ffmix(b, a, ss);',
  vuslice:
    'float s = ffsmooth(-0.5, 0.0, Y / H - P * 1.5); float ss = s <= fract(10.0 * Y / H) ? 0.0 : 1.0; return ffmix(b, a, ss);',
  vdslice:
    'float yy = (H - 1.0 - Y) / H; float s = ffsmooth(-0.5, 0.0, yy - P * 1.5); float ss = s <= fract(10.0 * yy) ? 0.0 : 1.0; return ffmix(b, a, ss);',
  zoom:
    'float zf = ffsmooth(0.5, 1.0, P); float u = 0.5 + (X / W - 0.5) * zf; float v = 0.5 + (Y / H - 0.5) * zf;' +
    ' vec3 zv = amostraA(ceil(u * (W - 1.0)), ceil(v * (H - 1.0))); return ffmix(zv, b, ffsmooth(0.0, 0.5, P));',
  pixelize:
    'float d = min(P, 1.0 - P); float dist = ceil(d * 50.0) / 50.0; float sq = 2.0 * dist * min(W, H) / 20.0;' +
    ' float sx = dist > 0.0 ? float(int(min((floor(X / sq) + 0.5) * sq, W - 1.0))) : X;' +
    ' float sy = dist > 0.0 ? float(int(min((floor(Y / sq) + 0.5) * sq, H - 1.0))) : Y;' +
    ' return ffmix(amostraA(sx, sy), amostraB(sx, sy), P);',
  blur:
    'float prog = P <= 0.5 ? P * 2.0 : (1.0 - P) * 2.0; float tam = float(int(1.0 + W2 * prog));' +
    ' float fim = min(X + tam, W); float n = fim - X; vec3 sa = vec3(0.0); vec3 sb = vec3(0.0);' +
    ' for (int i = 0; i < 32; i++) { float x = X + (float(i) + 0.5) * n / 32.0; sa += amostraA(x, Y); sb += amostraB(x, Y); }' +
    ' return ffmix(sa / 32.0, sb / 32.0, P);',

};

// Flash: o "pelo branco" do FFmpeg, curto.
CORPOS.flash = CORPOS.fadewhite!;

/** Índice de cada transição no shader (a ordem do catálogo). */
export const INDICE_DA_TRANSICAO: Record<string, number> = Object.fromEntries(
  TRANSICOES_DO_CATALOGO.map((t, i) => [t.id, i]),
);

/** As transições do catálogo que ainda não têm GLSL (o teste cobra). */
export function transicoesSemGlsl(): string[] {
  return TRANSICOES_DO_CATALOGO.filter((t) => t.id !== 'cut' && !CORPOS[t.id] && !t.receita).map((t) => t.id);
}

/** O shader de transição inteiro: uma função por transição e um seletor. */
export function shaderDeTransicao(): string {
  const funcoes = TRANSICOES_DO_CATALOGO.filter((t) => CORPOS[t.id] || t.receita)
    .map((t) => {
      if (t.receita) {
        const r = corpoDaReceita(t.id, t.receita);
        return `${r.funcoes}\nvec3 tr_${t.id}(vec3 a, vec3 b) { ${r.corpo} }`;
      }
      return `vec3 tr_${t.id}(vec3 a, vec3 b) { ${CORPOS[t.id]} }`;
    })
    .join('\n');
  const seletor = TRANSICOES_DO_CATALOGO.filter((t) => CORPOS[t.id] || t.receita)
    .map((t) => `  if (uTipo == ${INDICE_DA_TRANSICAO[t.id]}) return tr_${t.id}(a, b);`)
    .join('\n');
  return `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float P;
uniform int uTipo;
uniform vec2 uTamanho;
uniform float uN;
out vec4 cor;
float W, H, W2, H2, X, Y;

vec3 ffmix(vec3 a, vec3 b, float m) { return a * m + b * (1.0 - m); }
float ffsmooth(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
// YUV BT.601 de faixa limitada (0-255), como o yuv420p do render.
vec3 yuv(vec3 c) {
  c *= 255.0;
  return vec3(16.0 + (65.481 * c.r + 128.553 * c.g + 24.966 * c.b) / 255.0,
              128.0 + (-37.797 * c.r - 74.203 * c.g + 112.0 * c.b) / 255.0,
              128.0 + (112.0 * c.r - 93.786 * c.g - 18.214 * c.b) / 255.0);
}
vec3 rgb(vec3 v) {
  float y = 1.164 * (v.x - 16.0);
  return clamp(vec3(y + 1.596 * (v.z - 128.0), y - 0.392 * (v.y - 128.0) - 0.813 * (v.z - 128.0), y + 2.017 * (v.y - 128.0)) / 255.0, 0.0, 1.0);
}
float frand(float x, float y) { float r = sin(x * 12.9898 + y * 78.233) * 43758.545; return r - floor(r); }
// Coordenadas com a origem em cima (como o FFmpeg); a textura tem a origem embaixo.
vec3 amostraA(float x, float y) { int xi = int(clamp(x, 0.0, W - 1.0)); int yi = int(clamp(y, 0.0, H - 1.0)); return texelFetch(uA, ivec2(xi, int(H) - 1 - yi), 0).rgb; }
vec3 amostraB(float x, float y) { int xi = int(clamp(x, 0.0, W - 1.0)); int yi = int(clamp(y, 0.0, H - 1.0)); return texelFetch(uB, ivec2(xi, int(H) - 1 - yi), 0).rgb; }
// Amostra com interpolação linear (perspective/rotate do FFmpeg).
vec3 suaveA(float x, float y) { return texture(uA, vec2((x + 0.5) / W, 1.0 - (y + 0.5) / H)).rgb; }
vec3 suaveB(float x, float y) { return texture(uB, vec2((x + 0.5) / W, 1.0 - (y + 0.5) / H)).rgb; }

${funcoes}

vec3 transicao(vec3 a, vec3 b) {
${seletor}
  return ffmix(a, b, P);
}

void main() {
  W = uTamanho.x; H = uTamanho.y;
  // Divisões inteiras do código original (width / 2).
  W2 = float(int(W) / 2); H2 = float(int(H) / 2);
  X = floor(gl_FragCoord.x);
  Y = H - 1.0 - floor(gl_FragCoord.y);
  vec3 a = amostraA(X, Y);
  vec3 b = amostraB(X, Y);
  cor = vec4(clamp(transicao(a, b), 0.0, 1.0), 1.0);
}`;
}
