# Inventário integral da aplicação

## Produtos e infraestrutura

`portal/`: Next.js (`apps/web`), NestJS (`apps/api`), Prisma/PostgreSQL (`packages/database`), contratos e validação compartilhados. Módulos: auth, users, posts, categories, tags, authors, media/storage, videos, homepage, market, ads, newsletter, settings, analytics, search, audit, tasks. `studio/`: Next.js, NestJS, banco separado, workers de mídia/transcrição/render e contratos de segurança semântica. ADRs 0001–0010 e `README.md` definem separação e restrições. Diretórios `makucho-1/` e `MAKUCHO_Landing_Page_Complete_v1/` são cópia histórica e referência visual, respectivamente; não são o workspace ativo do pnpm.

## Superfícies públicas do Portal — 11/11 (9 páginas + 404 + erro)

| Rota | Tarefa | Dados e componente principal |
|---|---|---|
| `/` | descobrir e seguir conteúdos | `api.homepage`, `Cabecalho`, `Newsletter`, `Rodape`, cards, radar, anúncio |
| `/artigo/[slug]` | ler, compartilhar, seguir relacionados | posts, `ContadorLeitura`, `AnuncioSlot` (artigo/lateral) |
| `/autor/[slug]` | explorar autor | authors, posts, `Listagem` |
| `/categoria/[slug]` | explorar editoria | categories, posts, `Listagem` |
| `/tag/[slug]` | explorar assunto | tags, posts, `Listagem` |
| `/busca` | buscar e paginar | search, `Listagem` |
| `/videos` | assistir e paginar | videos, `Moldura` |
| `/sobre` | conhecer a proposta editorial | settings públicos, `Moldura` |
| `/contato` | encontrar o canal institucional | settings públicos, `Moldura` |
| `not-found` | recuperar navegação de endereço inválido | layout/estado do App Router |
| `error` | repetir após falha inesperada | limite de erro do App Router, retry e retorno |

## Rotas do CMS — 17/17

| Rota | Tarefa | Permissão mínima/área |
|---|---|---|
| `/painel/entrar` | entrar | pública; auth |
| `/painel/senha` | trocar senha | autenticada; auth |
| `/painel` | visão geral | AUTHOR; posts/newsletter |
| `/painel/publicacoes` | buscar, filtrar e duplicar | AUTHOR; posts |
| `/painel/publicacoes/nova` | criar | AUTHOR; posts |
| `/painel/publicacoes/[id]` | editar, revisar, publicar, restaurar | AUTHOR/EDITOR; posts/revisions |
| `/painel/midia` | upload, metadados, recorte | AUTHOR; media |
| `/painel/videos` | cadastro e ordem | AUTHOR; videos |
| `/painel/categorias` | editorias e ordem | EDITOR; categories |
| `/painel/tags` | taxonomia | AUTHOR; tags |
| `/painel/autores` | assinaturas | EDITOR; authors |
| `/painel/home` | seções e ordem | EDITOR; homepage |
| `/painel/anuncios` | campanhas | ADMIN; ads |
| `/painel/newsletter` | inscritos/exportação | EDITOR/ADMIN; newsletter |
| `/painel/usuarios` | contas/permissões | ADMIN; users |
| `/painel/configuracoes` | site/redes/SEO | ADMIN; settings |
| `/painel/auditoria` | rastreabilidade | ADMIN; audit |

## Studio — 7/7 rotas, diagnóstico apenas

`/` projetos, `/entrar`, `/gravar`, `/roteiros`, `/editor`, `/marca`, `/ajuda`. Componentes de shell (`Moldura`, `Sidebar`, `Topbar`), editor (`Palco`, `Inspector`, `RailDeFerramentas`, painéis de IA/legendas/refino), timeline (`Timeline`, `TimelineRuler`) e workers. Regras críticas: original imutável, IA em JSON validado, fala/timestamp rastreáveis, preview e render pelo mesmo EditPlan.

## Superfícies compartilhadas

Portal público: `Cabecalho`, ticker/radar, menu, busca, `Moldura`, `Rodape`, `CardArtigo`, `Listagem`, `Newsletter`, `ContadorLeitura`, `AnuncioSlot`, ícones. CMS: `MolduraPainel`, `TituloPagina`, `Sessao`, `Botao`, `Campo`, `Entrada`, `Selecao`, `Alternador`, `Aviso`, `SeloStatus`, `Modal`, `Confirmacao`, `Vazio`, `Carregando`, `Paginacao`, `Recado`, `FormularioPost`, `Editor`, `SeletorMidia`. Estados: normal, carregando, vazio, erro, confirmação, sucesso, desabilitado, sessão expirada e sem permissão, conforme rota.
