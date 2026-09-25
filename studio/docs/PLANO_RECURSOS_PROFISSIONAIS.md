# Plano — recursos profissionais no Studio (referência: CapCut)

Data: 24/09/2026. Origem: análise das funções do CapCut (transições,
efeitos, filtros, animações, textos, stickers, overlays, montagens,
sons, pacotes) comparada com o Studio.

## Princípios que não mudam

1. **Prévia = export.** Todo recurso tem UMA definição (parâmetros no
   contrato) e duas implementações com a MESMA matemática: filtro do
   FFmpeg no render e shader/canvas na prévia. Um teste automático
   compara os quadros das duas.
2. **Tudo visível e editável.** O que a IA ou um pacote aplica vira itens
   separados na timeline, com operações que a pessoa desfaz, move e troca.
3. **Render só com FFmpeg**, sem navegador no servidor e sem GPU. Custo de
   CPU medido para cada efeito pesado.
4. **Licença clara** para toda mídia: gerada por código, OFL/Apache/CC0
   com a origem registrada, ou produzida pelo Codex quando for imagem.

## Fase 1 — Compositor da prévia e catálogo de efeitos (fundação)

- A prévia deixa de mostrar o `<video>` com CSS e passa a desenhar num
  canvas **WebGL2**: os dois players viram texturas; enquadramento
  (ajustar, preencher, desfoque), zoom do trecho, transição, filtro e
  efeitos são shaders.
- **Catálogo único** (`contracts`): id, categoria, nome, descrição,
  parâmetros (Zod) e custo de cada recurso visual. O render monta o
  filtro FFmpeg; a prévia, o shader.
- **Banco de paridade**: página de teste (Playwright + WebGL) que desenha
  cada recurso em quadros de teste e compara com o quadro que o FFmpeg
  produz. Diferença média máxima aceita por recurso, registrada no teste.
- O recorte da pessoa passa a sair do quadro composto (igual ao render).

**Estado: feito.** `web/components/editor/gl/` (compositor, shaders,
miniaturas); catálogo em `contracts/src/transicoes.ts`; banco de
paridade em `web/scripts/paridade/` (147 medidas dentro da tolerância:
diferença média por pixel ≤ 6; `dissolve` e `distance`, que têm grão ou
limiar, comparam a cor média, ≤ 4). O player que espera o próximo trecho
já guarda o quadro dele, e quem está buscando repete o último quadro:
a prévia não pisca preto.

## Fase 2 — Transições 2.0

- ~45 transições em categorias: **Básicas, Deslizar, Cortina, Formas,
  Fatias, Câmera, Luz, Glitch e distorção, Desfoque**.
- As do `xfade` nativo (46 no FFmpeg 5.1) portadas uma a uma para GLSL a
  partir do código-fonte do filtro (mesmas fórmulas).
- As que o `xfade` não tem (chicote, giro, zoom com desfoque, flash,
  vazamento de luz, glitch, ondas) viram `xfade=custom` com expressão
  própria, e a mesma expressão em GLSL.
- Cada transição sugere um som (whoosh, impacto...), que entra como item
  próprio na faixa Sons.
- Aviso quando a transição cai no meio de uma palavra.

**Estado: feito.** 50 transições (41 do `xfade` nativo portadas para
GLSL, com as de preto/branco emuladas em YUV como o FFmpeg). As próprias
**não** usam `xfade=custom` (lento e com corrida entre threads nas
variáveis `st`/`ld`): são receitas de filtros nativos na ordem
zoom/giro (`perspective`, `rotate`) → mistura → faixas/ondas
(`displace` com mapa 270x480) → `rgbashift` → `gblur` → luz (`blend`
tela), e o shader faz as mesmas contas. Biblioteca por categoria, com
miniaturas desenhadas pelo shader; som sugerido opcional; aviso de
palavra partida pela transcrição.

## Fase 3 — Filtros e cor

- ~20 aparências (Mono, Retro, Quente, Frio, Cinema, Comida, Noite,
  Vívido...) com intensidade; ajuste por trecho (brilho, contraste,
  saturação, temperatura, matiz, realce/sombra).
- **Uma função JavaScript** transforma aparência + ajustes numa tabela de
  cor 3D (33³). O render usa `lut3d` com o `.cube` gerado; a prévia usa a
  MESMA tabela como textura 3D. Paridade por construção.
- "Igualar cor": mede o brilho e a cor média de cada trecho e compensa.

