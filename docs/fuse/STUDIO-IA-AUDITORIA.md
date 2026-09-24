# MAKUCHO Studio — auditoria do uso de IA

Data: 24/09/2026. Escopo: todas as chamadas de IA do Studio (API, prompts, provedor,
custo, gatilhos na interface), com foco em três perguntas: **funciona**, **é automático
para quem usa** e **gasta o mínimo de tokens**. Provedor: DeepSeek, pela chave cadastrada em
Configurações.

## 1. Resumo

| | Antes | Depois |
|---|---|---|
| Chamadas de IA em produção | **Todas falhando**: os modelos `deepseek-chat` e `deepseek-reasoner` foram desligados pela DeepSeek em 24/07/2026 | Modelo atual (`deepseek-flash`, V4.1), trocável por ambiente |
| Raciocínio | Em 2026 ele vem **ligado por padrão**: toda chamada pagaria tokens de pensamento | Desligado explicitamente em 5 das 7 chamadas; ligado só onde há julgamento sobre a transcrição inteira |
| Parâmetros | `temperature` e `response_format` também eram enviados nas chamadas com raciocínio, que não os aceita | Enviados só quando o raciocínio está desligado |
| Preços do teto de gasto | Tabela de 2025 | Tabela atual, no horário de pico (o teto nunca estima abaixo do cobrado) |
| Cache de contexto da DeepSeek | Ignorado: o custo contava toda a entrada pelo preço cheio | `prompt_cache_hit_tokens` lido e cobrado pelo preço de cache (~1/30) |
| Pedido repetido | Sempre ia ao provedor e era cobrado | Cache de respostas por 24 h: o mesmo pedido sai sem custo |
| Sugestões de roteiro | Disparavam **sozinhas a cada 2 s de pausa** na digitação | Sob demanda, por botão |
| Acabamento do vídeo | Não existia | Por regra, sem token; a IA só sugere estilo, título, chamada e ênfase, e **na mesma resposta** da seleção |
| Editar pedindo | Não existia | "Peça à IA": linguagem natural → operações validadas, com plano resumido (~1/10 do JSON) |
| Campo "Modelo" nas Configurações | Salvo e ignorado | Removido, com texto explicando o que o Studio usa |

## 2. Inventário das chamadas

| # | Chamada | Gatilho | Modelo / raciocínio | Entrada | Teto de saída | Custo típico* |
|---|---|---|---|---|---|---|
| 1 | Gerar roteiro | botão, em Roteiros | Flash / desligado | tema + perfil de comunicação | 4.000 | < US$ 0,002 |
| 2 | Sugestões de roteiro | **botão** (antes: automático) | Flash / desligado | blocos + perfil | 3.000 | < US$ 0,002 |
| 3+5 | Seleção de trechos e risco (+ acabamento sugerido) | **automático** após a transcrição; botão "Refazer a análise" | Flash / alto | transcrição segmentada + catálogo de estilos | 16.000 | ~US$ 0,01 (10 min de gravação) |
| 4 | Trechos adicionais | botão, no editor | Flash / desligado | só a fala que ficou de fora | 1.500 | < US$ 0,001 |
| 6 | Aprimorar cortes | botão, no editor | Flash / baixo | palavras em volta de cada borda | 2.500 | < US$ 0,003 |
| 7 | Peça à IA (novo) | caixa no editor | Flash / desligado | plano resumido (1 linha por trecho) + pedido | 1.200 | < US$ 0,001 |

\* Preço de pico do Flash: US$ 0,30/M de entrada, US$ 0,006/M em cache, US$ 1,20/M de
saída. Um vídeo completo (análise + um comando + um refino) fica abaixo de **US$ 0,02**;
o teto mensal padrão (US$ 20) cobre cerca de mil vídeos.

O que **não** usa IA, e é deliberado: legenda (sai da transcrição), remoção de silêncio
(medição do FFmpeg), acabamento (regras + Kit de marca), montagem sem IA quando não há chave,
transições, zoom, logo, trilha e sons.

## 3. Achados

