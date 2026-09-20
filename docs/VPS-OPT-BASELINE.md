# VPS-OPT-BASELINE — medições de referência

> Etapa 0 do protocolo de otimização. Somente leitura: nada foi alterado,
> reiniciado ou apagado na coleta.

- Data da coleta: 2026-09-20, 19:29–19:32 UTC
- Host medido: `72.60.10.112` (`srv953808`) — VPS da aplicação
- Método: SSH com chave dedicada `makucho-audit-readonly`
- Ferramentas: `uptime`, `free`, `df`, `ps`, `top`, `vmstat`, `docker ps`
- Limitação: snapshot em repouso não representa pico. Não havia deploy
  ativo dos serviços medidos, mas **havia um `docker pull` em curso** do
  deploy travado (run 35529931304).

---

## BL-001 — CPU: steal time em 90,6% (CRÍTICO)

**Status:** VERIFIED

```text
%Cpu(s):  4.3 us,  5.1 sy,  0.0 ni,  0.0 id,  0.0 wa,  0.0 hi,  0.0 si, 90.6 st
%Cpu(s):  4.7 us,  4.7 sy,  0.0 ni,  0.0 id,  0.0 wa,  0.0 hi,  0.0 si, 90.7 st

 r  b   swpd   free   buff  cache  ...  us sy id wa st
24  0      0 675764 165984 4400464 ...   8  6 77  0  9
14  0      0 678824 165984 4400516 ...   5  5  0  0 90
12  0      0 684220 165984 4400500 ...   4  5  0  0 91
```

**Achado.** O hipervisor entrega cerca de 9% da CPU contratada. Os 90,6%
restantes sao tomados por outras VMs no mesmo host fisico.

**Evidencia de que a causa e externa, nao das aplicacoes:**

- as proprias aplicacoes usam 4–5% de `us` + 4–5% de `sy`;
- a soma dos `%CPU` dos processos nao chega a 70% de um nucleo;
- `id` (idle) em 0,0% com `us` em 4,7%: a CPU nao esta ociosa nem
  ocupada pelo sistema — esta indisponivel;
- `wa` (I/O wait) em 0,0% e nenhum processo em estado D: nao e disco;
- fila de execucao (`r`) entre 12 e 24 para 2 nucleos: processos prontos
  esperando CPU que nao chega.

**Impacto.** Load average de 9,5 para 2 vCPUs (~4,8x a capacidade).
Explica o deploy travado por mais de uma hora no `docker pull` e o
`TLS handshake timeout` do GHCR em 14/09: sob steal desse nivel, ate
operacoes de rede sofrem, porque o processo nao ganha CPU para tratar
os pacotes.

**Consequencia para o planejamento.** Otimizar codigo, imagem ou limite
de memoria **nao recupera CPU que o hipervisor nao entrega**. Enquanto o
steal permanecer nesta faixa, nenhuma medicao de ganho de desempenho
nesta VPS e confiavel, e o ADR 0003 (processamento de video aqui) fica
inviavel na pratica: FFmpeg e faster-whisper sao limitados por CPU.

**Proposta.** Fora do escopo de otimizacao de aplicacao. Exige acao de
infraestrutura: chamado ao provedor, migracao de host ou troca de plano.
Decisao do cliente em 2026-09-20: migrar para `72.60.10.108`.

**Resolvido em 2026-09-20 19:50.** Medida a `72.60.10.108`
(`srv953800`, maquina distinta): **steal de 0,2%**, idle 99,3%, fila de
execucao 0. O problema era do host fisico daquela VPS, nao do provedor
nem das aplicacoes. Migracao concluida; ver BL-005.

---

## BL-002 — Memória: folgada

**Status:** VERIFIED

```text
               total        used        free      shared  buff/cache   available
Mem:           7.8Gi       2.7Gi       663Mi       342Mi       4.4Gi       4.3Gi
Swap:             0B          0B          0B
```

**Achado.** 2,7 GB em uso de 7,8 GB; 4,3 GB disponiveis. Os 4,4 GB de
`buff/cache` sao cache de disco, reclamavel sob pressao — nao e memoria
perdida.

**Observacao.** `free` baixo (663 Mi) nao indica problema: o kernel usa
a memoria livre como cache. O numero que importa e `available`.

**Swap ausente**, confirmando a premissa do ADR 0003: nao ha rede de
seguranca para picos, e um estouro de memoria leva direto ao OOM killer.

**Conclusao.** A memoria **nao** e o gargalo atual. Os `mem_limit`
apertados do portal e do studio continuam justificados como protecao
contra pico, mas reduzi-los nao traria ganho — sobra RAM.

---

## BL-003 — Disco: 35% de uso

**Status:** VERIFIED

```text
/dev/sda1        97G   34G   63G  35% /
```

**Achado.** 63 GB livres. Longe do alerta de 75% previsto no plano do
studio (secao 16).

**Conclusao.** Disco nao e gargalo. Ha espaco para os temporarios de
video previstos no ADR 0003.

---

## BL-004 — Densidade: 20 containers, 7 aplicações

**Status:** VERIFIED