**Estado: feito.** `contracts/src/cor.ts`: 22 filtros em 5 categorias,
7 ajustes (brilho, contraste, saturação, temperatura, tom, realces,
sombras) e intensidade. A tabela é gerada em bytes e o `.cube` sai dos
mesmos bytes; o render aplica `lut3d` trilinear no fim do trecho, e a
prévia, a textura 3D no fim do enquadramento. Paridade: 48 medidas com
diferença média ≤ 0,75 (0-255). Biblioteca > Filtros com miniaturas
pintadas num quadro do próprio trecho; "Igualar os outros trechos a
este" mede três quadros de cada trecho e compensa brilho, temperatura e
tom (`ajustesParaIgualar`). Selo de cor no card do trecho.

## Fase 4 — Efeitos de trecho e efeitos de corpo

- Itens na faixa Efeitos com início, fim e intensidade: vinheta,
  aberração cromática, grão de filme, VHS/TV, glitch, tremor de câmera,
  desfoque, flash/pulso de luz, espelho/divisão, abertura e fechamento
  (íris, cinema).
- Efeitos de corpo com a máscara da pessoa: fundo desfocado, fundo de
  cor/imagem, fundo em preto e branco, contorno brilhante.

**Estado: feito (contorno brilhante e fundo de imagem ficam para a
fase 6, junto das imagens sobrepostas).** 16 efeitos de tela
(`contracts/src/efeitos-de-tela.ts`), itens da faixa Efeitos com
começo, duração e intensidade, arrastáveis e com bordas. No render,
sobre o vídeo montado e antes de logo e textos: filtros nativos com
`enable` (desfoque, aberração, espelho, grão, tremor/pulso pelo
`perspective`, glitch pelo `displace` com mapa yuv420p neutro) ou
camadas geradas postas com `overlay` (vinheta, flash, íris, barras,
linhas). Efeitos de fundo (desfocado, P&B, escuro) usam a máscara da
pessoa: o worker gera a máscara também para eles (`janelasDaPessoa`), o
render divide a máscara entre efeitos e textos atrás; sem modelo, o
efeito de fundo não entra. Na prévia, um passo de pós-processamento por
efeito (efeitosGlsl.ts); o gblur é emulado em YUV (croma com o dobro do
sigma, como no yuv420p). Paridade: 48 medidas dentro da tolerância
(grão por média; fundo com máscara sintética igual nos dois lados).

## Fase 5 — Keyframes e animações

- Motor de keyframes nos contratos (posição, escala, rotação,
  opacidade) usado por textos, stickers e overlays; vira `\move`/`\t`
  no libass e expressões do `overlay`/`scale` no FFmpeg.
- Novas animações de texto (flutter, flicker, onda por letra, quique,
  desfoque) e animação por bloco de legenda.

## Fase 6 — Overlays e B-roll

- Faixa de sobreposição: imagem ou vídeo com posição, tamanho,
  opacidade, modo de mistura, cantos, sombra, ordem e "atrás da pessoa".
- Picture-in-picture, tela dividida, B-roll em tela cheia com a fala
  continuando; busca no Pexels (chave nas Configurações); IA sugere
  B-roll pela fala.

## Fase 7 — Stickers

- Acervo próprio em SVG (setas, círculos, sublinhados, check/X, balões,
  selos) + emoji Noto (Apache), exportados em PNG para o render.
- Animação de entrada/loop/saída, keyframes e acompanhar o rosto
  (detector de rosto em ONNX, mesmo esquema da máscara).

## Fase 8 — Fotos e montagens

- Foto na timeline com Ken Burns; slideshow com ritmo e batida da trilha;
  colagem (2, 3, 4) com `xstack`; antes e depois (divisão e cortina);
  modelos com espaços para trocar mídia.

## Fase 9 — Sons

- Categorias (transição, impacto, humor, suspense, interface, reação);
  sons sintetizados + acervo CC0 com a origem registrada.
- Proteção da fala: efeito que cai sobre palavra é abaixado ou movido
  para a pausa mais próxima; sugestão de som pela IA.

## Fase 10 — Pacotes de estilo

- "Podcast limpo", "Energia TikTok", "Tutorial", "Cinema", "Vendas":
  cada pacote aplica itens separados (legenda, transições, efeitos,
  filtro, sons, textos). "Salvar como meu estilo" no workspace. A IA
  escolhe o pacote pelo tipo de vídeo.

## Fora do escopo (e por quê)

- Catálogo "Trending": conteúdo que muda sem parar; o equivalente aqui
  são os "mais usados" do workspace.
- Efeitos 3D/cartoon: custo de CPU sem GPU não compensa.
- Sticker gerado por IA: depende de serviço pago; fica para depois.

## Critério de pronto de cada fase

Testes dos contratos e do render, teste de paridade prévia × export,
checagem de tipos, build de produção, validação no navegador com
capturas e um export conferido quadro a quadro; commit e push.
