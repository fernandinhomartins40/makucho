# Pauta diária (sem IA)

Cria até três publicações por dia, com imagem, pela API do portal:

| Publicação | Origem | Imagem |
|---|---|---|
| Boletim "Mercado em DD/MM/AAAA" (dias úteis) | Texto montado por regras fixas com os números do dia: Dólar, Euro e Bitcoin (AwesomeAPI), Ibovespa (Yahoo Finance), Selic e IPCA (Banco Central) | Gráfico do dólar em 30 dias, gerado pelo script |
| Até 2 notícias de economia | Feed oficial da [Agência Brasil](https://agenciabrasil.ebc.com.br/rss/economia/feed.xml), reproduzidas na íntegra | Foto da matéria, com crédito do fotógrafo |

Nada é reescrito nem inventado. A [política da Agência Brasil](https://agenciabrasil.ebc.com.br/sobre) autoriza a reprodução "para veículos de comunicação com fins jornalísticos, mediante indicação da fonte"; cada notícia sai com a fonte, link para o original (também como URL canônica, para SEO) e o crédito da foto. O autor aparece como "Agência Brasil" (criado automaticamente).

Tudo passa pela API: validação, sanitização do HTML, recorte/compressão das imagens em WebP/AVIF e registro na auditoria. O script não publica o mesmo conteúdo duas vezes (um boletim por dia; notícias pelo título).

## Configurar (uma vez)

1. No painel, **Usuários → Novo usuário**: por exemplo `pauta@makucho.com.br`, papel **Editor**. Entre uma vez com ele e troque a senha provisória.
2. No GitHub, **Settings → Secrets and variables → Actions**:
   - *Secrets*: `MAKUCHO_EMAIL` e `MAKUCHO_SENHA` desse usuário.
   - *Variables* (opcional): `PAUTA_STATUS` = `REVIEW` (padrão: fica "Em revisão" para a redação publicar), `PUBLISHED` (publica direto) ou `DRAFT`.
3. **Actions → Pauta diária → Run workflow** com "Só simular" marcado para ver o que seria criado; depois rode sem simular.

A execução automática é diária às 18h30 (Brasília).

## Rodar manualmente

```bash
pip install -r requirements.txt
MAKUCHO_API_URL=https://makucho.com.br/api MAKUCHO_EMAIL=... MAKUCHO_SENHA=... \
PAUTA_STATUS=REVIEW PAUTA_SIMULAR=1 python pauta_diaria.py
```

Outras variáveis: `PAUTA_MAX_AGENCIA` (padrão 2), `PAUTA_CATEGORIA` (padrão `economia`), `PAUTA_BOLETIM_FDS=1` (boletim também no fim de semana).