| Aplicação | Containers |
|---|---|
| advocacia | advocacia-postgres, advocacia-vps |
| fusesite | fusesite |
| **makucho (portal)** | **makucho-api, makucho-nginx, makucho-postgres, makucho-web** |
| mercadoflow | mercadoflow-backend, mercadoflow-postgres |
| metalgest | metalgest-backend-1, metalgest-frontend-1, metalgest-nginx-1, metalgest-postgres-1 |
| palmital | palmital-api-1, palmital-postgres-1, palmital-web-1 |
| tagflow | tagflow-api, tagflow-db, tagflow-nginx, tagflow-web |

**Achado.** 6 instancias Postgres independentes (uma por aplicacao) e um
processo `java` com 516 MB de RSS (`advocacia`, no ar ha 6 dias).

**Observacao.** O protocolo e explicito: nao consolidar bancos de
clientes por conveniencia. Registrado como fato do inventario, nao como
proposta.

**Uptime do host:** 243 dias. O container `makucho-api` reporta uptime
de ~6,7 dias, coerente com o ultimo deploy bem-sucedido (14/09) e com a
falha do deploy do painel administrativo na mesma data.

---

## NOT MEASURED

O protocolo proibe inventar dados. Itens sem medicao ate aqui:

| Item | Motivo |
|---|---|
| `docker stats` por container | coleta interrompida antes de concluir |
| `docker system df` | nao executado |
| Pico de CPU/RAM sob carga real | exigiria janela de observacao |
| Historico de OOM (`dmesg`) | nao coletado |
| Latencia e throughput da aplicacao | sem instrumentacao disponivel |
| Duracao e downtime de deploy | ultimo deploy nao concluiu |
| Steal time da VPS `72.60.10.108` | chave ainda nao autorizada no host |
| I/O de disco por processo | `iotop`/`pidstat` nao verificados |

---

## Síntese

| Recurso | Estado | Gargalo? |
|---|---|---|
| CPU | **90,6% steal** | **SIM — critico** |
| Memória | 4,3 GB disponíveis | não |
| Disco | 35% usado | não |
| Swap | ausente | risco, não gargalo |

A hipotese inicial — de que o deploy travava por lentidao de rede — esta
**parcialmente correta na consequencia e errada na causa**: a rede sofre
porque a CPU nao e entregue. Timeout e retry no `docker pull` (ja
escritos, nao commitados) tratam o sintoma; a causa e o steal time.

**Proxima medicao obrigatoria:** steal time da `.108`, antes de migrar.


---

## BL-005 — VPS 72.60.10.108: migração concluída

**Status:** VERIFIED
**Coleta:** 2026-09-20 19:50 UTC, via Paramiko (`srv953800`)

```text
%Cpu(s):  0.2 us,  0.2 sy,  0.0 ni, 99.3 id,  0.0 wa,  0.0 hi,  0.0 si,  0.2 st

 r  b   swpd   free   buff   cache  ...  us sy id wa st
 0  0   4096 479192 917448 12681560 ...   1  1 96  0  2
 0  0   4096 479952 917448 12681600 ...   1  1 98  0  0
```

### Comparação

| Métrica | `.112` (`srv953808`) | `.108` (`srv953800`) |
|---|---|---|
| **Steal time** | **90,6%** | **0,2%** |
| Idle | 0,0% | 99,3% |
| vCPUs | 2 | 4 |
| Load average | 9,53 | 0,21 |
| RAM total | 7,8 GB | 15 GB |
| RAM disponível | 4,3 GB | 12 GB |
| Swap | ausente | 2 GB |
| Disco | 97 GB (35%) | 194 GB (21%) |
| Fila de execução (`r`) | 12–24 | 0 |
| Containers no host | 20 | 18 |

**Confirmacao pratica.** No deploy da release `7406439`, o
`docker pull` concluiu em **menos de 2 segundos** e os servicos ficaram
saudaveis em 21s. Na `.112`, o mesmo passo ficou **mais de uma hora**
sem concluir. O gargalo era CPU indisponivel, nao banda.

### Containers do makucho

| Container | Estado | CPU | Memória |
|---|---|---|---|
| makucho-nginx | healthy | 0,00% | 4,7 MiB / 48 MiB |
| makucho-web | healthy | 0,00% | 54,6 MiB / 256 MiB |
| makucho-api | healthy | 0,00% | 84,9 MiB / 192 MiB |
| makucho-postgres | healthy | 0,00% | 39,0 MiB / 256 MiB |

### Efeito sobre decisões anteriores

**ADR 0003 volta a ser viável.** Ele aceitava processar video numa VPS
de 2 vCPU/8 GB sem swap, com risco declarado. A `.108` entrega 4 vCPU e
15 GB — exatamente a recomendacao da secao 17.1 do plano — e ainda tem
2 GB de swap como protecao. Os `mem_limit` apertados continuam validos
como defesa contra pico, mas deixam de ser o fator limitante.

**Revisar:** os tetos dos workers do studio foram reduzidos (768m/896m)
por causa do orcamento apertado da `.112`. Com 12 GB disponiveis, cabe
reavaliar — preferencialmente com medicao sob carga real, nao por
estimativa.

### Outras aplicações no host

aprenderia (4), digiurban (3), ferraco (2), ultrazend (5), makucho (4).
Total 18 containers. O protocolo proibe consolidar bancos de clientes
por conveniencia: registrado como fato, nao como proposta.
