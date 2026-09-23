# Auditoria funcional — portal e painel (2026-09-23)

Verificação de que cada funcionalidade é real: contratos de API existem e são usados, a landing reflete dados persistidos e o upload de mídia é otimizado.

## 1. Contratos API × frontend

Extração estática de 106 rotas NestJS e das chamadas do web (`lib/api.ts`, `lib/painel.ts`, links `/api`).

| Resultado | Detalhe |
|---|---|
| Chamadas do front sem rota na API | **0** |
| Rotas usadas pelo front | 81 (eram 77; +4 de mercado) |
| Lacuna corrigida | Indicadores do Radar (`/market/*`) não tinham tela: com `MARKET_DATA_PROVIDER=manual` os valores ficavam congelados no seed. Criado `/painel/mercado`. |
| Rotas ainda sem tela (conscientemente) | `analytics/*` (métricas), `auth/forgot-password` e `reset-password` (dependem de provedor de e-mail, não configurado), `videos/reorder`, `videos/:id/view`, `search/suggestions`, `tags/popular`, leituras públicas redundantes (`/authors`, `/settings/public`…). |

## 2. Landing e dados persistidos

Corrigido o que estava fixo no código em vez de vir do CMS: títulos/subtítulos das seções, seções "Em alta", "Mais lidas" e "Seleção manual" (não renderizavam), posição do espaço de anúncio, título/chamada da newsletter (configurações), "mostrar na home" das categorias, chave "Exibir ticker", descrição do rodapé. "Ver todos"/"Análises" apontavam para uma busca fixa: criada `/conteudos`. Links `/privacidade` e `/termos` davam 404: páginas criadas (texto descreve só o que o sistema faz — **revisar juridicamente**).

Teste ponta a ponta (altera pela API do painel, confere a página renderizada, desfaz): **11/11**.

| Caso | Resultado |
|---|---|
| Configuração `site.description` → rodapé | PASS |
| "Exibir ticker" desligado → Radar some / volta | PASS |
| Valor do Dólar editado → Radar | PASS |
| Título de seção → home | PASS |
| Seção oculta → sai da home | PASS |
| Publicação nova → home, `/conteudos`, editoria, artigo; excluída → some | PASS |
| Categoria fora da home → sai de "Temas" | PASS |
| Vídeo novo → `/videos` | PASS |
| URL de rede social → rodapé | PASS |
| Inscrição no formulário da landing → lista do painel | PASS |
| Sem atraso de cache (primeira requisição já reflete) | PASS |

## 3. Upload de mídia

- Vídeos guardam **só URL** (+ capa como imagem). A API recusa vídeo no upload (validação pelo conteúdo, via Sharp).
- Todas as imagens passam pelo recorte (`react-easy-crop`), inclusive o formato "Livre" (recorte na proporção original). Cada campo abre no formato certo: avatar 512×512, capa de categoria 1000×560, capa de vídeo 1280×720, capa de publicação 1600×900, compartilhamento 1200×630, anúncio e imagem no texto em "Livre".
- O servidor recorta, remove metadados, redimensiona e grava **apenas WebP e AVIF** (a variante JPEG de compatibilidade foi removida; nada no site a usava). O arquivo original não é armazenado.
- Corrigido: a mesma foto com outro recorte colidia nas chaves do storage (variantes pequenas se sobrescreviam) e falhava com "Já existe um registro". O identificador agora considera arquivo + formato + recorte. Recorte fora da borda por arredondamento é limitado à imagem.

Teste real (MinIO temporário): **5/5** — avatar 4,1 MB JPEG → 28 KB WebP 512×512; "Livre" 3:2 → 2400×1600 WebP+AVIF; vídeo recusado na tela e na API; bucket só com `.webp`/`.avif`.
