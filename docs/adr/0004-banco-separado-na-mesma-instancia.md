# ADR 0004 — Banco `makucho_studio` separado, na mesma instancia Postgres

- Status: aceito
- Data: 2026-09-20

## Contexto

O portal usa o banco `makucho` no container `makucho-postgres`, com
`mem_limit` de 256m. O studio precisa de persistencia propria para projetos,
transcricoes, EditPlans, renders e jobs.

## Decisao

Um segundo **database** (`makucho_studio`) dentro da instancia Postgres ja
existente, com usuario proprio (`makucho_studio`) e senha propria.

O container `makucho-postgres` passa a aceitar conexoes da rede do stack do
studio, alem da rede do portal.

## Alternativas consideradas

**Instancia Postgres dedicada.** Rejeitada: mais ~256 MB de RAM numa VPS que
ja esta no limite (ADR 0003). O isolamento adicional nao compensa o custo.

**Mesmo banco, schema `studio`.** Rejeitada: acopla os ciclos de migration.
Um `prisma migrate deploy` do studio abriria transacao no mesmo banco do
portal, e um erro de migration poderia travar o produto em producao.

## Consequencias

- Isolamento logico completo: usuario do studio nao enxerga tabelas do portal.
- Um unico ponto de falha para as duas aplicacoes — se o Postgres cair, ambas
  caem. Aceito: ja era verdade para o portal, e a VPS inteira e um ponto de
  falha comum de qualquer forma.
- O backup precisa cobrir os dois bancos; `pg_dumpall` resolve, mas o runbook
  deve verificar explicitamente a presenca dos dois.
- A criacao do banco e do usuario e idempotente, feita pelo workflow de deploy
  antes do `prisma migrate deploy`.
- Os dois stacks Compose compartilham a rede `makucho-net` apenas para alcancar
  o Postgres; o restante dos servicos do studio vive em `makucho-studio-net`.
