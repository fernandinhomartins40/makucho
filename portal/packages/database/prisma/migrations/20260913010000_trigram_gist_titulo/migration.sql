-- Troca o indice trigram do titulo de GIN para GiST.
--
-- A busca usa word_similarity(termo, title), que compara o termo com a
-- melhor palavra do titulo — similarity() sobre a frase inteira cai para
-- perto de zero em titulos longos, mesmo com a palavra certa dentro.
-- Apenas o GiST acelera esse operador; o GIN so serve para similarity().

DROP INDEX IF EXISTS "posts_title_trgm_idx";

CREATE INDEX IF NOT EXISTS "posts_title_trgm_idx"
  ON "posts" USING GIST ("title" gist_trgm_ops);
