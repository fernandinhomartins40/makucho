# Contexto mestre de produto — Editor Inteligente de Vídeos

> Base canônica de consulta para produto, design, arquitetura e programação.
> Versão 1.0 — 14 de setembro de 2026.

## 1. Como usar este documento

Este arquivo consolida o conceito e as decisões discutidas para que uma IA programadora não precise reinterpretar o produto do zero.

Ordem de autoridade:

1. regras não negociáveis deste documento;
2. decisões explicitamente aprovadas;
3. `PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md`;
4. ADRs aprovados no repositório;
5. backlog e implementação atual.

Se houver contradição, interromper a decisão afetada, apontar o conflito e pedir aprovação. Não preencher lacunas importantes silenciosamente.

Este é um registro consolidado do conteúdo e da intenção da conversa, não uma transcrição literal com mensagens repetidas.

## 2. Visão do produto

O produto é uma plataforma mobile-first para transformar gravações longas de uma pessoa falando para a câmera em vídeos curtos, estruturados e prontos para publicação.

A melhor definição criada durante o planejamento foi:

> Não estamos criando um editor de vídeo com IA. Estamos criando um editor de vídeo dirigido por IA.

A IA é a diretora. FFmpeg e Remotion são os executores.

Outra descrição útil:

> Editor automático de talking-head videos orientado por identidade de marca, perfil de comunicação e frameworks de engajamento.

## 3. Esclarecimento central feito pelo usuário

O cliente filma a si próprio falando sobre um assunto. Os vídeos não são gerados por IA.

O sistema recebe o vídeo bruto e usa IA para:

- transcrever;
- entender a estrutura do que foi dito;
- identificar frases e trechos fortes;
- localizar hook, problema, contexto, autoridade, solução, payoff e CTA;
- remover saudações, redundâncias, hesitações e silêncios quando seguro;
- escolher as melhores partes;
- reorganizar trechos quando o sentido permanecer intacto;
- aplicar o conceito editorial escolhido;
- adicionar legendas, títulos, assets, música, intro, outro e transições;
- renderizar uma versão final.

A IA não pode:

- inventar uma fala;
- completar uma frase que a pessoa não gravou;
- criar depoimentos, provas ou números;
- mudar o sentido;
- transformar uma negação em afirmação;
- retirar ressalvas essenciais;
- reconstruir contexto para atribuir uma opinião diferente;
- gerar comandos FFmpeg para execução direta.

## 4. Exemplo que define o comportamento esperado

Imagine um vídeo bruto de oito minutos.

No começo:

> “Oi pessoal, tudo bem? Hoje eu queria falar de uma coisa que acontece muito com empresários...”

Aos 2min18s:

> “O maior erro que eu vejo é que a empresa gasta dinheiro para trazer cliente e depois faz o cliente esperar no WhatsApp.”

Aos 4min30s:

> “Eu vejo isso praticamente toda semana quando analiso atendimento de empresas.”

Aos 6min10s:

> “Antes de investir mais em anúncio, corrija primeiro esses três pontos.”

A edição proposta poderia ser:

| Tempo final | Função | Fonte no bruto |
|---|---|---|
| 0–4s | Hook | trecho forte de 2min18s |
| 4–12s | Problema | consequência explicada em outro trecho |
| 12–17s | Autoridade | trecho de 4min30s |
| 17–45s | Solução | trechos com os três pontos |
| 45–55s | Payoff/CTA | trecho de 6min10s |

O vídeo bruto vira um Reel de aproximadamente 55 segundos, mantendo somente falas reais do cliente.

## 5. Regra de integridade editorial

Regra central aprovada:

> A IA pode selecionar, remover e reorganizar trechos apenas quando preservar integralmente o significado e a intenção do comunicador.

Exemplo de pegadinha:

> “A segunda coisa que você precisa fazer...”

Esse trecho não pode aparecer antes do primeiro ponto sem que a enumeração seja reestruturada de forma legítima ou removida do áudio — e qualquer mudança precisa continuar fiel ao que foi falado.

Outro risco:

