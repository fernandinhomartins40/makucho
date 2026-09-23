# Plano UX/UI — Painel administrativo MAKUCHO

Direção: **clareza editorial, controle de estúdio** (ver `BRAND-AND-DIRECTION.md`). Mesmos tokens do portal público — navy `#0a1f44`, azul de ação `#1f6bff`, bordas `#e3ebf6`, canvas `#f5f8fd`, Inter — com densidade de ferramenta de trabalho. Logos oficiais: `makucho-logo-horizontal-dark-bg.webp` na lateral navy.

## Fase 1 — Sistema e shell (efeito em todas as telas)

- Tokens `--pn-*` alinhados ao portal; foco visível de 2 px; alvos ≥ 32 px.
- Lateral agrupada (Conteúdo / Organização / Site / Administração), card do usuário no pé, fundo contínuo (A-03, A-12).
- Barra superior com trilha da seção e "Ver site" (A-05). A criação fica no título de cada tela, para não haver duas ações primárias concorrentes.
- Contêiner 1280 px centralizado (A-06).
- Botão `perigo-suave` para excluir em linhas; ações compactas (A-04).
- Selos tintados (A-10); tabelas com cabeçalho fixo e hover (A-13); vazio com ícone; toast com status (A-14).

## Fase 2 — Telas

- R-01 cards com ícone e ações rápidas (A-07).
- R-02 título abre o editor; plataforma legível (A-08).
- R-04 legenda na grade (A-15).
- R-09 linhas compactas (A-09).
- R-13 lista de redes legível e barra de salvar fixa (A-02, A-11).
- R-14 rótulos e filtros completos (A-01).

## Fase 3 — Validação

Capturas em 1366 e 390 px de todas as rotas, com sessão real no ambiente local; typecheck e lint; nenhuma rolagem horizontal; comportamento preservado (nenhuma API alterada).

## Fora do escopo desta rodada

Ações em lote, editor de publicação (R-03) além dos tokens, calendário editorial — dependem de endpoints novos.
