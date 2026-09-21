# Progresso da implementação — MAKUCHO Studio

> Estado real, conferido contra `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`.
> Uma fase só é marcada concluída quando o critério de aceite do plano está
> verificado, não quando o código existe.
> Atualizado em 2026-09-21.

## Panorama

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Fundação e contratos | **concluída** |
| 1 | Plataforma base | **concluída**, menos CRUD de projetos |
| 2 | Brand e Communication Studio | API parcial; **tela pronta, desligada** |
| 3 | Script e Record Studio | API parcial; **tela pronta, desligada** |
| 4 | Ingestão e transcrição | contratos + núcleo dos workers; **fila não roda** |
| 5 | Inteligência editorial | pendente |
| 6 | Preview e composição | timeline antecipada (ADR 0008); resto pendente |
| 7 | Render e entrega | pendente |
| 8 | Hardening e piloto | pendente |

Em produção: `studio.makucho.com.br` responde 200 com SSL próprio, API e
banco conectados.

---

## Onde realmente paramos

O redesign inverteu a natureza do trabalho pendente. Antes faltava tela;
agora **a tela existe inteira e o que falta é o que fica atrás dela**.

Sete rotas no ar: `/`, `/roteiros`, `/gravar`, `/editor`, `/marca`, `/ajuda` e
a página 404. Todas seguem o guia de UX/UI e as referências.

O que isso significa em termos de risco: o produto *parece* pronto e não
está. Quem abrir hoje vê projetos que não existem, edita um EditPlan que não
é salvo e clica em "Exportar vídeo" sem render por trás. Essa distância entre
aparência e função é a dívida principal deste momento — e é maior do que era
antes do redesign, não menor.

---

## Fase 0 — Fundação e decisões — CONCLUÍDA

Critério do plano: *contratos compilam, migrations sobem em ambiente limpo e o
pipeline de CI passa.*

| Entregável | Estado | Onde |
|---|---|---|
| Repositório, convenções e CI | feito | dois workflows, build e deploy separados |
| ADRs | feito | `docs/adr/0001` a `0009` |
| Modelo de dados | feito | `packages/database/prisma/schema.prisma`, 23 tabelas |
| Estados de projeto/job | feito | `contracts/src/vocabulary.ts` |
| Schema `EditPlan` | feito | `contracts/src/edit-plan.ts` |
| Schema da proposta de IA | feito | `contracts/src/ai-proposal.ts` |
| Contratos de eventos | feito | `contracts/src/events.ts` |
| Diagrama de arquitetura | **pendente** | — |
| Threat model | **pendente** | — |
| Fixtures de mídia | **pendente** | precisa de vídeo autorizado do cliente |

**Verificado:** 280 testes nos contratos, incluindo as pegadinhas semânticas
da seção 18.5 (negação, enumeração, pronome órfão, dependência fora de ordem)
e as operações de timeline.

---

## Fase 1 — Plataforma base — CONCLUÍDA

Critério do plano: *dois usuários de workspaces distintos não acessam dados ou
arquivos um do outro.*

| Entregável | Estado | Onde |
|---|---|---|
| Autenticação | feito | JWT access+refresh, cookie httpOnly |
| Workspace e isolamento | feito | `api/src/common/tenant.ts` |
| Layout | feito | desktop-first (ADR 0009), sete rotas |
| PostgreSQL | feito | banco `makucho_studio` (ADR 0004) |
| Redis | feito | container próprio, fila BullMQ declarada |
| Object storage | **pendente** | volume existe; upload entra na Fase 4 |
| CRUD de projetos | **pendente** | **bloqueia a tela de Projetos** |
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

## A dívida do redesign

Cada tela abaixo está desenhada e navegável. A coluna da direita é o que
falta para deixar de ser demonstração.

| Tela | O que já funciona de verdade | O que é demonstração |
|---|---|---|
| `/` Projetos | busca filtra a lista; navegação | `PROJETOS` é constante no arquivo — **falta `GET /projects`** |
| `/roteiros` | blocos editáveis, duplicar, remover, reclassificar; contagem de palavras e duração a 150 ppm; checklist com 4 critérios verificáveis | não persiste — **falta ligar em `POST/PATCH /scripts`, que já existe**; "Gerar com IA" é da Fase 5 |
| `/gravar` | câmera e microfone reais, teleprompter navegável, tratamento de permissão negada e dispositivo ausente | **não grava**: falta `MediaRecorder` e o upload |
| `/editor` | 9 operações de timeline validadas pelo contrato; desfazer/refazer; seleção, corte, divisão, duplicação | `PLANO_DEMO` é constante — **falta carregar e salvar EditPlan**; sem proxy, o preview é uma caixa preta |
| `/marca` | preview reage a cor, fonte e estilo na hora | não persiste — **falta ligar em `brand-profile`, que já existe** |
| `/ajuda` | conteúdo estático, correto | — |

### O que não existe por trás

Três módulos da API que o novo frontend pressupõe e que não foram escritos:

- **`projects`** — a tela inicial inteira depende dele. É o menor e o mais
  urgente: sem projeto não há onde pendurar mídia, roteiro nem EditPlan;
- **`media`** — sessão de upload, proxy, thumbnail. Sem ele `/gravar` não tem
  para onde enviar e `/editor` não tem o que mostrar;