> “Isso não funciona...”

Não se pode juntar essa frase a um contexto diferente para fazer parecer que a pessoa rejeitou algo que, na gravação, ela aprovava ou qualificava.

## 6. O ciclo completo

```text
SCRIPT STUDIO
planeja o conteúdo
        ↓
RECORD STUDIO
orienta e grava
        ↓
AI EDITOR
analisa e monta
        ↓
BRAND STUDIO
aplica a identidade
        ↓
REVISÃO E RENDER
entrega o vídeo
```

Todos os módulos compartilham o mesmo `Communication Profile`.

## 7. Script Studio

O Script Studio ajuda o cliente antes da gravação. Isso reduz a necessidade de “salvar” um vídeo mal estruturado apenas na edição.

Entrada típica:

```text
Objetivo: autoridade
Tema: erros que empresas cometem no WhatsApp
Duração: 60 segundos
Estilo: direto
Framework: problema → autoridade → solução → CTA
```

Saída esperada:

```text
HOOK
“Se sua empresa demora para responder no WhatsApp, você pode estar
pagando para perder cliente.”

PROBLEMA
“Muitas empresas investem em anúncio, conseguem gerar interesse e
perdem a venda justamente no atendimento.”

AUTORIDADE
“Eu vejo isso constantemente quando analiso processos comerciais de
pequenas empresas.”

APRESENTAÇÃO
“Eu sou [nome]...”

SOLUÇÃO
“Existem três pontos que eu corrigiria primeiro...”
1. tempo de resposta
2. mensagem inicial
3. acompanhamento

PAYOFF
“Antes de investir mais em anúncio, conserte isso.”

CTA
“Salva este vídeo e verifica esses três pontos no seu atendimento.”
```

Internamente, não é apenas texto livre. É um roteiro estruturado:

```json
{
  "framework": "authority",
  "targetDuration": 60,
  "blocks": [
    {"type": "hook", "goal": "create_curiosity", "text": "..."},
    {"type": "problem", "text": "..."},
    {"type": "authority", "text": "..."},
    {"type": "solution", "text": "..."},
    {"type": "cta", "text": "..."}
  ]
}
```

### Modos de roteiro aprovados

- **Roteiro completo:** texto praticamente pronto.
- **Tópicos:** pontos que precisam ser abordados.
- **Bullet teleprompter:** frases curtas para leitura natural.
- **Improviso guiado:** perguntas para respostas espontâneas.
- **Storytelling:** momentos da história, sem exigir texto decorado.

Exemplo de improviso guiado:

```text
HOOK
Fale sobre o maior erro que você vê.

PROBLEMA
Explique por que isso custa dinheiro.

AUTORIDADE
Conte que você encontra isso frequentemente nos seus clientes.

SOLUÇÃO
Liste três mudanças.

CTA
Diga o que a pessoa deve verificar hoje.
```

### Variações de hook

**Curiosidade**

> “Existe um erro que quase toda empresa comete no WhatsApp.”

**Contrarian**

> “Seu problema provavelmente não é falta de clientes.”

**Resultado**

> “Essa mudança simples pode aumentar muito o número de pessoas que chegam até o orçamento.”

**Dor**

> “Você pode estar pagando anúncio para mandar cliente direto para um atendimento que não vende.”

## 8. Record Studio e teleprompter

Como a experiência principal é mobile, o roteiro pode abrir diretamente em um teleprompter.

Funções planejadas:

- velocidade ajustável;
- tamanho da fonte;
- pausa;
- contador regressivo;
- espelhamento;
- destaque da frase atual;
- roteiro por blocos;
- gravação pelo dispositivo quando o navegador permitir;
- upload posterior como alternativa robusta.

Além do texto, mostrar a intenção do bloco:

```text
HOOK — crie curiosidade
PROBLEMA — mostre a consequência
AUTORIDADE — demonstre experiência
```

O objetivo é orientar a interpretação, não obrigar o criador a decorar.

## 9. Script Match

Quando uma gravação estiver ligada a um roteiro, o sistema compara planejado e falado.

