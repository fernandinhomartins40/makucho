# Matriz de preservação

| Área | Classe | Regra/evidência |
|---|---|---|
| `studio/` inteiro | NÃO ALTERAR | pedido explícito: estudar fluxos e oportunidades sem intervenção visual/código |
| Logo oficial e fotos do brand kit | PRESERVAR | `MAKUCHO_Landing_Page_Complete_v1/brand-kit` e assets da landing; marca oficial aplicada em `portal/apps/web/public/brand/` |
| Schema Prisma, dados editoriais e slugs | PRESERVAR | banco real e relações existentes; nenhuma migração estética |
| Papéis e guardas de API | PRESERVAR | `@Roles`, sessão e `pode()`; servidor decide autorização |
| Regras de publicação, revisão, autosave | PRESERVAR | `posts.service.ts`, `FormularioPost`; não perder rascunho nem etapa |
| Composição visual da landing | CORRIGIR/INTEGRAR | seguir imagem aprovada, mantendo conteúdo e ordem do CMS |
| Nove tipos e reordenação das seções | INTEGRAR | `HomepageService.montar()` já entrega a ordem; frontend precisa respeitar |
| Espaço publicitário | INTEGRAR | `ads/serve`, evento e clique reais; ausência de campanha não cria anúncio falso |
| Navegação móvel, estados e acessibilidade | CORRIGIR | rotas públicas e CMS precisam funcionar sem hover e com foco |
| Formulários administrativos | SIMPLIFICAR | clareza de ação e recuperação, sem remover campos/regras |
| Trabalho repetitivo editorial | EXPLORAR | lote/filtros salvos dependem de volume observado e capacidade completa |
| Studio: importação, retomada, render | EXPLORAR | registrar hipótese/risco no radar; implementação fora do escopo |

Refresh e polling não devem substituir estado local de edição, fechar modal ou perder seleção. Qualquer mudança de API deve preservar contratos existentes e trilha de auditoria.
