# Studio — fluxos e oportunidades, sem intervenção visual

Escopo: leitura de `studio/apps/web/src/app/`, `studio/apps/api/src/modules/`, workers, contratos e ADRs. Não há alteração em `studio/` nesta execução. “Observado” indica código lido; “hipótese” exige medição/entrevista.

| Fluxo | Caminho e estados observados | Atrito/oportunidade |
|---|---|---|
| STU-01 Entrada/projetos | `/entrar` → `/`; lista real da API, busca local, skeleton, criação, arquivamento otimista com rollback e retry de projeto `FAILED_RETRYABLE` | Observado: botão de notificações e botão de conta na lista não apresentam ação no trecho examinado. Dar destino real ou remover da jornada; preservar status e retry. |
| STU-02 Roteiro | `/roteiros`; blocos, estimativa de tempo, análise/sugestões e persistência via API | Hipótese: tornar explícito o estado salvo e a continuidade para gravar quando houver versão pronta, sem nova tela. Medir abandono entre roteiro e gravação. |
| STU-03 Gravar/importar | `/gravar`; câmera/teleprompter, upload por partes (`POST /uploads`, `PUT /chunks`, conclusão/cancelamento), workers de mídia/transcrição | Hipótese: retomada orientada por estado do upload e erro por etapa reduz reenvio. Não duplicar o retry já presente. Confirmar comportamento em celular com câmera negada/aba interrompida. |
| STU-04 Editor | `/editor`; palco, inspector, rail, timeline, IA/refino/legendas; contratos de EditPlan e origem semântica | Observado: original imutável e preview/render compartilham EditPlan. Oportunidade: evidenciar origem/timestamp e impacto antes de aceitar sugestões, mantendo reversão humana. |
| STU-05 Render | editor → `POST /projects/:id/render` → status → download; worker separado | Hipótese: status com prazo estimado e ação de retry contextual pode reduzir consultas repetidas. Não inventar prazo sem telemetria de fila. |
| STU-06 Marca/uso/ajuda | `/marca`, `/ajuda`, credencial e cota por workspace; assets próprios | Hipótese: alerta de cota antes de iniciar operação de IA, com caminho direto para configuração, reduz interrupção; checar acesso por papel e sigilo da credencial. |

## 3C e continuidade

Compreender: projeto informa estado e ação disponível. Concluir: roteiro, gravação, edição e render respeitam original, timestamps e plano validado. Confirmar: cada etapa precisa status, erro recuperável e próximo passo. Oportunidades só avançam depois de validar frequência, custo e regras; nenhum redesign visual foi produzido para o Studio por decisão explícita do usuário.