Exemplo:

```text
ADERÊNCIA AO ROTEIRO: 87%

Hook         encontrado
Problema     encontrado
Autoridade   encontrada
Apresentação encontrada
Solução 1    encontrada
Solução 2    encontrada
Solução 3    não encontrada
CTA          encontrado
```

Respostas possíveis:

> “Você não gravou o terceiro ponto previsto. Posso montar uma versão com apenas dois pontos.”

> “Seu hook gravado ficou mais forte que o roteiro original.”

A ausência de bloco nunca autoriza a IA a inventá-lo.

## 10. Communication Profile

Exemplo discutido:

```text
Tom: direto
Energia: alta
Frases: curtas
Abertura preferida: problema
Apresentação pessoal: somente após gerar valor
Autoridade: demonstrada antes de declarada
Hooks: curiosidade, contrarian, problema, resultado
Storytelling: permitido
Humor: moderado
Palavrões: permitidos
CTA: natural
Duração alvo: 45–75 segundos
```

O perfil alimenta tanto o gerador de roteiro quanto a análise editorial. Com o tempo, poderá registrar preferências aprendidas mediante comportamento do usuário:

- raramente usa apresentação pessoal;
- prefere hooks de afirmação;
- fala melhor com tópicos que com texto fechado;
- costuma aprovar vídeos entre 42 e 55 segundos;
- rejeita CTAs excessivamente comerciais.

Essa evolução deve ser transparente e controlável.

## 11. Frameworks editoriais

### Autoridade educacional

```text
HOOK
↓
PROBLEMA
↓
INSIGHT
↓
PROVA DE AUTORIDADE
↓
APRESENTAÇÃO
↓
SOLUÇÃO
↓
CTA
```

Referência temporal discutida:

```text
0–3s    Hook
3–8s    Problema
8–15s   Insight
15–20s  Autoridade
20–23s  Nome/apresentação
23–45s  Solução
45–55s  Payoff
55–60s  CTA
```

### Viral educativo

```text
CONTRARIAN HOOK
↓
CURIOSITY GAP
↓
EXPLICAÇÃO
↓
PATTERN INTERRUPT
↓
INSIGHT
↓
PAYOFF
```

### Storytelling

```text
COLD OPEN / MOMENTO MAIS FORTE
↓
CONTEXTO
↓
CONFLITO
↓
TENSÃO
↓
DESCOBERTA
↓
RESULTADO
↓
CTA
```

### PAS

```text
PROBLEM → AGITATE → SOLVE
```

### Venda

```text
DOR
↓
CONSEQUÊNCIA
↓
SOLUÇÃO
↓
PROVA
↓
OFERTA
↓
CTA
```

O mesmo bruto pode gerar versões diferentes — autoridade, engajamento, 30 segundos, 60 segundos — sempre usando as mesmas falas reais.

## 12. Engagement Engine

O diferencial comercial não é somente “colocar legenda”. É encaixar o material existente numa arquitetura de comunicação escolhida.

O motor procura:

- hook;
- problema;
- curiosidade;
- autoridade;
- social proof;
- insight;
- solução;
- payoff;
- CTA.

Antes do render, o sistema pode exibir:

```text
HOOK               92/100
RITMO              81/100
AUTORIDADE         88/100
CLAREZA            91/100
RETENÇÃO ESTIMADA  84/100
CTA                62/100
```

E observações:

> O vídeo não possui CTA claro.

> Existem 4,7 segundos de introdução antes da primeira informação relevante.

> Existe demonstração de autoridade antes da apresentação pessoal.

> O hook abre um loop de curiosidade.

O score é uma estimativa explicável, não uma garantia de viralização.

## 13. Explicabilidade e confiança

Não criar uma caixa preta. A aplicação deve explicar decisões importantes.

Exemplo:

```text
Hook escolhido
“Você está perdendo dinheiro toda vez que responde seu cliente dessa forma.”

Motivo
Frase direta + consequência financeira + curiosidade.

Trecho original
02:18–02:24
```

Outro exemplo:

