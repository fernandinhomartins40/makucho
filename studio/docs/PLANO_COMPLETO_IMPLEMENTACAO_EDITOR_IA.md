# Plano completo de implementação — Editor Inteligente de Vídeos

> Documento operacional para orientar Codex, Claude ou outra IA programadora.
> Versão 1.0 — 14 de setembro de 2026.

## 1. Objetivo deste documento

Este arquivo converte o planejamento conceitual do produto em uma sequência executável de arquitetura, desenvolvimento, testes e implantação.

Ele deve ser usado como plano de trabalho. O arquivo `CONTEXTO_MESTRE_EDITOR_IA.md` é a fonte complementar para propósito, regras, exemplos e decisões de produto.

Antes de alterar uma decisão estrutural, a IA deve:

1. consultar os dois documentos;
2. identificar se a mudança contradiz uma regra já aprovada;
3. registrar a decisão em um ADR;
4. atualizar os dois documentos quando a mudança for aprovada.

## 2. Resultado esperado

Construir uma plataforma PWA mobile-first que feche o ciclo:

```text
planejamento → roteiro → gravação → upload → análise → edição → revisão → render → download
```

O produto recebe vídeos reais gravados pelo cliente falando para a câmera. A IA atua como diretora/editor: transcreve, classifica, seleciona, remove e, quando semanticamente seguro, reorganiza trechos já gravados. Depois o sistema aplica identidade visual, legendas, música, assets, transições e componentes gráficos.

O produto não gera a fala da pessoa e não inventa cenas.

## 3. Princípios não negociáveis

1. **Fonte real:** toda fala do vídeo final deve existir no vídeo bruto.
2. **Integridade semântica:** cortes e reordenações não podem mudar significado, intenção, negação, causalidade, ordem lógica ou atribuição.
3. **Original imutável:** o arquivo enviado nunca é alterado destrutivamente.
4. **IA declarativa:** a IA produz JSON; nunca produz comandos executáveis.
5. **Render determinístico:** código próprio compila um `EditPlan` validado para FFmpeg e Remotion.
6. **Controle humano:** toda sugestão relevante pode ser revisada, explicada e desfeita.
7. **Mobile como controle:** uploads e processamento pesado acontecem no servidor, não no celular.
8. **Proxy no editor:** preview usa proxy; render final usa o original.
9. **Privacidade:** arquivos, dados, prompts e URLs assinadas são isolados por usuário/tenant.
10. **Evolução incremental:** não tentar reproduzir o CapCut inteiro no primeiro ciclo.

## 4. Escopo do produto

### 4.1 Módulos de experiência

| Módulo | Responsabilidade |
|---|---|
| Script Studio | Gerar e revisar roteiros coerentes com objetivo, perfil e framework |
| Record Studio | Teleprompter e gravação guiada pelo celular |
| AI Editor | Analisar o bruto, propor cortes, narrativa e acabamento |
| Brand Studio | Guardar logos, fontes, cores, músicas e componentes visuais |
| Communication Profile | Definir o jeito de falar, estruturar e chamar para ação |
| Engagement Engine | Avaliar hook, ritmo, clareza, autoridade, payoff e CTA |
| Render Center | Acompanhar filas, progresso, falhas, histórico e downloads |

### 4.2 Escopo do MVP 1

- cadastro, login e recuperação de acesso;
- onboarding inicial;
- Brand Studio básico;
- Communication Profile;
- Script Studio com modos de roteiro;
- teleprompter mobile;
- criação de projeto e upload direto/resumível;
- validação de mídia e metadados com ffprobe;
- proxy, áudio e thumbnails;
- transcrição com timestamps por palavra e VAD;
- detecção de silêncios;
- análise editorial pela IA;
- seleção de hook e melhores trechos;
- reorganização semanticamente segura;
- relatório explicável de decisões;
- legendas, título, logo, música, intro/outro e CTA;
- preview da composição;
- ajustes simples por formulário, sem timeline complexa;
- render vertical 9:16;
- controle de jobs, retry, cancelamento e download;
- auditoria, logs, métricas e limpeza de temporários.

### 4.3 Fora do MVP 1

- clone completo do CapCut;
- colaboração simultânea;
- app nativo;
- múltiplas câmeras;
- geração de avatar, voz ou fala;
- geração automática de B-roll por IA;
- publicação direta nas redes sociais;
- edição frame a frame avançada;
- múltiplos renders concorrentes em VPS pequena;
- aprendizado automático com métricas reais de redes sociais.

### 4.4 Evolução planejada

**MVP 2 — Editor controlável**

- timeline editável;
- drag-and-drop;
- múltiplas tracks;
- ajuste de trims e ordem;
- edição de captions;
- substituição de assets, música, intro e transições.

**V3 — Distribuição multiformato**

- presets de edição;
- 9:16, 1:1, 4:5 e 16:9;
- versões para Reels, TikTok e Shorts;
- A/B de hooks;
- templates reutilizáveis.

**V4 — Otimização personalizada**

- variantes emocional, contrarian e resultado;
- ingestão autorizada de métricas reais;
- análise de retenção, conclusão, compartilhamento e conversão;
- recomendações específicas por criador;
- aprendizado de preferências editoriais aprovadas/rejeitadas.

## 5. Arquitetura escolhida

### 5.1 Estratégia

Usar um monorepo com aplicação modular e workers separáveis. No início, os containers podem estar na mesma VPS. A fila e os contratos permitem mover o processamento para outro servidor sem reescrever o produto.

```text
PWA Next.js
    │
    ▼
API Fastify ─── PostgreSQL
    │               │
    ├── Redis/BullMQ┤
    │               │
    ▼               ▼
Workers ─────── Cloudflare R2
  ├─ media/FFmpeg
  ├─ transcription/faster-whisper
  └─ render/Remotion + FFmpeg
```

### 5.2 Stack-base

| Camada | Escolha inicial |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web/PWA | Next.js, React, TypeScript strict |
| UI | Tailwind CSS + shadcn/ui, design system próprio |
| PWA | manifest + service worker; avaliar Serwist na implementação |
| Estado local | Zustand |
| Dados remotos | TanStack Query |
| API | Node.js + Fastify |
| Validação/contratos | Zod + OpenAPI |
| Banco | PostgreSQL |
| ORM | Drizzle ORM |
| Fila | BullMQ + Redis |
| Object storage | Cloudflare R2, interface compatível com S3 |
| Mídia | FFmpeg + ffprobe |
| Transcrição | faster-whisper + Silero VAD |
| IA editorial | adapter de provedor; DeepSeek como primeira integração |
| Visão futura | modelo multimodal apenas sobre keyframes selecionados |
| Motion graphics | Remotion |
| Autenticação | Better Auth; decisão final registrada em ADR |
| Infra | Ubuntu LTS + Docker Compose + proxy reverso/HTTPS |
| Observabilidade | logs JSON, métricas e rastreamento de jobs |
| Testes | Vitest, Playwright e testes de integração com containers |

