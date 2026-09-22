# Runbook — MAKUCHO Studio

> O que fazer quando algo dá errado em produção, escrito para ser lido às
> 2h da manhã por alguém que não construiu o sistema.
>
> Cada procedimento começa pelo **sintoma**, não pelo componente: quem chega
> aqui sabe que "o vídeo não processa", não que "o worker de mídia perdeu o
> lock".

---

## Onde as coisas estão

| O quê | Onde |
|---|---|
| Aplicação | `studio.makucho.com.br` (VPS `72.60.10.108`) |
| Raiz | `/opt/makucho-studio` |
| Release em uso | `/opt/makucho-studio/current` → `releases/<release>` |
| Segredos | `/opt/makucho-studio/.env` (modo 600) |
| Backups | `/opt/makucho-studio/backups/` |
| Banco | container `makucho-postgres`, base `makucho_studio` |
| Vídeos e assets | volume `studio_media` |
| Compose | `current/studio/docker-compose.prod.yml` |

A VPS é **compartilhada com o portal** (`makucho.com.br`) e outras
aplicações. Nenhum procedimento aqui derruba o Postgres nem o nginx do host:
os dois são de todos.

```bash
cd /opt/makucho-studio/current/studio
docker compose -f docker-compose.prod.yml ps
```

---

## Primeiro diagnóstico

Rode isto antes de qualquer coisa. Dois minutos aqui evitam meia hora de
suposição.

```bash
# 1. A aplicação responde?
curl -s -o /dev/null -w '%{http_code}\n' https://studio.makucho.com.br/api/health

# 2. O portal continua de pé? (nunca pode ser derrubado pelo studio)
curl -s -o /dev/null -w '%{http_code}\n' https://makucho.com.br/

# 3. Quais containers estão fora do ar?
cd /opt/makucho-studio/current/studio
docker compose -f docker-compose.prod.yml ps --format '{{.Service}} {{.State}} {{.Health}}'

# 4. Disco — a causa mais comum de falha silenciosa
df -h /

# 5. O que os workers disseram nos últimos minutos
docker compose -f docker-compose.prod.yml logs --tail 50 --since 10m
```

