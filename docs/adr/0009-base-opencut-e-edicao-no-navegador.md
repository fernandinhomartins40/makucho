# ADR 0009 — Editor sobre a base do OpenCut, com edição no navegador

- Status: aceito
- Data: 2026-09-21
- Substitui: princípio 7 do plano ("mobile como controle: processamento pesado
  no servidor, não no celular") e parte do ADR 0003
- Relacionado: ADR 0007 (Remotion), ADR 0008 (timeline no MVP 1)

## Contexto

O cliente quer a experiência do OpenCut — editor open source tipo CapCut,
MIT, 90k estrelas — com o nosso motor de IA por cima.

Duas decisões do cliente em 2026-09-21:

1. adotar o OpenCut completo, incluindo o motor WASM;
2. **o produto será usado no computador, não no celular.**

A segunda muda a avaliação da primeira. O ADR 0003 e o princípio 7 do plano
proíbem processamento pesado no cliente porque o alvo era o smartphone:
"celular processando vídeo de 500 MB esquenta, drena bateria e falha em
aparelho modesto". Num desktop, essa objeção não se aplica.

## O que foi medido

Código do `opencut-classic` examinado localmente em 2026-09-21:

| Área | Arquivos | Tamanho |
|---|---|---|
| timeline | 105 | 434 KB |
| preview | 24 | 141 KB |
| commands | 53 | 103 KB |
| core | 13 | 99 KB |
| media | 11 | 51 KB |
| subtitles | 7 | 38 KB |
| selection, retime, ripple, effects, text | 38 | 79 KB |
| components/ui (Radix) | 48 | 144 KB |

Total do `apps/web/src`: **685 arquivos, ~2,4 MB**.

**Acoplamento com o WASM: 27 de 685 arquivos** — bem menor do que a leitura
por amostras sugeria. E `opencut-wasm` é **pacote publicado no npm** (v0.2.10),
não código a portar: entra como dependência.

O acoplamento real é com o store `useEditor()` (56 arquivos), que é o que
precisa ser reconciliado com o nosso EditPlan.

## Decisão

Adotar a base do OpenCut como camada de edição, com o motor WASM rodando no
navegador, e manter no servidor apenas o que só o servidor pode fazer.

### Divisão de responsabilidades

| Camada | Onde roda | Por quê |
|---|---|---|
| Timeline, preview, cortes, efeitos | **navegador** (WASM) | resposta instantânea, sem consumir a VPS |
| Upload e guarda do original | servidor | o arquivo precisa sobreviver ao fechar a aba |
| Transcrição (faster-whisper) | **servidor** | modelo de centenas de MB; não roda no navegador |
| Análise editorial (IA) | **servidor** | a chave da API não pode ir para o cliente |
| Render final | **servidor** | resultado reproduzível e arquivo entregue pronto |

O EditPlan continua sendo a fonte de verdade compartilhada: o navegador o
edita, o servidor o renderiza. A garantia da seção 7.1 do plano — preview e
render consomem o mesmo documento — passa a valer entre máquinas diferentes,
o que exige que a compilação para FFmpeg seja determinística.

### O que isso preserva

A regra de integridade editorial não muda. O navegador ganha poder de EDITAR,
não de inventar: todo clipe continua apontando para timestamps do original, e
as operações passam pelo mesmo schema validado.

A IA continua dirigindo. A base do OpenCut é um editor manual; o que a torna
este produto é a proposta automática que chega pronta na timeline, com o
motivo de cada escolha.

## Consequências

### Ganhos

- A VPS deixa de gastar CPU com preview, que era consumo contínuo enquanto o
  usuário assiste. Sobra capacidade para transcrição e render, que são os
  gargalos reais (ADR 0003).
- Edição responde no ato, sem ida e volta ao servidor a cada ajuste.
- A experiência fica próxima da referência que o cliente pediu.

### Custos

- **Requisito de máquina.** O produto passa a exigir desktop com navegador
  moderno (WebCodecs). Isso é uma mudança de posicionamento: deixa de ser
  "mobile-first" como o plano descreve na seção 28. O teleprompter continua
  fazendo sentido no celular, mas a edição não.
- **Duas implementações de composição.** O preview usa o motor WASM; o render
  usa FFmpeg no servidor. Divergência entre os dois produz o pior bug
  possível: o usuário aprova uma coisa e recebe outra. Os golden tests da
  seção 18.4 do plano passam a ser obrigatórios, não desejáveis.
- **Superfície de código grande.** Mesmo portando só o necessário, entram
  dezenas de arquivos escritos por terceiros, com um store próprio a
  reconciliar com o nosso EditPlan.
- **Origem arquivada.** O `opencut-classic` foi arquivado em 17/05/2026. O
  código funciona e é MIT, mas não recebe correção: bugs encontrados são
  nossos para resolver.

### Licença

MIT. Permite uso comercial, modificação e redistribuição, exigindo apenas a
preservação do aviso de copyright. Cada arquivo portado carrega a atribuição,
como já feito em `ruler-utils.ts`.

## Alternativa descartada

Portar só a interface e manter o processamento no servidor (a recomendação
inicial). Preservaria o princípio 7 do plano e evitaria a divergência entre
dois motores de composição, ao custo de preview menos responsivo e mais carga
na VPS. O cliente optou pelo motor completo.

## Revisão

Reavaliar se:

- o preview no navegador divergir visualmente do render do servidor;
- o cliente voltar a precisar editar pelo celular;
- o `opencut-wasm` parar de receber publicações no npm (hoje em v0.2.10).
