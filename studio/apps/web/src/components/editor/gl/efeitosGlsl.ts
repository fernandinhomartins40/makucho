// ============================================================
// Efeitos de tela na prévia -- as MESMAS contas do render
// (worker-core/render.ts, `filtroDoEfeitoDeTela`).
//
// Um passo de pós-processamento por efeito, sobre o quadro já composto.
// Coordenadas com a origem em cima (como o FFmpeg): X, Y em pixels.
// `j` é o quadro dentro do efeito, `nf` o total de quadros, `k` a
// intensidade. O desfoque tem dois passos (horizontal e vertical).
// ============================================================

import { EFEITOS_DE_TELA } from '@makucho/studio-contracts';

export const INDICE_DO_EFEITO: Record<string, number> = Object.fromEntries(EFEITOS_DE_TELA.map((e, i) => [e.id, i + 1]));

const i = (id: string) => INDICE_DO_EFEITO[id]!;

export const SHADER_DE_EFEITO = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uC;
uniform int uTipo;
uniform float uK;
uniform float uJ;
uniform float uNf;
uniform vec2 uTamanho;
uniform vec2 uDir;
// Efeitos de fundo: a máscara da pessoa (256x256, linha 0 em cima) e o
// quadro de antes do efeito (o desfoque tem dois passos).
uniform sampler2D uMascara;
uniform sampler2D uOrig;
uniform float uTemMascara;
out vec4 cor;
float W, H, X, Y;

vec3 amostra(float x, float y) {
  int xi = int(clamp(x, 0.0, W - 1.0));
  int yi = int(clamp(y, 0.0, H - 1.0));
  return texelFetch(uC, ivec2(xi, int(H) - 1 - yi), 0).rgb;
}
// Interpolação linear, como o perspective do FFmpeg.
vec3 suave(float x, float y) { return texture(uC, vec2((x + 0.5) / W, 1.0 - (y + 0.5) / H)).rgb; }
float frac1(float x) { return x - floor(x); }
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
float hash(float x, float y, float z) { return frac1(sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.545); }
// Alfa de 8 bits, como a máscara do render.
float a8(float a) { return floor(clamp(a, 0.0, 1.0) * 255.0 + 0.5) / 255.0; }

vec3 perspectiva(float z, float dx, float dy) {
  float m = (1.0 - 1.0 / z) / 2.0;
  return suave(W * m + X * (1.0 - 2.0 * m) + dx, H * m + Y * (1.0 - 2.0 * m) + dy);
}

float pessoa() {
  if (uTemMascara < 0.5) return 0.0;
  return texture(uMascara, vec2((X + 0.5) / W, (Y + 0.5) / H)).r;
}
vec3 original() { return texelFetch(uOrig, ivec2(int(X), int(H) - 1 - int(Y)), 0).rgb; }

// Desfoque gaussiano em YUV como o gblur no yuv420p: o croma tem metade
// da resolução, então o mesmo sigma em pixels do plano vira o dobro.
vec3 desfocar(float sg) {
  float somaY = 0.0, pesoY = 0.0, pesoC = 0.0;
  vec2 somaC = vec2(0.0);
  for (int n = -24; n <= 24; n++) {
    float o = float(n) * sg / 4.0;
    vec3 v = yuv(suave(X + o * uDir.x, Y + o * uDir.y));
    float wy = exp(-0.5 * (o / sg) * (o / sg));
    float wc = exp(-0.5 * (o / (2.0 * sg)) * (o / (2.0 * sg)));
    somaY += v.x * wy;
    pesoY += wy;
    somaC += v.yz * wc;
    pesoC += wc;
  }
  return rgb(vec3(somaY / pesoY, somaC / pesoC));
}