As versões devem ser fixadas no lockfile no início da implementação, após conferir documentação, compatibilidade e licenças.

### 5.3 Estrutura do repositório

```text
/
├─ apps/
│  ├─ web/                    # Next.js PWA
│  └─ api/                    # Fastify e OpenAPI
├─ workers/
│  ├─ media/                  # ffprobe, proxy, áudio, frames
│  ├─ transcription/          # faster-whisper e VAD
│  └─ render/                 # Remotion e FFmpeg
├─ packages/
│  ├─ contracts/              # DTOs, eventos e schemas Zod
│  ├─ db/                     # Drizzle, migrations e repositories
│  ├─ timeline-schema/        # Documento de composição versionado
│  ├─ editor-engine/          # regras de cortes e montagem
│  ├─ engagement-engine/      # classificação, score e recomendações
│  ├─ semantic-safety/        # validações de sentido e dependências
│  ├─ brand-system/           # tokens, assets e componentes
│  ├─ ai-prompts/             # prompts versionados e avaliações
│  ├─ storage/                # adapter S3/R2 e URLs assinadas
│  ├─ observability/          # logs, métricas e correlação
│  ├─ config/                 # env schemas e config compartilhada
│  └─ ui/                     # componentes do design system
├─ remotion/
│  ├─ compositions/
│  └─ components/
├─ infra/
│  ├─ docker/
│  ├─ compose/
│  ├─ proxy/
│  └─ scripts/
├─ docs/
│  ├─ adr/
│  ├─ api/
│  └─ runbooks/
└─ tests/
   ├─ fixtures/
   ├─ integration/
   └─ e2e/
```

## 6. Modelo de domínio

### 6.1 Entidades principais

| Entidade | Função |
|---|---|
| users | identidade e acesso |
| workspaces | limite organizacional/tenant |
| memberships | papel do usuário no workspace |
| brand_profiles | identidade visual ativa e versões |
| communication_profiles | preferências de voz e estrutura |
| assets | metadados, tipo, storage key e estado |
| scripts | roteiros e versões |
| script_blocks | hook, problema, autoridade, solução, CTA etc. |
| recordings | gravações vinculadas ou não a um roteiro |
| projects | unidade de trabalho editorial |
| media_sources | original, proxy, áudio, thumbnail e keyframes |
| transcriptions | texto, idioma, versão e confiança |
| transcript_segments | segmentos temporais |
| transcript_words | timestamps por palavra |
| detected_regions | fala, silêncio, cena e qualidade |
| ai_analyses | entrada, modelo, prompt, saída e custo |
| edit_plans | composição JSON versionada |
| edit_plan_versions | histórico e origem de cada alteração |
| engagement_reports | scores, alertas e justificativas |
| renders | saída, configuração, progresso e resultado |
| jobs | fila, tentativas, idempotência e erro |
| audit_events | ações sensíveis e mudanças de estado |

Todas as tabelas de dados do cliente devem conter `workspace_id` ou ser alcançáveis apenas por uma relação que imponha esse isolamento.

### 6.2 Estados de projeto

```text
DRAFT
→ UPLOADING
→ INGESTING
→ TRANSCRIBING
→ ANALYZING
→ PROPOSAL_READY
→ USER_EDITING
→ READY_TO_RENDER
→ RENDERING
→ QUALITY_CHECK
→ COMPLETED
```

Estados alternativos:

- `FAILED_RETRYABLE`
- `FAILED_FINAL`
- `CANCEL_REQUESTED`
- `CANCELLED`
- `ARCHIVED`

Não atualizar estado diretamente na interface. Toda transição deve passar por serviço de domínio com regras e evento de auditoria.

### 6.3 Estados de job

```text
WAITING → ACTIVE → COMPLETED
                 ↘ RETRY_DELAY → ACTIVE
                 ↘ FAILED
WAITING/ACTIVE → CANCEL_REQUESTED → CANCELLED
```

Cada job terá:

- `job_id` e `correlation_id`;
- `project_id` e `workspace_id`;
- `type` e `schema_version`;
- chave de idempotência;
- tentativas e backoff;
- heartbeat/lease;
- progresso de 0 a 100;
- etapa legível para o usuário;
- erro interno estruturado e mensagem pública segura;
- timestamps e tempos de execução.

## 7. Contratos centrais

### 7.1 EditPlan como source of truth

O `EditPlan` é o documento único usado pelo preview e pelo render. Ele deve ser tipado, versionado, validado e migrável.

```ts
type EditPlanV1 = {
  schemaVersion: "1.0";
  projectId: string;
  sourceMediaId: string;
  fps: 30;
  canvas: {
    aspectRatio: "9:16";
    width: 1080;
    height: 1920;
  };
  targetDurationMs: number;
  framework: string;
  clips: Array<{
    id: string;
    sourceStartMs: number;
    sourceEndMs: number;
    timelineStartMs: number;
    role: "hook" | "problem" | "context" | "authority" | "proof" |
      "insight" | "solution" | "payoff" | "cta";
    transcriptSegmentIds: string[];
    semanticRisk: "low" | "medium" | "high";
    reason: string;
  }>;
  captions: CaptionTrack;
  overlays: Overlay[];
  music?: MusicTrack;
  soundEffects: SoundEffect[];
  transitions: Transition[];
  intro?: ComponentRef;
  outro?: ComponentRef;
  render: RenderSettings;
};
```

Validações obrigatórias:

- intervalos dentro da duração do original;
- começo menor que fim;
- timeline sem sobreposição inválida;
- IDs pertencentes ao workspace/projeto;
- duração dentro do limite do preset;
- assets aprovados e existentes;
- formatos, FPS e resolução permitidos;
- nenhuma string tratada como comando;
- nenhuma URL arbitrária;
- nenhuma fala sem ligação com timestamps reais;
- ordem de dependências discursivas válida.

### 7.2 Resposta da IA editorial

A IA não devolve o `EditPlan` final diretamente. Ela devolve uma proposta editorial restrita:

```json
{
  "schemaVersion": "1.0",
  "framework": "authority_education",
  "targetDurationMs": 57000,
  "segments": [
    {
      "sourceStartMs": 138200,
      "sourceEndMs": 144900,
      "role": "hook",
      "score": 0.94,
      "dependencies": [],
      "reason": "Frase direta, consequência financeira e curiosidade",
      "semanticRisk": "low"
    }
  ],
  "warnings": [],
  "missingBlocks": ["cta"]
}
```

Fluxo obrigatório:

```text
transcrição + perfil + regras
→ modelo de IA
→ JSON restrito
→ parse seguro
→ Zod
→ validação temporal
→ validação semântica
→ compilador interno
→ EditPlan versionado
```

