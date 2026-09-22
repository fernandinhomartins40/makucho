# Plano vertical de implementação

| Fase | Fluxos e resultado | Arquivos/dados | Validação/aceite | Risco/recuperação |
|---|---|---|---|---|
| 1 Home/CMS | PUB-01/PUB-07/ADM-06: todas as seções aparecem na ordem; anúncio real | `page.tsx`, `anuncio-home.tsx`, `api.ts`, `globals.css`; Homepage/Ads existentes | tipos, build, campanha/vazio, posições | mudança restrita à home; reverter apenas a fatia mantendo dados |
| 2 Descoberta | PUB-02–05: busca, artigo, listas e vídeo coerentes | páginas públicas, `Moldura`, `Cabecalho`, `Listagem`, CSS; APIs existentes | 320–1920, SEO, teclado, vazio/erro | isolar CSS público; nenhuma migração |
| 3 Entrada CMS | ADM-01/02: login, conta, visão geral com falha parcial explícita | `painel/entrar`, `painel/senha`, `painel/page`, shell, auth/analytics existentes | sessão, papel, erro, teclado, mobile | preservar tokens e cookie, sem tocar credenciais |
| 4 Produção CMS | ADM-03–07: editor, mídia, vídeo, taxonomia e montagem da home | páginas, `FormularioPost`, `Editor`, `SeletorMidia`; posts/media/homepage | salvar, publicar, restaurar, upload, seleção, erro | cada etapa deixa o painel utilizável; nenhuma exclusão sem confirmação |
| 5 Operação CMS | ADM-08–12: anúncio, inscritos, usuários, configurações, auditoria | respectivas páginas e serviços existentes | permissões, exportação, campanha, filtros, logs | papéis verificados no servidor; mudanças reversíveis de CSS/UI |
| 6 Referências e fechamento | todos os fluxos em escopo | exportar telas nas dimensões 390/820/1280/1440; documentos 01–13 | lint, tipos, build, testes existentes, visual, zoom e foco | registrar pendência verificável sem fingir validação |

Cada fase conserva rollback por arquivo/fatia e exige atualização da matriz 02/03/11. Qualquer função nova que demande banco, API, permissão ou auditoria será fechada ponta a ponta antes de ser considerada implementada. O Studio está fora de todas as fases de código.
