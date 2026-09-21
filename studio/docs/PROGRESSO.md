# Progresso da implementação — MAKUCHO Studio

> Estado real, conferido contra `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`.
> Uma fase só é marcada concluída quando o critério de aceite do plano está
> verificado, não quando o código existe.
> Atualizado em 2026-09-21 (terceira revisão: Fase 4 fechada).

## Panorama

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Fundação e contratos | **concluída** |
| 1 | Plataforma base | **concluída** |
| 2 | Brand e Communication Studio | tela ligada; falta upload de assets |
| 3 | Script e Record Studio | **concluída** |
| 4 | Ingestão e transcrição | **concluída** — pipeline fecha da câmera à transcrição |
| 4a | Entrada de vídeo | **concluída** (ADR 0010) |
| 5a | IA: adapter e travas de custo | pendente — **próximo passo** |
| 5b | IA: seleção de trechos e risco | pendente |
| 5c | IA: roteiro e sugestões | pendente |
| 5d | IA: candidatos e refino | pendente |
| 6 | Preview e composição | timeline antecipada (ADR 0008); resto pendente |
| 7 | Render e entrega | pendente |
| 8 | Hardening e piloto | pendente |

Em produção: `studio.makucho.com.br` responde 200 com SSL próprio, API e
banco conectados.

---

## Onde realmente paramos

O caminho da câmera até a transcrição está fechado. Um vídeo entra — gravado
ou enviado —, vira proxy, thumbnail e áudio, é transcrito com timestamps por
palavra, e o projeto chega a `ANALYZING` com os silêncios já marcados como
regiões. O editor abre esse projeto, toca o proxy e salva cada ajuste como
uma versão no banco.

O que ainda **não** funciona, sem rodeio:

- **IA**: as seis chamadas da seção 26 não existem. O painel "Seleção da IA"
  mostra o exemplo do plano, não uma proposta real. É por isso que o projeto
  para em `ANALYZING`: o estado está certo, só não há quem analise;
- **render**: "Exportar vídeo" não gera arquivo. É a Fase 7 inteira;
- **upload de logo e trilha**: os botões em Marca são a interface, sem o
  `assets` por trás.

A partir daqui, o que falta é inteligência e saída — a entrada e o preparo do
material estão prontos.

---

## O que mudou nesta revisão

### Um travamento que não aparecia em teste nenhum

`FilaService.transcrever()` existia, estava correto e **ninguém o chamava**.
O worker de mídia terminava o trabalho, marcava o projeto como `TRANSCRIBING`
e parava ali. Não havia produtor para a fila de transcrição, e
`workers/transcription/` era um diretório vazio.

O efeito: **todo vídeo enviado ficava preso em "Transcrevendo" para sempre.**
A máquina de estados não tem saída desse ponto sem o worker, e o estado dizia
que a transcrição havia começado quando nada a tinha pedido.

Não aparecia em build, typecheck nem teste — só num vídeo real passando pelo
pipeline, que era justamente o caminho ainda não exercitado na VPS. É o mesmo
tipo de falha que motivou mover os nomes de fila para o contrato: **um
produtor ausente é indistinguível de um consumidor lento.**

### Worker de transcrição

`workers/transcription`, com faster-whisper `small` int8 em CPU. O modelo roda
em processo Python separado, e não por binding: ele carrega centenas de MB e
ocasionalmente morre por falta de memória. Num processo filho isso é um código
de saída que vira falha de job; no mesmo processo, derrubaria a fila inteira.

Decisões que valem registrar:

- **VAD ligado.** Sem ele o whisper alucina texto em trechos mudos — e
  alucinação aqui viraria fala que a pessoa nunca disse, exatamente o que o
  produto promete não fazer;
- **idioma fixo em `pt`.** A detecção automática ocasionalmente devolve
  espanhol num áudio curto de português, e transcrição no idioma errado não é
  recuperável por edição;
- **`condition_on_previous_text` desligado.** Com ele ligado, quando o modelo
  repete uma frase, ele se prende ao próprio erro e repete até o fim;
- **stdout só do JSON, log em stderr.** O faster-whisper escreve avisos por
  conta própria; um aviso no meio do stdout quebraria o parse;
- **código 3 para áudio sem fala.** É um caso real — microfone errado,
  gravação muda — e merece mensagem própria, não um erro de validação do Zod.

A saída passa pelo `transcriptionResultSchema` antes de tocar o banco. Não é
cerimônia: o que vem do modelo é dado externo, e um segmento com `endMs` menor
que `startMs` viraria clipe de duração negativa na timeline três telas adiante.

Os silêncios que o worker de mídia deixou em `silencios.json` viram
`DetectedRegion` agora, porque só neste ponto existe a `Transcription` de que
eles dependem.

### "Tentar de novo" deixou de ser uma frase

O estado `FAILED_RETRYABLE` mostra "Falhou — dá para tentar de novo" desde o
redesenho, e **não existia rota de retentativa**. O usuário lia a promessa e
não tinha botão.

`POST /projects/:id/retry` recomeça da etapa mais adiantada que já tem insumo
pronto: se o áudio foi extraído, a falha foi da transcrição, e refazer proxy e
thumbnail gastaria minutos de FFmpeg para produzir os mesmos arquivos. O lock
global é único na VPS — trabalho repetido ali é fila parada para todo mundo.