```text
Trecho removido
00:00–00:17

Motivo
Saudação e contextualização sem informação nova.
```

O usuário deve poder restaurar o trecho, trocar a sugestão ou editar manualmente.

## 14. Análise multimodal futura

Além do texto, o produto pode avaliar:

- pausas longas;
- hesitações e fillers;
- repetições;
- silêncio;
- velocidade;
- energia vocal;
- erros prováveis;
- olhar fora da câmera;
- mudança de iluminação;
- movimento corporal;
- risadas;
- ênfase da voz.

Exemplo de comparação:

```text
Trecho A
clareza:    92
energia:    84
autoridade: 93
visual:     88
hook:       95

Trecho B
clareza:    91
energia:    42
autoridade: 87
visual:     65
hook:       71
```

Visão computacional e análise acústica avançada pertencem a uma fase posterior. No começo, a base é transcrição, timestamps, VAD e regras editoriais.

## 15. Brand Studio

### Marca

- logo;
- logo negativa;
- logo pequena;
- marca d'água;
- fonte principal;
- fonte secundária;
- cores.

### Vídeo

- intro 01/02;
- outro;
- transições;
- bumper;
- lower third;
- CTA.

### Assets

- PNG;
- WebP;
- SVG;
- GIF;
- MP4;
- WebM;
- Lottie.

### Música

- informativa;
- inspiradora;
- urgente;
- storytelling;
- promoção.

### Efeitos sonoros

- pop;
- whoosh;
- click;
- impact;
- notification.

### Legendas

- fonte;
- cor;
- borda;
- highlight;
- posição;
- palavras por bloco;
- animação.

## 16. Jornada principal no aplicativo

Tela inicial:

```text
+ NOVO VÍDEO
```

Depois:

```text
Selecionar ou gravar vídeo
```

Objetivo:

- engajamento;
- educação;
- venda;
- autoridade;
- storytelling;
- viral.

Ao analisar:

```text
Analisando fala...
Identificando trechos fortes...
Detectando silêncios...
Encontrando hook...
Estruturando narrativa...
Aplicando identidade...
```

Resultado:

```text
Duração original: 4m32s
Duração sugerida: 58s

Hook        0–4s
Problema    4–13s
Autoridade 13–21s
Solução    21–46s
CTA        46–58s
```

## 17. Controle manual

Depois da edição automática, o usuário pode:

- alterar corte;
- desativar ou restaurar trecho;
- mudar ordem quando permitido;
- trocar música;
- trocar intro/outro;
- editar legenda;
- trocar título;
- substituir asset;
- mudar transição.

No MVP 1, esses ajustes podem ser controles simples. A timeline visual completa fica para o MVP 2.

A timeline futura usa múltiplas tracks:

- vídeo;
- texto;
- assets;
- música;
- efeitos.

O documento JSON de composição é a fonte de verdade.

## 18. Proxy Video

Nunca carregar um original 4K de centenas de megabytes como mídia principal do editor.

Fluxo:

```text
ORIGINAL
4K / 600 MB
    ↓ FFmpeg
PROXY
720p / tamanho reduzido
```

O preview usa o proxy. O render final usa o original.

Isso melhora fluidez, reduz banda e preserva a qualidade da saída.

## 19. Pipeline técnico consolidado

```text
1. upload
2. validação
3. ffprobe
4. proxy
5. extração de áudio
6. faster-whisper
7. timestamps por palavra
8. VAD/silêncio
9. detecção de cenas
10. keyframes
11. análise editorial por IA
12. Engagement Engine
13. proposta JSON
14. validação Zod
15. compilação para EditPlan
16. preview
17. ajustes manuais
18. render
19. quality check
20. upload do resultado
21. download
```

Exemplo de transcrição:

```json
[
  {"start": 0.4, "end": 3.8, "text": "Oi pessoal, tudo bem..."},
  {"start": 138.2, "end": 144.9, "text": "O maior erro que eu vejo..."},
  {"start": 271.1, "end": 277.6, "text": "Eu vejo isso praticamente toda semana..."}
]
```

