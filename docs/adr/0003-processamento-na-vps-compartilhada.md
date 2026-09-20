# ADR 0003 — Processamento de video na VPS compartilhada, com contencao

- Status: aceito com risco reconhecido
- Data: 2026-09-20
- Revisar: apos o piloto, com as medicoes da secao "Criterios de revisao"

## Contexto

`PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md` secao 17.1 recomenda **4 vCPU /
16 GB** dedicados, e classifica 2 vCPU / 8 GB como piloto lento, "nao e a
recomendacao comercial principal".

A VPS atual (72.60.10.112) tem 2 vCPU, ~8 GB e **nao tem swap**. Ela hospeda
cerca de 12 aplicacoes de clientes distintos. Por isso todo servico do portal
declara `mem_limit` apertado (api 192m, web 256m, postgres 256m): um pico de
uma aplicacao nao pode matar a de outro cliente.

FFmpeg, faster-whisper e Remotion sao exatamente as cargas que o desenho atual
da VPS foi feito para evitar. O seed do portal ja precisou sair para um
container efemero de 640 MB porque o pipeline Sharp era morto pelo cgroup.

## Decisao

O processamento roda **na VPS atual**, por decisao comercial do cliente
(2026-09-20), com as contencoes abaixo como condicao de aceite.

### Contencoes obrigatorias

1. **Concorrencia 1 global.** Um unico job pesado por vez em todo o stack.
   A fila nunca executa transcricao e render simultaneamente. Implementado por
   um lock em Redis compartilhado pelas tres filas, nao por `concurrency: 1`
   em cada worker — tres workers com concorrencia 1 cada ainda dariam tres
   jobs simultaneos.
2. **`mem_limit` rigido em cada worker**, mantendo a soma do stack dentro do
   orcamento que sobra na VPS.
3. **faster-whisper `small` com quantizacao `int8`**, em CPU. O modelo
   `large-v3` nao cabe na memoria disponivel.
4. **Proxy 720p obrigatorio** antes de qualquer analise; o original so e
   tocado no render final.
5. **Limite de upload e duracao**: 500 MB e 15 minutos por video no piloto.
   Recusar no momento da sessao de upload, nao depois de receber o arquivo.
6. **Quota de disco temporario por job**, com limpeza garantida em `finally`,
   inclusive no cancelamento e na falha.
7. **Alerta em 75% de disco**, conforme secao 16 do plano.

### Orcamento de memoria do stack studio

| Servico              | mem_limit | Ativo quando        |
|----------------------|-----------|---------------------|
| studio-nginx         | 32m       | sempre              |
| studio-web           | 256m      | sempre              |
| studio-api           | 192m      | sempre              |
| studio-redis         | 96m       | sempre              |
| worker-media         | 512m      | so com job de midia |
| worker-transcription | 768m      | so com transcricao  |
| worker-render        | 896m      | so com render       |

O Postgres do studio reaproveita a instancia do portal (ADR 0004), sem custo
adicional de memoria.

### Por que os tetos dos workers nao sao maiores

O primeiro desenho dava 1024m a transcricao e ao render. Com o lock global, o
pico real seria o mesmo (um worker por vez), mas o **pior caso importa**: se o
lock falhar — bug, Redis reiniciado, chave expirada sob carga — os tres
workers rodam juntos.

| Cenario                        | Studio  | Studio + portal |
|--------------------------------|---------|-----------------|
| Sempre ativo (sem job)         |  576 MB |      1.328 MB   |
| Pico real (lock funcionando)   | 1.344 MB|      2.096 MB   |
| Pior caso (lock falho)         | 2.752 MB|      3.504 MB   |

Com 1024m nos dois workers maiores, o pior caso ia a 3.888 MB somado ao
portal — perto da metade de uma VPS de 8 GB que ainda hospeda outras ~11
aplicacoes, sem swap para absorver o excesso.

O lock e uma protecao de software; o `mem_limit` e uma protecao do kernel.
A segunda precisa valer sozinha, porque e a unica que continua de pe quando a
primeira falha. Os tetos atuais mantem o pior caso em 3,5 GB, faixa em que o
OOM killer atinge um worker do studio em vez de uma aplicacao vizinha.

## Risco aceito

Render e transcricao vao competir por 2 vCPU com as outras ~12 aplicacoes.
Consequencias esperadas e comunicadas ao cliente:

- tempo de render na ordem de varios minutos por video, nao segundos;
- lentidao perceptivel nas outras aplicacoes durante um job pesado;
- risco residual de OOM, mitigado mas nao eliminado pelos `mem_limit`.

## Criterios de revisao

Medir durante o piloto e reavaliar esta decisao se qualquer um ocorrer:

- razao tempo de render / duracao do video final acima de 8x;
- qualquer OOMKill registrado em qualquer container da VPS;
- fila com espera acima de 15 minutos em uso normal;
- reclamacao de lentidao vinda de outra aplicacao hospedada.

A saida planejada esta na secao 17.3 do plano e no ADR 0001: os workers
comunicam-se apenas por fila e storage, entao movem-se para uma segunda VPS
sem reescrever o produto — muda o endereco do Redis e do Postgres, nada mais.
