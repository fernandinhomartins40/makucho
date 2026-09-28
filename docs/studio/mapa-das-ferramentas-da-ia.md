# Mapa das ferramentas do Studio (para a IA com ferramentas e o MCP)

Levantado do código em 27/09/2026, antes da Fase 1 (IA com ferramentas).
Objetivo: saber **tudo** o que o Studio faz, onde mora no código, quem aciona
hoje e como cada coisa vira uma **ferramenta** que a IA chama sozinha (e,
depois, que o servidor MCP expõe).

Legenda da coluna **Hoje**:
- **Auto**: roda sozinho no pipeline (ninguém pede).
- **Botão**: a pessoa clica no editor.
- **IA-M**: a IA usa na montagem inicial.
- **IA-C**: a IA do "Peça à IA" (comando) consegue usar hoje.
- **—**: nenhuma IA alcança hoje.

---

## 1. O caminho de ponta a ponta

```
Envio / gravação ──► Preparo (worker de mídia) ──► Transcrição + tipo de áudio
      │                                                   │
      ▼                                                   ▼
 Tipo de vídeo, resumo                       Montagem inicial (IA-M)
 Ramo do negócio                 ┌── pela FALA: seleção viral + acabamento + mídias
                                 └── pelas CENAS: visão + montagem visual + acabamento
                                                          │
                                                          ▼
                                   Edição (editor + "Peça à IA" + botões)
                                                          │
                                                          ▼
                                     Exportação (servidor ou navegador)
```

---

## 2. Preparo e entendimento do vídeo

| Ferramenta | Onde está | O que faz | Hoje | Vira ferramenta da IA? |
|---|---|---|---|---|
| Envio em partes / juntar partes | `media.controller`, worker de mídia (`juntar.ts`) | Recebe o vídeo em pedaços, junta vários vídeos num só | Botão | Não (é da pessoa) |
| Metadados, prévia leve, miniatura | worker de mídia (`gerarProxy`, `gerarThumbnail`) | Duração, resolução, proxy 720p, capa | Auto | Não |
| Áudio para transcrição / áudio mudo | `extrairAudio`, `gerarAudioMudo` | WAV 16 kHz; vídeo sem som ganha áudio mudo | Auto | Não |
| Silêncios | `detectarSilencios` (silencedetect) | Mapa de pausas | Auto | **Ler**: `ver_silencios` |
| Cortes de cena + quadro de cada cena | `detectarCortesDeCena`, `cenasDosCortes` | Cenas usáveis (junta curtas, divide longas) | Auto | **Ler**: `listar_cenas` |
| Transcrição (Whisper) | worker de transcrição | Frases e palavras com tempo e confiança | Auto | **Ler**: `ler_fala` |
| Filtro de alucinação | `transcrever.py`, `ehAlucinacaoDoWhisper` | Tira "Legendas pela comunidade…" e afins | Auto | Não (garantia interna) |
| Tipo de áudio | `classificarAudio` | fala / fala parcial / música-ambiente / mudo | Auto | **Ler**: `ver_projeto` traz |
| Visão dos quadros (CLIP) | `VisaoService.olharQuadros` | O que cada quadro mostra, nitidez, brilho | IA-M (cenas) | **Ler**: `olhar_quadro` |
| Onda do áudio | `GET /projects/:id/onda` | Forma de onda para a timeline | Auto | Não |
| Retomadas (frase refeita) | `detectarRetomadas` | Marca "esta refaz aquela" | IA-M | **Ler**: dentro de `ler_fala` |

## 3. Contexto do negócio e da pessoa

| Ferramenta | Onde está | O que faz | Hoje | Vira ferramenta? |
|---|---|---|---|---|
| Tipo de vídeo + resumo ("O que tem neste vídeo?") | `project.videoKind/contentBrief`, `TipoDoVideo.tsx` | A receita da montagem; o que a IA não vê (preço, oferta) | IA-M | **Ler**: `ver_projeto`; **Editar**: `definir_tipo_do_video` |
| Receitas por tipo de vídeo (6) | `adaptativo.ts` `RECEITAS` | Duração, ritmo, legenda, textos, som ambiente | IA-M | **Ler**: `consultar_catalogo(receitas)` |
| Ramo do negócio (10) | `workspace.businessType`, `RAMOS` | Chamada padrão, vocabulário visual, tipo sem fala | IA-M | **Ler**: `ver_marca` |
| Perfil de comunicação | `communication` (tom, energia, muletas, CTA…) | Como a pessoa fala e corta | IA-M (seleção) | **Ler**: `ver_marca` |
| Kit de marca (preferências de vídeo) | `brand-profile.videoDefaults`, `acabamento.ts` | Legenda fixa, logo, trilha, zoom, transição, sons, barra | IA-M | **Ler**: `ver_marca` |
| Biblioteca da marca (logos, trilhas, sons, vinhetas, imagens) | `assets`, `itensDoKit` | Arquivos da marca com "para que serve" | IA-C | **Ler**: `ver_biblioteca_da_marca` |
| Roteiro de origem | `scripts` | O que a pessoa queria dizer | IA-M | **Ler**: `ver_projeto` |

