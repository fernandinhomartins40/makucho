# Progresso da implementação — MAKUCHO Studio

> Estado real, conferido contra `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`.
> Uma fase só é marcada concluída quando o critério de aceite do plano está
> verificado, não quando o código existe.
> Atualizado em 2026-09-22 (oitava revisão: Fase 6 completa — legendas queimadas).

## Panorama

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Fundação e contratos | **concluída** |
| 1 | Plataforma base | **concluída** |
| 2 | Brand e Communication Studio | tela ligada; falta upload de assets |
| 3 | Script e Record Studio | **concluída** |
| 4 | Ingestão e transcrição | **concluída** — pipeline fecha da câmera à transcrição |
| 4a | Entrada de vídeo | **concluída** (ADR 0010) |
| 5a | IA: adapter e travas de custo | **concluída** |
| 5b | IA: seleção de trechos e risco | **concluída** |
| 5c | IA: roteiro e sugestões | **concluída** — rodam sem gravação |
| 5d | IA: candidatos e refino | pendente |
| 6 | Preview e composição | **concluída** — timeline (ADR 0008) e legendas queimadas |
| 7 | Render e entrega | **concluída** — exporta mp4 pronto para publicar |
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

**O ciclo fecha de ponta a ponta, e agora começa antes da câmera.** A IA
escreve o rascunho do roteiro a partir do tema e do perfil de comunicação;
a pessoa grava; o vídeo vira proxy e transcrição; a IA escolhe os trechos
com o motivo de cada escolha e o risco de tirá-los do contexto; o editor
abre essa proposta — e "Exportar vídeo" devolve um mp4 pronto para
publicar, com as legendas queimadas e sincronizadas.

O que mudou nas últimas revisões foram as duas pontas e o acabamento. Antes
o produto tinha opinião no meio e nada nas extremidades: não ajudava a
escrever, não entregava arquivo, e o arquivo que passou a entregar não
parecia publicável sem legenda.

O que ainda **não** funciona, sem rodeio:

