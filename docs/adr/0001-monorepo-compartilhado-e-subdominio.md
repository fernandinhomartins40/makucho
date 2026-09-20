# ADR 0001 — Studio no mesmo monorepo, servido por subdominio

- Status: aceito
- Data: 2026-09-20
- Contexto: `CONTEXTO_MESTRE_EDITOR_IA.md`, `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`

## Contexto

O cliente ja possui o portal MAKUCHO (`makucho.com.br`) neste repositorio: um
monorepo pnpm + Turborepo com `apps/web` (Next.js) e `apps/api` (NestJS),
publicado por GitHub Actions em uma VPS compartilhada.

O Editor Inteligente de Videos e um produto novo para o mesmo cliente. O
requisito declarado foi: mesmo repositorio remoto, mesmo dominio, servido em
um subdominio.

## Decisao

Uma unica aplicacao adicional dentro do mesmo monorepo, publicada em
`studio.makucho.com.br`.

```text
apps/
├─ web/            portal publico          makucho.com.br
├─ api/            API do portal           makucho.com.br/api
├─ studio-web/     PWA do editor           studio.makucho.com.br
└─ studio-api/     API do editor           studio.makucho.com.br/api
workers/
├─ media/          ffprobe, proxy, audio, thumbnails
├─ transcription/  faster-whisper + VAD
└─ render/         Remotion + FFmpeg
```

Um segundo stack Docker Compose (`docker-compose.studio.prod.yml`), com projeto
`makucho-studio`, publicando uma unica porta em `127.0.0.1:3097`. O nginx do
host roteia `studio.makucho.com.br` para essa porta, do mesmo modo que ja
roteia `makucho.com.br` para `3096`.

## Alternativas consideradas

**Repositorio separado.** Rejeitada: o requisito do cliente e repositorio unico,
e a separacao impediria reaproveitar `@makucho/typescript-config`,
`@makucho/eslint-config` e o padrao de deploy ja validado.

**Mesma aplicacao, rota `/studio`.** Rejeitada: acopla os ciclos de deploy. Uma
falha no render do editor derrubaria o portal editorial, que e o produto em
producao.

**Mesmo stack Compose do portal.** Rejeitada pelo mesmo motivo: `docker compose
up` no stack unico recria containers do portal a cada deploy do editor.

## Consequencias

- Deploys independentes: dois workflows, dois stacks, duas portas.
- Cookie de sessao do studio usa `studio.makucho.com.br` como dominio, nao o
  dominio raiz — as duas aplicacoes nao compartilham sessao.
- O certificado do subdominio e emitido separadamente pelo certbot.
- Os pacotes `typescript-config` e `eslint-config` passam a servir aos dois
  produtos; mudancas neles afetam ambos e exigem rodar `turbo run typecheck`
  no repositorio inteiro.
