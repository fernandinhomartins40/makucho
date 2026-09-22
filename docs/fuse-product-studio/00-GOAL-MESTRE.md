# Goal mestre — MAKUCHO

Estado: **em execução**. Fonte de verdade: este diretório. Data: 22/09/2026.

## Resultado

Modernizar o Portal público e o CMS com a direção da landing fornecida, preservando dados, regras, permissões e funções. Examinar o Studio somente em fluxos e oportunidades; nenhum arquivo de `studio/` deve ser alterado. Produzir referências responsivas em imagem para as superfícies do Portal e CMS.

## Fases e critérios de saída

| Fase | Estado | Escopo | Saída verificável |
|---|---|---|---|
| 1. Inspeção e inventário | concluída | rotas, componentes, API, Prisma, marca, alterações locais | arquivos 01–06; todas as rotas listadas |
| 2. Direção e responsividade | concluída como referência | anatomia, tokens, viewports, referências | arquivos 07–09/13; 112 imagens ilustrativas |
| 3. Home pública | em execução | nove seções do CMS, anúncio real, conteúdo real | tipos, build e inspeção visual |
| 4. Descoberta pública | em execução | busca, listagens, artigo, vídeos, estados | jornadas e viewports validados |
| 5. CMS editorial | em execução | shell, visão geral, listas, editor, montagem da home | funções e dados preservados; sem regressão |
| 6. CMS operacional | em execução | mídia, vídeo, taxonomia, anúncios, assinantes, usuários, configurações, auditoria | permissões, formulários, modais e respostas validados |
| 7. Fechamento | pendente | lint, tipos, build, testes e imagens finais | matriz 11 sem pendência em escopo |

## Decisões e limites

- A imagem desktop anexada define a direção aprovada para a landing; marca e fotografias oficiais estão em `MAKUCHO_Landing_Page_Complete_v1/`.
- Arquivos públicos modificados antes desta tarefa são trabalho preexistente. As edições desta execução preservam sua direção e conteúdo.
- Studio: diagnóstico e oportunidades, sem alteração visual ou de código.
- Uma função nova só é concluída quando interface, regra, API, persistência, autorização e teste aplicáveis estiverem conectados.
- A ordem operacional é a tabela acima; retomar pela primeira fase não concluída, atualizar evidências e seguir para a próxima fatia segura.

## Checkpoint

- Inspeção: Next.js 15, NestJS, Prisma/PostgreSQL, produtos separados no monorepo.
- Home: passou a renderizar os nove tipos de seção na ordem do CMS. Slot de anúncio consulta a API real; busca móvel e página de busca foram expostas. Newsletter agora exige aceite explícito antes de transmitir consentimento.
- CMS: seleção manual de post/vídeo e posição do anúncio foram ligadas aos campos persistidos; a leitura pública respeita a ordem editorial e exclui rascunhos/agendados. Painel diferencia falha de zero. Listas de publicações e vídeos distinguem erro de vazio, permitem retry e ignoram respostas antigas. Vídeos preservam `isPublished` ao editar; duração inválida é rejeitada antes do envio; primeira publicação recebe a data correta, e slug/visualização públicos respeitam agendamento. Shell ganhou responsividade e foco; modais agora contêm o Tab e devolvem foco ao gatilho.
- Institucional: `/sobre` e `/contato` usam configurações reais do CMS; sitemap inclui as duas rotas e `robots.txt` exclui `/painel`.
- Operação de anúncios: painel distingue falha de lista vazia, permite retry e valida destino, imagem, prioridade e período antes de salvar; o serviço aplica regras equivalentes mesmo em edição parcial e não serve campanha sem imagem. As posições de artigo, lateral e rodapé agora têm slots reais no Portal além da home.
- Mídia: biblioteca e seletor distinguem falha de lista vazia, permitem nova tentativa e descartam respostas antigas; exclusão informa corretamente a retenção temporária. A API expõe formatos e tamanho vigentes ao painel, e o interceptador usa o mesmo limite configurado; o seletor impede fechar ou trocar de aba durante o envio. O campo de arquivo é acessível por teclado e mostra foco.
- Taxonomia e autores: Categorias, Tags e Autores distinguem erro de lista vazia, preservam a lista anterior e permitem retry; a ordem das categorias volta ao estado anterior em falha e bloqueia novas movimentações durante a gravação. Modais não fecham durante salvamento.
- Newsletter administrativa: falhas nas métricas e na lista são visíveis e recuperáveis, sem transformar indisponibilidade em zero; a exportação não aninha controles interativos e a lista continua restrita a administradores.
- Usuários: a redefinição agora envia a senha temporária exigida pela API e só a exibe após confirmação de sucesso; a senha usa aleatoriedade criptográfica do navegador e não é persistida. A lista mostra ações somente para contas gerenciáveis pelo papel atual, protege edição do próprio papel/status, inicia novas contas no menor papel disponível e distingue falha de ausência de usuários.
- Auditoria: filtros recebem nomes acessíveis; falha de listagem não se apresenta como ausência de registros, com retry e proteção contra respostas atrasadas.
- Editor editorial: autosave e salvamento manual têm ordem serializada, falha automática visível, estado salvo com o `updatedAt` real e revisões com retry; restaurar revisão exige antes salvar mudanças locais. Autor envia para revisão, editor pode publicar ou agendar; a API impede agendamento por autor, porque a tarefa automática publica depois.
- Configurações: parâmetros e perfis sociais carregam de forma independente, com falhas e retry próprios; salvar parâmetros atualiza a referência apenas dos valores enviados, sem recarregar nem apagar edições feitas durante a requisição. Criar/editar/excluir rede não reabre o formulário de parâmetros nem descarta mudanças não salvas. A edição de rede não repõe implicitamente visibilidade, atividade ou ordem; o formulário impede plataforma duplicada.
- Descoberta pública: Vídeos e categorias não confundem falha de API com ausência de conteúdo ou 404; paginação descarta números inválidos e listas além do fim oferecem volta à primeira página. Vídeo sem thumbnail usa tratamento visual em CSS e plataforma `OTHER` não recebe marca YouTube indevidamente.
- Referências: 28 superfícies × 4 viewports = 112 PNG em `referencias/`, indexados em 13.
- Pendente: verificação visual da aplicação conectada e regressão completas, restante da modernização. Não declarar conclusão global antes disso.
