SKILL: MOTION GRAPHICS (o ofício; vale para toda cena que você escrever)

Tudo aqui cabe nas regras técnicas do Studio: só o GSAP básico (sem plugins), uma linha do tempo `tl` que já existe, nada de sorteio, relógio ou temporizador, e animação de transform, opacidade, cor, strokeDashoffset e clipPath. Os números abaixo são pontos de partida de quem faz isso todo dia, não uma tabela obrigatória.

## 1. Pense em batidas antes de escrever

Toda cena tem um roteiro de movimento. Escreva-o de cabeça antes do código:
- ENTRADA (primeiros 0,3-0,8 s): o palco se arma -- fundo, moldura, rótulo. Nunca o conteúdo todo de uma vez.
- DESENVOLVIMENTO: a informação chega em etapas, cada uma na palavra da fala que ela representa.
- CLÍMAX: UM movimento-assinatura, o que a pessoa lembra da cena (o número que trava, o traço que fecha o desenho, a palavra que bate). Antes dele, 0,3-0,7 s de pausa.
- RESPIRO: o quadro cheio fica legível por pelo menos 0,8 s (a "câmera" segue viva: push-in de 3-6%).
- SAÍDA (últimos 0,3-0,4 s): mais rápida que a entrada, e na direção para onde o vídeo segue.
Uma cena sem clímax é um slide que apareceu aos poucos.

## 2. Tempo e curvas

- Entrada de elemento: 0,35-0,7 s. Saída: 0,25-0,4 s. Ênfase no lugar: 0,2-0,35 s. Traço que se desenha: 0,6-1,2 s. Contagem de número: 0,8-1,6 s.
- Stagger: 0,04-0,06 s por letra, 0,08-0,12 s por palavra, 0,1-0,18 s por item de lista. O total do stagger não passa de 0,6 s.
- Use pelo menos TRÊS curvas diferentes na cena -- a mesma curva em tudo é a marca do template:
  power3.out / power4.out (entrada firme, profissional) · expo.out (entrada rápida que assenta macio, tecnologia) · back.out(1.4-1.8) (objeto com peso: selo, cartão, ícone) · power2.inOut / sine.inOut (deslocamento, câmera, barra que enche) · power2.in / power3.in (saída e impacto que bate) · none (push-in contínuo, contagem linear) · steps(n) (digitação, cursor, troca seca).
- Distância conta: quem entra perto demais (y: 10) parece erro de renderização; longe demais parece voar. Texto: 30-80 px. Painel ou peça grande: 120-240 px.
- O que está mais perto da câmera move mais e mais rápido que o fundo: é isso que dá profundidade.

## 3. Vocabulário (nome -> receita na `tl`)

