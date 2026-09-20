-- Busca textual em portugues (secao 28).
--
-- Estrategia: uma coluna tsvector mantida pelo proprio Postgres (GENERATED
-- ALWAYS) + indice GIN. Nao ha Elasticsearch: o volume de um portal
-- editorial cabe folgado no full-text nativo, e uma peca a menos para
-- operar, monitorar e pagar.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Configuracao propria que remove acentos antes de reduzir ao radical.
-- Sem isso "economia" e "econômia" seriam termos diferentes, e o leitor
-- que digita sem acento — a maioria — nao encontraria nada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'portuguese_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION portuguese_unaccent (COPY = portuguese);

    ALTER TEXT SEARCH CONFIGURATION portuguese_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, portuguese_stem;
  END IF;
END
$$;

-- Pesos: titulo (A) vale mais que resumo (B), que vale mais que o corpo (C).
-- Assim um artigo cujo titulo e "Selic" vence outro que so a cita no meio.
ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese_unaccent', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('portuguese_unaccent', coalesce("subtitle", '')), 'B') ||
    setweight(to_tsvector('portuguese_unaccent', coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('portuguese_unaccent', coalesce("content_text", '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");

-- Indice trigram no titulo: cobre o erro de digitacao ("economai"), que o
-- full-text sozinho nao alcanca, e alimenta o autocomplete.
CREATE INDEX IF NOT EXISTS "posts_title_trgm_idx" ON "posts" USING GIN ("title" gin_trgm_ops);

-- Mesma ideia para videos, com menos campos.
ALTER TABLE "videos"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese_unaccent', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('portuguese_unaccent', coalesce("description", '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "videos_search_vector_idx" ON "videos" USING GIN ("search_vector");
