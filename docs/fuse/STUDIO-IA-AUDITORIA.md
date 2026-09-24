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

## 5. Próximos passos recomendados

1. **Deploy do Studio** para levar a troca de modelo e a imagem do Whisper corrigida à
   produção; depois, cadastrar a chave em Configurações e testar um vídeo real.
2. **Painel de uso com cache**: mostrar quanto o cache economizou no mês (os dados já
   chegam em `prompt_cache_hit_tokens`; falta gravar por chamada).
3. **Cache persistente** (Redis) se a API ganhar mais de uma instância; hoje é em memória.
4. **Horário fora de pico**: a DeepSeek cobra menos fora do pico; a análise automática
   poderia esperar a janela barata quando o vídeo não for urgente.
5. **Amostragem de qualidade**: guardar, por projeto, se a pessoa manteve ou refez a
   seleção da IA — é o sinal para decidir se vale o `deepseek-v4-pro` (`DEEPSEEK_MODELO`).
