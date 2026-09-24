# MAKUCHO Studio — auditoria funcional e oportunidades

Data: 23/09/2026. Escopo: `studio/` inteiro (web, API, workers, contratos), com o fluxo
**gravar/enviar → preparar → transcrever → proposta → editar → pré-visualizar → exportar**
executado de ponta a ponta com FFmpeg e Whisper reais (ambiente local com as mesmas imagens
de produção).

## 1. Por que o Studio "não funcionava"

| # | Defeito | Efeito para quem usa | Correção |
|---|---|---|---|
| 1 | Depois da transcrição o projeto ia para `ANALYZING` e **nada** disparava a análise | Todo vídeo ficava para sempre em "A IA está analisando" | Fila `studio-analysis` consumida pela API; o worker de transcrição enfileira; varredura a cada minuto recupera projetos já parados (inclusive os de produção) |
| 2 | Não havia tela para cadastrar a chave de IA | A análise falhava sempre por falta de credencial | Nova página **Configurações**: chave DeepSeek (cifrada), limite mensal, consumo, armazenamento |
| 3 | Sem chave (ou com a IA falhando) não havia caminho alternativo | Vídeo sem proposta = vídeo inutilizável | **Montagem automática sem IA**: toda a fala, sem as pausas longas; aviso claro no editor e botão para analisar com IA depois |
| 4 | Gravação do navegador (WebM do MediaRecorder) não tem duração no cabeçalho; o ffprobe devolve `N/A` → `NaN` | **Toda gravação feita em /gravar falhava** no preparo | Duração lida do formato/faixas e, na falta, medida no proxy gerado |
| 4b | O mesmo WebM declara `r_frame_rate` = 1000/1 (base de tempo, não fps); o contrato recusa fps > 240 | Mesmo depois da duração, a gravação do navegador falhava no preparo | fps lido de `avg_frame_rate`, com faixa plausível e 30 como reserva |
| 4c | Imagem do Whisper sem o módulo `requests` (o `huggingface_hub` 1.x deixou de trazê-lo) | **Toda transcrição falhava**: o modelo não baixava | `huggingface_hub<1.0` fixado e `requests` instalado no Dockerfile |
| 5 | `GET /projects/:id/video` ignorava `Range` (sempre 200 com o arquivo inteiro) | O preview não conseguia saltar entre os trechos | Resposta 206 com `Content-Range` |
| 6 | Cartão de projeto em processamento abria `/gravar`, que ligava a câmera | Quem enviou um vídeo via a câmera abrir de novo, sem saber do vídeo | Cartão abre o editor, que mostra o andamento etapa por etapa |
| 7 | `/gravar` pedia câmera e microfone ao abrir | Upload de arquivo começava por um pedido de câmera | Tela começa pela escolha: **Enviar um vídeo** (arrastar/soltar) ou **Gravar com teleprompter**; a câmera só liga no segundo |
| 8 | Editor mostrava um plano de **exemplo** com legendas inventadas sobre o vídeo real | Edição de dados falsos; operações recusadas pelo servidor | Sem dados de exemplo: tela de processamento até existir proposta real |
| 9 | Desfazer/refazer só mudavam a tela | A exportação saía com o ajuste que a pessoa desfez | Desfazer/refazer salvam a versão no servidor (e Ctrl+Z / Ctrl+Shift+Z) |
| 10 | Preview com relógio próprio (setInterval) corrigindo o player | Saltos constantes; trechos desligados tocavam; clicar na timeline parado não mudava a imagem | Relógio do próprio vídeo; pula desligados; busca com o vídeo parado; legenda real da transcrição com palavra ativa |
| 11 | "Regravar" deixava a câmera preta | Segunda tomada impossível sem recarregar | Fluxo religado ao `<video>` por ref de callback |
| 12 | Renomear o projeto no editor não salvava; "Salvo" era fixo | Perda silenciosa | Título salvo na API; indicador real (Salvando / Salvo / Não salvo) |
| 13 | "Gravar com este roteiro" perdia o roteiro (`?roteiro=` ignorado) | Teleprompter com texto genérico | Roteiro carregado e vinculado ao projeto |
| 14 | Retentativa após falha na análise voltava para a transcrição; retentativa do worker de mídia duplicava proxy/thumbnail | Minutos de CPU desperdiçados; editor tocando arquivo velho | Retentativa recomeça da etapa certa; mídias derivadas recriadas limpas |
| 15 | Botões sem ação: Configurações e seletores de câmera/microfone em /gravar, notificações e avatar "JR" na lista, "Adicionar faixa", "Mais opções" e "Adicionar trecho com IA" duplicado | Interface que promete o que não faz | Removidos ou ligados a ações reais (seleção de dispositivo, duplicar/remover trecho) |