| # | Achado | Gravidade | Situação |
|---|---|---|---|
| A1 | Modelos desligados pela DeepSeek em 24/07/2026: toda chamada falha, e o Studio cai sempre na montagem sem IA | Bloqueante | Corrigido: `CONFIG_POR_CHAMADA` em `contracts/src/ai-usage.ts` |
| A2 | Raciocínio ligado por padrão na API atual: roteiro, sugestões, candidatos e comando pagariam pensamento | Custo alto | Corrigido: `thinking: {type: "disabled"}` explícito |
| A3 | `temperature` e `response_format` enviados com raciocínio ligado (não suportados) | Erro/instabilidade | Corrigido no provedor; o parser continua limpando cerca e validando com Zod |
| A4 | Tabela de preços antiga no teto de gasto | Teto impreciso | Atualizada (pico) |
| A5 | Cache de contexto não contabilizado: o prompt de sistema fixo (a maior parte da entrada de roteiro, sugestões e comando) era contado pelo preço cheio | Custo superestimado | Lido de `prompt_cache_hit_tokens`; prompts de sistema continuam fixos e em primeiro lugar |
| A6 | Pedido idêntico sempre cobrado (reabrir sugestões, repetir candidatos, repetir comando) | Custo desnecessário | Cache em memória por 24 h, por workspace; a análise manual ignora o cache |
| A7 | Sugestões automáticas a cada pausa de 2 s na digitação | Custo desnecessário | Botão "Pedir sugestões à IA" |
| A8 | Estilo, zoom e acabamento exigiriam uma chamada extra de "estilização" | Custo/latência | Acabamento por regra + `style` opcional na resposta da seleção (dezenas de tokens) |
| A9 | Estilo fixado no Kit de marca pedido de novo à IA | Tokens descartados | O pedido diz "definido pela marca; omita" |
| A10 | Campo "Modelo" nas Configurações sem efeito | Confusão | Removido |
| A11 | Sem forma de pedir ajustes em linguagem natural | Comodidade | "Peça à IA" (chamada #7), com as mesmas operações do editor |
| A12 | A imagem do Whisper em produção sem `requests` (corrigido no Dockerfile em `a18dbb2`) | Bloqueante para a transcrição | Precisa do próximo deploy do Studio para valer |

## 4. Como cada chamada economiza

- **Prompt de sistema fixo e primeiro.** Mesmo texto a cada chamada (inclusive o catálogo de
  estilos, gerado do código de forma determinística): é o prefixo que o cache de contexto
  da DeepSeek aproveita.
- **Entrada mínima.** Seleção: transcrição segmentada, sem palavras. Candidatos: só o que
  ficou de fora. Refino: só as palavras em volta das bordas. Comando: uma linha por trecho,
  não o EditPlan.
- **Saída curta e fechada.** Todas as respostas são JSON validado por Zod, com enums
  fechados; o comando descarta só a operação inválida, sem gastar outra chamada.
- **Raciocínio só onde decide.** Seleção e risco (alto), refino de bordas (baixo); o resto
  sem raciocínio.
- **Uma chamada em vez de duas.** Seleção + risco + acabamento sugerido numa resposta.

## 5. Plano executado (24/09/2026)

| # | Item | Situação |
|---|---|---|
| 1 | Deploy do Studio | O workflow "Deploy Studio" roda sozinho a cada push em `studio/**`; os commits desta auditoria já o disparam (inclusive a imagem do Whisper com `requests`). Falta cadastrar a chave em Configurações e testar um vídeo real |
| 2 | Painel de uso com economia | Feito: `ai_usage` grava `cachedTokens`, `cacheHits` e `savedCents`; Configurações mostra a economia do mês e quantas respostas foram reaproveitadas |
| 3 | Cache persistente | Feito: respostas no Redis por 24 h (`studio:ia:cache:*`), com o Map em memória como primeiro nível e reserva; validado reiniciando a API entre duas chamadas iguais (a segunda saiu com custo zero) |
| 4 | Horário fora do pico | Feito do jeito que compensa: o custo registrado usa o preço real do horário (metade fora do pico, `fatorDoHorario`); o teto antes da chamada continua pelo pico. A análise **não** espera a janela barata: o pico da DeepSeek (01–04h e 06–10h UTC, dias úteis) é de 22h a 1h e de 3h a 7h em Brasília, então o uso diurno já é o mais barato e esperar só atrasaria o vídeo |
| 5 | Amostragem de qualidade | Feito: na exportação, `projects.aiKeptRatio` guarda quanto da seleção da IA ficou no vídeo (`aproveitamentoDaSelecao`, por tempo do bruto); Configurações mostra a média dos últimos 90 dias e avisa abaixo de 60%. Os planos do "Peça à IA" gravam com origem `ai-comando` para não passar pela seleção |

## 6. O que ainda vale acompanhar

- **Aproveitamento baixo por várias semanas**: é o sinal para testar `DEEPSEEK_MODELO=deepseek-v4-pro`
  na seleção (cerca de 4x o preço) ou revisar o prompt `selecao-v2`.
- **Uso intenso de "Peça à IA"**: se virar a chamada mais cara, dá para responder pedidos comuns
  ("legenda maior", "sem música") por regra, sem modelo.

## 7. Medição com a chave real (24/09/2026)

Mesmo vídeo de 41 s, prompt da seleção com o catálogo de estilos, DeepSeek Flash:

| Configuração | Tokens de saída (raciocínio) | Custo (pico) | Tempo | Resultado |
|---|---|---|---|---|
| `selecao-v2`, raciocínio alto | 5.838 (5.126) | US$ 0,0071 | 25,8 s | válido |
| `selecao-v2`, raciocínio baixo | 5.864 (5.304) | US$ 0,0075 | 25,1 s | válido |
| `selecao-v2`, sem raciocínio | 449 (0) | US$ 0,0010 | 2,4 s | **inválido**: papéis em português ("abertura") |
| `selecao-v3`, sem raciocínio | 370–394 (0) | US$ 0,0005–0,0010 | 2,3–2,7 s | válido, **os mesmos 5 trechos** do raciocínio alto |

Conclusões aplicadas:

- O raciocínio era 90% da conta, e o nível "baixo" não economiza nada. O `selecao-v2` só
  funcionava com raciocínio porque não listava os valores aceitos; o `selecao-v3` lista
  papel, framework e risco, e pede motivos de até 15 palavras.
- Seleção e refino rodam **sem raciocínio**. A seleção só paga uma segunda tentativa, com
  raciocínio, se a primeira resposta não passar no contrato ou no compilador.
- O uso é somado em **micro-dólares** (`ai_usage.costMicros`): antes, cada chamada contava pelo
  menos 1 centavo inteiro, e uma seleção de US$ 0,0005 aparecia como US$ 0,01.
- Resultado: um vídeo completo (seleção + um comando) sai por **~US$ 0,0009**, contra
  ~US$ 0,009 antes — dez vezes menos, e a proposta chega em segundos.
- Diagnóstico: o motivo de uma proposta montada sem IA fica no projeto e aparece no editor, e
  Configurações tem "Testar a chave" (uma chamada de ~50 tokens com o resultado exato da DeepSeek).
