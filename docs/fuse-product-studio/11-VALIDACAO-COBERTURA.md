# Validação e cobertura

Estado parcial em 22/09/2026. A documentação não é aceite final.

## Observação da produção após o commit `011607b`

- Workflow de produção `35798474885`: build e deploy na VPS concluídos com sucesso. A home respondeu HTTP 200 em 22/09/2026.
- Capturas reais da home e do login em 390, 820, 1280 e 1440 px: `validacao/producao-*-exact.png`. As imagens são evidência de duas rotas e do primeiro viewport, não de todas as jornadas.
- Home em 1280 px: `document.documentElement.scrollWidth` era 1500 px; em 1440 px, 1589 px. A navegação completa forçava overflow. O breakpoint do menu foi ajustado para recolhê-lo abaixo de 1600 px.
- Reteste publicado após `be76aaf` (workflow `35799575355`, sucesso): em 1280 px, `scrollWidth` 1265 px; em 1440 px, 1425 px. Em 390 px, 390 px; em 820 px, 805 px. A rolagem horizontal de documento foi eliminada nesses quatro viewports. Isso não substitui os testes de 320/360/430/1024/1366/1920, zoom e navegação por teclado.
- Home em 390 px não apresentou overflow (`scrollWidth` 390 px). O login também não apresentou overflow em 390/820 px e seu formulário estava visível.
- A imagem de destaque publicada foi carregada com sucesso pelo navegador, mas o próprio arquivo mostra um placeholder azul com pequenos glifos ilegíveis. É uma pendência de conteúdo/mídia da publicação atual, não um erro de rede nem autorização para substituir registros no CMS.
- Não houve acesso autenticado ao CMS nesta verificação; comportamento de gravação, papéis e estados internos permanece sem validação real.
- Smoke HTTP + browser em produção: artigo publicado, categoria Economia, tag Copom, autora Helena Braga, busca `selic`, vídeos, Sobre e Contato responderam 200; URL inexistente respondeu 404. Em 390 e 1280 px, cada rota exibiu `h1` específico e `scrollWidth` não excedeu o viewport. Isso verifica a renderização principal com dados existentes, não paginação, teclado, erros nem ações de escrita.
- A página 404 renderizou o estado de recuperação, mas herdava o título genérico. O título específico foi adicionado; o `noindex` já era emitido automaticamente pelo Next.js (confirmado no HTML gerado), sem duplicar a tag. Deploy e reteste pendentes.

Ambiente local: a API em `localhost:3001` não está em execução e não há `.env` em `portal/` ou `portal/apps/api/`. Não foi criado dado demonstrativo nem aplicada migração para simular integração. A inspeção de rotas dependentes de API e de sessão autenticada precisa de ambiente configurado.

| Área | Evidência concluída | Falta para aceite |
|---|---|---|
| Inventário | 11 superfícies públicas (9 páginas, 404 e erro), 17 rotas CMS, 7 rotas Studio; componentes e APIs cruzados | conferência visual de cada estado e rota |
| Portal público | nove tipos da home na ordem do CMS; slots reais de home/artigo/lateral/rodapé conectados; newsletter requer aceite explícito; erro global oferece retry; JSON-LD do artigo escapa marcação | campanha real/vazio, inscrição e responsividade em browser conectado à API |
| CMS | todas as rotas e componentes catalogados; shell, montagem da home, visão geral, editor/revisões e listas de publicações/vídeos/anúncios/mídia/categorias/tags/autores/newsletter/usuários/auditoria/configurações atualizados | redesign/implementação/validação por família em sessão autenticada |
| Studio | fluxos e oportunidades identificados | nenhuma alteração solicitada; entrevistas/volume são hipóteses futuras |
| Tipos/build | `pnpm --filter @makucho/web typecheck` e `pnpm --filter @makucho/web build` passaram após as últimas alterações de código, incluindo Configurações | repetir após novas alterações |
| Testes | API: 30 casos de conteúdo + 9 de storage + 6 de seleção/publicação + 5 de veiculação + 6 de permissão/agendamento; validação: 18 casos passaram, incluindo preservação de opções de redes sociais | integração HTTP com banco e sessão real |
| API | `@makucho/database build`, `@makucho/api typecheck`, `@makucho/api lint` e `@makucho/api build` passaram após as últimas alterações; seleção pública filtra rascunhos/agendados e preserva ordem; DTO de vídeo preserva `isPublished`; primeira publicação carimba data; autor não pode agendar publicação automática | testar HTTP com banco real |
| Imagens | mockup desktop original e 112 referências 390/820/1280/1440, índice em 13; amostras desktop/mobile inspecionadas | comparar a aplicação real em browser com o estudo, verificar cada estado |
| Lint | `pnpm --filter @makucho/web lint` sem alertas após as últimas alterações de código | repetir se houver novas alterações |
| Validação | 18 casos de `@makucho/validation` passaram | conferir CMS/API em sessão real |
| Browser | login real e estado de API indisponível capturados em 390/820/1280/1440 via viewport exato (`validacao/*-exact.png`); amostras mobile e notebook inspecionadas sem clipping | rotas com dados e CMS autenticado exigem API/sessão para verificação fiel |

## Matriz de aceite

- Público: carregar dados reais, estados vazios/erro, SEO/links, menu e busca por teclado, anúncio com campanha e sem campanha, newsletter com confirmação.
- Rodapé: `/sobre` e `/contato` usam os dados institucionais disponíveis. `/privacidade` e `/termos` requerem texto jurídico aprovado; links legados continuam apontando para rotas inexistentes.
- CMS: cada botão efetiva ação real, formulário mantém edição durante atualização, permissão por papel, confirmação/desfazer quando aplicável, erro recuperável.
- Viewports: 320/360/390/430/768/820/1024/1280/1366/1440/1920; alturas 600/720/768; zoom 200%, paisagem e teclado virtual.
- Performance: imagem com dimensão reservada e lazy quando fora da dobra; nenhum layout shift severo.
- Identidade: logo real, paleta, imagens corretas, tipografia legível e contraste WCAG 2.2 AA.

Não marcar “validado” com base apenas em checagem de tipos. Registrar resultado, viewport, reprodução e arquivo da captura em cada linha quando a verificação for executada.
