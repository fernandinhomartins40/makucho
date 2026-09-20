# ADR 0006 — Deploy do studio como stack independente

- Status: aceito
- Data: 2026-09-20
- Relacionado: ADR 0001, 0003, 0004

## Contexto

O studio compartilha repositorio, dominio e VPS com o portal, mas e um produto
distinto, em construcao, enquanto o portal esta em producao atendendo o
cliente.

## Decisao

Workflow, stack Compose e raiz de release proprios.

| | Portal | Studio |
|---|---|---|
| Workflow | `deploy-production.yml` | `deploy-studio.yml` |
| Projeto Compose | `makucho` | `makucho-studio` |
| Raiz na VPS | `/opt/makucho` | `/opt/makucho-studio` |
| Porta no host | `127.0.0.1:3096` | `127.0.0.1:3097` |
| vhost | `makucho.com.br`, `www` | `studio.makucho.com.br` |
| Certificado | proprio | proprio |
| Banco | `makucho` | `makucho_studio` (mesma instancia) |
| Segredos JWT | proprios | proprios |

### Acionamento

O workflow do studio roda **apenas por `workflow_dispatch`** enquanto
`studio/apps/{api,web}` nao existirem. O gatilho por push esta escrito e
comentado no arquivo, pronto para ser habilitado.

Um primeiro step confere a presenca dos apps e degrada para "so
infraestrutura" com aviso, em vez de estourar no meio do `docker build` com um
erro do pnpm sobre filtro sem resultado — mensagem que nao explica a causa.

Ha tambem a entrada `infra_only`, para preparar vhost, SSL e banco sem
publicar imagens.

### Cuidados com a VPS compartilhada

A VPS hospeda ~12 aplicacoes de clientes distintos e ~24 dominios. O workflow
do studio herda as protecoes ja validadas no do portal:

- `nginx -t` valida **todos** os vhosts: se outro projeto estiver quebrado, o
  link do studio e removido e o job falha com mensagem clara, em vez de deixar
  a configuracao pior do que encontrou;
- o certbot **espera** o lock em vez de matar o processo: um `pkill certbot`
  abortaria a renovacao dos outros sites;
- a poda de imagens filtra por `makucho-studio-*`; um `prune -a` apagaria
  imagens do portal e de terceiros;
- `systemctl enable --now` em vez de `restart`: reiniciar o Docker derrubaria
  os containers vizinhos.

### Verificacoes especificas deste deploy

Alem das do portal, duas que existem por causa da convivencia:

1. **O portal continua no ar.** O script confere `127.0.0.1:3096` depois de
   subir o studio, e o workflow confere `https://makucho.com.br`. Sem isso, um
   deploy que derrubasse o portal seria reportado como sucesso.
2. **A rede `makucho-net` existe.** O studio a declara como `external` para
   alcancar o Postgres. Se faltar, o script falha com a causa em vez de o
   Docker criar uma rede vazia de mesmo nome e a API nao encontrar o banco.

### Criacao do banco

Idempotente, dentro do container `makucho-postgres`: cria papel e banco apenas
se faltarem, e atualiza a senha a cada deploy. A senha entra por variavel do
`psql` (`-v` + `:'...'`), nao interpolada na SQL, para nao quebrar com
caractere especial.

## Consequencias

- Dois deploys para acompanhar, com dois conjuntos de logs.
- O studio depende de o stack do portal estar no ar (rede e Postgres). A
  dependencia e explicita e verificada, nao implicita.
- Primeiro `workflow_dispatch` com `infra_only` prepara DNS, vhost e SSL antes
  de existir aplicacao, permitindo validar a rota de rede cedo.

## Pendencia

`studio.makucho.com.br` precisa de um registro DNS apontando para
`72.60.10.112` antes do primeiro deploy — o certbot valida por webroot e falha
sem ele. Nao bloqueia o commit, bloqueia o primeiro deploy.