**Disco acima de 90% é a resposta para a maioria dos sintomas confusos.** O
render escreve arquivos temporários grandes; sem espaço, ele falha de formas
que não mencionam disco. Vá direto para [Disco cheio](#disco-cheio).

---

## Sintomas

### O vídeo fica "processando" para sempre

O projeto entra em `TRANSCRIBING` ou `RENDERING` e não sai.

**Causa provável:** um worker morreu segurando o lock global, ou a fila parou
de ser consumida.

```bash
cd /opt/makucho-studio/current/studio

# O worker está vivo?
docker compose -f docker-compose.prod.yml ps worker-transcription worker-render

# Há job preso na fila?
docker compose -f docker-compose.prod.yml exec studio-redis \
  redis-cli --scan --pattern '{studio}*' | head -20

# O lock global está preso? (ADR 0003 — um só job pesado por vez)
docker compose -f docker-compose.prod.yml exec studio-redis \
  redis-cli GET 'studio:heavy-job-lock'
```

Se o lock existe e **nenhum worker está processando**, ele ficou órfão — o
processo morreu antes de liberar:

```bash
# Confirme que nenhum worker está trabalhando ANTES de apagar.
docker compose -f docker-compose.prod.yml logs --tail 20 worker-render

# Só então:
docker compose -f docker-compose.prod.yml exec studio-redis \
  redis-cli DEL 'studio:heavy-job-lock'
```

> Apagar o lock com um worker ativo põe dois FFmpeg competindo pelo mesmo
> arquivo e pela mesma CPU. Confirme antes.

O lock tem TTL e expira sozinho; apagar à mão só se justifica quando alguém
está esperando.

Depois: o usuário pode clicar em **"Tentar de novo"** na tela. A rota
`POST /projects/:id/retry` recomeça do ponto mais adiantado que já tem
insumo — se o áudio foi extraído, não refaz o FFmpeg.

---

### "Exportar vídeo" falha

```bash
cd /opt/makucho-studio/current/studio
docker compose -f docker-compose.prod.yml logs --tail 100 worker-render | grep -i erro
```

**Se a mensagem mencionar FFmpeg:** copie a linha inteira do erro. O render
monta o `filter_complex` a partir do EditPlan, e um erro de filtro costuma
apontar um plano com dados fora do esperado.

**Se mencionar espaço ou `ENOSPC`:** [Disco cheio](#disco-cheio).

**Se o job aparece como falho na fila:** o BullMQ tenta 3 vezes com espera
crescente. Depois disso o registro fica com o erro anotado, e o usuário
precisa pedir de novo.

---

### A IA não responde / erro ao analisar

```bash
# O teto de gasto do mês foi atingido?
docker exec makucho-postgres psql -U postgres -d makucho_studio -c \
  "SELECT period, call, calls, \"costCents\" FROM ai_usage ORDER BY period DESC LIMIT 10;"

docker exec makucho-postgres psql -U postgres -d makucho_studio -c \
  "SELECT \"workspaceId\", \"monthlyLimitCents\", \"isActive\", \"lastUsedAt\" FROM ai_credentials;"
```

**Teto atingido:** é comportamento esperado, não defeito. O limite se
renova no dia 1º, ou o usuário o aumenta em Configurações.

**`isActive` falso ou credencial ausente:** o cliente precisa cadastrar a
chave em Configurações. A chave é cifrada com o `JWT_ACCESS_SECRET` — se
esse segredo mudou, a credencial fica ilegível e precisa ser recadastrada.

**Erro de provedor:** o corpo da resposta do DeepSeek vai para o log do
servidor e **nunca** para a tela, porque pode conter a chave. Procure nos
logs da API:

```bash
docker compose -f docker-compose.prod.yml logs --tail 200 studio-api | grep -i deepseek
```

---

### Disco cheio

O sintoma mais traiçoeiro: causa falhas que não mencionam disco.

```bash
df -h /
du -sh /var/lib/docker/volumes/studio_media/_data/* 2>/dev/null | sort -h | tail
```

Na ordem, do mais seguro ao menos:

```bash
# 1. Imagens e camadas órfãs (não toca em volume nem em dado)
docker image prune -af

# 2. Temporários de render que sobraram de um job morto
docker run --rm -v studio_media:/d alpine:3 sh -c 'rm -rf /d/tmp/* 2>/dev/null; du -sh /d'

# 3. Backups além da retenção
find /opt/makucho-studio/backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +

# 4. Releases antigas (mantenha as 3 últimas)
ls -1dt /opt/makucho-studio/releases/*/ | tail -n +4 | xargs rm -rf
```

> **Nunca** apague `/var/lib/docker/volumes/studio_media/_data/m/` — são os
> vídeos originais dos clientes. E nunca rode `docker volume prune`: ele
> apaga volumes de todas as aplicações da VPS, inclusive do portal.

---

### O deploy falhou

O workflow tem cinco builds em paralelo e o deploy só roda se **todos**
passarem. A VPS fica na versão anterior, inteira.

| Sintoma no log | Causa |
|---|---|
| `pnpm --filter "...^..." build` falhou | falta um `package.json` de dependência no Dockerfile |
| `could not locate the Query Engine` | `binaryTargets` do Prisma não cobre a imagem |
| `Simple and complex filtering cannot be used together` | filtro FFmpeg montado errado |
| timeout no build do whisper | o `pip install faster-whisper` é o passo mais longo; reexecutar costuma resolver |

Para voltar à versão anterior:

```bash
ls -1dt /opt/makucho-studio/releases/*/ | head -3   # descubra a anterior
cd /opt/makucho-studio/releases/<release-anterior>/studio
docker compose -f docker-compose.prod.yml up -d
ln -sfn /opt/makucho-studio/releases/<release-anterior> /opt/makucho-studio/current
```

---

## Backup e restauração

O backup roda **todo dia às 03:20**, por cron, e guarda 14 dias.

Entra o **banco** (roteiros, planos, transcrições, correções de legenda) e os
**assets** (logo, trilha). **Não** entram os vídeos originais: são gigabytes,
o cliente tem o arquivo, e um backup diário deles encheria o disco em uma
semana.

```bash
# Está rodando?
crontab -l | grep studio-backup
tail -20 /opt/makucho-studio/backups/backup.log
ls -lht /opt/makucho-studio/backups/ | head

# Rodar agora, à mão
APP_ROOT=/opt/makucho-studio /opt/makucho-studio/current/.github/scripts/studio-backup.sh
```

### Restaurar

**Sempre comece pelo `--conferir`.** Ele valida o backup sem tocar em nada, e
descobrir que o dump está corrompido depois de derrubar o banco é o pior
momento possível.

```bash
cd /opt/makucho-studio

# 1. Valide (não altera nada)
.github/scripts/studio-restore.sh --conferir backups/<data>

# 2. Restaure (pede confirmação digitada, e salva o estado atual antes)
.github/scripts/studio-restore.sh --banco backups/<data>   # só o banco
.github/scripts/studio-restore.sh --tudo  backups/<data>   # banco + assets
```

O script para os serviços do studio, restaura, e sobe de novo. O estado
anterior fica em `backups/antes-da-restauracao-<data>.dump` — confira a
aplicação antes de apagar.

### Teste o restore antes de precisar dele

Um backup que nunca foi restaurado é uma suposição. Uma vez por trimestre:

```bash
.github/scripts/studio-restore.sh --conferir backups/$(ls -1t backups | head -1)
```

Isso não altera produção e responde a única pergunta que importa: **o backup
de ontem restauraria?**

---

## Emergências

### O portal caiu junto

Os dois stacks dividem VPS e nginx do host. Se `makucho.com.br` caiu depois
de um deploy do studio, é regressão séria.

```bash
docker ps -a | grep -iE 'makucho|portal'
nginx -t && systemctl reload nginx
df -h /   # disco cheio derruba os dois
```

O studio tem projeto Compose próprio (ADR 0001). Derrubá-lo **não** pode
derrubar o portal — se derrubou, registre o que aconteceu.

### Preciso derrubar só o studio

```bash
cd /opt/makucho-studio/current/studio
docker compose -f docker-compose.prod.yml stop
# Para voltar:
docker compose -f docker-compose.prod.yml up -d
```

### Suspeita de vazamento de credencial

1. Revogue no provedor (DeepSeek, GitHub, o que for) — **antes** de qualquer
   outra coisa;
2. troque no `.env` da VPS e rode um deploy;
3. se o `JWT_ACCESS_SECRET` mudou, toda credencial de IA cifrada fica
   ilegível e precisa ser recadastrada pelos clientes;
4. trocar o `JWT_ACCESS_SECRET` **desloga todo mundo** — é o comportamento
   correto num vazamento.

---

## O que este runbook não cobre

- **Ajuste de capacidade da VPS.** Depende de medir o uso real com carga de
  cliente, que ainda não aconteceu.
- **Monitoramento ativo.** Não há alerta automático: hoje alguém precisa
  olhar. O `/api/health` existe e serve para um monitor externo apontar.
- **Restauração parcial** (uma tabela, um projeto). O dump é `-Fc`, então o
  `pg_restore` aceita `-t <tabela>`, mas o procedimento não foi testado.
