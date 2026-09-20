# ADR 0007 — Licença do Remotion e reuso de open source

- Status: aceito
- Data: 2026-09-20
- Relacionado: seção 20 do contexto mestre (divisão FFmpeg × Remotion)

## Contexto

O plano especifica Remotion para motion graphics sem tratar do licenciamento.
Remotion **não é MIT**: tem licença própria que exige pagamento conforme o
tamanho da organização.

A pergunta surgiu ao avaliar se valeria reaproveitar projetos open source
prontos em vez de escrever o pipeline do zero.

## O que a licença diz

Verificado em `remotion.dev/docs/license/faq` em 2026-09-20:

- **gratuito** para indivíduos, organizações sem fins lucrativos e times de
  **até 3 pessoas**, inclusive para uso comercial;
- a partir de **4 pessoas**, exige Company License;
- a contagem é do **headcount da organização que opera a ferramenta**, não
  dos usuários finais da aplicação;
- "agência que entrega apenas o MP4 final" conta só o próprio headcount; se o
  cliente opera o produto, os dois headcounts somam;
- não há diferença de funcionalidade entre a licença gratuita e a paga.

## Decisão

**Manter o Remotion.** A empresa do cliente tem até 3 pessoas (confirmado em
2026-09-20), o que enquadra o uso na licença gratuita, inclusive comercial.

### Gatilho de revisão

Esta decisão depende de um fato que pode mudar sem aviso. **Se a equipe do
cliente chegar a 4 pessoas**, é preciso escolher entre:

1. contratar a Company License (US$ 25/mês por desenvolvedor que escreve
   código Remotion — hoje, uma pessoa); ou
2. migrar as composições para FFmpeg puro (`drawtext`, legendas ASS).

A segunda opção tem um efeito colateral positivo já medido no desenho: sem o
Chromium headless do Remotion, o worker de render dispensa ~900 MB de RAM e a
lista de bibliotecas do `worker-render.Dockerfile` encolhe bastante.

Para manter a saída em aberto, o compilador do EditPlan trata Remotion como
**um backend de composição, não como a única forma de renderizar**: legendas e
títulos simples saem por FFmpeg; Remotion cuida do que exige animação de
verdade. Trocar de backend não deve exigir reescrever o EditPlan.

## Reuso de open source: o que foi avaliado

### OpenShorts (MIT, 5,3k estrelas)

Python/FastAPI + faster-whisper + Remotion + FFmpeg. Converte vídeo longo em
shorts 9:16, roda em CPU (5–8 min para vídeo de 8 min), fila com semáforo.
Funcionalmente é o projeto mais próximo.

**Não adotado como base.** Três motivos:

1. **Stack divergente.** É Python/FastAPI; o monorepo é TypeScript/NestJS.
   Adotá-lo traria uma segunda stack para manter, com outro gerenciador de
   pacotes, outro padrão de teste e outro ciclo de deploy — exatamente o que
   o ADR 0002 evitou ao alinhar o studio com o portal.
2. **Licença mista.** O núcleo é MIT, mas a pasta `cloud/` usa licença
   comercial que proíbe oferecer como serviço pago a terceiros. Separar o que
   pode do que não pode ser usado é risco jurídico permanente.
3. **Falta a peça central deste produto.** Ele seleciona trechos por
   "momentos virais"; não tem integridade editorial. A regra do contexto
   mestre — a IA só reorganiza quando preserva significado e intenção — não
   existe lá, e é o que distingue este produto de um cortador automático.

**Aproveitado como referência:** parâmetros de FFmpeg para proxy e corte, e a
forma de invocar o faster-whisper. São detalhes que custam horas de tentativa
e erro e não carregam licença.

### Onda (MIT, 23 estrelas)

Biblioteca de componentes Remotion cujo CLI **copia o código-fonte para o
projeto** em vez de instalar dependência — cada componente vem com schema Zod
e props TypeScript inferidas, o mesmo padrão já usado em
`@makucho/studio-contracts`.

**Adotar na Fase 6**, para os componentes que o plano lista na seção 21
(`LowerThird`, `StatCard`, `QuoteCard`, transições). O código passa a ser
nosso e pode ser ajustado à identidade da marca.

O que NÃO vem de lá: `HookTitle`, `AnimatedCaption` e `CTA` dependem do
EditPlan e das regras de legenda deste produto — são escritos aqui.

### OpenCut e MotionForge

Avaliados e descartados por ora. OpenCut é um editor de timeline completo
(MVP 2, não MVP 1). MotionForge é alternativa ao Remotion que só faria sentido
se a licença virasse problema — fica registrado como plano B do gatilho acima.

## Consequências

- Nenhuma dependência de projeto de terceiro no caminho crítico.
- O pipeline continua escrito aqui, em TypeScript, com a segurança semântica
  que nenhum dos projetos avaliados possui.
- A Fase 6 economiza tempo real de UI de vídeo com a Onda, sem acoplamento:
  o código é copiado, não instalado.
- Fica registrado o gatilho de licença, que depende de um fato externo
  (tamanho da equipe do cliente) e não de uma escolha técnica.