## 4. Montagem inicial (hoje só no pipeline, uma decisão por vez)

| Ferramenta | Onde está | O que faz | Hoje | Vira ferramenta? |
|---|---|---|---|---|
| Seleção viral de trechos | `analise.service`, prompt `selecao-v5` | Gancho 0-3 s, promessa, entrega, recompensa, CTA; risco semântico | IA-M | **Conceito**: `montar_pela_fala` (refazer os cortes no protocolo viral) |
| Compilador de proposta | `compilador.ts` | Proposta → plano; recusa trecho sem fala | Auto | Não (garantia interna das ferramentas) |
| Fechamento do assunto | `analisarFechamento` | Estende o último corte até o fim da frase; avisa se falta conclusão | Auto + aviso | **Ler/Conferir**: `conferir_plano` |
| Cortes encostados na fala | `tirarPausas` | Tira o silêncio das pontas dos trechos | Auto + Botão ("Cortar silêncios") | **Editar**: `cortar_silencios` |
| Montagem pelas cenas | `montagem-visual.service`, `compilarMontagemVisual` | Vídeo sem narração: cenas, ordem, ritmo, textos | IA-M | **Conceito**: `montar_pelas_cenas` |
| Acabamento da marca | `aplicarAcabamento` | Legenda, zoom alternado, transições nas viradas, título, CTA, logo, barra, sons, trilha, vinhetas, enquadramento, voz limpa | IA-M + Botão ("Refazer acabamento") | **Conceito**: `aplicar_acabamento_da_marca` |
| Mídias que ilustram a fala | `midias.service.sugerir/separarNaMontagem`, prompt `midias-v2` | Momentos da fala que pedem imagem + opções (com visão) | IA-M + Botão | **Conceito**: `ilustrar_a_fala` |

## 5. Edição (as 44 operações da timeline)

Todas em `packages/contracts/src/timeline.ts`, validadas por Zod, aplicadas
por `aplicarOperacao`, e cada pedido vira uma versão (desfazer). Hoje a IA do
comando alcança todas (IA-C), mas **numa jogada só** e sem poder ler antes.

| Grupo | Operações (parâmetros principais) | Ferramenta proposta |
|---|---|---|
| Trechos | `mover_clipe`, `ajustar_corte` (início/fim no original), `alternar_clipe` (ligar/desligar), `dividir_clipe`, `duplicar_clipe`, `inserir` (trecho da gravação), `reordenar` | `editar_trechos` |
| Ritmo e imagem do trecho | `definir_velocidade` (0,25-4x), `definir_efeito` (zoom seco/lento), `definir_cor` / `cor_em_todos` (22 aparências), `ajustar_audio_do_clipe` (volume, mudo, fades, J/L-cut) | `ajustar_trechos` |
| Legenda | `configurar_legenda` (ligar, palavras por bloco, posição, tamanho, fonte, cores, entrada), `trocar_estilo_legenda` (10 estilos), `editar_legenda` / `desfazer_correcao` (corrigir palavra), `ocultar_legenda` / `restaurar_legenda`, `adicionar_legenda` / `editar_legenda_manual` / `remover_legenda_manual` | `editar_legenda` |
| Textos na tela | `adicionar_overlay` / `editar_overlay` / `remover_overlay` (título, CTA, destaque, rodapé, citação, número; 13 estilos prontos, 13 entradas, 10 saídas, 9 animações, keyframes), e o atalho `estilo_de_texto` | `editar_textos` |
| Transições | `definir_transicao`, `transicao_em_todos` (50 transições) | `editar_transicoes` |
| Efeitos de tela | `adicionar/editar/remover_efeito_de_tela` (16: flash, tremor, VHS…) | `editar_efeitos_de_tela` |
| Mídias sobrepostas | `adicionar/editar/remover_midia` (14 layouts, Ken Burns, moldura, revelação, seguir a pessoa, animações, keyframes) | `editar_midias` |
| Som | `trocar_musica`, `configurar_musica` (volume, fades, abaixar na voz), `adicionar/editar/remover_efeito_sonoro` (26 sons embutidos + da marca), `adicionar/editar/remover_narracao` | `editar_audio` |
| Vídeo | `definir_formato` (9:16, 4:5, 1:1, 16:9), `configurar_video` (enquadramento, voz limpa), `definir_abertura` / `definir_encerramento` (vinhetas) | `configurar_video` |
| Pacotes de estilo | atalho `aplicar_pacote` (5 pacotes: energia TikTok…) | `aplicar_pacote` |

