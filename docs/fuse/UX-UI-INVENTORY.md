# Inventário UX/UI — Painel administrativo MAKUCHO

Escopo: `/painel/*` do portal (não o Studio). Base: capturas em 1920px enviadas em 2026-09-23 e o código em `portal/apps/web/src/app/painel` e `components/painel`.

## Shell compartilhado

| ID | Item | Arquivo | Estados |
|---|---|---|---|
| SH-1 | Barra lateral (marca, navegação, "Ver o site") | `components/painel/moldura-painel.tsx` | ativo, hover, mobile aberto/fechado, papel (itens filtrados por `minimo`) |
| SH-2 | Barra superior (usuário, avatar → Minha conta, Sair) | idem | — |
| SH-3 | Título de página (`TituloPagina`) | idem | com/sem descrição, com/sem ações |
| SH-4 | Tela de espera / redirecionamento de sessão | idem | carregando, sem sessão, troca de senha obrigatória |

## Componentes (`components/painel/ui.tsx`)

`Campo`, `Entrada`, `AreaTexto`, `Selecao`, `Alternador`, `Botao` (primario/neutro/perigo/fantasma, carregando, disabled), `Aviso` (info/erro/ok), `Etiqueta`, `SeloStatus`, `Modal` (foco preso, Esc), `Confirmacao`, `Vazio`, `Carregando`, `Paginacao`, `useRecado` (toast).

## Rotas

| ID | Rota | Tela | Dados/ações | Estados relevantes |
|---|---|---|---|---|
| R-01 | `/painel` | Visão geral | contadores (publicados, rascunhos, agendados, inscritos), últimas publicações | carregando, falha parcial, vazio |
| R-02 | `/painel/publicacoes` | Lista de publicações | busca, status, categoria, ver/duplicar/excluir, paginação | vazio, vazio filtrado, erro |
| R-03 | `/painel/publicacoes/nova`, `/[id]` | Editor (`formulario-post.tsx`, `editor.tsx`, `seletor-midia.tsx`) | formulário longo, TipTap, mídia | salvando, erro de campo |
| R-04 | `/painel/midia` | Biblioteca de mídia | busca, upload, grade | vazio, enviando, erro |
| R-05 | `/painel/videos` | Vídeos | plataforma, abrir/editar/excluir | vazio |
| R-06 | `/painel/categorias` | Categorias | reordenar, editar, excluir | — |
| R-07 | `/painel/tags` | Tags | filtro, editar, excluir | vazio |
| R-08 | `/painel/autores` | Autores | editar, excluir | vazio |
| R-09 | `/painel/home` | Montagem da home | reordenar, ocultar, editar, excluir, nova seção | seção oculta |
| R-10 | `/painel/anuncios` | Anúncios | status, CRUD | vazio |
| R-11 | `/painel/newsletter` | Newsletter | métricas, filtro, exportar CSV | lista restrita (não-admin), vazio |
| R-12 | `/painel/usuarios` | Usuários | papel, status, editar | "(você)", super admin sem ações |
| R-13 | `/painel/configuracoes` | Configurações | geral, newsletter, SEO, redes | salvando, erro por bloco |
| R-14 | `/painel/auditoria` | Auditoria | filtro por ação e item, paginação | vazio filtrado |
| R-15 | `/painel/senha` | Minha conta | troca de senha com validação ao vivo | troca obrigatória |
| R-16 | `/painel/entrar` | Login | já redesenhado (padrão do portal) | erro, senha alterada |

## Viewports verificados

1920 (capturas do usuário), 1366, 390 (validação após implementação).