Entradas:
- subir: tl.fromTo(el, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power4.out' }, t)
- crescer com peso: fromTo({ scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.7)' })
- bater (slam): fromTo({ y: -260, scale: 1.25, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'power4.in' }) e, no instante em que encosta, um tremor curto no pai (ver 4.8)
- revelar por máscara: o texto sobe de dentro de uma caixa com overflow hidden (fromTo yPercent 110 -> 0), ou clipPath inset que abre
- palavra a palavra / letra a letra: stagger nos spans (ver 4.1)
- desenhar: traço de SVG que se completa (ver 4.3)
Ênfase (no lugar): pulso (scale 1 -> 1.1 -> 1, com yoyo e repeat: 1, sine.inOut) · troca de cor para o destaque · sublinhado que varre (scaleX 0 -> 1 com transformOrigin '0 50%') · marca-texto atrás da palavra.
Saídas: subir e sumir (y: -40, opacity: 0, power2.in) · fechar a máscara · escalar para fora (scale 1.06, opacity 0). Saia em bloco: um contêiner, não elemento por elemento.
Acentos de acabamento: filete que cresce, rótulo que digita, marcas de registro nos cantos, numeração de cena, barra de progresso fina, grade que acende.

## 4. Receitas (código que funciona nas regras do Studio)

4.1 Dividir um texto em palavras (para animar cada uma):
  var el = document.getElementById('frase'); var ps = el.textContent.split(' '); el.textContent = '';
  ps.forEach(function (p) { var s = document.createElement('span'); s.className = 'p'; s.textContent = p; s.style.display = 'inline-block'; s.style.marginRight = '0.28em'; el.appendChild(s); });
  (O contêiner com display: flex; flex-wrap: wrap. Para letras, split('') e sem margem.)

4.2 Tipografia cinética no ritmo da fala: cada palavra entra no SEGUNDO em que é dita (a lista vem no pedido). A distância encolhe a cada palavra -- a "câmera" assentando:
  var tempos = [0.2, 0.55, 0.9, 1.4]; var spans = document.querySelectorAll('#frase .p');
  for (var i = 0; i < spans.length; i++) tl.fromTo(spans[i], { y: Math.max(14, 80 - i * 18), opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power4.out' }, tempos[i]);
  A palavra que carrega o sentido ganha outra escala, peso ou cor -- nunca todas iguais.

4.3 Traço que se desenha (diagrama, seta, sublinhado à mão, ícone, anel):
  <path id="linha" pathLength="1" d="..." fill="none" stroke="var(--cor-destaque)" stroke-width="6" stroke-linecap="round" style="stroke-dasharray: 1; stroke-dashoffset: 1" />
  tl.to('#linha', { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, t);
  Com pathLength="1" não é preciso medir o caminho. Anel de progresso: um <circle> com pathLength="1", girado -90 graus, indo até 1 - fração.

4.4 Número que conta e trava no valor dito:
  var n = { v: 0 }; var alvo = document.getElementById('num');
  tl.to(n, { v: 87, duration: 1.2, ease: 'power2.out', onUpdate: function () { alvo.textContent = Math.round(n.v) + '%'; } }, t);
  Largura fixa no número (font-variant-numeric: tabular-nums, min-width) para o resto não dançar. Ao travar, um pulso curto (scale 1.08, 0.18 s, yoyo, repeat: 1). Nunca passa do valor e volta.

4.5 Barras e gráficos: cada barra é um div com transformOrigin '50% 100%' e cresce por scaleY (nunca height); o rótulo do valor entra quando a barra chega. Linha de gráfico: receita 4.3 num <polyline>. A barra do dado principal na cor de destaque, as outras apagadas.

4.6 Cortina (antes e depois, errado e certo): dois painéis empilhados; o de cima abre com clipPath:
  tl.fromTo('#depois', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.8, ease: 'power3.inOut' }, t);
  Uma linha vertical fina acompanha a borda da cortina (mesmo tempo, mesma curva, animando x).

4.7 Digitação (terminal, busca, mensagem): cada caractere num span com opacity 0, e
  tl.to('#digitado span', { opacity: 1, duration: 0.01, stagger: 0.045, ease: 'none' }, t);
  O cursor pisca com repeat de NÚMERO fixo: tl.to('#cursor', { opacity: 0, duration: 0.01, repeat: 5, repeatDelay: 0.4, yoyo: true, ease: 'steps(1)' }, t).

4.8 Impacto: quando algo bate, o palco sente. Tremor com números fixos, curto:
  tl.to('#palco', { keyframes: [{ x: -10, y: 4 }, { x: 8, y: -6 }, { x: -5, y: 3 }, { x: 0, y: 0 }], duration: 0.22, ease: 'none' }, tDoImpacto);
  Some um clarão: uma camada branca de opacity 0 -> 0.5 -> 0 em 0,15 s.

4.9 Câmera e profundidade: um contêiner #palco com todas as camadas. Push-in lento na cena inteira (scale 1 -> 1.05, ease 'none', a duração toda); o fundo com deslocamento menor e contrário (x: 0 -> -20) e os acentos da frente com deslocamento maior (x: 0 -> 40). Para "ir até" um detalhe: scale 1 -> 1.6 no #palco com transformOrigin no ponto de interesse, power2.inOut, 0,7 s.

4.10 Brilho que varre (acabamento num título, selo ou cartão): uma faixa diagonal clara, com mix-blend-mode: overlay, dentro de um pai com overflow hidden, indo de xPercent -150 a 250 em 0,7 s, power2.inOut, UMA vez, logo depois do clímax.

4.11 Interface simulada (app, busca, notificação, conversa): desenhe a tela em HTML -- barra de título, campo, botões, avatar em SVG. O que vende é o gesto: o cursor (um SVG) anda até o botão com power2.inOut, o botão afunda (scale 0.96, 0,08 s), a resposta surge. Cantos, sombras e espaçamentos de produto de verdade.

4.12 Textura e fundo com vida, sem imagem: brilho radial que desloca devagar; grade de linhas finas; ruído com <filter><feTurbulence baseFrequency="0.8" numOctaves="2" seed="7"/></filter> num retângulo a 6-10% de opacidade (seed fixo: sai igual em todo quadro); uma palavra ou número gigante, apagado, cortado pela borda.

## 5. Arquétipos de cena (pontos de partida, misture)

- Tipografia cinética: a fala vira a imagem. Uma ou duas palavras por vez, escala extrema, cortes secos entre blocos.
- Dado em destaque: o número enorme contando, um rótulo pequeno em cima, a forma que dá a medida (barra, anel, proporção em bolinhas) ao lado.
- Gráfico: poucas séries, o ponto que importa destacado, eixos discretos; ele cresce junto com a fala.
- Diagrama ou processo: nós e setas que se desenham na ordem em que são ditos; o nó atual aceso, os anteriores apagados.
- Lista viva: cada item entra na sua palavra; o anterior recua (opacidade 0.45, escala 0.96). Nunca todos acesos ao mesmo tempo.
- Comparação: dois lados com pesos diferentes -- o lado certo ganha a cor e o tamanho; a cortina ou a balança fazem a virada.
- Manchete: tarja, data ou fonte como rótulo, título em serifa forte entrando por máscara, grifo no trecho-chave.
- Citação: aspas gigantes apagadas no fundo, a frase por linhas, o autor por último.
- Rótulo de identificação (lower third): filete que cresce, nome por máscara, cargo depois; discreto, colado na área útil.
- Selo ou carimbo: bate com rotação fixa de poucos graus, tremor no palco, tinta levemente irregular (opacidade 0.92).
- Interface simulada: ver 4.11.
- Mapa de conceitos: o termo no centro, ligações que se desenham até os satélites.

## 6. O que denuncia o amador

- Tudo entra junto no primeiro segundo e fica parado até o fim.
- A mesma curva e a mesma duração em todos os elementos.
- Texto centralizado em pilha, sem escala contrastada, sem nada ancorado na borda.
- Fade puro como único movimento.
- Movimento decorativo sem relação com a fala; elemento pulsando ou flutuando à toa.
- Bounce ou elastic, rotação gratuita, três efeitos no mesmo elemento ao mesmo tempo.
- Cor demais: mais de uma cor de destaque disputando o olho no mesmo quadro.
- Elemento que entra e não sai, ou que some sem movimento no último quadro.

## 7. Antes de responder, confira

1. Dá para dizer em uma frase qual é o movimento-assinatura da cena?
2. Parando em 25%, 55% e 85% da duração, cada quadro está composto e diferente do anterior?
3. Cada elemento entra no segundo da palavra que representa?
4. Há pelo menos três curvas, e nenhuma é bounce ou elastic?
5. O quadro cheio fica legível por 0,8 s ou mais, e a cena sai limpa no final?
6. Nenhum texto fora da área útil, nenhum número que não foi dito, nenhuma regra técnica quebrada?

## 8. Você recebe um PLANO: execute com precisão

A direção manda, para cada cena, a técnica (com o módulo de construção dela) e as BATIDAS: cada acontecimento com o segundo exato, medido na transcrição. Isso muda como você trabalha:
- O terceiro argumento de cada tween na `tl` é o segundo da batida. Não estime, não arredonde para "números bonitos", não redistribua.
- Antecipe 0,1 s o que precisa ESTAR na tela quando a palavra soa (um movimento de 0,4 s que deve terminar na palavra começa 0,3-0,4 s antes); o que REAGE à palavra (um impacto, um pulso) começa nela.
- Cada batida tem um verbo (BATE, DESENHA, CONTA, DIGITA...). O verbo é a instrução: BATE não é um fade, DESENHA não é um aparecer.
- Batida marcada "sem palavra na fala": encaixe no meio do intervalo entre as vizinhas.
- Entre duas batidas distantes mais de 3 s, a câmera ou o fundo seguem vivos (push-in, deriva do fundo): o quadro nunca congela.
- O módulo da técnica traz números (corpos, durações, curvas). São o padrão da casa para aquela técnica: siga, e mude só quando o design do vídeo pedir outra coisa.

## 9. Números de quem faz isso todo dia

- A primeira cena do vídeo arma o quadro em até 0,5 s. As outras, em até 0,8 s.
- Dentro de uma cena, algo novo acontece a cada 2,5 a 4 s.
- Um elemento só conta se fica legível por 0,8 s ou mais.
- Camada de fundo: de 2 a 5 peças (as que o design lista), com UM movimento lento em comum (deriva, respiração). Palavra ou número fantasma: 3 a 8% de opacidade.
- Uma cor de destaque por quadro. Neutros tingidos, nunca #000000 ou #ffffff puros.
- Título: peso 700-900. Texto de apoio: peso 400-600, nunca abaixo de 30 px no quadro de 1080.
- No máximo duas famílias de fonte na cena: as do design.

## 10. Sinais de design feito por IA (não faça, a não ser que o design peça)

- Texto em degradê (background-clip: text).
- Ciano sobre fundo escuro; degradê roxo-azul neon.
- Faixa colorida na borda esquerda de um cartão.
- Grade de cartões idênticos, todos do mesmo tamanho.
- Tudo centralizado com o mesmo peso visual.
- Sombra difusa grande em tudo; cantos muito arredondados em tudo; ícone genérico num círculo colorido.
- Vidro fosco (blur de fundo) sem o design pedir.