## 6. Buscar e trazer mídia

| Ferramenta | Onde está | O que faz | Hoje | Vira ferramenta? |
|---|---|---|---|---|
| Busca nos bancos (sem IA) | `banco-de-midia` + `traduzirBusca` | Vídeos, fotos, ilustrações, ícones 3D, ícones, logos (Pexels, Pixabay, Openverse, Iconify, 3dicons, Fluent) | Botão | **Buscar**: `buscar_midia` |
| Importar para o workspace | `POST /banco-de-midia/importar` | Baixa com licença e crédito, vira asset | Botão | Interno de `adicionar_midia_do_banco` |
| Posicionar pela fala | `midias.service.posicionar`, prompt `posicionar-midia-v1` | Momento, duração e composição (6) | Botão (IA) | **Editar**: `adicionar_midia_do_banco` |
| Enviar arquivo próprio | `assets` | Imagem/vídeo da pessoa | Botão | Não (é da pessoa) |
| Slideshow no ritmo / colagem / antes e depois | `PainelDeMidias` + `cortesDoSlideshow` + batidas da trilha | Várias fotos em sequência ou lado a lado | Botão | **Editar**: `montar_com_fotos` (mover a lógica para o servidor) |

## 7. Refino e roteiro

| Ferramenta | Onde está | O que faz | Hoje | Vira ferramenta? |
|---|---|---|---|---|
| Trecho esquecido | `refino.service` candidatos, prompt `candidatos-v1` | Acha falas boas que ficaram de fora | Botão (IA) | **Conceito**: `achar_trechos_esquecidos` |
| Aprimorar cortes | `refino.service` refinar, prompt `refino-v1` | Ajusta bordas dos cortes | Botão (IA) | **Conceito**: `aprimorar_cortes` |
| Roteiro (gerar, livre, editar, sugestões) | `roteiro.service` | Antes da gravação | Botão (IA) | Fase 3 (MCP); fora do agente do editor |
| Configurar a marca com IA | `acabamento.service.configurarMarca` | Cores, fontes e estilo a partir da logo | Botão (IA) | Fase 3 (MCP) |

## 8. Recursos que rodam só no navegador

| Ferramenta | Onde está | O que faz | Vira ferramenta? |
|---|---|---|---|
| Recorte da pessoa (texto atrás) | `recorteDaPessoa.ts` | Máscara da pessoa na prévia | Não: é desenho da prévia (o render faz o dele em `mascaras.ts`) |
| Remover fundo de imagem | `removerFundo.ts` | Recorta imagem enviada | Não na Fase 1 (depende do navegador) |
| Batidas da trilha | `batidasDaTrilha.ts` / `batidas.ts` | Ritmo para cortes e slideshow | Levar ao servidor na Fase 1 se `montar_com_fotos` entrar |
| Gravar narração | `gravadorDeNarracao.ts` | Voz por cima | Não (precisa do microfone da pessoa) |
| Exportar no navegador | `lib/exportacao/` | Render local | Não; a IA usa a exportação do servidor |

## 9. Exportação

| Ferramenta | Onde está | O que faz | Hoje | Vira ferramenta? |
|---|---|---|---|---|
| Render no servidor | `renders`, worker de render (`render.ts`, legendas ASS, máscaras) | MP4 final a partir do original | Botão | **Ação**: `exportar_video` (só com confirmação da pessoa) |
| Situação / baixar | `GET /render`, `/render/download` | Progresso e arquivo | Botão | **Ler**: `ver_exportacao` |

## 10. Catálogos (consultados sob demanda, não mais no prompt inteiro)

| Catálogo | Itens | Onde |
|---|---|---|
| Estilos de legenda | 10 | `PRESETS_DE_LEGENDA` |
| Fontes | 24 | `FAMILIAS_DE_FONTE` |
| Animações de legenda | 7 | `ANIMACOES_DE_LEGENDA` |
| Estilos prontos de texto | 13 | `PRESETS_DE_TEXTO` |
| Entradas / saídas / animações de texto | 13 / 10 / 9 | `textos-de-tela.ts` |
| Efeitos de tela | 16 | `EFEITOS_DE_TELA` |
| Stickers | 40 | `STICKERS` |
| Sons embutidos | 26 | `SONS_EMBUTIDOS` |
| Transições | 50 | `TRANSICOES_DO_CATALOGO` |
| Aparências de cor | 22 | `APARENCIAS` |
| Pacotes de estilo | 5 | `PACOTES_DE_ESTILO` |
| Layouts de mídia | 14 | `LAYOUTS_DE_MIDIA` |
| Composições de mídia | 6 | `COMPOSICOES` |
| Efeitos de trecho | 2 | `EFEITOS_DE_TRECHO` |
| Formatos | 4 | `FORMATOS` |
| Papéis de trecho / estruturas | 13 / 5 | `CLIP_ROLES` / `FRAMEWORKS` |
| Tipos de vídeo / ramos | 6 / 10 | `adaptativo.ts` |