Exemplo de decisão editorial:

```json
{
  "targetDuration": 57,
  "framework": "authority_education",
  "segments": [
    {
      "sourceStart": 138.2,
      "sourceEnd": 144.9,
      "role": "hook",
      "score": 0.94
    },
    {
      "sourceStart": 152.7,
      "sourceEnd": 163.4,
      "role": "problem",
      "score": 0.91
    },
    {
      "sourceStart": 271.1,
      "sourceEnd": 277.6,
      "role": "authority",
      "score": 0.87
    }
  ]
}
```

## 20. Divisão de responsabilidades

### FFmpeg

- cortar;
- concatenar;
- crop e resize;
- extrair e tratar áudio;
- normalização;
- mixagem;
- fade;
- overlay técnico;
- compressão;
- transcode.

### Remotion

- textos sofisticados;
- legendas animadas;
- motion graphics;
- lower thirds;
- componentes reutilizáveis;
- intros/outros;
- CTA;
- transições complexas.

### faster-whisper

- transcrição;
- timestamps de segmentos;
- timestamps por palavra;
- probabilidades;
- VAD/Silero;
- identificação de regiões de fala e silêncio.

### IA editorial/DeepSeek

- classificar função dos segmentos;
- avaliar clareza, força, redundância e dependência;
- selecionar trechos;
- propor ordem e duração;
- explicar escolhas;
- sinalizar lacunas.

### Código próprio

- validação;
- segurança semântica;
- compilação do plano;
- autorização;
- controle da fila;
- chamadas FFmpeg/Remotion com parâmetros permitidos;
- persistência e auditoria.

## 21. Componentes visuais reutilizáveis

```text
HookTitle
AnimatedCaption
LowerThird
LogoBug
CTA
ProgressBar
QuoteCard
StatCard
EmojiPop
ImageOverlay
Intro
Outro
```

A IA pode escolher um componente existente:

```json
{
  "component": "HookTitle",
  "text": "VOCÊ ESTÁ FAZENDO ISSO ERRADO",
  "start": 42,
  "duration": 85,
  "variant": "warning"
}
```

Ela não inventa código de animação a cada vídeo.

## 22. Regra de segurança da IA

Fluxo proibido:

```text
DeepSeek → “ffmpeg -i ...” → exec()
```

Fluxo obrigatório:

```text
DeepSeek
→ JSON
→ parser
→ Zod
→ validadores temporais e semânticos
→ compiler próprio
→ FFmpeg/Remotion
```

Isso limita prompt injection, comandos arbitrários e planos incoerentes.

## 23. Stack acordada

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js + React + TypeScript |
| Interface | Tailwind + shadcn/ui |
| PWA | manifest/service worker; Serwist a avaliar |
| Estado | Zustand |
| API | Fastify/Node.js |
| Banco | PostgreSQL |
| ORM | Drizzle como escolha inicial |
| Fila | BullMQ |
| Queue store | Redis |
| Storage | Cloudflare R2 |
| Mídia | FFmpeg/ffprobe |
| Motion | Remotion |
| Transcrição | faster-whisper |
| VAD | Silero via faster-whisper |
| IA | adapter com DeepSeek inicial |
| Visão futura | modelo multimodal sobre keyframes |
| Autenticação | Better Auth como escolha inicial |
| Deploy | Docker Linux em VPS |
| Mobile futuro | Capacitor, somente se necessário |

A arquitetura combina monólito modular para regras/API com workers separados por responsabilidade.

## 24. Armazenamento

PostgreSQL guarda dados estruturados:

```text
projects
assets
brand_profiles
communication_profiles
scripts
edit_plans
renders
jobs
transcriptions
users/workspaces
```

R2 guarda objetos:

```text
originals/
proxies/
assets/
music/
intros/
outros/
renders/
thumbnails/
```

O banco não guarda os vídeos como blobs.

A VPS usa disco temporário durante o job e limpa ao concluir, falhar ou cancelar.

## 25. Hospedagem e capacidade