Também: medidor de nível do microfone antes de gravar, velocidade/tempo restante e
cancelamento do envio, aviso ao sair da aba durante o envio, reaproveitamento do projeto
quando um envio falha (sem rascunhos vazios), tipo inferido pela extensão (MKV/MOV no
Windows), lista de projetos que se atualiza sozinha durante o processamento, e
"Exportar de novo" quando o plano muda depois de uma exportação.

## 2. Validação

Ambiente local com as imagens de produção (API, mídia, Whisper `small`, render) e o código
novo montado por cima; Chromium com câmera e microfone simulados (voz sintética em pt-BR).

| Cenário | Resultado |
|---|---|
| `/gravar` abre sem pedir câmera | 0 pedidos |
| Envio de MP4 (41 s) → proposta | 24 s, 4 trechos (41,1 s → 33,9 s), sem IA |
| Prévia: Range 206, reprodução saltando trechos, legenda da transcrição | ok ("quero falar de", "um erro muito", "comum.") |
| Renomear, remover trecho, desfazer | servidor acompanha (4 → 3 → 4 trechos) |
| Exportação | MP4 de 6,0 MB com 68 palavras de legenda |
| Gravação pela câmera (WebM sem duração), regravar | imagem mantida; duração medida 14,1 s; proposta pronta |
| "Tentar de novo" após falha | recomeça e chega à proposta, sem proxy duplicado |
| Chave de IA inválida | erro exibido, proposta anterior preservada |
| Análise com IA (provedor de teste) | nova versão com origem `ai` |

## 3. Oportunidades (não implementadas)

Ordem sugerida por impacto no resultado do vídeo e esforço.

1. **Logo e trilha na exportação.** A Marca aceita logo e trilha, mas o render só aplica
   cortes e legendas. É a próxima entrega de maior valor percebido.
2. **Títulos e chamadas sobre o vídeo (overlays).** O contrato já prevê `HookTitle`,
   `CTA`, `LowerThird`; falta a aba no editor e o desenho no render. As abas "Texto" e
   "Áudio" foram retiradas do editor até existirem de fato.
3. **Trechos desligados no servidor.** Hoje ficam no navegador (por projeto) e seguem na
   exportação; outro computador não os vê. Levar para o plano como `enabled`.
4. **Progresso real por etapa.** Os workers já publicam progresso no BullMQ; expor em
   `GET /projects/:id` daria porcentagem e tempo estimado na tela de processamento.
5. **Notificação quando a proposta ou a exportação ficam prontas** (e-mail ou push do PWA):
   o processamento leva minutos e a pessoa sai da aba.
6. **Prévia do vídeo exportado no editor** (tocar o MP4 final antes de baixar) e
   histórico de exportações.
7. **Upload direto do celular com retomada entre sessões**: hoje a sessão de upload vive
   na memória da API; um restart obriga a reenviar.
8. **Enquadramento 9:16 ajustável** (posição do corte para vídeos horizontais), hoje fixo
   no centro.
9. **Histórico de versões do plano na interface** (a API já tem `history` e `restore`).
10. **Testes de ponta a ponta no CI** com o mesmo roteiro usado nesta auditoria
    (vídeo sintético + WebM sem duração).
