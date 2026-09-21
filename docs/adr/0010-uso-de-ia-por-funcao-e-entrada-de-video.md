# ADR 0010 — Uso de IA por função e entrada de vídeo

Data: 2026-09-21
Estado: aceito

## Contexto

O redesenho do frontend, feito a partir das referências do cliente, mudou duas
coisas que o plano original não previa.

**Primeira: a IA deixou de ser um ponto e virou seis.** O plano tratava
"adapter DeepSeek" como um entregável da Fase 5, ao lado de outros oito. A
interface nova promete IA em seis lugares distintos — gerar roteiro, sugerir
melhorias, selecionar trechos, propor trechos adicionais, avaliar risco
semântico e refinar cortes. Cada um tem prompt, esquema de saída, custo e modo
de falha próprios. Tratá-los como um item só levaria a um adapter genérico que
não serve bem a nenhum.

**Segunda: não há como colocar vídeo no produto.** As seis telas ficaram
prontas e nenhuma aceita um arquivo. Não existe `input type="file"`, área de
soltar arquivo nem `MediaRecorder`. A tela `/gravar` verifica câmera e
microfone, mostra o preview e conta o tempo — e o botão Gravar não grava. A
aba "Mídia" do editor diz que "a gravação enviada aparece aqui", sem caminho
por onde ela chegue.

A segunda lacuna é a mais séria: sem vídeo, as seis chamadas de IA não têm
sobre o que agir, e o produto inteiro funciona apenas com dados de
demonstração escritos no código.

## Decisão

### 1. Seis chamadas, um adapter

A interface `ProvedorDeIA` expõe seis métodos, um por chamada, em vez de um
método genérico de completude. DeepSeek é a primeira implementação; um
provedor falso, que devolve saídas conhecidas — inclusive inválidas —, é
exigência para os testes, não conveniência.

Modelo por chamada: `deepseek-reasoner` para seleção de trechos e risco
semântico, que precisam sustentar coerência sobre a transcrição inteira;
`deepseek-chat` para as demais. Os nomes exatos serão conferidos na
documentação oficial antes da implementação.

### 2. A IA não substitui o que já é determinístico

Dois pontos onde a tentação existe e foi recusada:

- o **checklist do roteiro** calcula quatro critérios localmente (tamanho de
  frase, tempo total, pergunta no hook, verbo de ação no CTA). Fica como está.
  É explicável, funciona offline e não custa nada. A IA acrescenta sugestões
  de julgamento, não substitui a régua;
- a **remoção de silêncios** já é feita com FFmpeg no `worker-core`. A IA
  entra só no ajuste fino das bordas de corte, onde a pergunta é "esse corte
  cai no meio de uma ideia?".

### 3. A confiança não vem do modelo

O painel mostra "N% de confiança". Esse número é derivado do risco semântico
que o modelo atribui a cada clipe, com pesos fixos, e **não** pedido ao
modelo. Modelos de linguagem não produzem confiança calibrada; pedir um número
é convidá-lo a inventar.

### 4. Dois caminhos de entrada, não um

Gravar no navegador **e** enviar arquivo. Só o primeiro obrigaria a regravar o
que já existe no celular; só o segundo desligaria o teleprompter do resto do
produto.

Os dois convergem para a mesma sessão de upload resumível, com pedaços de
5 MB. A gravação envia enquanto grava, em vez de acumular em memória: dez
minutos em 1080p passam de 1 GB, e uma aba que cresce até esse ponto trava a
própria máquina que está gravando.

### 5. A quota é verificada ao abrir a sessão

`POST /uploads` recusa o que não couber nos 6 GB de edição, e a resposta diz
quanto falta e quais vídeos antigos seriam liberados. É a promessa da decisão
de armazenamento: avisar antes da perda, não explicar depois.

### 6. Fase 4a antes da Fase 5

A entrada de vídeo vira uma fase própria, anterior à inteligência editorial.
A Fase 5 se subdivide em 5a (fundação e travas de custo), 5b (seleção e
risco), 5c (roteiro) e 5d (candidatos e refino).

## Consequências

**Positivas**

- cada chamada de IA pode ser testada, medida e trocada isoladamente;
- a trava de custo existe desde a primeira chamada ligada, não depois da
  primeira fatura;
- o produto passa a aceitar vídeo real, que é o que separa demonstração de
  ferramenta;
- as quatro subfases da 5 podem ser entregues fora de ordem: a 5c não depende
  de vídeo.

**Negativas**

- seis prompts versionados custam mais manutenção que um;
- o upload resumível é mais trabalho que um `POST` simples, e só se justifica
  porque arquivos de 2 GB em conexão instável são o caso comum, não a exceção;
- a Fase 4a adia a IA, que é o diferencial do produto, em favor da ingestão,
  que é infraestrutura. É a ordem certa mesmo assim: sem entrada, não há o que
  analisar.

**Riscos**

- o custo real por vídeo só será conhecido com transcrições reais. As travas
  da 5a existem para que a descoberta não venha pela fatura;
- `MediaRecorder` tem suporte desigual entre navegadores. A negociação de
  codec cobre Safari, mas exige teste em aparelho real.

## Alternativas consideradas

**Um método genérico de completude.** Simples de escrever, ruim de operar: o
esquema de saída de cada chamada é diferente, e validar tudo no chamador
espalha a regra por seis lugares.

**Só upload, sem gravação no navegador.** Descartada porque o teleprompter já
existe e é parte do valor: gravar lendo o roteiro é o que torna o resultado
editável com precisão.

**Só gravação, sem upload.** Descartada porque a maioria dos vídeos de cliente
nasce no celular, e pedir regravação para usar a ferramenta é atrito que
nenhuma qualidade de edição compensa.

**Pedir a confiança ao modelo.** Descartada: seria um número inventado com
aparência de medida.