Foi discutido comunicar ao cliente que a aplicação precisa de VPS por executar processamento de vídeo no servidor.

Conclusão:

| Cenário | Capacidade |
|---|---|
| App/API e render externo | 2 vCPU / 4–8 GB pode atender |
| Um cliente, pouco volume, render local | 2 vCPU / 8 GB funciona como piloto lento |
| Uso confortável inicial | 4 vCPU / 16 GB recomendado |
| Muitos renders simultâneos | 8 vCPU / 32 GB ou workers separados |

Configuração recomendada para este projeto:

- 4 vCPU;
- 16 GB RAM;
- Docker;
- Ubuntu LTS;
- um render pesado por vez;
- object storage para mídia;
- medição real de CPU, RAM, disco e tempo.

Mensagem comercial sugerida:

> “A plataforma precisa de uma VPS porque faz processamento de vídeo no servidor. Para começar, recomendamos 4 vCPU e 16 GB de RAM. Podemos iniciar com 2 vCPU e 8 GB caso o volume seja baixo, mas o tempo de renderização será maior. A arquitetura será preparada para aumentar os recursos ou separar o servidor de processamento conforme o uso crescer.”

Arquitetura de evolução:

```text
VPS principal
├─ PWA
├─ API
├─ PostgreSQL
├─ Redis
└─ fila
     ↓
Servidor de processamento
├─ FFmpeg
├─ faster-whisper
└─ Remotion
```

## 26. MVPs discutidos

### MVP 1

- login;
- Brand Studio;
- assets;
- música;
- intro/outro;
- Script Studio;
- teleprompter;
- upload;
- transcrição;
- remoção de silêncio;
- legendas;
- IA escolhendo cortes e hook;
- reestruturação segura;
- títulos e assets;
- render 9:16;
- preview;
- download.

### MVP 2

- timeline editável;
- drag-and-drop;
- múltiplas tracks;
- substituir asset;
- editar captions;
- trocar música;
- alterar cortes.

### V3

- múltiplos presets;
- A/B de hooks;
- 9:16, 1:1, 4:5 e 16:9;
- versões para TikTok, Reels e Shorts.

### V4

```text
Versão A — hook emocional
Versão B — hook contrarian
Versão C — hook de resultado
```

Todas podem usar o mesmo vídeo bruto.

## 27. Visão de produto de longo prazo

Com consentimento e integrações futuras, o sistema pode receber métricas:

```text
Vídeo 001
Retenção 3s: 82%
Conclusão: 46%
Compartilhamentos: 1,9%

Vídeo 002
Retenção 3s: 93%
Conclusão: 71%
Compartilhamentos: 4,2%
```

Então poderia concluir:

> “Para este criador, hooks de contradição performam melhor que perguntas.”

O produto deixa de aplicar apenas boas práticas genéricas e passa a entender o padrão do próprio criador.

Isso é visão futura, não requisito do primeiro MVP.

## 28. Premissas de UX e produto

- experiência principal confortável no smartphone;
- processamento pesado no servidor;
- fluxo simples para quem não é editor;
- edição automática primeiro, controle manual depois;
- razões visíveis para decisões da IA;
- sem prometer viralização;
- sem interface carregada desnecessariamente;
- estados de progresso honestos;
- falhas com orientação clara;
- original sempre recuperável;
- configurações complexas guardadas em presets.

## 29. Premissas técnicas e de qualidade

- TypeScript strict;
- schemas Zod;
- migrations versionadas;
- retries com backoff;
- idempotência;
- logs estruturados;
- progresso real;
- cancelamento;
- testes unitários, integração e E2E;
- Docker;
- health checks;
- rate limiting;
- validação MIME e de tamanho;
- URLs assinadas;
- chaves somente no backend;
- isolamento multi-tenant;
- backup e restauração testados;
- build de imagens fora da VPS;
- não reduzir containers/recursos sem medir benefício real.

## 30. Decisões confirmadas versus pendentes

### Confirmadas