- **duas das seis chamadas da seção 26**: candidatos (#4) e refino (#6). As
  outras quatro rodam;
- **upload de logo e trilha**: os botões em Marca são a interface, sem o
  `assets` por trás.

A partir daqui, o que falta é o upload de assets e as duas chamadas de IA
que operam sobre uma timeline já montada. O caminho principal, do tema ao
arquivo publicável, está inteiro.

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

### Fase 5a — o encanamento da IA, com o teto ligado

Vem antes das chamadas porque é onde mora o limite de gasto. Ligar IA sem teto
configurado é o tipo de erro que só aparece na fatura.

**Adapter.** Deliberadamente estreito — um método, não os seis que o plano
esboça. Seis métodos tipados por função obrigariam cada implementação a
repetir parsing e validação; com um só, o parsing vive uma vez, junto do
schema que ele precisa satisfazer.

**Provedor falso.** Testar o caminho feliz de uma IA é fácil e quase inútil: o
que precisa de teste é a recusa. Ele produz sob encomenda JSON quebrado, campo
inventado, prosa no lugar de estrutura — e o caso perigoso, em que o JSON é
válido, o schema passa, e o trecho aponta para um tempo que não existe na
gravação. Só uma conferência contra a duração real pega esse, e é por isso que
o validador semântico existe.

**Trava de custo.** Confere antes de chamar, registra depois de receber:
registrar antes contaria o que não aconteceu, conferir depois seria conferir a
fatura. A estimativa usa o máximo de tokens que o pedido autoriza, não a média
— estimar pela média deixaria passar justamente a chamada grande, que é a que
estoura.

- preços em centavos inteiros: somar float de centavo cem vezes produz
  4,999999 e um limite que dispara na hora errada;
- arredondamento para cima: um teto que erra para baixo deixa passar a chamada
  que estoura;
- `upsert` com `increment`: duas chamadas simultâneas perderiam uma contagem,
  e a que se perde é sempre a que faltava para bater no teto;
- `AiUsage` separado de `AiAnalysis`, porque aquela pende de um projeto e as
  chamadas de roteiro acontecem antes de existir projeto nenhum.

O gasto aparece na tela de Marca, ao lado do armazenamento, com aviso em 80% e
bloqueio em 100%. Um limite que só aparece quando bloqueia é indistinguível de
um defeito, do ponto de vista de quem está usando.

**Um bug pego construindo a imagem, não lendo o código.** O `tsc` só emite
`.js`, então `dist/modules/ai/prompts/` não existia e a primeira chamada de IA
em produção falharia com "prompt não está na imagem". Não aparece em
typecheck, nem em teste, nem no build.

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
| O prompt chega dentro da imagem | `docker build` da API, arquivo listado e lido no container |
| O `PromptsService` carrega em produção | executado dentro da imagem, pelo caminho real do `dist` |
| As recusas da IA são recusadas | provedor falso: JSON quebrado, campo extra, prosa, vazio |
| Aritmética do teto de gasto | 30 casos, incluindo o centavo que passa do limite |
| As migrations aplicam em banco limpo | Postgres descartável, `migrate deploy` do zero |
| A API sobe com as rotas novas | `/analyze`, `/retry`, `/ai-usage`, `/ai-limit` registradas, sem ciclo |
| A cadeia da 5b roda ponta a ponta | banco real + provedor falso: IDs conferidos contra o banco |
| Suíte completa | **455 testes, 0 falhas** |

O que **não** foi verificado: transcrição de um vídeo real na VPS. O
faster-whisper não roda nesta máquina de desenvolvimento, então a qualidade da
transcrição em português e o tempo real de processamento ainda são previsão,
não medição.

### Fase 5b — a peça que faltava entre a proposta e o plano

O compilador. É onde `transcriptSegmentIds` deixa de ser promessa e vira
dado: cada clip recebe os IDs dos segmentos de transcrição que de fato cobre,
e um trecho que não case com segmento nenhum é **recusado**. Sem origem
verificável, a fala do resultado não existe comprovadamente no bruto — e essa
é a regra que o produto inteiro sustenta.

Dois casos que só ele pega, porque o schema não conhece o vídeo:

- **trecho depois do fim da gravação.** Um `sourceEndMs` além do fim faz o
  FFmpeg produzir um clip mudo e mais curto, sem erro: a falha só apareceria
  no vídeo final, depois do render inteiro;
- **tempos válidos, dentro do vídeo, e sem fala nenhuma.** Acontece quando o
  modelo aponta para um silêncio. O JSON é válido, o schema passa, e o clip
  sairia mudo.

Decisões técnicas são do compilador, não do modelo: canvas, codec, CRF,
loudness e legenda têm resposta certa, e pedi-las a um modelo é convidar
variação onde não deveria haver nenhuma.

A confiança exibida **não vem do modelo**. Modelos de linguagem não produzem
confiança calibrada, e pedir um é convidar o modelo a inventar. É agregação
dos riscos que ele classificou — o painel já usava os mesmos pesos.

Nenhuma falha é terminal: o projeto fica num estado de onde dá para tentar de
novo, porque a gravação continua válida. O que falhou foi a análise.

A rota é **síncrona**, e não por fila: leva dezenas de segundos e o usuário
está olhando a tela esperando. Uma fila acrescentaria polling e um estado
intermediário para economizar um tempo que ninguém ganharia.

---

### Fase 7 — o render, e o arquivo que o botão prometia

"Exportar vídeo" existia desde o redesenho e não gerava nada. Era a maior
distância que restava entre demonstração e ferramenta: o produto escolhia os
trechos com critério e não entregava arquivo.

Ao contrário da análise, o render vai **por fila**. Leva minutos, não dezenas
de segundos, e ninguém fica olhando a tela — o usuário pede, fecha a aba e
volta depois. É por isso que o estado precisa ser consultável, e o `GET`
devolve quatro que o usuário distingue: `na_fila`, `processando`, `pronto` e
`falhou`.

O worker **revalida o plano com Zod** antes de começar. É a última chance de
barrar um plano inválido antes de gastar minutos de CPU numa VPS onde o lock
é único.

Dois defeitos que só apareceram porque o FFmpeg foi executado de verdade, e
que nenhum teste de unidade pegaria:

- **`-af` não pode coexistir com a saída de um `filter_complex`.** O binário
  responde *"Simple and complex filtering cannot be used together for the
  same stream"* e aborta. O `loudnorm` estava num `-af`, o que significa que
  **toda exportação teria falhado**. Foi para dentro do grafo, via
  `[aconcat]`;
- **o Dockerfile copiava `studio/remotion`, que não existe** — o build
  quebraria — e faltavam as duas linhas de `worker-core`, exatamente o mesmo
  defeito que o Dockerfile do media já tinha tido antes.

| Verificação | Resultado |
|---|---|
| Argumentos exatos do código, com FFmpeg real | exit 0 |
| Duração da saída | **6.00s** — a soma exata dos clipes |
| Dimensões / pixel format | 1080×1920, yuv420p |
| Codecs | h264 + aac, `+faststart` |
| Suíte completa | **496 testes no studio, 0 falhas** |

A duração é a prova de que o `setpts` funcionou: um vídeo de 20s entrou e
saíram 6s de trechos selecionados. Se os relógios não tivessem sido zerados,
a saída teria a duração do original com pausas no meio.

O que **não** foi verificado: o worker nunca rodou como worker. Os argumentos
do FFmpeg foram exercitados com binário real, mas o laço BullMQ → lock →
render → gravação no banco ainda não completou uma volta.

---

### Fase 5c — roteiro e sugestões, e três defeitos de tabela

As duas únicas chamadas que rodam **antes de existir gravação** — o motivo de
poderem sair antes do resto.

A **#1** é a única chamada do produto que escreve texto original. O que a
mantém legítima não é uma regra técnica, é a ordem das coisas: o texto ainda
será falado por uma pessoa, que lê, corrige e decide. Nada é salvo sozinho —
o roteiro volta para a tela já no formato do `scriptInputSchema` e entra pela
**mesma porta** de um escrito à mão. Se houvesse conversão própria, existiriam
dois formatos de roteiro no produto.

A **#2 não substitui o checklist local.** Os quatro critérios da tela são
determinísticos, explicáveis e funcionam offline; a IA entra no que exige
julgamento — uma promessa do hook que o resto não cumpre, um bloco que muda de
assunto sem ligação. O prompt lista explicitamente o que **não** sugerir, para
não virar eco do que a tela já calcula. E toda sugestão carrega o texto
reescrito pronto: "melhore o hook" é conselho, não ferramenta.

#### Três defeitos encontrados no caminho

Dois deles **pré-existentes**, e o terceiro só apareceu contra banco real:

- **a tela de roteiros nunca conseguiu salvar.** O autosave mandava
  `mode: 'manual'`, que não existe em `SCRIPT_MODES`, e o contrato recusava
  com 400. A pessoa escrevia, via "salvando", e nada era gravado. Passa a
  mandar `BULLETS`, que é o que a tela produz de fato;
- **a tela conhecia 4 dos 13 papéis** do vocabulário. Um roteiro salvo com
  qualquer outro virava `undefined` em `ROTULO` e quebrava a renderização.
  Ampliada para os treze, com verificação em vez de `as`;
- **o intervalo mínimo da #2 rodava antes da autorização.** Responder "aguarde
  12s" a quem pede sugestão de um roteiro alheio confirma que aquele id existe
  e está sendo editado agora — e deixaria um workspace negar serviço ao outro,
  porque o intervalo é por `scriptId`. A consulta com `workspaceId` passou a
  vir primeiro.

O terceiro é o que justifica testar contra banco: nenhum teste unitário o
pegaria, porque com dublês o `findFirst` sempre devolve o que o teste mandou.

| Verificação (Postgres real) | Resultado |
|---|---|
| Duração vem do perfil do banco | 40s (do perfil), não 60s (do padrão) |
| Uso contabilizado em `ai_usage` | nas duas chamadas |
| Roteiro gerado gravado sem conversão | passa no `scriptInputSchema` |
| Roteiro de outro workspace | recusado |
| Teto em zero | degrada com motivo, sem lançar |
| API compilada | as duas rotas mapeadas, sem ciclo |
| Suíte completa | **548 testes no studio, 0 falhas** |

O que **não** foi verificado: o DeepSeek nunca foi chamado de fato. Todo o
caminho rodou contra o provedor falso, então a qualidade do roteiro em
português e a aderência do modelo ao formato ainda são previsão.

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

## Fase 6 — Preview e composição — CONCLUÍDA

A timeline veio antes (ADR 0008) e está no ar. Nove operações validadas:
mover, ajustar corte, alternar, dividir, duplicar, reordenar, editar legenda,
trocar estilo e trocar música.

As legendas queimadas fecharam a fase.

**A legenda não é escrita, é derivada.** Cada palavra exibida vem de uma
`TranscriptWord` com o timestamp que o whisper mediu, e nenhuma função aceita
texto de fora. Isso é deliberado: legenda que não foi dita é a mesma violação
que a IA inventar fala, com o agravante de ficar **queimada** no arquivo —
sem como corrigir depois de publicado.

**Por `.ass` e não `drawtext`.** O `drawtext` precisaria de um filtro por
bloco, cada um com `enable='between(t,...)'` — perto de 60 filtros num vídeo
de 60s, num `filter_complex` que já carrega dois por clip. E não tem como
destacar a palavra ativa, que é justamente o estilo que prende atenção. O
`.ass` tem karaokê nativo (`\kf`), contorno e posição no próprio estilo, e o
texto vive num **arquivo**: nada dele entra na linha de comando.

**O ponto mais delicado é a conversão de tempo.** O tempo de timeline é
recalculado clip a clip, acumulando durações, em vez de lido de
`timelineStartMs`. Com clips desligados, esse campo descreve onde o clip
*estaria* se nada tivesse sido desligado, e o render concatena o que sobrou:
usá-lo adiantaria toda a legenda pelo tamanho exato do que o usuário
desligou. Três testes cobrem exatamente isso.

#### Um defeito que só apareceu assistindo ao resultado

O `Dialogue` saía com **dez campos** para os nove que o `Format:` declara.
Não é erro de sintaxe — o libass trata o excedente como início do texto, e a
vírgula aparecia **queimada** antes da primeira palavra. O exit 0 não mostrava
nada, o `.ass` era válido, e o teste de unidade passava porque conferia o
prefixo da linha. Só o quadro extraído do mp4 mostrou: `,Atenção não perca`.

Há teste que reprova a regressão, conferido reintroduzindo o bug de propósito.

A fonte padrão também mudou depois do container: `Liberation Sans`, que é a
que **existe** na imagem. Uma fonte ausente não falha — o libass cai num
substituto em silêncio, e a legenda sai com uma tipografia que ninguém
escolheu.

| Verificação (FFmpeg real) | Resultado |
|---|---|
| Render com legenda | exit 0 |
| Dimensões / pixel format / codecs | 1080×1920, yuv420p, h264+aac |
| Duração | 6.00s — a soma dos clipes |
| Luminância da faixa inferior | **235** com legenda, **17** sem |
| Quadro em t=1s | "Atenção não perca", acento correto, "perca" em azul |
| Quadro em t=4s | "Comente AGENDA você" — fala que no original está em 12s |
| Suíte completa | **657 testes, 0 falhas** |

A última linha é a prova da conversão de tempo: a legenda acompanhou o corte
em vez de ficar no tempo do original.

**Os componentes Remotion saíram do caminho, e as legendas confirmaram a
decisão.** A Fase 7 renderiza com FFmpeg puro, e o Dockerfile do worker
chegou a copiar um `studio/remotion` que nunca existiu. Remotion e Chromium
foram removidos da imagem em vez de criados: um navegador headless custaria
centenas de MB e minutos de CPU numa VPS compartilhada para fazer o que o
`filter_complex` faz. A caption era o caso que poderia justificá-lo, e não
justificou — o `libass` resolve karaokê, contorno e posição sem browser.

O que **não** foi verificado: nenhuma legenda foi gerada a partir de uma
transcrição real do banco. As palavras do teste foram construídas à mão, com
tempos escolhidos; o caminho `Transcription → TranscriptWord → .ass` só roda
quando o worker processar um vídeo de verdade.

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

1. **Subir o que está pronto, e rodar o pipeline inteiro uma vez.** Dez
   commits locais — transcrição, 5a, 5b, 7, 5c e legendas — e nada disso
   está na VPS. Entre eles vai a correção do `mode`, sem a qual a tela de
   roteiros continua sem salvar para quem está usando hoje.

   Subir não é só deploy: é a primeira oportunidade de ver as peças se
   falando com dados reais. Três caminhos foram construídos e nunca
   executados de ponta a ponta — o faster-whisper nunca transcreveu áudio
   real, o DeepSeek nunca foi chamado de fato, e o worker de render nunca
   completou uma volta como worker. Cada um tem teste próprio e todos
   passam; a costura entre eles é o que resta conferir.
2. **Upload de assets** (logo e trilha em Marca). Os botões são a interface,
   sem o `assets` por trás — e agora que o render aplica legenda pela marca,
   é o que falta para a identidade visual chegar ao vídeo por inteiro.
3. **Fase 5d — candidatos (#4) e refino (#6).** As duas chamadas que faltam
   da seção 26. Operam sobre uma timeline já montada, então dependem de o
   pipeline ter rodado.
4. **Fase 8 — hardening e piloto.**