### Dois containers que subiriam unhealthy

`worker-transcription` e `worker-render` tinham o mesmo defeito de tmpfs já
corrigido no de mídia: a montagem apaga o `mkdir` do Dockerfile, o tmpfs nasce
`root` e o processo roda como uid 1001. Sem `mode: 1777` o worker consome a
fila normalmente e mesmo assim é marcado unhealthy, porque não consegue
escrever o heartbeat. Corrigido antes de chegar à VPS.

---

## Verificações feitas

Não por inspeção — executando:

| O que | Como |
|---|---|
| Script Python roda e produz JSON | duble do `faster_whisper`, script real invocado |
| A saída real passa no contrato | `transcriptionResultSchema` sobre o JSON produzido |
| Segmento vazio e de duração zero são descartados | duble devolve os dois; saída tem 2 de 4 |
| Posições renumeradas sem buraco | `0,1` após os descartes |
| Áudio sem fala sai com código 3 e stdout vazio | duble que devolve zero segmentos |
| Erros de uso saem em stderr, stdout limpo | sem argumento e com arquivo inexistente |
| Build e typecheck | worker compila; API e web limpos |
| Suíte completa | **380 testes, 0 falhas** |

O que **não** foi verificado: transcrição de um vídeo real na VPS. O
faster-whisper não roda nesta máquina de desenvolvimento, então a qualidade da
transcrição em português e o tempo real de processamento ainda são previsão,
não medição.

---

## Fase 0 — Fundação e decisões — CONCLUÍDA

Critério do plano: *contratos compilam, migrations sobem em ambiente limpo e o
pipeline de CI passa.*

| Entregável | Estado | Onde |
|---|---|---|
| Repositório, convenções e CI | feito | dois workflows, build e deploy separados |
| ADRs | feito | `docs/adr/0001` a `0010` |
| Modelo de dados | feito | `packages/database/prisma/schema.prisma`, 23 tabelas |
| Estados de projeto/job | feito | `contracts/src/vocabulary.ts` |
| Schema `EditPlan` | feito | `contracts/src/edit-plan.ts` |
| Schema da proposta de IA | feito | `contracts/src/ai-proposal.ts` |
| Contratos de eventos | feito | `contracts/src/events.ts` |
| Diagrama de arquitetura | **pendente** | — |
| Threat model | **pendente** | — |
| Fixtures de mídia | **pendente** | precisa de vídeo autorizado do cliente |

---

## Fase 1 — Plataforma base — CONCLUÍDA

Critério do plano: *dois usuários de workspaces distintos não acessam dados ou
arquivos um do outro.*

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

## Fase 4 — Ingestão e transcrição — CONCLUÍDA

Critério do plano: *um vídeo enviado chega a transcrição segmentada sem
intervenção manual.*

| Entregável | Estado |
|---|---|
| Contratos (upload, proxy, silêncios, transcrição) | feito |
| Lock global de job pesado | feito — 18 testes |
| Temporários com limpeza garantida | feito — 21 testes |
| FFmpeg: proxy, áudio, thumbnail, silêncios | feito — 13 testes |
| Upload resumível e sessão autorizada | feito |
| Worker de mídia | feito |
| **Worker de transcrição (faster-whisper)** | **feito** |
| **Encadeamento mídia → transcrição** | **feito** |
| Retentativa pelo usuário | feito |

O pipeline fecha: upload → proxy, thumbnail, áudio, silêncios → transcrição
com palavras → `ANALYZING`.

---

## Fase 6 — antecipada em parte

A timeline veio antes (ADR 0008) e está no ar. Nove operações validadas:
mover, ajustar corte, alternar, dividir, duplicar, reordenar, editar legenda,
trocar estilo e trocar música.

O que falta da fase: captions renderizadas e os componentes Remotion.

---

## Pendências que não são de fase

| Item | Impacto |
|---|---|
| ~~Storage: disco vs. R2~~ | **decidido**: disco da VPS, 10 GB em dois baldes |
| ~~Chave da API de IA~~ | **decidido**: cadastrada pelo painel, AES-256-GCM |
| Fixtures de mídia | os golden tests da seção 18.4 dependem de vídeo autorizado |
| Transcrição real na VPS | qualidade em pt-BR e tempo de processamento ainda não medidos |
| **Credenciais expostas no chat** | token do GitHub, senha da VPS e duas chaves SSH temporárias **precisam ser revogados** |

---

## Ordem sugerida a partir daqui

1. **Fase 5a — adapter, provedor falso, prompts versionados e travas de
   custo.** Vem primeiro porque as outras três dependem dela, e porque é onde
   mora o limite de gasto: ligar chamadas de IA sem teto configurado é o tipo
   de erro que só aparece na fatura.
2. **Fase 5b — seleção de trechos e risco semântico (#3, #5).** O caminho
   crítico. Consome a transcrição que agora existe e tira o projeto de
   `ANALYZING`.
3. **Fase 5c — roteiro e sugestões (#1, #2).** Não dependem de vídeo; podem
   sair antes se o cliente precisar.
4. **Fase 7 — render.** É o que fecha o ciclo e entrega arquivo.
5. **Fase 5d, upload de assets e Fase 8.**
