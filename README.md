# MAKUCHO

Monorepo com duas aplicacoes do mesmo cliente, no mesmo dominio.

| Aplicacao | Endereco | O que e |
|---|---|---|
| **portal** | `makucho.com.br` | Portal editorial de economia + CMS. Em producao. |
| **studio** | `studio.makucho.com.br` | Editor inteligente de videos. Em construcao. |

## Organizacao

Cada produto e autocontido: apps, packages e infraestrutura proprios. So o
que e genuinamente comum a ambos vive em `shared/` (ADR 0005).

```text
portal/                  makucho.com.br
├─ apps/web              Next.js
├─ apps/api              NestJS
├─ packages/             database, types, validation
├─ infrastructure/       nginx e Dockerfiles
└─ docker-compose*.yml

studio/                  studio.makucho.com.br
├─ apps/web              PWA mobile-first
├─ apps/api              NestJS
├─ packages/contracts    EditPlan, proposta da IA, seguranca semantica
├─ packages/database     Prisma (banco proprio)
├─ workers/              media, transcription, render
├─ infrastructure/       nginx e Dockerfiles
├─ docs/                 contexto e plano do produto
└─ docker-compose.prod.yml

shared/                  usado pelos dois
├─ typescript-config
└─ eslint-config

docs/adr/                decisoes arquiteturais
```

Os dois stacks sao independentes: portal na porta `127.0.0.1:3096`, studio na
`3097`, cada um com seu roteador nginx e seu ciclo de deploy. Um render travado
no studio nao derruba o portal.

## Desenvolvimento

```bash
pnpm install

# Tudo
pnpm dev
pnpm test
pnpm typecheck

# Um produto so
pnpm --filter "@makucho/web" dev
pnpm --filter "@makucho/studio-*" test
```

O pnpm resolve por **nome de pacote**, nao por caminho: `@makucho/database` e
o do portal, `@makucho/studio-database` e o do studio.

## Decisoes arquiteturais

Antes de mudar estrutura, stack ou infraestrutura, leia `docs/adr/`:

| ADR | Assunto |
|---|---|
| [0001](docs/adr/0001-monorepo-compartilhado-e-subdominio.md) | Studio no mesmo monorepo, servido por subdominio |
| [0002](docs/adr/0002-stack-nestjs-prisma-em-vez-de-fastify-drizzle.md) | NestJS + Prisma no studio, divergindo do plano escrito |
| [0003](docs/adr/0003-processamento-na-vps-compartilhada.md) | Processamento de video na VPS compartilhada, com contencao |
| [0004](docs/adr/0004-banco-separado-na-mesma-instancia.md) | Banco `makucho_studio` separado, na mesma instancia |
| [0005](docs/adr/0005-organizacao-por-aplicacao.md) | Monorepo organizado por aplicacao |
| [0006](docs/adr/0006-deploy-do-subdominio.md) | Deploy do studio como stack independente |
| [0007](docs/adr/0007-remotion-e-reuso-de-open-source.md) | Licenca do Remotion e reuso de open source |
| [0008](docs/adr/0008-timeline-no-mvp1-e-preview-no-navegador.md) | Timeline no MVP 1 e preview no navegador |

O ADR 0003 e leitura obrigatoria antes de mexer em `mem_limit`, concorrencia
de fila ou modelo de transcricao: a VPS e compartilhada com outras aplicacoes
e nao tem swap.

## Documentos de produto do studio

`studio/docs/` guarda o contexto mestre e o plano de implementacao. Eles sao a
fonte de verdade para **o que** o produto faz; os ADRs sobrescrevem **com que
ferramenta**, quando divergem.

Regras nao negociaveis do studio, resumidas:

- a pessoa grava o video; a IA nunca gera fala, cena, prova ou numero;
- toda fala do resultado aponta para timestamps do original;
- cortes e reordenacoes preservam significado e intencao;
- a IA devolve JSON validado, nunca comandos executaveis;
- o original e imutavel; o preview usa proxy, o render usa o original;
- preview e render consomem o mesmo `EditPlan` versionado.