- vídeo é real e gravado pelo cliente;
- IA é diretora/editor, não geradora da fala;
- preservar significado é obrigatório;
- PWA mobile-first primeiro;
- processamento no backend;
- proxy para preview;
- original para render final;
- FFmpeg + Remotion;
- faster-whisper + VAD;
- JSON validado por Zod;
- IA nunca executa FFmpeg diretamente;
- PostgreSQL para dados e R2 para arquivos;
- fila e workers separáveis;
- 4 vCPU/16 GB como recomendação inicial;
- 2 vCPU/8 GB somente para piloto leve;
- começar sem clone completo do CapCut;
- adicionar Script Studio e teleprompter;
- permitir revisão manual e explicar decisões.

### Pendentes

- nome comercial;
- identidade visual do produto;
- modelo/preço de cobrança;
- domínio e provedor exatos;
- limites comerciais de upload e retenção;
- política jurídica final;
- provedor de autenticação definitivo;
- modelo DeepSeek exato e fallback;
- músicas/assets que o cliente fornecerá;
- se a primeira versão terá gravação direta ou apenas upload;
- requisitos exatos da timeline no MVP 2.

## 31. Glossário

| Termo | Significado no projeto |
|---|---|
| Talking-head | vídeo de uma pessoa falando para a câmera |
| Hook | abertura que captura atenção |
| Payoff | entrega da promessa criada pelo hook |
| CTA | chamada para ação |
| Pattern interrupt | mudança visual/sonora para recuperar atenção |
| VAD | detecção de atividade de voz |
| Proxy | cópia leve usada no preview |
| Original | mídia imutável enviada pelo usuário |
| EditPlan | JSON versionado que descreve toda a composição |
| Script Match | comparação entre roteiro planejado e fala gravada |
| Engagement Engine | regras e análise para estruturar o vídeo |
| Brand Profile | identidade visual e assets aprovados |
| Communication Profile | regras de voz, estrutura e estilo do criador |
| Worker | processo assíncrono que executa tarefa pesada |
| ADR | registro de decisão arquitetural |

## 32. Prompt mestre para qualquer IA que entrar no projeto

```text
Você está trabalhando em uma plataforma mobile-first de edição inteligente
de vídeos reais de pessoas falando para a câmera.

Leia integralmente este documento e o arquivo
PLANO_COMPLETO_IMPLEMENTACAO_EDITOR_IA.md antes de propor ou alterar código.

Entenda a distinção fundamental:
- a pessoa grava o vídeo e todas as falas;
- a IA analisa, seleciona, remove e reorganiza apenas o que existe;
- a IA nunca inventa fala, cena, prova, número ou intenção;
- toda fala final deve ser rastreável a timestamps do original;
- reordenação só é permitida quando preserva completamente o significado.

A IA produz uma proposta JSON. Ela nunca produz comandos FFmpeg executados
diretamente. O JSON passa por schemas, validações temporais e segurança
semântica. Código próprio compila o EditPlan para FFmpeg e Remotion.

O original é imutável. O editor usa proxy. O render usa o original. Preview e
render compartilham o mesmo EditPlan versionado. O celular é a interface de
controle; o servidor executa upload, transcrição, análise e render.

Implemente em fases. Não crie um clone completo do CapCut. Preserve isolamento
multi-tenant, segurança, idempotência, observabilidade, testes e possibilidade
de separar workers quando a carga crescer.

Quando uma decisão estiver em aberto, registre-a e solicite definição em vez
de assumir algo que altere produto, custo, segurança ou arquitetura.
```

## 33. Referências técnicas

- [Remotion — renderização programática](https://www.remotion.dev/docs/renderer/render-media)
- [FFmpeg — filtros e composição](https://ffmpeg.org/ffmpeg-filters.html)
- [faster-whisper — transcrição, timestamps e VAD](https://github.com/SYSTRAN/faster-whisper)
- [Cloudflare R2 — URLs assinadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [BullMQ — jobs idempotentes](https://docs.bullmq.io/patterns/idempotent-jobs)
- [BullMQ — retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [Next.js — PWA](https://nextjs.org/docs/app/guides/progressive-web-apps)

