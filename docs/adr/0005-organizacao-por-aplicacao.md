# ADR 0005 — Monorepo organizado por aplicacao

- Status: aceito
- Data: 2026-09-20
- Relacionado: ADR 0001

## Contexto

O repositorio nasceu com um unico produto e usava a divisao convencional
`apps/` + `packages/`. Com a entrada do studio, essa estrutura passou a
misturar dois produtos sem relacao funcional: `apps/` teria `web`, `api`,
`studio-web` e `studio-api`, e `packages/` teria pacotes de um, do outro e
compartilhados — distinguiveis apenas pelo prefixo do nome.

Prefixo e convencao, nao fronteira. Nada impediria o portal de importar um
pacote do studio por engano, e a arvore nao revelaria a quem cada pasta serve.

## Decisao

Agrupar por aplicacao, com cada produto autocontido:

```text
portal/                     makucho.com.br
├─ apps/web, apps/api
├─ packages/database, types, validation
├─ infrastructure/
└─ docker-compose*.yml

studio/                     studio.makucho.com.br
├─ apps/web, apps/api
├─ packages/contracts, database
├─ workers/media, transcription, render
├─ infrastructure/
└─ docs/                    contexto e plano do produto

shared/                     usado pelos dois
├─ typescript-config
└─ eslint-config

docs/adr/                   decisoes transversais
```

Os nomes dos pacotes perdem o prefixo redundante: o caminho ja diz de quem e.
`@makucho/studio-contracts` continua com o nome npm prefixado para nao colidir
no escopo, mas vive em `studio/packages/contracts`.

## Consequencias

### Caminhos alterados

A reorganizacao tocou o produto em producao. Foram atualizados e verificados:

- `pnpm-workspace.yaml`: globs por produto, incluindo `studio/workers/*`;
- `portal/infrastructure/docker/*.Dockerfile`: origem dos `COPY` e destino
  dentro da imagem passam a espelhar a arvore real (`/app/portal/apps/...`).
  Origem e destino precisam casar: o `COPY . .` do builder traz
  `portal/apps/api/`, e um destino em `./apps/api/` faria o pnpm resolver o
  workspace num caminho inexistente;
- `portal/infrastructure/docker/api-entrypoint.sh`: `cd` para o pacote Prisma;
- `.github/workflows/deploy-production.yml`: caminho dos Dockerfiles e do
  `chmod +x`;
- `.github/scripts/remote-deploy.sh`: compose em `portal/` na release e
  caminho do seed dentro da imagem;
- `.github/scripts/remote-health-check.sh`: caminho do compose;
- `.dockerignore`: `portal/apps/api/storage`, `**/docker-compose*.yml` e a
  infra nginx dos dois produtos;
- `portal/apps/web/next.config.mjs`: `outputFileTracingRoot` sobe tres niveis
  em vez de dois — o standalone precisa da raiz do monorepo, nao da raiz do
  produto.

Os filtros `pnpm --filter @makucho/...` nao mudaram: o pnpm resolve por nome
de pacote, nao por caminho.

### Verificacao executada

Nao basta compilar: o deploy do portal roda por imagem Docker, e um caminho
errado so apareceria em producao. Antes de aceitar esta mudanca foram
executados, com sucesso:

1. `pnpm install` na nova estrutura;
2. build dos tres pacotes e das duas aplicacoes do portal;
3. `docker build` das imagens `api` e `web` do portal;
4. inspecao dentro das imagens, confirmando `portal/apps/api/dist/main.js`,
   `portal/apps/api/dist/seed/seed.js`, `portal/packages/database/prisma/` e
   `portal/apps/web/server.js` nos caminhos que `CMD` e seed invocam.

### Pendencia

O primeiro deploy apos esta mudanca deve ser acompanhado: o diretorio de
release na VPS passa a ter `portal/` como subpasta, e o `current` symlink
aponta para a release, nao para o produto.
