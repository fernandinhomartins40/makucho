# Auditoria UX/UI

| Severidade | Superfície | Evidência observada | Impacto e critério de correção |
|---|---|---|---|
| Alto | Home pública × CMS | a versão local da landing selecionava só HERO/LATEST/VIDEOS/CATEGORIES/NEWSLETTER/AD e ignorava posição | editor altera seção sem refletir no site; renderizar nove tipos na ordem do banco |
| Alto | Slot publicitário | bloco fixo dizia “parceiro” sem campanha | publicidade falsa; exibir criativo real ou nenhum bloco |
| Alto | CMS home | UI promete seleção manual mas modal só edita tipo, título, subtítulo e limite | HERO/CUSTOM_POSTS precisam escolha de posts e VIDEOS de vídeos, com confirmação |
| Alto | Painel geral | cinco chamadas independentes convertem erro em zero | zero parece dado real; comunicar indisponibilidade e permitir tentar de novo |
| Alto | Rodapé público | `Rodape` apontava para quatro rotas ausentes; `/sobre` e `/contato` agora usam configurações do site | `/privacidade` e `/termos` ainda levam a 404; texto jurídico precisa fonte aprovada antes de publicação |
| Alto | Editor de post | muitos campos, revisão e mídia numa página extensa | orientar estágio, ação principal e estado salvo; preservar autosave e contexto |
| Médio | Navegação pública móvel | menu recém-adicionado, busca oculta em largura menor | corrigido com formulário no menu móvel e busca dedicada; validar em browser |
| Médio | CMS móvel | menu lateral vira overlay; botão e foco não integram `aria-controls`/Escape | foco e fechamento previsíveis, sem cobrir edição |
| Médio | Tabelas CMS | rolagem horizontal (`pn-tabela-area`) em telas estreitas | priorizar colunas/ação, conservar comparação e títulos |
| Médio | Modais CMS | foco inicial existia, mas não havia ciclo de foco/retorno ao gatilho | corrigido no `Modal` compartilhado; validar teclado em sessão real |
| Médio | Ações destrutivas | confirmação existe, mas mensagens/recuperação variam por tela | identificar item e consequência, notificar resultado |
| Médio | Newsletter | o envio usava `consent: true` sem aceite explícito | corrigido: checkbox obrigatório informa finalidade e cancelamento; validar integração real |
| Refinamento | Visual do CMS | superfícies, sombras e cartões repetidos sem hierarquia de decisão | usar densidade editorial e agrupamentos funcionais, não card para toda ação |

## Análise por família

- Descoberta pública: hero e cards seguem a composição do mockup; listagens e busca precisam manter filtros e contexto. Artigo precisa medida de leitura, metadados e mídia com `alt` real.
- Segurança e recuperação do artigo: o JSON-LD agora escapa `<` antes de entrar em `<script>`, impedindo que texto editorial forme marcação executável nesse ponto. Metadados distinguem 404 real de falha temporária da API e não indexam o estado de erro.
- CMS produção: publicações, editor, mídia e vídeos compartilham `MolduraPainel`, `Botao`, campos e feedback, mas cada fluxo requer ações e estados próprios.
- CMS operação: home, anúncios, newsletter, usuários, configurações e auditoria precisam esclarecer causa de erro, papel e resultado persistido.
- Studio: projetos → roteiro/gravação → edição/render é um fluxo contínuo. Oportunidades em 06; nenhuma recomendação visual implica alteração do Studio.

Separação de evidência: os problemas de renderização da home e APIs são observados no código; volume operacional, perfil de audiência e frequência de falhas são hipóteses para validação.
