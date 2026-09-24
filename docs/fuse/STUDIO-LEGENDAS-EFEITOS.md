# MAKUCHO Studio — legendas, efeitos e transições

Data: 23/09/2026. Escopo: o sistema de estilização de legendas do Studio (contrato, editor,
prévia, Marca, worker de render) e a pesquisa de bibliotecas open source para legendas,
efeitos e transições que rodem **na nossa VPS, sem API externa e sem GPU**.

## 1. Como funciona hoje

```
Transcrição (faster-whisper, palavra a palavra)
      │
      ▼
EditPlan.captions  { enabled, styleId, wordsPerBlock, position, highlightActiveWord, corrections }
      │
      ├─► Prévia (Palco.tsx): <div> com CSS fixo (19px, peso 800, cor --accent na palavra ativa)
      │
      └─► Render (worker-core/legendas.ts): gera .ass → ffmpeg `subtitles=` (libass) → MP4
                 estilo = CaptionStyle do banco pelo styleId, ou o padrão
                 (Liberation Sans 64px, branco, contorno preto 3px, embaixo)
```

A base é boa e é a certa para uma VPS: legenda **derivada da transcrição** (nunca texto
inventado), correção ancorada na palavra, `.ass` num arquivo (sem injeção na linha de
comando), uma passagem só de FFmpeg. O problema está na ligação entre as escolhas da tela
e o que o render aplica.

## 2. Defeitos encontrados

| # | Defeito | Efeito para quem usa |
|---|---|---|
| L1 | Os estilos do editor (`padrao`, `minimal`, `destaque`, `caixa`, `karaoke`) são ids que **não existem no banco**; o render procura `CaptionStyle` por esse id, não acha e cai no padrão | **Toda exportação sai branca em Liberation Sans**, qualquer que seja o estilo escolhido |
| L2 | A página Marca mostra três estilos (`moderno`, `impacto`, `minimalista`) e fontes, mas **nunca grava** um `CaptionStyle` (a rota `POST /brand/:id/caption-styles` existe e não tem quem a chame) | A escolha na Marca é só visual |
| L3 | O render usa `estilo.wordsPerBlock` e `estilo.position`; o editor muda `plan.captions.wordsPerBlock` e `position` | O controle "Intensidade" e a posição **não chegam ao vídeo**; a prévia e o arquivo agrupam as palavras diferente |
| L4 | Fontes oferecidas (Poppins, Inter, Montserrat, Archivo, Roboto…) não estão na imagem de render (só `fonts-liberation`) | Mesmo com o estilo gravado, o libass trocaria a fonte em silêncio |
| L5 | Destaque com `\kf`: no .ass a palavra **ainda não dita** fica na cor de destaque e a dita volta à cor normal (é um preenchimento de karaokê); na prévia só a palavra ativa acende | A prévia promete um efeito e o arquivo entrega outro |
| L6 | Prévia desenhada em CSS independente do .ass (tamanho, contorno, fundo, cor, fonte) | Não há "o que você vê é o que exporta" para legenda |
| L7 | Estilos "caixa"/"destaque" pedem fundo atrás do texto; o gerador fixa `BorderStyle 1` (só contorno) | Mesmo resolvendo L1, esses estilos não teriam fundo |
| L8 | Emoji na fala (ou no futuro "EmojiPop") | libass não desenha emoji colorido (sem suporte a CBDT/COLR) — sai em branco/contorno |

## 3. Direção recomendada

**Um motor de estilos em TypeScript que gera o `.ass`, e o mesmo `.ass` desenhado na
prévia pelo libass compilado para o navegador.** Assim a prévia e a exportação passam pelo
mesmo renderizador, com custo quase zero na VPS (libass já está no FFmpeg da imagem).

1. **Presets como código, no pacote de contratos** (`PRESETS_DE_LEGENDA`), com os ids que o
   editor já usa. Cada preset descreve fonte, tamanho, cores (podendo apontar para as cores
   da Marca: `primary`, `accent`…), contorno, sombra, caixa de fundo, caixa alta e
   **animação** (`nenhuma`, `pop`, `karaoke`, `palavra-ativa`, `caixa-na-ativa`,
   `uma-palavra`, `subir`). O render resolve `styleId` → preset + cores da Marca; um
   `CaptionStyle` do banco continua valendo como estilo personalizado. Fecha L1, L2 e L7.
2. **O plano manda em `wordsPerBlock` e `position`**; o estilo só dá o padrão. Fecha L3.
3. **Fontes OFL dentro da imagem** (`/app/fonts`, `subtitles=…:fontsdir=/app/fonts`) e os
   mesmos `.woff2` servidos pela web. 6–8 famílias cabem em ~5 MB. Fecha L4.
4. **Palavra ativa sem `\k`**: um evento `Dialogue` por palavra, repetindo o bloco com a
   palavra atual colorida/escalada (`{\c&H..&\fscx115\fscy115}`), e `\t(...)` para o "pop".
   É a técnica usada pelos geradores estilo Hormozi/MrBeast e é mais previsível que o
   karaokê. Fecha L5.
