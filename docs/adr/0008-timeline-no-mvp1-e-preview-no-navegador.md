# ADR 0008 — Timeline no MVP 1 e preview no navegador

- Status: aceito
- Data: 2026-09-20
- Substitui: seção 17 do contexto mestre ("no MVP 1, esses ajustes podem ser
  controles simples; a timeline visual completa fica para o MVP 2")
- Relacionado: ADR 0003 (capacidade da VPS), ADR 0007 (Remotion)

## Contexto

Duas decisões do cliente em 2026-09-20, tomadas ao avaliar o OpenCut — editor
open source tipo CapCut, MIT, que processa vídeo **no navegador** com
Rust compilado para WASM.

O plano coloca a timeline no MVP 2 e diz explicitamente, na seção 4.3, que
"clone completo do CapCut" está fora do MVP 1. A justificativa registrada é
"não tentar reproduzir o CapCut inteiro no primeiro ciclo".

O conflito foi apontado ao cliente, que confirmou ambas as decisões.

## Decisão 1 — Timeline multi-track no MVP 1

Substitui os "ajustes por formulário" previstos para a primeira entrega.

### Por que faz sentido apesar do plano

A timeline é a peça que **nenhuma ferramenta entrega pronta**. A documentação
do Remotion é explícita: *"Remotion does not currently provide samples for
building a timeline component, since everybody has different needs."*

O OpenCut tem uma, em MIT. Construir depois significaria reescrever a camada
de ajuste que o MVP 1 teria entregado por formulário — retrabalho evitável.

### O que muda no escopo

Timeline multi-track com drag-and-drop é, sozinha, comparável em esforço a
duas ou três fases das já entregues. As tracks previstas na seção 17 são
vídeo, texto, assets, música e efeitos.

**O que NÃO muda:** a IA continua dirigindo. A timeline é para ajustar a
proposta, não para editar do zero — a distinção que separa este produto de um
editor manual. O fluxo segue sendo "a IA propõe, o usuário corrige".

### Fonte

O código do OpenCut serve de **referência**, não de dependência: é MIT, o que
permite copiar trechos com atribuição. Duas ressalvas que pesam:

- `opencut-classic` (Next.js, a versão que interessaria) foi **arquivada em
  17/05/2026** — somente leitura. Herdar código arquivado é herdar bugs que
  ninguém vai corrigir.
- `opencut` (90k estrelas) está em **reescrita do zero para Rust**, declarado
  "not yet production-ready" e sem aceitar contribuições externas.

Portanto: estudar o desenho da timeline deles, escrever a nossa. O mesmo
critério aplicado ao OpenShorts no ADR 0007.

## Decisão 2 — Avaliar preview no navegador

O preview com proxy passa a ser candidato a rodar no cliente, via WebCodecs,
em vez de consumir CPU da VPS.

### O que motiva

A VPS é compartilhada com outras cinco aplicações. Preview é reprodução
contínua: se acontece no servidor, cada segundo assistido custa CPU que
disputa com o render de outro projeto e com os apps vizinhos.

No navegador, custa zero ao servidor.

### O que NÃO muda

O plano é categórico na seção 3, princípio 7: *"mobile como controle:
uploads e processamento pesado acontecem no servidor, não no celular"*.

Isso permanece. Transcrição, análise editorial e render final continuam no
servidor. O que migra é só a **reprodução do preview**, que não é
processamento pesado — é o que qualquer player de vídeo já faz.

A distinção importa: decodificar um proxy de 720p para assistir é diferente
de cortar, transcrever e renderizar.

### Condições

Preview no navegador **exige** o proxy, que continua sendo gerado no servidor
(seção 18 do contexto mestre). Sem ele, o celular baixaria o original de
500 MB — o oposto da economia pretendida.

A implementação precisa degradar com elegância: aparelho sem suporte a
WebCodecs cai para o player HTML5 comum sobre o mesmo proxy. Nenhum usuário
pode ficar sem preview por causa do navegador.

## Consequências

- O MVP 1 fica maior. A entrega demora mais, e vale o cliente saber disso.
- Preview e render continuam consumindo o **mesmo EditPlan** — a garantia da
  seção 7.1 do plano não é afetada por onde o preview roda.
- A timeline manipula o EditPlan, que já é versionado: cada ajuste cria uma
  versão, e desfazer continua possível.
- Economia de CPU no servidor: a ser medida quando o preview existir, junto
  com os demais números do ADR 0003.

## Pendência

O plano prevê, na seção 4.4, que a timeline do MVP 2 inclua "substituição de
assets, música, intro e transições". Trazer a timeline para o MVP 1 **não**
traz automaticamente todos esses recursos: a primeira versão cobre ajuste de
cortes, ordem e legendas. O resto segue o cronograma original.
