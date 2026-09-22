# Mapa de assets

## Existentes, reutilizáveis

| Asset | Origem/licença | Uso e alt | Proporção/crop | Entrega |
|---|---|---|---|---|
| marca horizontal e símbolo | `MAKUCHO_Landing_Page_Complete_v1/brand-kit/`; fornecido pelo cliente | cabeçalho, rodapé, newsletter e CMS | manter proporção; `object-fit:contain` | variantes WebP oficiais copiadas para `portal/apps/web/public/brand/` |
| `hero-congresso-brasilia` | pacote de referência do cliente | destaque; “Congresso Nacional em Brasília ao pôr do sol” | 16:9, centro | WebP 640/960/1600; prioridade se usado |
| `card-banco-central`, `card-real-dolar` | mesmo pacote | referência editorial; alt conforme assunto | 16:9, centro | WebP 640/960/1600; lazy |
| `video-reserva-emergencia`, `video-mercado`, `video-financas-pessoais` | mesmo pacote | referência de vídeo | 16:9, foco conforme manifest original | WebP 640/960/1600; lazy |
| mídia real do CMS | `Media` + `MediaVariant` no Prisma | capa/thumbnail com `alt` salvo | variantes por tamanho, `object-fit:cover` | `urlDaImagem()`, `sizes` por grade |

Não usar `video-apresentador-placeholder` em produção; o próprio README do pacote exige imagem real do criador. Sem necessidade de gerar fotografia adicional: as telas em escopo usam fotos reais e o restante é código. Imagens de referência das telas são artefatos de revisão, não assets de interface.

O manifest do pacote já existe em `MAKUCHO_Landing_Page_Complete_v1/landing-page/assets.manifest.json`. Se novos assets raster forem introduzidos, especificar versões desktop/tablet/mobile, área segura, ponto focal, alt, compressão e executar `build_asset_manifest.py` da skill.