5. **Prévia com JASSUB** (libass em WebAssembly) sobre o `<video>` do Palco, alimentada
   pelo mesmo gerador (`gerarAss` roda no navegador — é TypeScript puro). Fecha L6.
6. **Emoji**: fora do .ass — PNG do Noto Emoji (OFL) sobreposto com `overlay` no FFmpeg,
   quando o recurso existir. Fecha L8.

Custo na VPS: nenhum processo novo, nenhum navegador headless; o render continua sendo uma
passagem de FFmpeg. O mais caro é o `\blur`/sombra em muitos eventos, que ainda é barato
perto do `libx264`.

## 4. Bibliotecas e repositórios pesquisados

Legenda: ✅ recomendada · 🔎 referência para copiar técnica · ⚠️ restrição · ❌ não usar.

### Legendas

| Projeto | Licença | O que é | Veredito |
|---|---|---|---|
| [libass](https://github.com/libass/libass) (já no FFmpeg) | ISC | Renderizador de .ass: `\t` (animação), `\fscx/\fscy` (escala), `\blur`, `\bord`, `\move`, `\fad`, `\clip`, `\p` (desenho vetorial), `BorderStyle 3` (caixa) | ✅ Motor da exportação; já temos |
| [JASSUB](https://github.com/ThaUnknown/jassub) | MIT | libass em WebAssembly + WebGL, sobre um `<video>`; carrega fontes `.woff2` | ✅ Prévia idêntica ao render. Chrome 80+, Safari 17+, Firefox 105+ |
| [ass-compiler](https://github.com/weizhenye/ass-compiler) | MIT | Parse/serialização de .ass em JS | 🔎 Útil se um dia importarmos .ass; o gerador próprio basta |
| [nik-devs/ffmpeg-caption-burn-ass](https://github.com/nik-devs/ffmpeg-caption-burn-ass) | MIT | Legendas por palavra para vídeo vertical, `\c` + `\fscx110` na palavra ativa, `\t` para "pop", uma passagem de FFmpeg | 🔎 Mesma técnica do item 4 acima |
| [Capite](https://github.com/muneebkhan08/Capite) | MIT | 27 estilos (Hormozi, MrBeast, Podcast, Cinema, Neon…) e 7 animações em ASS (pysubs2 + libass) | 🔎 Catálogo de presets para portar para o nosso gerador TS |
| [ai-video-captions](https://github.com/nicolaigaina/ai-video-captions) | ver repo | 6 estilos animados com Whisper + FFmpeg | 🔎 Referência de estilos |
| [captions.js](https://github.com/maskin25/captions.js) | MIT | 26 presets; mesmo desenho na prévia e no servidor (Konva + skia-canvas → frames → FFmpeg) | ⚠️ Ideia certa, mas desenha quadro a quadro em Node (mais CPU que libass), 5 estrelas, API instável antes da 2.0 |
| [Remotion](https://www.remotion.dev) (+ `@remotion/captions`) | Licença própria | React → vídeo via Chromium headless | ❌ Empresa com mais de 3 pessoas precisa de licença paga; Chromium por render pesa na VPS. O Dockerfile do render ainda cita Remotion, mas ele não está instalado — remover a menção e as libs do Chromium |
| [Revideo](https://github.com/redotvideo/revideo) / [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | MIT | Vídeo programático com canvas | ⚠️ Também renderizam em navegador headless; só se overlays complexos exigirem |

**Transcrição / tempo das palavras** (qualidade da legenda depende disso):

| Projeto | Licença | Uso |
|---|---|---|
| [stable-ts](https://github.com/jianfch/stable-ts) | MIT | Estabiliza os tempos de palavra do faster-whisper (menos palavra "adiantada"); roda no worker atual | 
| [WhisperX](https://github.com/m-bain/whisperX) | BSD-2 | Alinhamento forçado com wav2vec2; mais preciso, mas modelo extra (~1 GB RAM) — avaliar só se o stable-ts não bastar |

### Transições e efeitos de vídeo

| Projeto | Licença | O que é | Veredito |
|---|---|---|---|
| FFmpeg `xfade` + `acrossfade` | LGPL (FFmpeg) | ~56 transições nativas em C: `fade`, `dissolve`, `wipe*`, `slide*`, `smooth*`, `circleopen/close`, `radial`, `pixelize`, `hblur`, `zoomin`, `squeezeh/v`, `cover*`, `reveal*`… | ✅ Cobre o enum do contrato (`fade`, `dissolve`, `slide`, `zoom`). A lista completa depende da versão: o Debian bookworm traz FFmpeg 5.1 (sem `cover*`/`reveal*`/`fadefast`); usar um build estático 7.x na imagem |
| [xfade-easing](https://github.com/scriptituk/xfade-easing) | MIT | Easing CSS e ~80 transições do gl-transitions portadas para expressões do `xfade` | ⚠️ Com FFmpeg padrão exige `-filter_complex_threads 1` e leva minutos por transição em HD; rápido só com FFmpeg recompilado. Deixar para depois |
| [gl-transitions](https://github.com/gl-transitions/gl-transitions) | por transição | Transições GLSL | ❌ Precisa de GPU/OpenGL; o plugin de FFmpeg não é mantido |
| FFmpeg `zoompan`, `crop`/`scale` com expressão de tempo | LGPL | "Punch-in" (zoom de ênfase), Ken Burns em imagens | ✅ Zoom sutil nos trechos `hook`/`payoff` do plano |
| FFmpeg `eq`, `curves` (presets `vintage`, `strong_contrast`…), `lut3d` (.cube), `vignette`, `unsharp` | LGPL | Correção e "looks" de cor | ✅ Filtros de 1 linha; LUTs `.cube` livres como presets da Marca (conferir licença de cada pacote) |
| FFmpeg `overlay` (+ `color`/`drawbox`) | LGPL | Logo, marca-d'água, barra de progresso, imagem | ✅ Logo da Marca e `ProgressBar` sem navegador |
| [rlottie](https://github.com/Samsung/rlottie) | MIT (conferir terceiros) | Renderiza Lottie para quadros em C++, sem navegador | 🔎 Para `EmojiPop`/animações Lottie da Marca, gerando PNGs que o `overlay` aplica |

### Enquadramento, cortes e áudio

| Projeto | Licença | O que é | Veredito |
|---|---|---|---|
| OpenCV YuNet (ONNX) / MediaPipe Face Detection | Apache-2.0 | Detecção de rosto em CPU | ✅ Enquadramento 9:16 automático: amostrar 2–4 quadros/s, suavizar o caminho, virar `crop` com expressão no render |
| [Reframe](https://github.com/Prekzursil/Reframe), [auto-vertical-reframe](https://github.com/KazKozDev/auto-vertical-reframe), [FrameShift](https://github.com/fralapo/FrameShift), [OpenShorts](https://github.com/mutonby/openshorts) | ver cada repo | Reenquadramento com rastreio de rosto + FFmpeg | 🔎 Referências de suavização de câmera virtual |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) / FFmpeg `scdet` | BSD-3 / LGPL | Detecção de troca de cena | ✅ Evita corte no meio de um movimento; ajuda o enquadramento |
| [auto-editor](https://github.com/WyattBlue/auto-editor) | Domínio público | Corte por silêncio/volume | 🔎 Já fazemos pela transcrição; útil como técnica para "remover respirações" |
| FFmpeg `afftdn` / `arnndn` (RNNoise) | LGPL / BSD | Redução de ruído leve | ✅ "Melhorar voz" barato, uma linha no filtro de áudio |
| [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | MIT/Apache-2.0 | Redução de ruído neural, RTF ~0,19 num núcleo de CPU | ✅ Opção "voz de estúdio" como etapa do worker de mídia (binário Rust, sem GPU) |
| FFmpeg `sidechaincompress` + `afade` | LGPL | Trilha abaixa sob a voz (o contrato já tem `duckUnderVoice`) | ✅ Trilha da Marca na exportação |

## 5. Plano de implementação sugerido

Ordem por valor percebido e risco. Todas as fases usam só FFmpeg/libass e código nosso.

| Fase | Entrega | Onde | Custo na VPS |
|---|---|---|---|
| 1 | Corrigir L1–L4: presets em `contracts`, render resolvendo preset + cores da Marca, plano mandando em blocos/posição, fontes OFL na imagem com `fontsdir` | contracts, worker-core, render Dockerfile, Marca, Inspector | Nenhum |
| 2 | Animações por palavra (palavra ativa, pop, caixa na ativa, uma palavra por vez) + 8–10 presets portados do catálogo do Capite | worker-core/legendas.ts + testes | Desprezível |
| 3 | Prévia com JASSUB usando o mesmo `gerarAss`; editor de estilo (fonte, tamanho, cores, contorno, fundo, animação) com prévia ao vivo | web (Palco, Inspector, Marca) | Zero no servidor |
| 4 | Transições `xfade`/`acrossfade` do contrato + "punch-in" de ênfase; FFmpeg 7 estático na imagem de render | worker-core/render.ts | +10–30% de tempo de render quando usadas |
| 5 | Logo/marca-d'água e trilha com ducking; barra de progresso | render | Baixo |
| 6 | Enquadramento automático por rosto (YuNet) e "voz de estúdio" (DeepFilterNet) no worker de mídia | worker-media (Python) | Uma passada por vídeo, em CPU |

Cuidados comuns a todas as fases: toda fonte, LUT, trilha e efeito sonoro entra com a
licença registrada (o contrato já exige para `FONT` e `MUSIC`); nenhuma URL externa no
render (só assets do workspace); testes de `montarArgumentos` e `gerarAss` para cada novo
filtro, como os que já existem.
