# Progresso da implementação — MAKUCHO Studio

> Estado real, conferido contra `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`.
> Uma fase só é marcada concluída quando o critério de aceite do plano está
> verificado, não quando o código existe.
> Atualizado em 2026-09-20.

## Panorama

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Fundação e contratos | **concluída** |
| 1 | Plataforma base | **concluída** |
| 2 | Brand e Communication Studio | **contratos e API** |
| 3 | Script e Record Studio | **contratos, API e teleprompter** |
| 4 | Ingestão e transcrição | **contratos + núcleo dos workers**; falta ligar a fila |
| 5 | Inteligência editorial | pendente |
| 6 | Preview e composição | pendente |
| 7 | Render e entrega | pendente |
| 8 | Hardening e piloto | pendente |

Em produção: `studio.makucho.com.br` responde 200 com SSL próprio, API e
banco conectados.

---

## Fase 0 — Fundação e decisões — CONCLUÍDA

Critério do plano: *contratos compilam, migrations sobem em ambiente limpo e o
pipeline de CI passa.*

| Entregável | Estado | Onde |
|---|---|---|
| Repositório, convenções e CI | feito | dois workflows com build e deploy separados |
| ADRs iniciais | feito | `docs/adr/0001` a `0006` |
| Modelo de dados | feito | `studio/packages/database/prisma/schema.prisma`, 21 tabelas |
| Estados de projeto/job | feito | `contracts/src/vocabulary.ts` |
| Schema `EditPlan` | feito | `contracts/src/edit-plan.ts` |
| Schema da proposta de IA | feito | `contracts/src/ai-proposal.ts` |
| Contratos de eventos | feito | `contracts/src/events.ts` |
| Diagrama de arquitetura | **pendente** | — |
| Threat model | **pendente** | — |
| Fixtures de mídia | **pendente** | precisa de vídeo autorizado do cliente |

**Verificado:** 34 testes nos contratos, incluindo as pegadinhas semânticas da
seção 18.5 (negação, enumeração, pronome órfão, dependência fora de ordem).
Migration inicial aplicada em banco limpo na VPS.

---

## Fase 1 — Plataforma base — CONCLUÍDA

Critério do plano: *dois usuários de workspaces distintos não acessam dados ou
arquivos um do outro.*

| Entregável | Estado | Onde |
|---|---|---|
| Autenticação | feito | JWT access+refresh, cookie httpOnly |
| Workspace e isolamento | feito | `api/src/common/tenant.ts` |
| Layout mobile-first | parcial | estrutura PWA; telas do produto nas fases seguintes |
| PostgreSQL | feito | banco `makucho_studio` (ADR 0004) |
| Redis | feito | container próprio, fila BullMQ |
| Object storage | **pendente** | volume de disco existe; upload entra na Fase 4 |
| CRUD de projetos | **pendente** | Fase 4 |
| URLs de upload | **pendente** | Fase 4 |
| Observabilidade mínima | parcial | logs do Nest; métricas pendentes |

**Verificado:** 13 testes de isolamento, incluindo a tentativa de sobrescrever
o `workspaceId` pelo corpo da requisição — o valor vem sempre do token.

Decisões de segurança que valem registrar:

- guard global: rota só fica pública com `@Public()` explícito, então esquecer
  de proteger deixa de ser possível;
- papel relido do banco no refresh, não aceito do token: quem foi rebaixado a
  VIEWER para de escrever na hora;
- recurso de outro workspace responde 404, não 403 — 403 confirmaria a
  existência e permitiria mapear IDs por tentativa e erro.

---

## Fase 2 — Brand e Communication Studio — EM CONSTRUÇÃO

Critério do plano: *perfil versionado é aplicado a um projeto sem expor assets
de outro workspace.*

| Entregável | Estado |
|---|---|
| Perfil de comunicação | em construção |
| Perfil visual (cores, fontes) | em construção |
| Estilos de captions | em construção |
| Cadastro e validação de assets | pendente |
| Músicas, intros, outros e CTA | pendente |
| Presets iniciais | pendente |