Saídas inválidas podem passar por no máximo uma rotina controlada de reparo de JSON. Persistindo o erro, o job falha de modo explicável.

### 7.3 Eventos internos mínimos

- `project.created`
- `upload.completed`
- `media.validated`
- `proxy.created`
- `audio.extracted`
- `transcription.completed`
- `analysis.completed`
- `edit_plan.created`
- `edit_plan.updated`
- `render.requested`
- `render.progressed`
- `render.completed`
- `render.failed`
- `project.cancelled`

Eventos devem possuir versão, timestamp, origem, correlation ID e payload validado.

## 8. Pipeline de processamento

1. Criar projeto em rascunho.
2. Solicitar sessão de upload autorizada.
3. Enviar o vídeo diretamente ao object storage.
4. Confirmar upload e registrar checksum/metadados.
5. Validar tamanho, MIME real, container, codecs e duração.
6. Executar ffprobe.
7. Criar proxy 720p otimizado para preview.
8. Extrair áudio mono em formato adequado à transcrição.
9. Gerar thumbnails.
10. Transcrever com faster-whisper.
11. Persistir segmentos, palavras, probabilidades e idioma.
12. Executar VAD e mapear silêncios.
13. Detectar cenas/keyframes quando habilitado.
14. Relacionar gravação ao roteiro, se houver.
15. Executar Script Match.
16. Classificar segmentos por função comunicacional.
17. Executar Engagement Engine.
18. Solicitar proposta editorial à IA.
19. Validar JSON com Zod.
20. Executar verificações temporais e semânticas.
21. Compilar o EditPlan.
22. Gerar explicações e Engagement Score.
23. Exibir preview e controles simples.
24. Criar nova versão a cada ajuste do usuário.
25. Enfileirar render com chave de idempotência.
26. Baixar/streamar apenas recursos necessários ao worker.
27. Renderizar componentes Remotion.
28. Executar composição/encoding FFmpeg.
29. Validar duração, resolução, codecs, áudio e arquivo reproduzível.
30. Enviar resultado ao storage.
31. Limpar temporários.
32. Liberar download por URL temporária.

## 9. Regras do Engagement Engine

### 9.1 Funções comunicacionais

- hook;
- problema/dor;
- contexto;
- curiosity gap;
- autoridade demonstrada;
- apresentação pessoal;
- prova/social proof;
- insight;
- solução;
- pattern interrupt;
- payoff;
- oferta;
- CTA.

### 9.2 Indicadores iniciais

| Indicador | Sinais considerados |
|---|---|
| Hook | especificidade, consequência, novidade, tensão e abertura de loop |
| Ritmo | densidade de informação, pausas e redundância |
| Clareza | frase completa, referente identificável e baixa ambiguidade |
| Autoridade | experiência demonstrada antes de apenas declarada |
| Retenção estimada | progressão, curiosidade e ausência de introdução vazia |
| Payoff | entrega da promessa aberta pelo hook |
| CTA | presença, naturalidade e coerência com o objetivo |

Exibição sugerida:

```text
HOOK               92/100
RITMO              81/100
AUTORIDADE         88/100
CLAREZA            91/100
RETENÇÃO ESTIMADA  84/100
CTA                62/100
```

O score é heurístico, não promessa de viralização. A interface deve explicar os fatores e evitar alegações garantidas.

### 9.3 Segurança semântica

Bloquear ou exigir revisão manual quando houver:

- negação separada da frase;
- pronomes/referentes sem contexto;
- “primeiro/segundo/terceiro” fora de ordem;
- resposta sem pergunta necessária;
- causa e efeito reconstruídos artificialmente;
- mudança de sujeito ou atribuição;
- números sem qualificador;
- cortes que alterem ironia ou ressalva;
- junção que faça parecer que a pessoa afirmou algo diferente;
- baixa confiança de transcrição em trecho crítico.

Trechos de risco alto não entram automaticamente na edição.

## 10. Brand Studio

### 10.1 Dados cadastráveis

- logo principal, negativa, compacta e marca d'água;
- fontes principal e secundária, com licença registrada;
- paleta e tokens de cor;
- PNG, WebP, SVG, GIF, MP4, WebM e Lottie;
- intros, outros, bumpers, lower thirds e CTA graphics;
- transições aprovadas;
- músicas por intenção: informativa, inspiradora, urgente, storytelling e promoção;
- efeitos: pop, whoosh, click, impact e notification;
- estilos de legenda e título.

### 10.2 Regras de asset

- validar MIME pelos bytes, não apenas extensão;
- registrar dimensões, duração, codec e transparência;
- normalizar nomes e evitar execução de conteúdo ativo;
- armazenar licença, autor e restrições quando aplicável;
- gerar preview seguro;
- permitir desativar sem apagar histórico;
- impedir referência cruzada entre workspaces.

## 11. Communication Profile e Script Studio

### 11.1 Perfil de comunicação

Campos mínimos:

- tom;
- energia;
- tamanho das frases;
- velocidade desejada;
- abertura preferida;
- tipos de hook permitidos;
- apresentação pessoal atrasada ou desativada;
- autoridade antes da apresentação;
- frameworks permitidos;
- nível de storytelling e humor;
- palavrões permitidos/proibidos;
- estilo do CTA;
- duração alvo;
- agressividade de cortes;
- número de pattern interrupts;
- palavras proibidas;
- fillers removíveis.

### 11.2 Modos de roteiro

- roteiro completo;
- tópicos;
- bullet teleprompter;
- improviso guiado;
- storytelling por momentos.

### 11.3 Variações de hook

- curiosidade;
- contrarian;
- resultado;
- dor/problema.

### 11.4 Script Match

Após a gravação, comparar roteiro planejado e fala real:

```text
ADERÊNCIA AO ROTEIRO: 87%
Hook        encontrado
Problema    encontrado
Autoridade  encontrado
Solução 1   encontrada
Solução 2   encontrada
Solução 3   ausente
CTA         encontrado
```

O sistema pode sugerir uma versão com blocos encontrados, mas não pode preencher com uma fala que não foi gravada.

## 12. Componentes Remotion iniciais

- `HookTitle`
- `AnimatedCaption`
- `LowerThird`
- `LogoBug`
- `CTA`
- `ProgressBar`
- `QuoteCard`
- `StatCard`
- `EmojiPop`
- `ImageOverlay`
- `Intro`
- `Outro`

Cada componente recebe props validadas. A IA escolhe somente entre componentes, variantes e parâmetros permitidos.

## 13. API mínima

### Autenticação e perfil

- `POST /auth/*`
- `GET/PATCH /me`
- `GET/PATCH /workspaces/:id`

### Marca e comunicação

- `GET/PUT /brand-profile`
- `POST/GET/PATCH /assets`
- `POST /assets/:id/deactivate`
- `GET/PUT /communication-profile`

