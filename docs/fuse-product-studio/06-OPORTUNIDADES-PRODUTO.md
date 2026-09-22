# Radar de oportunidades

Cada decisão considera trabalho real, frequência ainda não medida, custo, fallback e risco. “Plano” não autoriza criar uma função incompleta.

| ID/área | Sinal e público | Solução 3C; dados e regra | Frontend/backend/segurança/falha | Métrica; decisão |
|---|---|---|---|---|
| O-01 Home | editor ordena nove seções; site ocultava quatro | refletir ordem e todos os tipos do CMS; confirmação pela home | render Next dos DTOs; API/Prisma já existem; seção vazia não quebra layout | correspondência CMS/site; IMPLEMENTADO, validação conectada pendente |
| O-02 Anúncio | slot mostrava parceria inexistente | servir campanha elegível, registrar impressão e clique; vazio não aparece | `ads/serve`, `events`, redirect; sem imagem ou período válido não há campanha ativa; falha silenciosa para visitante | impressões verificáveis; IMPLEMENTADO, validação conectada pendente |
| O-03 Montagem da home | editor precisa escolher conteúdo manual | seleção de post/vídeo com busca e ordem de escolha; salvar `postIds/videoIds` | modal + endpoints existentes; permissão EDITOR; erro mantém edição | tempo para montar seção; IMPLEMENTADO, validação em sessão pendente |
| O-04 Publicações | revisão e status exigem abrir itens individualmente | filtros salvos e fila de revisão; lote apenas para ação reversível e mesmo status | UI de seleção, API transacional/idempotente, auditoria por item; falha parcial legível | tempo por sessão; EXPERIMENTO após medir volume |
| O-05 Mídia | múltiplos arquivos, alt e recorte repetidos | upload múltiplo com progresso individual e correção de metadados | pipeline atual, limites por arquivo, retry seguro, desfazer exclusão; privacidade | tempo por lote; INCLUIR NO PLANO |
| O-06 Busca | termos curtos/sem resultado | sugestões existentes, recentes locais e correção de termo com GET como fallback | `search/suggestions`; sem persistir dado sensível no navegador | taxa de busca útil; INCLUIR NO PLANO |
| O-07 Painel | erros de contagem viram zero | estado “indisponível”, retry e última leitura identificada | front consome endpoints atuais; sem inventar número | erro percebido vs dado falso; IMPLEMENTAR AGORA |
| O-08 Newsletter | assinatura e exportação têm riscos distintos | aceite explícito na inscrição; acesso e escopo do export restritos | checkbox ligado ao `consent` enviado à API; trilha de export e limites de acesso ainda a validar | reclamações/descadastro; PARCIAL |
| O-09 Studio gravação | câmera/upload, transcrição e render têm espera | checkpoint de etapa, fila e retomada explícita | contratos/jobs existentes; não tocar neste ciclo; fallback manual | abandono por etapa; EXPERIMENTO |
| O-10 Studio roteiro/editor | IA sugere mudanças sem inventar fala | mostrar origem/timestamps e impacto antes de aplicar; controle humano | EditPlan versionado e segurança semântica; não alterar neste ciclo | reversões e cortes rejeitados; INCLUIR NO PLANO FUTURO |
| O-11 Studio marca/cota | configuração pode interromper edição | alerta antecipado de cota/credencial com ação contextual | dados de uso existentes; não tocar neste ciclo | tarefas interrompidas; EXPERIMENTO |

Descartado por ora: criação automática de conteúdo financeiro, publicação em lote sem revisão e automação de render sem aprovação humana. Risco de erro editorial e semântico desproporcional. As oportunidades do Studio são hipóteses, não pedidos de implementação.
