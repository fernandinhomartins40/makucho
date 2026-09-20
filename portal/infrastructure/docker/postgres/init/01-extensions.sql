-- Extensoes usadas pela busca do portal (secao 28).
-- Roda apenas na primeira criacao do volume do Postgres.

-- unaccent: permite buscar "economia" e encontrar "econômia".
CREATE EXTENSION IF NOT EXISTS unaccent;

-- pg_trgm: busca por similaridade, tolera erros de digitacao.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Configuracao de busca em portugues que ignora acentos.
-- Usada nos indices full text dos posts.
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
