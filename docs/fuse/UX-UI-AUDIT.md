# Auditoria UX/UI — Painel administrativo MAKUCHO

Gravidade: `BLOCKER` · `HIGH` · `MEDIUM` · `REFINEMENT`. IDs de tela em `UX-UI-INVENTORY.md`.

## Referências de pesquisa (2026-09-23)

- NN/g — [Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/): encontrar, comparar, ver/editar uma linha, agir sobre registros; [Bulk Actions](https://www.nngroup.com/videos/bulk-actions-design-guidelines/).
- [Pencil & Paper — Enterprise data tables](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) e [Setproduct — Data table UI 2026](https://www.setproduct.com/blog/data-table-ui-design): barra de ferramentas acima da tabela, cabeçalho fixo, ações por linha discretas.
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/): alvo mínimo 24×24 px (2.5.8), foco não encoberto (2.4.11), foco visível.
- [SaaS UI — Destructive actions](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns): atrito proporcional ao risco; destrutivo diferenciado em vermelho.
- [Carbon — Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) e [PatternFly — Empty state](https://www.patternfly.org/components/empty-state/design-guidelines/): explicar e oferecer a próxima ação.
- Painéis editoriais (Ghost/WordPress): a visão geral prioriza rascunhos, agendados e atalhos de criação.

## Achados

| ID | Tela | Gravidade | Problema | Solução | Técnica | Critério de aceite |
|---|---|---|---|---|---|---|
| A-01 | R-14 | HIGH | Rótulos crus (`password_changed`, `market_indicator`, `social_profile`, `settings`); chaves do mapa erradas (`ad`, `setting`, `homepage`) | Mapear todas as ações/recursos que a API registra, com cor e texto em português | CSS/código | Nenhum código cru visível; filtros listam os valores reais |
| A-02 | R-13 | HIGH | Redes sociais: nome e URL colados ("Instagramhttps://…") | Título e URL em linhas separadas, ícone da rede | CSS | Leitura em duas linhas |
| A-03 | SH-1 | HIGH | 13 itens de navegação sem agrupamento; difícil escanear | Agrupar em Conteúdo, Organização, Site e Administração | código | Grupos com rótulo; item ativo evidente |
| A-04 | todas | HIGH | Ações por linha ("Ver Duplicar Excluir") com o mesmo peso; excluir não se distingue | Ações compactas; excluir em vermelho, separado; foco e alvo ≥ 24 px | CSS/código | Excluir identificável sem ler; teclado funciona |
| A-05 | SH-2 | MEDIUM | Barra superior vazia à esquerda; sem contexto de onde se está nem atalho de criação | Mostrar seção atual (trilha) e atalho "Nova publicação" + "Ver site" | código | Contexto visível em todas as telas |
| A-06 | todas | MEDIUM | Conteúdo alinhado à esquerda com max 1180 px deixa vazio grande em 1920 px | Contêiner 1280 px centralizado | CSS | Margens equilibradas em 1920/1366 |
| A-07 | R-01 | MEDIUM | Visão geral mostra números sem próxima ação | Cards com ícone e link; bloco de ações rápidas (publicar, enviar mídia, montar home, ver site) | código | Criar conteúdo a 1 clique |
| A-08 | R-02 | MEDIUM | Subtítulo "vídeo · youtube" em minúsculas técnicas; título não abre o editor | "Com vídeo · YouTube"; título como link para editar | código | Clicar no título abre o editor |
| A-09 | R-09 | MEDIUM | Cards de seção muito altos (≈190 px) com área vazia; seção oculta pouco distinta | Linha compacta: posição, nome, descrição, contagem, estado e ações na mesma faixa | CSS | 7 seções visíveis sem rolar em 1366×900 |
| A-10 | todas | MEDIUM | Selos de status sólidos e saturados competem com o conteúdo | Selo com fundo tintado e texto escuro da cor (contraste AA) | CSS | Contraste ≥ 4.5:1 |
| A-11 | R-13 | MEDIUM | Formulário longo com salvar só no topo | Barra de salvar fixa no rodapé da tela | CSS | Salvar alcançável sem rolar ao topo |
| A-12 | SH-1 | REFINEMENT | Fundo da lateral termina em 100vh em páginas longas (visível em capturas de página inteira) | Fundo da coluna pintado no contêiner | CSS | Sem faixa branca sob a lateral |
| A-13 | todas | REFINEMENT | Tabelas sem cabeçalho fixo; hover pouco perceptível | Cabeçalho `sticky`, hover sutil, números tabulares | CSS | Cabeçalho visível ao rolar |
| A-14 | todas | REFINEMENT | Empty state sem ícone; toast sem hierarquia | Ícone no vazio; toast com ícone e borda de status | CSS | — |
| A-15 | R-04 | REFINEMENT | Grade de mídia sem nome do arquivo | Legenda com nome/descrição | código | Identificar imagem sem abrir |

Sem assets raster novos: tudo é CSS/SVG e as logos oficiais do Kit de Marca já estão em `public/brand` (`CODEX-ASSET-JOBS.md` não é necessário).