### Roteiros e gravação

- `POST/GET/PATCH /scripts`
- `POST /scripts/:id/generate`
- `POST /scripts/:id/hooks`
- `POST /recordings`
- `POST /recordings/:id/complete`

### Projetos e upload

- `POST/GET/PATCH /projects`
- `POST /projects/:id/uploads`
- `POST /projects/:id/uploads/complete`
- `POST /projects/:id/analyze`
- `GET /projects/:id/status`

### Edição e render

- `GET /projects/:id/transcription`
- `GET /projects/:id/engagement-report`
- `GET/POST /projects/:id/edit-plans`
- `POST /projects/:id/renders`
- `GET /renders/:id`
- `POST /renders/:id/cancel`
- `POST /renders/:id/download-url`

Rotas não devem revelar storage keys internas nem aceitar `workspace_id` arbitrário do cliente quando ele puder ser derivado da sessão.

## 14. UX mobile-first

Fluxo principal:

```text
Novo vídeo
→ escolher/gravar
→ objetivo
→ framework e duração
→ analisar
→ acompanhar etapas
→ revisar sugestão
→ ajustar
→ renderizar
→ baixar
```

Durante análise, mostrar etapas reais:

- enviando vídeo;
- validando arquivo;
- preparando preview;
- analisando fala;
- detectando silêncios;
- encontrando trechos fortes;
- estruturando narrativa;
- aplicando identidade;
- preparando sugestão.

Não exibir progresso falso. Quando não houver porcentagem confiável, mostrar etapa e tempo decorrido.

### 14.1 Tela de sugestão

Mostrar:

- duração original e sugerida;
- framework escolhido;
- sequência de blocos e timestamps;
- hook selecionado e motivo;
- trechos removidos e motivo;
- avisos semânticos;
- blocos ausentes;
- Engagement Score;
- preview;
- ações de aceitar, restaurar, trocar e editar.

## 15. Segurança, privacidade e conformidade

- autenticação e autorização sempre no servidor;
- RBAC por workspace;
- consultas com isolamento multi-tenant testado;
- secrets fora do Git e nunca enviados ao frontend;
- HTTPS obrigatório;
- banco e Redis sem exposição pública;
- URLs assinadas curtas e de operação limitada;
- CORS restritivo;
- rate limiting por IP, usuário e workspace;
- limites de tamanho, duração e tipo de arquivo;
- checksum e validação de conteúdo;
- nomes internos aleatórios, sem confiar no nome enviado;
- proteção contra path traversal e SSRF;
- prompts tratam transcrição como dado não confiável;
- LLM sem ferramentas de execução e sem acesso a secrets;
- política de retenção e exclusão de mídia;
- backups testados de banco e configurações;
- trilha de auditoria;
- dependências verificadas e imagens Docker mínimas;
- usuário sem privilégios dentro dos containers;
- temporários por job e limpeza garantida;
- consentimento para uso de material audiovisual;
- não usar vídeos do cliente para treinar modelos sem autorização explícita.

## 16. Observabilidade e operação

### Logs

Formato JSON com:

- timestamp;
- nível;
- serviço;
- environment;
- correlation ID;
- workspace/project/job ID pseudonimizado quando necessário;
- etapa;
- duração;
- erro tipado.

Nunca registrar tokens, URLs assinadas, conteúdo integral do roteiro ou transcrição em produção.

### Métricas

- uploads iniciados/concluídos/falhos;
- tempo e tamanho de upload;
- duração original;
- tempo de proxy/transcrição/análise/render;
- razão tempo de render/duração final;
- CPU, RAM e disco temporário;
- profundidade e idade da fila;
- tentativas/falhas por tipo de job;
- custo de IA por projeto;
- taxa de aceitação e ajustes das sugestões.

### Alertas

- disco temporário acima de 75%;
- fila sem consumo;
- job sem heartbeat;
- falhas repetidas;
- banco/Redis indisponível;
- storage ou IA acima da taxa de erro;
- backup ausente ou teste de restauração falho.

## 17. Infraestrutura e hospedagem

### 17.1 Configuração inicial recomendada

- VPS Ubuntu LTS;
- 4 vCPU;
- 16 GB RAM;
- ao menos 150–200 GB NVMe para sistema, imagens e temporários;
- Docker Compose;
- um job pesado por vez;
- originais, proxies, assets e renders no Cloudflare R2;
- volumes persistentes apenas para PostgreSQL/Redis e dados operacionais;
- swap moderada apenas como proteção, não como capacidade normal.

Uma VPS de 2 vCPU/8 GB pode atender um piloto com um único cliente, pouco volume e processamento sequencial, mas será mais lenta e não é a recomendação comercial principal.

### 17.2 Containers iniciais

- `web`
- `api`
- `postgres`
- `redis`
- `worker-media`
- `worker-transcription`
- `worker-render`
- `reverse-proxy`

Mesmo na mesma máquina, manter responsabilidades e filas separadas. Aplicar limites de CPU/RAM e concorrência.

### 17.3 Escalabilidade

Primeira evolução:

```text
VPS principal: web + API + banco + Redis
Servidor worker: FFmpeg + faster-whisper + Remotion
Storage: R2
```

Depois, escalar workers por fila e tipo de carga. O banco continua guardando metadados; vídeos permanecem no object storage.

### 17.4 Entrega e deploy

- build de imagens em CI, não na VPS de produção;
- registry privado;
- migrations como etapa explícita e reversível;
- deploy com health checks;
- smoke test após implantação;
- rollback para imagem anterior;
- configuração validada na inicialização;
- staging com arquivos sintéticos/consentidos;
- nunca rodar seed destrutivo em produção.

## 18. Estratégia de testes

### 18.1 Unitários

- schemas Zod;
- máquina de estados;
- cálculo de timestamps;
- detecção de overlaps;
- compilador de EditPlan;
- regras de dependência discursiva;
- cálculo do score;
- permissões e retenção.

### 18.2 Integração

- PostgreSQL, Redis e storage compatível com S3;
- API → fila → worker;
- upload → ingestão;
- transcrição → proposta;
- EditPlan → render;
- retry e idempotência;
- cancelamento e limpeza;
- isolamento entre dois workspaces.

### 18.3 E2E

- onboarding e Brand Studio;
- criar roteiro;
- usar teleprompter;
- enviar vídeo;
- acompanhar análise;
- revisar sugestão;
- ajustar legenda/título;
- renderizar e baixar;
- recuperar falha transitória;
- cancelar render.

### 18.4 Golden tests de mídia

Manter fixtures pequenas e autorizadas para validar:

- duração;
- resolução;
- sincronização áudio/vídeo;
- cortes em timestamps;
- captions;
- transparência/posição de overlays;
- normalização de áudio;
- hash perceptual de frames selecionados.

### 18.5 Avaliação da IA