vec3 efeito() {
  float k = uK;
  float j = uJ;
  float S = min(W, H) / 1080.0;
  vec3 c = amostra(X, Y);

  // ---------- Camadas (overlay de preto/branco com alfa) ----------
  if (uTipo == ${i('flash')}) return mix(c, vec3(1.0), a8(k * pow(1.0 - j / uNf, 2.0)));
  if (uTipo == ${i('vinheta')}) {
    float r = length(vec2(2.0 * (X + 0.5) / W - 1.0, 2.0 * (Y + 0.5) / H - 1.0)) / sqrt(2.0);
    float s = clamp((r - 0.35) / 0.65, 0.0, 1.0);
    return c * (1.0 - k * 0.85 * s * s * (3.0 - 2.0 * s));
  }
  if (uTipo == ${i('cinema')}) {
    float e = max(0.0, min(1.0, min((j + 1.0) / 12.0, (uNf - j) / 12.0)));
    float h = floor(k * 0.13 * H * e + 0.5);
    return (Y < h || Y >= H - h) ? vec3(0.0) : c;
  }
  if (uTipo == ${i('iris_abrir')} || uTipo == ${i('iris_fechar')}) {
    float q = j / max(1.0, uNf - 1.0);
    float raioMax = ${(Math.hypot(270, 480) + 2).toFixed(6)};
    float raio = uTipo == ${i('iris_abrir')} ? raioMax * (1.0 - pow(1.0 - q, 3.0)) : raioMax * (1.0 - pow(q, 3.0));
    float gx = (X + 0.5) * 540.0 / W - 0.5;
    float gy = (Y + 0.5) * 960.0 / H - 0.5;
    float a = k * clamp((length(vec2(gx - 269.5, gy - 479.5)) - raio) / 2.0, 0.0, 1.0);
    return c * (1.0 - a);
  }
  if (uTipo == ${i('linhas')}) return mod(Y, 4.0) < 2.0 ? c * (1.0 - a8(k * 0.35)) : c;

  // ---------- Filtros sobre a imagem ----------
  if (uTipo == ${i('grao')}) {
    // Ruído uniforme na luminância, novo a cada quadro.
    float s = max(1.0, floor(k * 40.0 + 0.5));
    return clamp(c + vec3((hash(X, Y, j) - 0.5) * s * 1.164 / 255.0), 0.0, 1.0);
  }
  if (uTipo == ${i('aberracao')}) {
    float d = max(1.0, floor(k * 12.0 * S + 0.5));
    return vec3(amostra(X - d, Y).r, c.g, amostra(X + d, Y).b);
  }
  if (uTipo == ${i('espelho')}) return amostra(W - 1.0 - X, Y);
  if (uTipo == ${i('tremor')}) {
    float a = k * 16.0 * S;
    float dx = a * (sin(j * 1.9) + 0.6 * sin(j * 3.7 + 1.0));
    float dy = a * (sin(j * 2.3 + 2.0) + 0.6 * sin(j * 4.1));
    return perspectiva(1.0 + 0.08 * k, dx, dy);
  }
  if (uTipo == ${i('pulso')}) return perspectiva(1.0 + 0.1 * k * exp(-mod(j, 15.0) / 4.0), 0.0, 0.0);
  if (uTipo == ${i('glitch')}) {
    float amp = floor(min(120.0, k * 60.0 * S) + 0.5);
    float faixa = floor(floor(Y * 480.0 / H) / 20.0);
    float slot = floor(j / 3.0);
    float h1 = frac1((faixa * 37.0 + slot * 101.0) * 0.618034);
    float h2 = frac1((faixa * 53.0 + slot * 71.0) * 0.381966);
    float d = h2 > 0.55 ? floor((h1 - 0.5) * 2.0 * amp + 0.5) : 0.0;
    return amostra(X + d, Y);
  }
  // Gaussiano separável: um passo por direção (uDir).
  if (uTipo == ${i('desfoque')}) return desfocar(max(0.5, k * 18.0 * S));

  // ---------- Só o fundo: a pessoa volta por cima (alphamerge + overlay) ----------
  if (uTipo == ${i('fundo_desfocado')}) {
    vec3 borrado = desfocar(max(0.5, k * 24.0 * S));
    // No primeiro passo (horizontal) só borra; no segundo, devolve a pessoa.
    return uDir.y > 0.5 ? mix(borrado, original(), pessoa()) : borrado;
  }
  if (uTipo == ${i('fundo_pb')}) {
    vec3 v = yuv(c);
    vec3 fundo = rgb(vec3(v.x, 128.0 + (v.yz - 128.0) * (1.0 - k)));
    return mix(fundo, c, pessoa());
  }
  if (uTipo == ${i('fundo_escuro')}) return mix(c * (1.0 - 0.7 * k), c, pessoa());
  return c;
}

void main() {
  W = uTamanho.x;
  H = uTamanho.y;
  X = floor(gl_FragCoord.x);
  Y = H - 1.0 - floor(gl_FragCoord.y);
  cor = vec4(efeito(), 1.0);
}`;