## 11. Regras que continuam fixas (dentro das ferramentas)

A IA decide **o que, como e quando**. Estas garantias ela não contorna:

1. **Nunca inventar fala**: trecho de fala só aponta para fala que existe (`compilador`, schema do plano).
2. **Nunca inventar preço, oferta ou marca**: só do resumo da pessoa.
3. **Validação de toda edição** pelo Zod antes de aplicar.
4. **Tudo vira versão**: qualquer passo da IA dá para desfazer.
5. **Teto de gasto** do workspace e teto por pedido (passos e custo).
6. **Exportar e apagar** pedem confirmação da pessoa.
7. **Licença das mídias**: só fontes livres, com crédito quando exigido.

## 12. O que a IA do "Peça à IA" não alcança hoje

- Refazer os cortes no roteiro viral (só existe na montagem inicial).
- Buscar, importar e posicionar imagens (só existe nos botões).
- Ler a fala de um trecho, olhar um quadro, ver as cenas (recebe só um resumo).
- Saber o tipo de vídeo, o resumo e o ramo (não vão no prompt dela).
- Achar trechos esquecidos e aprimorar cortes.
- Conferir o que fez e corrigir no mesmo pedido.

## 13. O registro de ferramentas proposto (Fase 1)

**Ler (sem custo de IA):** `ver_projeto`, `ler_fala`, `listar_cenas`,
`olhar_quadro`, `ver_silencios`, `ver_marca`, `ver_biblioteca_da_marca`,
`consultar_catalogo`, `ver_exportacao`.

**Conceitos (a IA decide quando usar):** `montar_pela_fala`,
`montar_pelas_cenas`, `aplicar_acabamento_da_marca`, `ilustrar_a_fala`,
`achar_trechos_esquecidos`, `aprimorar_cortes`, `aplicar_pacote`.

**Editar (as 44 operações, agrupadas):** `editar_trechos`, `ajustar_trechos`,
`editar_legenda`, `editar_textos`, `editar_transicoes`,
`editar_efeitos_de_tela`, `editar_midias`, `editar_audio`,
`configurar_video`, `cortar_silencios`, `definir_tipo_do_video`,
`montar_com_fotos`.

**Buscar e trazer:** `buscar_midia`, `adicionar_midia_do_banco`.

**Sobreposições (implementado):** `adicionar_sobreposicao` (tipo do catálogo `SOBREPOSICOES`: luz vazando, bokeh, poeira, partículas, confete...). Busca curada no banco de vídeos, importa e põe em tela cheia com `blend` "tela" (ou "multiplicar" na textura de papel). O modo de mistura da camada (`blend`) vale no render (`blend` do FFmpeg, só nos quadros dela) e na prévia (blend do WebGL), com a mesma conta.

**Transições:** as receitas aceitam qualquer nativa do `xfade` como mistura (`MISTURAS_DE_RECEITA`), o que abriu 34 combinações novas (Impacto, Luz, Glitch, Formas e Desfoque). A prévia compila o shader de cada transição só quando ela aparece.

**Conferir:** `conferir_plano` (fechamento, sobreposição, legenda),
`resumir_mudancas`, `desfazer`.

**Pedem confirmação:** `exportar_video`.

Total: cerca de 35 ferramentas, quase todas sobre código que já existe. O
trabalho novo é o registro (nome, descrição, esquema e execução de cada
uma), o loop do agente com limites e o progresso na tela. O mesmo registro
alimenta o servidor MCP na Fase 3.

**Música e sons grátis (implementado):** `escolher_trilha` (clima do catálogo `CLIMAS_DE_MUSICA`; Jamendo pelo Openverse; instrumental que cobre o vídeo primeiro; devolve o crédito quando a licença é CC BY) e `adicionar_som_do_banco` (Freesound, até 15 s). Na tela: aba Música (climas + busca + ▶) e aba Sons (busca), com o crédito pronto para copiar. Endpoints `GET /banco-de-midia/audio` e `POST /banco-de-midia/importar-audio`, sem chave.