Criar dataset com exemplos aprovados, incluindo pegadinhas semânticas:

- negação;
- enumeração;
- referência pronominal;
- ressalva;
- ironia;
- números e comparações;
- frase dependente de contexto;
- hook forte porém enganoso.

Medir:

- JSON válido;
- cobertura de blocos;
- precisão dos timestamps;
- preservação de significado;
- concordância humana;
- taxa de trechos de alto risco aceitos incorretamente.

## 19. Fases de implementação

### Fase 0 — Fundação e decisões

Entregáveis:

- repositório, convenções e CI;
- ADRs iniciais;
- diagrama de arquitetura;
- modelo de dados;
- estados de projeto/job;
- schemas `EditPlan`, proposta de IA e eventos;
- threat model;
- orçamento de recursos;
- fixtures de mídia.

Critério de aceite: contratos compilam, migrations sobem em ambiente limpo e o pipeline de CI passa.

### Fase 1 — Plataforma base

Entregáveis:

- autenticação;
- workspace e isolamento;
- layout mobile-first;
- PostgreSQL/Redis;
- object storage;
- CRUD de projetos;
- URLs de upload;
- observabilidade mínima.

Critério de aceite: dois usuários de workspaces distintos não acessam dados ou arquivos um do outro.

### Fase 2 — Brand e Communication Studio

Entregáveis:

- cadastro e validação de assets;
- perfil visual;
- estilos de captions;
- músicas, intros, outros e CTA;
- perfil de comunicação;
- presets iniciais.

Critério de aceite: perfil versionado é aplicado a um projeto sem expor assets de outro workspace.

### Fase 3 — Script e Record Studio

Entregáveis:

- geração de roteiro estruturado;
- modos completo, tópicos, bullets, improviso e storytelling;
- variações de hook;
- editor de roteiro;
- teleprompter responsivo;
- gravação/upload pelo navegador quando suportado;
- vínculo entre roteiro e gravação.

Critério de aceite: o usuário gera, edita, grava e associa um roteiro ao projeto pelo celular.

### Fase 4 — Ingestão e transcrição

Entregáveis:

- confirmação segura de upload;
- ffprobe;
- proxy 720p;
- áudio;
- thumbnails;
- faster-whisper;
- timestamps por palavra;
- VAD;
- progresso real e retries.

Critério de aceite: uma gravação válida produz proxy e transcrição sincronizada; falhas não deixam temporários órfãos.

### Fase 4a — Entrada de vídeo

> Acrescentada em 2026-09-21. Detalhada na seção 27.

Entregáveis:

- módulo `projects` (CRUD);
- módulo `media` e protocolo de upload resumível;
- tela de envio de arquivo, com validação local e retomada;
- `MediaRecorder` em `/gravar`, com revisão antes de enviar;
- worker de mídia consumindo a fila;
- worker de transcrição.

Critério de aceite: um vídeo real entra pelos dois caminhos — gravado e
enviado — e chega ao estado `transcrito` sem intervenção técnica.

Esta fase precede a 5 porque, sem ela, nenhuma chamada de IA tem sobre o que
agir.

### Fase 5 — Inteligência editorial

> Subdividida em 2026-09-21. As seis chamadas estão na seção 26.

**5a — Fundação.** Adapter `ProvedorDeIA`, provedor falso para testes, prompts
versionados, `GET /settings/ai-usage` e as travas de custo por workspace.
Primeiro porque as outras dependem dela, e porque é onde mora o limite de
gasto: ligar chamadas sem teto configurado é erro que só aparece na fatura.

