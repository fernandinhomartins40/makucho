# Auditoria do Studio Editor — produto, fluxo e oportunidades

Data: 24/09/2026. Escopo: o editor (`/editor`), da proposta da IA até o
arquivo exportado. O critério foi um só: **o que a pessoa vê e ajusta é o
que sai no vídeo**, com o mínimo de passos e sem adivinhação.

## 1. O que foi resolvido nesta rodada

| # | Problema relatado | Causa encontrada | O que mudou |
|---|---|---|---|
| 1 | Cards da timeline não mostram o que a IA aplicou | O card do trecho só tinha a função e a duração | Selos em cada trecho (transição, efeito, legendas, textos, elementos, sons, som do trecho) e a lista "Neste trecho" no painel, com um clique para abrir cada recurso |
| 2 | Transições com pausa e corte brusco | (a) o trecho que saía **congelava** no último quadro durante a transição; (b) o áudio era cortado seco; (c) os trechos traziam o silêncio das pontas do Whisper; (d) a prévia saltava (seek) num player só | Agenda única (`contracts/agenda.ts`): transição centrada no corte com as sobras do original, áudio em peças que se cruzam (60 ms no corte seco, a janela inteira na transição); "Tirar pausas" (também automático na proposta da IA); prévia com dois players |
| 3 | Textos-chave atrás da pessoa, edição livre, fontes, fidelidade dos estilos | Não havia segmentação; a legenda só tinha 3 posições; 15 fontes; os cartões de estilo eram CSS e exageravam tamanho e destaque | Texto atrás da pessoa (MediaPipe Selfie Segmentation, mesmo modelo na prévia e no render); legenda arrastável e redimensionável; 37 fontes com seletor visual; cartões desenhados pelo libass |
| 4 | Não dá para editar o áudio | O plano não tinha áudio por trecho; a onda era um desenho fictício | Faixa Áudio com a forma de onda real (API `/onda`), volume, mudo, fades e J/L-cut por trecho, com as bordas arrastáveis |
| 5 | Sem trilha e sem efeitos/transições de áudio | O upload de trilha só existia no Kit de marca; 3 sons | Biblioteca → Trilha (enviar, ouvir, usar, volume, fades, abaixar na fala); 10 efeitos sonoros sintetizados (iguais na prévia e no render); crossfade de áudio em toda transição |
| 6 | Elementos e efeitos sem definição e sem prévia | Nomes técnicos, sem descrição | Catálogo único com o que cada recurso é e quando usar; Biblioteca com transições e efeitos animados, sons para ouvir e estilos de texto desenhados |
| 7 | Faltam atalhos | Só havia Ctrl+Z | Espaço, Shift+Espaço, Home/End, setas (quadro/segundo), S, C, D, Delete, Esc, "?" (lista de atalhos) |
| 8 | Barras de rolagem e nomes das faixas | Duas rolagens independentes; a coluna de nomes desalinhava | Uma rolagem só, nomes e régua presos; barras finas no tema; régua com arraste (scrub) |
| 9 | Painéis desorganizados | Ferramentas misturadas, sem prévia | Rail: IA · Biblioteca · Legendas · Mídia · Marca; propriedades do item em abas; presets visuais |

Também corrigido no caminho: o **zoom lento** do render andava para o
canto (o `crop` depois do `scale` variável fica preso no tamanho do
primeiro quadro); agora é centrado, igual à prévia.

## 2. Oportunidades — próximos passos, por impacto

### Alta prioridade

1. **Ondas de áudio na própria prévia de reprodução.** Mostrar o nível
   (VU) durante a reprodução ajuda a achar corte em meio de palavra sem
   olhar a timeline.
2. **Linha de volume na faixa Áudio** (arrastar a linha para cima e para
   baixo, com pontos-chave), além do painel. Hoje o volume é por trecho
   inteiro.
3. **Imã (snap) na timeline**: ao arrastar textos, sons e bordas,
   grudar no playhead, nos cortes e no começo de palavras.
4. **Seleção múltipla** (Shift+clique, arrasto de caixa) para mover,
   excluir ou aplicar estilo em vários itens de uma vez.
5. **Cópia de estilo** ("pincel"): copiar o estilo de um texto e colar
   nos outros; "aplicar a todos os títulos".

### Média prioridade

6. **Máscara da pessoa refinável**: hoje o recorte é automático; um
   pincel de "incluir/excluir" resolveria casos com objeto na mão ou
   duas pessoas.
7. **Biblioteca de trilhas licenciadas** (catálogo livre de direitos,
   com busca por clima). Hoje só entra música enviada pela pessoa.
8. **Mais transições com áudio próprio**: um "whoosh" opcional junto do
   slide/zoom, na mesma escolha.
9. **Legenda por palavra na timeline** (a faixa mostra blocos; editar o
   tempo de uma palavra ainda exige a aba Legendas).
10. **Pré-visualização em tela cheia com zonas de corte de cada rede**
    (Reels, TikTok, Shorts) e um aviso quando texto cai sob a interface.

### Qualidade e confiabilidade

11. **Teste visual automático prévia × export** no CI: renderizar um
    plano de referência e comparar quadros (hoje é feito à mão).
12. **Métrica de legibilidade** para textos atrás da pessoa: avisar
    quando a cobertura passar de ~45% durante a exibição (a pessoa se
    mexe depois do posicionamento).
13. **Carregamento progressivo do editor**: o runtime ONNX (14 MB) já só
    carrega com texto atrás; o JASSUB pode seguir a mesma regra quando o
    vídeo não tem legenda nem texto.

## 3. Limitações conhecidas

- A prévia da transição é uma aproximação em CSS de cada efeito do
  `xfade`; a mistura, o tempo e o som são os mesmos do render, o desenho
  exato de efeitos como "pixels" pode variar.
- O recorte da pessoa é por quadro (sem rastreamento); em movimento
  rápido a borda pode oscilar levemente (há suavização temporal).
- O volume do trecho acima de 0 dB soa correto no export; na prévia o
  navegador limita o volume de um `<video>` a 100%.
