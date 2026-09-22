# Direção visual e referências

## Conceito

“Casa de conteúdo que explica economia”: azul naval como estrutura, azul vivo para ação, fundo claro, tipografia forte e leitura confortável. O mockup fornecido é a referência aprovada para a home desktop. Logo oficial e fotografia editorial vêm do pacote da marca; texto, indicadores, botões, cards e ícones são código. O CMS usa a mesma marca, com mais densidade e hierarquia por tarefa, preservando o seu comportamento operacional.

## Anatomia por família

| Família | Conteúdo principal | Ação primária | Composição |
|---|---|---|---|
| Home | radar, hero, módulos do CMS, newsletter | ler análise | coluna editorial, módulos conforme ordem do banco |
| Busca/listagens | título, contexto, filtros e resultados | abrir conteúdo | cabeçalho de leitura + grade adaptativa |
| Artigo | título, autor, mídia, corpo e relacionados | ler/continuar | texto até ~68 caracteres, mídia reservada |
| Vídeos | título, plataformas e coleção | assistir | cards 16:9, links reais |
| Login/conta | marca, campos, feedback | entrar/salvar | formulário curto e foco evidente |
| Painel | prioridades, números confiáveis, recentes | criar publicação | resumo com próxima ação clara |
| Listas CMS | filtros, contagem, itens, ações | criar/editar | superfície densa, status legível |
| Editor CMS | conteúdo, estado salvo, publicação, mídia | salvar/publicar | área de escrita + metadados contextuais |
| Home CMS | sequência, visibilidade e preview | ajustar seção | lista ordenável, modal com seleção |
| Operação CMS | anúncios, newsletter, usuários, configurações, auditoria | ação da página | tabela/formulário e confirmação |

## Viabilidade

| Elemento | Técnica |
|---|---|
| Grid, fundos, botões, estados, cards, tipografia | HTML/CSS |
| Ícones, indicador, marca existente | SVG oficial/reutilizado |
| Capas e thumbnails | mídia real do CMS; assets aprovados como referência visual |
| Login, CRUD, publicação, anúncio, newsletter | API NestJS + Prisma; estado de carregamento/erro na interface |

Referências por viewport: desktop 1440 × 900, tablet 820 × 1180, celular 390 × 844. As imagens devem ser exportadas de interfaces em código para evitar controles ou texto fictícios. Studio não recebe direção visual nova.