**5b — Seleção e risco (#3 e #5).** Segmentação semântica, Engagement Engine,
saída estruturada, validação semântica, explicações de corte e geração do
EditPlan. É o caminho crítico do produto.

**5c — Roteiro (#1 e #2).** Geração e sugestões. Independe de vídeo, então
pode sair antes da 5b se o cliente precisar.

**5d — Candidatos e refino (#4 e #6).** Melhorias sobre uma proposta que já
funciona.

Critério de aceite: nenhum trecho inexistente aparece, os testes de
negação/ordem/dependência passam, e cada chamada degrada sem travar a tela
(seção 26.9).

### Fase 6 — Preview e composição

Entregáveis:

- player com proxy;
- captions;
- componentes Remotion;
- títulos, overlays, logo e música;
- formulário de ajustes simples;
- versionamento e undo.

Critério de aceite: preview e render interpretam o mesmo EditPlan sem divergência funcional relevante.

### Fase 7 — Render e entrega

Entregáveis:

- fila de render;
- compilador interno para FFmpeg/Remotion;
- progresso e cancelamento;
- QC automático;
- upload do MP4;
- download temporário;
- retenção e limpeza.

Critério de aceite: saída 1080×1920 H.264/AAC é reproduzível, sincronizada e vinculada ao projeto correto.

### Fase 8 — Hardening e piloto

Entregáveis:

- teste de carga;
- segurança e isolamento;
- backups/restauração;
- runbooks;
- monitoramento;
- acessibilidade;
- tratamento de falhas;
- teste real com o cliente;
- medição de tempos e ajuste da VPS.

Critério de aceite: piloto executa o fluxo completo com dados reais autorizados e sem intervenção técnica no caminho feliz.

## 20. Backlog inicial priorizado

### P0 — bloqueadores

- contratos e schemas;
- autenticação e tenant isolation;
- upload seguro;
- pipeline de mídia;
- transcrição;
- proposta editorial validada;
- EditPlan;
- preview/render consistentes;
- idempotência, cancelamento e limpeza;
- logs e erros seguros.

### P1 — valor do produto

- Brand Studio;
- Communication Profile;
- Script Studio;
- teleprompter;
- Script Match;
- Engagement Score explicável;
- presets de autoridade, viral educativo, storytelling e venda.

### P2 — evolução

- timeline avançada;
- visão computacional;
- múltiplos formatos;
- variações A/B;
- métricas de redes sociais;
- recomendações personalizadas.

## 21. Critérios de pronto globais

Uma história só está pronta quando:

- possui critérios de aceite verificados;
- passou por lint, typecheck e testes;
- inclui autorização e isolamento quando manipula dados;
- possui logs e mensagens de erro adequadas;
- não expõe secrets ou PII;
- mantém idempotência quando cria efeitos externos;
- atualiza schemas/documentação quando necessário;
- funciona em viewport mobile definida;
- possui estado vazio, carregando, sucesso e falha;
- não quebra o original nem versões anteriores;
- inclui migration/rollback quando afeta banco;
- foi observada no ambiente de staging.

## 22. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| IA alterar sentido | regras semânticas, risco por trecho e revisão humana |
| JSON inválido | schema estrito, reparo limitado e falha segura |
| execução arbitrária | IA sem shell; compiler com allowlist |
| VPS sobrecarregada | concorrência 1, métricas, filas e worker separável |
| disco cheio | R2, quota temporária e limpeza por job |
| upload interrompido | multipart/resumível e retomada |
| transcrição errada | confiança, edição manual e glossário/hotwords |
| preview diferente do render | mesmo EditPlan e golden tests |
| custos de IA/storage | quotas, medição por projeto e retenção |
| licença de fontes/músicas | metadados de licença e assets aprovados |
| promessa de viralização | score explicável tratado como estimativa |
| dependência de provedor | adapters para IA e storage |
| perda de dados | backup, restauração testada e original imutável |

## 23. Decisões ainda abertas

Registrar como ADR antes da implementação correspondente:

1. nome comercial do produto;
2. identidade visual própria ou vínculo com outra marca;
3. Better Auth versus alternativa gerenciada;
4. DeepSeek: modelo exato por chamada, política de dados e fallback — as
   seis chamadas e a escolha de modelo estão na seção 26; falta fixar os
   nomes conferindo a documentação oficial (ADR 0010);
5. limites de upload, duração e retenção;
6. política de cobrança e quotas;
7. proxy reverso: Caddy ou Nginx;
8. browser recording suportado por plataforma;
9. modelo do faster-whisper por hardware e idioma;
10. se o banco ficará na mesma VPS durante o piloto;
11. requisitos legais específicos e termos do cliente;
12. domínio e provedor final da VPS.

Nenhuma dessas pendências bloqueia a Fase 0.

## 24. Ordem recomendada para a IA programadora

Prompt de execução:

```text
Leia integralmente PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md e
CONTEXTO_MESTRE_EDITOR_IA.md.

Não implemente o produto inteiro de uma vez.

Comece pela Fase 0. Produza arquitetura, ADRs, modelo de dados, estados,
schemas Zod, contratos de eventos, threat model e backlog técnico.

Antes de codificar cada fase:
1. apresente o recorte;
2. enumere arquivos que serão criados ou alterados;
3. identifique decisões abertas relevantes;
4. escreva testes/critério verificável;
5. implemente em pequenos commits lógicos;
6. execute lint, typecheck e testes;
7. atualize a documentação.

Regras absolutas:
- a IA não gera a fala nem cria cenas;
- toda fala usada deve apontar para timestamps do original;
- preserve significado e intenção;
- não execute comandos produzidos pelo modelo;
- valide toda saída de IA;
- original imutável;
- preview e render usam o mesmo EditPlan;
- processamento pesado somente no backend;
- respeite isolamento multi-tenant.
```

## 25. Referências técnicas oficiais verificadas

- [Remotion `renderMedia()`](https://www.remotion.dev/docs/renderer/render-media): render programático, `inputProps`, progresso, concorrência e cancelamento.
- [FFmpeg Filters](https://ffmpeg.org/ffmpeg-filters.html): filtergraphs, transformações, overlays e composição.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper): timestamps por palavra, VAD e transcrição.
- [Cloudflare R2 — Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/): uploads/downloads temporários sem expor credenciais.
- [BullMQ — Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs): desenho de jobs repetíveis e seguros.
- [BullMQ — Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs): tentativas e backoff.
- [Next.js — Progressive Web Apps](https://nextjs.org/docs/app/guides/progressive-web-apps): manifest, instalação e integração PWA.


---

## 26. Uso de IA por função (DeepSeek)

> Acrescentado em 2026-09-21, depois que o redesenho do frontend multiplicou
> os pontos em que a interface promete IA. A seção 19 tratava disso como um
> entregável só — "adapter DeepSeek" na Fase 5 —, o que já não descreve o
> produto: são **seis chamadas distintas**, com prompts, esquemas de saída,
> custo e modo de falha diferentes.

### 26.1 Princípio que não muda

A regra da seção 3 continua valendo sem exceção: **a IA nunca inventa fala**.
Toda chamada abaixo ou (a) escolhe entre trechos que existem na gravação, ou
(b) escreve texto que a pessoa vai ler em voz alta antes de gravar. Nenhuma
escreve legenda que não foi dita, nem "melhora" uma frase já gravada.

A distinção entre (a) e (b) é o que define o risco de cada chamada, e por isso
a tabela a seguir separa as duas famílias.

### 26.2 As seis chamadas

| # | Onde | Família | Entrada | Saída | Quando dispara |
|---|---|---|---|---|---|
| 1 | `/roteiros` · "Gerar com IA" | escrita | perfil de comunicação + tema, objetivo, público, plataforma, duração, tom | 4 a 6 blocos com papel narrativo | clique explícito |
| 2 | `/roteiros` · "Sugestões da IA" | escrita | roteiro atual | até 3 sugestões, cada uma com o bloco reescrito | ao abrir e ao parar de digitar (debounce) |
| 3 | `/editor` · seleção de trechos | escolha | transcrição + regiões detectadas + framework | EditPlan com motivo por clipe | fim da transcrição |
| 4 | `/editor` · "Adicionar trecho com IA" | escolha | transcrição + clipes já escolhidos | 1 a 3 candidatos não usados | clique explícito |
| 5 | `/editor` · risco semântico | escolha | clipes propostos + contexto original | risco por clipe e o porquê | junto da #3 |
| 6 | `/editor` · "Aprimoramento com IA" | escolha | EditPlan + silêncios detectados | operações de timeline | toggle ligado |

### 26.3 Regras por chamada

**#1 — Gerar roteiro.** Única chamada que produz texto original, e é legítima
porque o texto ainda será falado por uma pessoa. A saída passa pelo
`scriptSchema` com `.strict()`. O tom e o público vêm do Communication
Profile (seção 11), não de campo livre digitado na hora: um perfil versionado
é auditável, um prompt improvisado não.

**#2 — Sugestões de roteiro.** Hoje a tela calcula quatro critérios
localmente, sem IA nenhuma — tamanho de frase, tempo total, pergunta no hook,
verbo de ação no CTA. **Isso fica.** A IA entra como camada adicional, não
como substituta: os critérios locais são determinísticos, explicáveis e
funcionam offline, e são eles que alimentam o checklist. A IA só acrescenta
sugestões que exigem julgamento — e cada uma precisa vir com o **texto
reescrito pronto**, porque "melhore o hook" sem o texto é conselho, não
ferramenta.

Debounce de 2 s e no máximo uma chamada a cada 20 s por roteiro. Sem isso,
digitar vira uma chamada por tecla.

**#3 — Seleção de trechos.** O coração do produto, já detalhado nas seções 7 e
9. Cada clipe devolve `transcriptSegmentIds` não vazio — é o que torna a fala
rastreável — e um `reason` que o painel mostra. Recusa qualquer trecho cujos
tempos não existam no original.

**#4 — Adicionar trecho.** Recebe os clipes **já escolhidos** para não propor
o que está na timeline. Devolve candidatos, não um EditPlan: quem decide é o
usuário, e a operação aplicada é a mesma `dividir`/`inserir` validada pelo
contrato.

**#5 — Risco semântico.** Já existe no `EditPlan` como campo obrigatório. O
que o redesenho mudou é a visibilidade: o selo "Revisar sentido" e o aviso no
inspector tornaram o campo visível, então ele precisa ser **preenchido com
critério**, não com `'low'` por omissão. Um risco sempre baixo é pior que
nenhum: dá falsa segurança.

**#6 — Aprimoramento.** O toggle diz o que faz — "melhora cortes, remove
silêncios e gera legendas automaticamente". Remover silêncio **não precisa de
IA**: o `worker-core` já detecta com FFmpeg, é determinístico e mais barato.
A IA entra só no ajuste fino das bordas de corte, onde a pergunta é "esse
corte cai no meio de uma ideia?" — e isso é julgamento de linguagem.

Regra: **toda operação proposta pelo aprimoramento é reversível em um
desfazer**, e a tela mostra o que mudou antes de aplicar.

### 26.4 Confiança, sem inventar número

O painel mostra "N% de confiança". Esse número **não vem do modelo** — modelos
de linguagem não produzem confiança calibrada, e pedir um é convidar o modelo
a inventar. Ele é derivado do risco semântico dos clipes, que o próprio
modelo classifica em três níveis:

```
confiança = média(peso[risco]) × 100      peso: low 1.0 · medium 0.7 · high 0.35
```

É uma agregação de julgamentos discretos, não uma probabilidade. A interface
deve dizer isso quando o número é baixo, em vez de deixar o usuário supor que
há estatística por trás.

### 26.5 Adapter, não cliente

Uma interface, várias implementações:

```ts
interface ProvedorDeIA {
  gerarRoteiro(entrada: EntradaDeRoteiro): Promise<Script>;
  sugerirMelhorias(script: Script): Promise<Sugestao[]>;
  selecionarTrechos(entrada: EntradaDeSelecao): Promise<AiProposal>;
  proporTrechosAdicionais(entrada: EntradaDeCandidatos): Promise<Candidato[]>;
  avaliarRisco(entrada: EntradaDeRisco): Promise<RiscoPorClipe[]>;
  refinarCortes(entrada: EntradaDeRefino): Promise<TimelineOperation[]>;
}
```

DeepSeek é a primeira implementação, não a única prevista. O adapter existe
por três motivos concretos, nenhum deles hipotético:

- **preço e disponibilidade mudam**, e trocar de provedor não pode significar
  reescrever seis pontos do produto;
- **os testes precisam de um provedor falso** que devolva saídas conhecidas,
  inclusive as inválidas — sem isso não dá para testar a recusa;
- **a política de dados do cliente** pode exigir outro provedor ou modelo
  local, e essa decisão ainda está aberta (seção 23, item 4).

### 26.6 Modelo por chamada

| Chamada | Modelo | Por quê |
|---|---|---|
| #1, #2 | `deepseek-chat` | escrita curta, sem raciocínio longo |
| #3, #5 | `deepseek-reasoner` | precisa sustentar coerência sobre a transcrição inteira |
| #4 | `deepseek-chat` | busca local, com o contexto já reduzido |
| #6 | `deepseek-chat` | decisão por borda de corte, uma de cada vez |

Os nomes exatos e a janela de contexto são fixados no ADR 0010 e conferidos na
documentação oficial antes da implementação.

### 26.7 Contenção de custo

Três regras, na ordem em que economizam mais:

1. **Não mande o que não é preciso.** A #3 recebe a transcrição segmentada,
   não o texto corrido com marcas de palavra: as `TranscriptWord` servem à
   legenda, não à escolha do trecho.
2. **Cacheie o que não muda.** A mesma transcrição com o mesmo framework
   produz a mesma proposta. Chave: hash da transcrição + framework + versão do
   prompt.
3. **Trave o gasto por workspace.** Limite mensal configurável, com aviso em
   80% e bloqueio em 100% — a mesma lógica da cota de disco, pelo mesmo
   motivo: o cliente precisa saber antes de bater no teto, não depois.

Chamadas por vídeo, em uso normal: **uma** #3 e **uma** #5 (na mesma
requisição), mais o que o usuário pedir explicitamente.

### 26.8 Prompts versionados

Cada chamada tem prompt em arquivo próprio, com versão no nome
(`selecao-v1.md`). A versão vai no `AiAnalysis` junto da resposta.

Isso não é organização: é o que permite responder "por que este vídeo ficou
diferente do outro" três meses depois. Sem a versão registrada, um prompt
ajustado torna todo resultado anterior inexplicável.

### 26.9 Falha e degradação

Nenhuma chamada de IA pode deixar a tela inutilizável.

| Chamada | Se falhar |
|---|---|
| #1 | a tela continua editável; o usuário escreve à mão |
| #2 | o checklist local continua funcionando — é a razão de ele não depender da IA |
| #3 | o projeto fica em `transcrito`, com botão de tentar de novo; **não** entra em erro terminal |
| #4 | avisa e mantém a timeline intacta |
| #5 | risco fica `unknown`, e a interface diz "não avaliado" em vez de fingir `low` |
| #6 | o toggle volta a desligado com o motivo |

Resposta que não passa no schema é **descartada**, não corrigida na marra:
uma retentativa com o erro no prompt, e depois falha honesta.

### 26.10 O que a API precisa expor

Acrescenta-se à seção 13:

```
POST /scripts/:id/generate          → #1
POST /scripts/:id/suggestions       → #2
POST /projects/:id/analyze          → #3 e #5 (já previsto)
POST /projects/:id/clip-candidates  → #4
POST /projects/:id/refine-cuts      → #6
GET  /settings/ai-usage             → consumo do mês e limite
```

Todas assíncronas por fila, menos a #2, que é curta e responde direto.

### 26.11 Impacto nas fases

A Fase 5 deixa de ser um bloco só:

| Fase | Escopo |
|---|---|
| **5a** | Adapter, provedor falso, prompts versionados, `/settings/ai-usage` e as travas de custo |
| **5b** | Seleção de trechos e risco semântico (#3, #5) — o caminho crítico |
| **5c** | Roteiro e sugestões (#1, #2) — independentes do vídeo, podem sair antes se o cliente precisar |
| **5d** | Candidatos e refino (#4, #6) — melhorias sobre uma proposta que já funciona |

A 5a vem primeiro porque as outras três dependem dela, e porque é onde mora a
trava de custo: ligar chamadas de IA sem limite configurado é o tipo de erro
que só aparece na fatura.

---

## 27. Entrada de vídeo — os dois caminhos

> Acrescentado em 2026-09-21. O redesenho produziu seis telas e **nenhuma
> delas aceita um vídeo**: não há `input type="file"`, nem área de soltar
> arquivo, nem `MediaRecorder`. A aba "Mídia" do editor diz que "a gravação
> enviada aparece aqui" e não existe caminho por onde ela chegue.
>
> O plano previa upload na seção 13 (`POST /projects/:id/uploads`) e gravação
> na 14, mas nunca descreveu as duas telas. Esta seção fecha isso, porque é a
> lacuna que impede o produto de funcionar com dados reais — sem vídeo, todas
> as seis chamadas de IA da seção 26 não têm sobre o que agir.

### 27.1 Por que dois caminhos, não um

| Caminho | Quem usa | Por quê |
|---|---|---|
| **Gravar no navegador** | quem está roteirizando agora | o teleprompter só serve se a gravação acontecer junto dele |
| **Enviar arquivo** | quem já gravou no celular ou na câmera | a maioria dos vídeos de cliente nasce fora do navegador |

Um produto com só o primeiro caminho obriga a regravar o que já existe. Com só
o segundo, o teleprompter vira um leitor de texto desligado do resto.

### 27.2 Caminho A — gravar no navegador

A tela `/gravar` já verifica dispositivos, mostra o preview e conta o tempo.
**Falta gravar.**

- `MediaRecorder` sobre o `MediaStream` que a tela já obtém;
- codec por capacidade, com `MediaRecorder.isTypeSupported`, nesta ordem:
  `video/webm;codecs=vp9,opus` → `video/webm;codecs=vp8,opus` → `video/mp4`.
  Safari só tem o último, e ignorar isso deixa metade dos clientes sem gravar;
- `ondataavailable` a cada 5 s, com cada pedaço **enviado enquanto se grava**,
  não acumulado em memória: dez minutos em 1080p passam de 1 GB, e uma aba que
  cresce até esse ponto trava a máquina que está gravando;
- perder a conexão no meio não perde a gravação: os pedaços já enviados ficam,
  e a sessão de upload retoma de onde parou;
- ao parar, `POST /recordings/:id/complete` costura os pedaços e cria o
  `MediaSource`.

O que a tela precisa ganhar, além do que já tem: o botão Gravar funcionando,
contagem regressiva (o toggle já existe), indicador de gravação ativa, pausa e
retomada, e a revisão antes de enviar — **descartar e regravar sem sair da
tela**, porque a primeira tomada quase nunca é a boa.

### 27.3 Caminho B — enviar arquivo

Falta por inteiro. Três pontos de entrada, todos levando à mesma sessão de
upload:

1. **`/` Projetos** — "Novo vídeo" abre a escolha: gravar agora ou enviar
   arquivo. Hoje esse botão vai direto para o editor, que é o único lugar onde
   ele não deveria ir: não há o que editar;
2. **`/editor`, aba Mídia** — onde o painel hoje promete que a mídia aparece;
3. **soltar o arquivo** em qualquer um dos dois.

Aceito: MP4, MOV, WebM, MKV, AVI. Até 2 GB e 30 minutos por arquivo — acima
disso o proxy demora mais que a paciência de quem espera, e a cota de 6 GB de
edição comporta poucos vídeos.

A validação começa **no navegador**, antes de subir um byte: tipo, tamanho e
duração (lidos com um `<video>` temporário). Descobrir que o arquivo era
inválido depois de 2 GB enviados é o pior momento possível para avisar.

### 27.4 Upload resumível

Protocolo próprio sobre a API, em vez de biblioteca de terceiros:

```
POST  /projects/:id/uploads            → { uploadId, tamanhoDoPedaco, recebidos: [] }
PUT   /projects/:id/uploads/:uploadId  → envia um pedaço (índice no header)
GET   /projects/:id/uploads/:uploadId  → { recebidos: [0,1,2,…] }  (para retomar)
POST  /projects/:id/uploads/:uploadId/complete
```

Pedaço de 5 MB. Ao retomar, o cliente pergunta o que já chegou e manda só o
resto — é o que torna viável enviar 2 GB de um Wi-Fi instável.

A sessão expira em 24 h; os pedaços órfãos são varridos pela mesma rotina de
retenção que cuida da cota. Sem isso, upload abandonado vira lixo que consome
os 6 GB de edição sem aparecer em lugar nenhum.

### 27.5 Quota antes de aceitar

O `POST /uploads` **recusa** se o arquivo não couber nos 6 GB de edição, e a
resposta diz quanto falta e quais vídeos antigos seriam liberados. Essa é a
promessa da decisão de armazenamento: avisar **antes** da perda, não explicar
depois que um vídeo sumiu.

Se couber apertado, o aviso aparece junto do botão de envio, não numa tela
separada que o usuário já passou.

### 27.6 Da chegada até a IA

```
arquivo/gravação
  └→ MediaSource criado, projeto em `enviando`
      └→ worker de mídia: proxy 720p, thumbnail, silêncios   (projeto: `processando`)
          └→ worker de transcrição: faster-whisper            (projeto: `transcrito`)
              └→ #3 e #5 da seção 26: seleção e risco         (projeto: `analisado`)
                  └→ editor abre com a proposta pronta
```

Cada seta é uma fila, e cada estado é visível na tela de Projetos. O cartão
mostra em que passo está e o que falta — um vídeo de 8 minutos leva alguns
minutos até chegar ao editor, e barra de progresso sem nome do passo não
explica a espera.

### 27.7 O que muda na API

Acrescenta-se à seção 13:

```
POST   /recordings                              sessão de gravação
PUT    /recordings/:id/chunks                   pedaço, enquanto grava
POST   /recordings/:id/complete                 costura e cria o MediaSource
DELETE /recordings/:id                          descarta a tomada

POST   /projects/:id/uploads                    abre sessão (valida quota aqui)
PUT    /projects/:id/uploads/:uploadId          envia pedaço
GET    /projects/:id/uploads/:uploadId          o que já chegou
POST   /projects/:id/uploads/:uploadId/complete finaliza e enfileira
```

### 27.8 Onde isso entra nas fases

Vira **Fase 4a**, antes de qualquer coisa da Fase 5:

| Passo | Entrega |
|---|---|
| 4a.1 | Módulo `projects` (CRUD) — sem projeto não há onde pendurar mídia |
| 4a.2 | Módulo `media` e o protocolo de upload resumível |
| 4a.3 | Tela de envio: escolha, validação local, progresso, retomada |
| 4a.4 | `MediaRecorder` em `/gravar`, com revisão antes de enviar |
| 4a.5 | Worker de mídia consumindo a fila — o `worker-core` já tem as peças |
| 4a.6 | Worker de transcrição |

Só depois de 4a.6 a Fase 5 tem entrada. Enquanto isso não existir, qualquer
trabalho de IA é testável apenas com fixture — e as fixtures dependem de vídeo
autorizado pelo cliente, que continua pendente desde a Fase 0.