As tabelas já existem no schema (`brand_profiles`, `caption_styles`, `assets`,
`communication_profiles`); falta a API e a validação.

---

## Fase 4 — Ingestão e transcrição — EM CONSTRUÇÃO

| Entregável | Estado |
|---|---|
| Contratos (upload, proxy, silêncios, transcrição) | feito — 32 testes |
| Lock global de job pesado | feito — 18 testes |
| Temporários com limpeza garantida | feito — 21 testes |
| FFmpeg: proxy, áudio, thumbnail, silêncios | feito — 13 testes |
| Worker de mídia (consumidor da fila) | pendente |
| Worker de transcrição (faster-whisper) | pendente |
| Upload resumível e sessão autorizada | pendente |

O núcleo (`@makucho/studio-worker-core`) traz as duas contenções que o ADR
0003 exige para processar vídeo numa VPS compartilhada: o lock que serializa
jobs pesados e o diretório temporário que se limpa sozinho.

## Fases 5 a 8 — pendentes

A 6 ganhou a timeline antecipada (ADR 0008), já pronta e no ar em
`/editor`.

---

## Pendências que não são de fase

| Item | Impacto |
|---|---|
| ~~Storage: disco vs. R2~~ | **decidido**: disco da VPS, 10 GB em dois baldes (4 GB permanente + 6 GB edição), com retenção e aviso antes de remover |
| Fixtures de mídia | os golden tests da seção 18.4 dependem de vídeo autorizado |
| ~~Chave da API de IA~~ | **decidido**: cadastrada pelo painel e cifrada em AES-256-GCM, uma por workspace |
| Threat model | previsto na Fase 0 |
| Métricas e alertas | seção 16 do plano |

---

## Ajustes ao plano, já registrados como ADR

O plano é a fonte de verdade sobre **o que** o produto faz; os ADRs
sobrescrevem **com que ferramenta**, quando divergem.

- **ADR 0002** — NestJS + Prisma no lugar de Fastify + Drizzle, para alinhar
  com o portal no mesmo monorepo.
- **ADR 0003** — processamento na VPS compartilhada. A medição de 2026-09-20
  mudou o quadro: a máquina atual tem 4 vCPU, 15 GB e steal de 0,2%, contra os
  2 vCPU e 90,6% de steal da anterior. É a configuração que a seção 17.1 do
  plano recomenda.
- **ADR 0004** — banco separado na instância Postgres do portal.


---

## Armazenamento — decisão de 2026-09-20

10 GB no disco da VPS, em dois baldes com regras distintas.

| Balde | Cota | Conteúdo | Expira? |
|---|---|---|---|
| Permanente | 4 GB | logo, fonte, música, intro, outro | não |
| Edição | 6 GB | original, proxy, áudio, render | sim |

Os baldes são separados porque misturar faria um upload de vídeo de 500 MB
apagar a trilha sonora da marca para caber.

**No balde permanente** nada é apagado automaticamente: o sistema não escolhe
qual material do cliente descartar. Ao encher, o upload é recusado com
explicação.

**No balde de edição** o espaço não acaba — os arquivos mais antigos cedem
lugar aos novos. O aviso começa em 75%, antes de qualquer perda, e diz o que
fazer: baixar ou fixar. Arquivo fixado nunca cede lugar.

Retenção por tempo: original e proxy 30 dias, render 60, derivados 15. Três
avisos (7, 3 e 1 dia), porque quem abre o app uma vez por semana perderia um
aviso único.

## Credencial de IA — decisão de 2026-09-20

Cadastrada no painel, não por variável de ambiente: cada workspace usa a
própria conta e o próprio crédito.

Guardada com AES-256-GCM. Em texto puro, um dump de banco — backup, log de
erro, acesso indevido — entregaria a chave de faturamento do cliente. A rota
devolve apenas o prefixo (`sk-ab…9f12`), o bastante para reconhecer qual está
ativa. Só OWNER pode trocá-la: chave de API é custo.