- **`edit-plans`** — carregar e salvar o plano com versionamento. As operações
  já existem e são validadas; falta só a persistência.

Os workers também não rodam: `@makucho/studio-worker-core` tem o lock global,
o diretório temporário e os wrappers de FFmpeg, todos testados, mas **nenhum
processo consome a fila**. É biblioteca sem aplicação.

---

## Fase 2 — Brand e Communication Studio — API PARCIAL

Critério do plano: *perfil versionado é aplicado a um projeto sem expor assets
de outro workspace.*

| Entregável | Estado |
|---|---|
| Perfil visual (cores, fontes) | API existe (`brand-profile`), **tela não usa** |
| Estilos de captions | API existe (`:id/caption-styles`), **tela não usa** |
| Perfil de comunicação | API existe (`communication-profile`) |
| Cadastro e validação de assets | pendente — o logo e a trilha não sobem |
| Músicas, intros, outros e CTA | pendente |
| Presets iniciais | pendente |

O trabalho aqui é de ligação, não de construção: a API e a tela existem e não
se falam.

---

## Fase 3 — Script e Record Studio — API PARCIAL

| Entregável | Estado |
|---|---|
| CRUD de roteiros | API existe (`scripts`), **tela não usa** |
| Blocos com função narrativa | feito nos dois lados, desconectados |
| Teleprompter | feito, com câmera e microfone reais |
| **Gravação** | **pendente** — o botão Gravar não grava |
| Geração assistida | Fase 5 |

A gravação é a lacuna mais visível: a tela verifica os dispositivos, mostra o
preview, conta o tempo e **não produz arquivo**.

---

## Fase 4 — Ingestão e transcrição — NÚCLEO PRONTO, FILA PARADA

| Entregável | Estado |
|---|---|
| Contratos (upload, proxy, silêncios, transcrição) | feito |
| Lock global de job pesado | feito — 18 testes |
| Temporários com limpeza garantida | feito — 21 testes |
| FFmpeg: proxy, áudio, thumbnail, silêncios | feito — 13 testes |
| **Worker de mídia (consumidor da fila)** | **pendente** |
| **Worker de transcrição (faster-whisper)** | **pendente** |
| **Upload resumível e sessão autorizada** | **pendente** |

O núcleo traz as duas contenções que o ADR 0003 exige para processar vídeo
numa VPS compartilhada: o lock que serializa jobs pesados e o diretório
temporário que se limpa sozinho. Falta o processo que os usa.

---

## Fase 6 — antecipada em parte

A timeline veio antes (ADR 0008) e está no ar. Nove operações validadas:
mover, ajustar corte, alternar, **dividir**, **duplicar**, reordenar, editar
legenda, trocar estilo e trocar música.

As duas últimas (dividir e duplicar) nasceram do redesign: a referência
mostrava os botões, então o contrato ganhou as operações com as regras que
faltavam — divisão recusada a menos de meio segundo da borda, porque o
fragmento não daria para ouvir nem selecionar.

O que falta da fase: player com proxy real, captions renderizadas, componentes
Remotion e o versionamento do EditPlan.

---

## Fases 5, 7 e 8 — pendentes

Sem alteração de escopo. A Fase 5 depende da chave de IA, que o painel já
cadastra e cifra.

---

## Pendências que não são de fase

| Item | Impacto |
|---|---|
| ~~Storage: disco vs. R2~~ | **decidido**: disco da VPS, 10 GB em dois baldes (4 permanente + 6 edição), com retenção e aviso antes de remover |
| ~~Chave da API de IA~~ | **decidido**: cadastrada pelo painel, cifrada em AES-256-GCM, uma por workspace |
| Fixtures de mídia | os golden tests da seção 18.4 dependem de vídeo autorizado |
| **Credenciais expostas no chat** | token do GitHub, senha da VPS e duas chaves SSH temporárias **precisam ser revogados** |

---

## Ordem sugerida a partir daqui

A sequência abaixo não é o plano reordenado por gosto: é a ordem em que cada
peça destrava a seguinte, e cada passo deixa algo **verificável pelo cliente**
em vez de código à espera de integração.

1. **`projects` (CRUD)** — destrava a tela inicial e dá onde pendurar tudo.
   É o menor dos três módulos e o que mais muda a percepção: a home deixa de
   mentir.
2. **Ligar `/roteiros` e `/marca` às APIs que já existem** — trabalho de
   ligação, sem construção nova. Duas telas deixam de ser demonstração.
3. **Gravação + upload** (`MediaRecorder`, sessão de upload, `media`) —
   fecha o caminho da câmera até o disco.
4. **Worker de mídia consumindo a fila** — proxy, thumbnail e silêncios.
   A partir daqui o `/editor` tem vídeo de verdade para mostrar.
5. **Worker de transcrição** — sem transcrição não há origem verificável para
   os cortes, e a integridade editorial depende disso.
6. **`edit-plans` com versionamento** — as operações já existem e são
   validadas; falta persistir.
7. **Fase 5 (IA)** — só aqui, porque ela consome transcrição e devolve um
   EditPlan: os dois precisam existir antes.
8. **Fases 7 e 8.**

Os passos 1 e 2 somados custam menos que qualquer um dos demais e removem a
maior parte da distância entre o que a tela mostra e o que o produto faz.
