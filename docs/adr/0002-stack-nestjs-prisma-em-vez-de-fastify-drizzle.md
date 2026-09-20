# ADR 0002 — NestJS + Prisma no studio, divergindo do plano escrito

- Status: aceito
- Data: 2026-09-20
- Substitui: secao 5.2 de `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`
  (linhas "API: Node.js + Fastify", "ORM: Drizzle ORM", "Autenticacao:
  Better Auth")

## Contexto

O plano de implementacao especifica Fastify, Drizzle ORM e Better Auth. O
portal MAKUCHO, no mesmo monorepo, ja roda NestJS, Prisma 5 e autenticacao
JWT propria (access + refresh, cookies `httpOnly`).

O plano preve explicitamente este tipo de conflito: "Se houver contradicao,
interromper a decisao afetada, apontar o conflito e pedir aprovacao."
O conflito foi apontado e a decisao foi aprovada pelo cliente em 2026-09-20.

## Decisao

O `studio-api` usa **NestJS + Prisma**, o mesmo padrao do `apps/api`.

A autenticacao reaproveita o desenho JWT ja em producao no portal, com
segredos e banco proprios — nao ha sessao compartilhada entre as aplicacoes.

## Justificativa

1. **Um jeito de fazer as coisas.** Dois frameworks HTTP e dois ORMs no mesmo
   repositorio dobram o custo de manutencao: duas formas de migration, dois
   sistemas de injecao de dependencia, dois padroes de teste.
2. **Dockerfiles e deploy ja validados.** O `api.Dockerfile` resolve o build
   do monorepo com pnpm, `prisma generate` e ordem de compilacao dos pacotes
   compartilhados. Replicar esse trabalho para outra stack e retrabalho puro.
3. **Prisma ja esta no `onlyBuiltDependencies`** do pnpm workspace, com os
   binarios nativos autorizados.
4. Nenhum requisito funcional do editor depende de Fastify ou Drizzle. A
   escolha do plano foi de conveniencia, nao de capacidade.

## Consequencias

- Os documentos de produto permanecem a fonte de verdade para **o que** o
  produto faz; este ADR sobrescreve apenas **com que ferramenta**.
- `packages/studio-database` usa Prisma com `DATABASE_URL` proprio, apontando
  para o banco `makucho_studio` (ver ADR 0003).
- As regras nao negociaveis do plano permanecem intactas: IA declarativa,
  validacao Zod, original imutavel, EditPlan como fonte de verdade.
- Se no futuro o volume exigir latencia que o NestJS nao entregue, a troca
  fica restrita a camada HTTP — dominio e workers nao dependem dela.
