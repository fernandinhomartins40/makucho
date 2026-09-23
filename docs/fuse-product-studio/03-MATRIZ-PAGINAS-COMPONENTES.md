# Páginas × componentes × estados × viewport

Todas as rotas foram encontradas cruzando `page.tsx`, imports, menu, controladores, Prisma e documentação. `C/T/N/D` = compacto/tablet/notebook/desktop. A = auditado; R/I/V = redesenhado/implementado/validado. `?` = inspeção visual pendente. Nenhum item similar foi removido do índice.

| Rota | Componentes próprios ou compartilhados | Estados prioritários | C/T/N/D | Estado |
|---|---|---|---|---|
| `/` | cabeçalho, radar, hero, cards, vídeo, temas, anúncio, newsletter, rodapé | vazio/API/sem campanha | normal/normal/sem overflow após deploy/sem overflow após deploy | A R I V parcial; mídia de destaque e demais estados pendentes |
| `/artigo/[slug]` | moldura, mídia, leitura, contador, relacionados, slots de artigo/lateral | 404/mídia ausente/longform/sem campanha | normal/?/normal/? | A R I V parcial (publicado) |
| `/autor/[slug]` | moldura, listagem, paginação | vazio/404 | normal/?/normal/? | A R I V parcial (Helena Braga) |
| `/categoria/[slug]` | moldura, listagem, paginação | vazio/404 | normal/?/normal/? | A R I V parcial (Economia) |
| `/tag/[slug]` | moldura, listagem, paginação | vazio/404 | normal/?/normal/? | A R I V parcial (Copom) |
| `/busca` | moldura, entrada, resultados, paginação | termo curto/vazio/erro | normal/?/normal/? | A R I V parcial (`selic`) |
| `/videos` | moldura, grade, links externos, paginação | vazio/erro | normal/?/normal/? | A R I V parcial |
| `/sobre` | moldura, conteúdo institucional, CTA | settings ausentes/erro | normal/?/normal/? | A R I V parcial |
| `/contato` | moldura, e-mail configurado, CTA | e-mail ausente/erro | normal/?/normal/? | A R I V parcial |
| 404 | moldura/retorno | endereço inválido/recuperação | normal/?/normal/? | A R I V parcial; título/noindex publicados e retestados |
| erro | retry global/retorno | falha de API/recuperação | ?/?/?/? | A R I parcial |
| `/painel/entrar` | login, campos, aviso | envio/erro/sessão ativa | V/V/V/V (normal) | A R I V parcial; captura de produção 390/820/1280/1440 |
| `/painel/senha` | moldura, formulário | obrigatório/erro/sucesso | ?/?/?/? | A |
| `/painel` | moldura, métricas, lista | carga/vazio/falha parcial | ?/?/?/? | A R I parcial |
| `/painel/publicacoes` | filtros, tabela/lista, status, confirmação | vazio/busca/erro/retry | ?/?/?/? | A R I parcial |
| `/painel/publicacoes/nova` | formulário, editor, mídia | autosave/erro/rascunho | ?/?/?/? | A R I parcial |
| `/painel/publicacoes/[id]` | formulário, editor, revisões, status | concorrência/erro/confirmação | ?/?/?/? | A R I parcial |
| `/painel/midia` | grade, upload, detalhe, recorte, modal | progresso/erro/sem mídia | ?/?/?/? | A R I parcial |
| `/painel/videos` | filtros, tabela, modal | vazio/erro/retry/rascunho | ?/?/?/? | A R I parcial |
| `/painel/categorias` | lista, ordem, modal | vazio/erro | ?/?/?/? | A R I parcial |
| `/painel/tags` | busca, lista, modal | vazio/erro | ?/?/?/? | A R I parcial |
| `/painel/autores` | lista, modal, mídia | vazio/erro | ?/?/?/? | A R I parcial |
| `/painel/home` | lista, ordem, visibilidade, modal | vazio/erro/salvando | ?/?/?/? | A I parcial |
| `/painel/anuncios` | filtros, tabela, formulário, modal | período/alvo/erro/retry | ?/?/?/? | A R I parcial |
| `/painel/newsletter` | resumo, lista, export | restrição/vazio/erro | ?/?/?/? | A R I parcial |
| `/painel/usuarios` | tabela, papel, reset, modal | sem permissão/erro | ?/?/?/? | A R I parcial |
| `/painel/configuracoes` | grupos, campos, redes, modal | sem permissão/erro | ?/?/?/? | A R I parcial |
| `/painel/auditoria` | filtros, tabela, paginação | vazio/erro | ?/?/?/? | A R I parcial |

## Índice de componentes globais

Público: `Cabecalho`, `Ticker`, `Moldura`, `Rodape`, `CardArtigo`, `Listagem`, `Newsletter`, `ContadorLeitura`, `AnuncioSlot`, ícones. CMS: `MolduraPainel`, `TituloPagina`, `Sessao`, `Botao`, `Campo`, `Entrada`, `AreaTexto`, `Selecao`, `Alternador`, `Aviso`, `Etiqueta`, `SeloStatus`, `Modal`, `Confirmacao`, `Vazio`, `Carregando`, `Paginacao`, `useRecado`, `FormularioPost`, `Editor`, `SeletorMidia`. Cada um herda os estados da rota onde aparece; verificar foco, loading, erro, disabled e toque. Studio: shell, gravação, roteiros, editor, timeline e painéis internos inventariados em 01; somente diagnóstico.
