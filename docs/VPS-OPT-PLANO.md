# VPS-OPT-PLANO — achados e correções

> Protocolo de otimização aplicado às duas aplicações.
> Medições em `VPS-OPT-BASELINE.md`. Nada aqui foi proposto por
> estimativa: cada item cita o número que o motivou.
> 2026-09-20.

## Princípio aplicado

`mem_limit` é **teto de proteção, não reserva**. Memória não usada
continua disponível ao host — reduzir um limite que ninguém alcança não
libera nada. O que de fato desperdiça recurso na VPS é disco acumulado e
processo sem contenção.

Por isso as correções abaixo tratam disco e rotação, não memória.

---

## Medição de memória: nada a cortar

| Container | Uso | Limite | % |
|---|---|---|---|
| makucho-api | 87,9 MB | 192 MB | 46% |
| makucho-web | 59,4 MB | 256 MB | 23% |
| makucho-postgres | 45,0 MB | 256 MB | 18% |
| makucho-nginx | 4,9 MB | 48 MB | 10% |
| studio-web | 45,6 MB | 256 MB | 18% |
| studio-api | 40,4 MB | 192 MB | 21% |
| studio-redis | 4,0 MB | 96 MB | 4% |
| studio-nginx | 5,8 MB | 32 MB | 18% |

**Total real: ~293 MB** de 1.328 MB declarados, num host com 13,2 GB
livres. CPU em 0,00–0,40%.

Os limites ficam como estão: existem para o pico, não para o repouso.

---

## OPT-001 — Log sem teto (CORRIGIDO)

**Achado.** Nenhum dos 11 serviços declarava `logging`. O driver
`json-file` do Docker **não tem limite por padrão**.

**Por que importa.** Hoje os logs são pequenos, mas um worker de render
em loop de erro escreve até encher o disco — que é compartilhado com as
outras 5 aplicações da VPS. É falha silenciosa: ninguém percebe até o
disco acabar e todos os containers pararem de escrever.

**Correção.** Âncora YAML `x-logging` nos dois composes, aplicada a
todos os serviços: 10 MB × 3 arquivos = 30 MB por serviço no pior caso.
Teto do stack: 330 MB, contra ilimitado.

---

## OPT-002 — Poda do portal apagava imagem do studio (CORRIGIDO)

**Achado.** O filtro `reference=*/<dono>/makucho-*` também casa
`makucho-studio-*`. Um deploy do portal removeria a imagem que o studio
está **usando** — os dois stacks dividem o mesmo daemon Docker.

**Por que não estourou ainda.** O `docker image rm` recusa remover
imagem de container ativo, então o `|| true` engolia o erro. A falha
apareceria no próximo restart do studio, com a imagem ausente — longe da
causa.

**Correção.** `grep -v 'makucho-studio'` na poda do portal.

---

## OPT-003 — Cache de build acumulado (CORRIGIDO)

**Achado.** 4,67 GB de build cache com **zero em uso**, e 20,34 GB de
imagens recuperáveis (64% de 31,73 GB).

**Causa.** O build acontece no runner do GitHub (ADR 0003): o cache na
VPS nunca é reaproveitado. Só ocupa disco.

**Correção.** `docker builder prune --filter until=168h` nos dois
scripts de deploy. O filtro por idade é deliberado — `prune -a` sem
ressalva atingiria cache de build de **outras** aplicações da VPS.

**Limpeza pontual executada:** 2,5 GB recuperados em imagens dangling.
Os 8 containers seguiram healthy. O cache de 4,67 GB é recente e foi
preservado pelo filtro, como projetado.

---

## OPT-004 — Limite de tamanho por tipo de asset (PREVENTIVO)

**Achado.** O volume de mídia é disco local da VPS compartilhada.

**Correção, já na origem.** `TAMANHO_MAXIMO` por tipo em
`contracts/src/brand.ts`: logo 2 MB, música 20 MB, intro 50 MB. Um logo
não precisa de 50 MB, e o teto único do upload (500 MB, para vídeo) seria
generoso demais para um PNG.

Validado por 38 testes, incluindo a recusa de arquivo acima do teto.

---

## OPT-005 — Validação por bytes (PREVENTIVO)

**Achado.** Extensão e `Content-Type` são informados por quem envia.

**Correção.** `file-signature.ts` detecta o tipo real pela assinatura
binária e recusa divergência. Cobre o caso concreto de HTML com
`<script>` renomeado para `.png`, que viraria XSS no domínio da
aplicação, e SVG com conteúdo ativo (script, `onload`, XXE,
`foreignObject`).

Não é otimização de recurso, mas entra aqui porque a seção 10.2 do plano
exige e o custo de adicionar depois seria retrabalho.

---

## Pendências medidas, não corrigidas

| Item | Medição | Por que não mexi |
|---|---|---|
| `ferraco-crm-vps` e `ferraco-postgres` sem `mem_limit` | 643 MB e crescendo | Aplicação de outro cliente; fora do escopo |
| 6 instâncias Postgres no host | — | O protocolo proíbe consolidar bancos de clientes por conveniência |
| Build cache de 4,67 GB | recente demais para o filtro | Cai sozinho em 7 dias |
| Storage: disco vs. R2 | volume em 1,1 MB hoje | Decisão para a Fase 4, quando entrar vídeo de 500 MB |

---

## O que medir no piloto

Conforme os critérios do ADR 0003:

- razão tempo de render / duração do vídeo final (revisar acima de 8x);
- qualquer OOMKill em qualquer container do host;
- espera de fila acima de 15 min em uso normal;
- disco acima de 75%.

O steal time da VPS atual é 0,2% — a premissa que inviabilizava o
processamento de vídeo na máquina anterior deixou de valer.
