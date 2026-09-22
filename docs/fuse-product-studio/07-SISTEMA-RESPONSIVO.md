# Sistema responsivo contínuo

Breakpoints surgem quando a composição perde leitura; testar 320/360/390/430/768/820/1024/1280/1366/1440/1920 px, alturas 600/720/768, paisagem, zoom 200% e fonte ampliada.

| Zona | Compacto 320–479 | Tablet 600–1023 | Notebook 1024–1365 | Desktop 1366+ |
|---|---|---|---|---|
| Header público | marca, menu e busca acionável; alvo 44 px | menu expandido se couber, busca visível | navegação horizontal | largura limitada, sem dispersão |
| Radar | rolagem horizontal com rótulo, não ocultar informação | cartões enxutos, scroll se preciso | linha | linha com espaçamento |
| Hero | texto antes de imagem, ações envolvem | texto/imagem conforme largura real | grade 5/7 | mesmo grid com medida de leitura |
| Cards/vídeos | 1 coluna | 2 colunas | 3 colunas | 3 colunas, imagem 16:9 |
| Temas | lista navegável | 2 colunas | 4 colunas se legível | 4 colunas |
| Newsletter | texto, campo e ação empilhados; teclado não cobre botão | híbrido | lado a lado | lado a lado |
| CMS shell | menu como drawer com foco/fechamento | drawer/rail conforme largura | sidebar persistente | sidebar persistente |
| CMS tabelas | linha resumida ou scroll com rótulos fixos; ação acessível | colunas essenciais | tabela completa | tabela completa |
| CMS editor | uma coluna, barra de ação fora do teclado | painel lateral abaixo do conteúdo | 2 colunas se houver área | 2 colunas |
| CMS modal | sheet/tela quase inteira e scroll interno único | diálogo central | diálogo central | diálogo central |

Usar `minmax(0,1fr)`, `clamp`, `aspect-ratio`, medidas máximas e safe areas. `100vh` rígido deve ceder a `100dvh` onde a altura móvel muda. Nenhuma função essencial desaparece para caber. Conteúdo longo deve quebrar linha sem overflow. Drawers e formulários mantêm estado durante refresh.
