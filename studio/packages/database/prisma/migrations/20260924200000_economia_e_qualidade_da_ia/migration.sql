-- Auditoria de IA: economia (cache e horario) por chamada e o
-- aproveitamento da selecao da IA por projeto.
ALTER TABLE "ai_usage" ADD COLUMN "cachedTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN "cacheHits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN "savedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN "aiKeptRatio" DOUBLE PRECISION;
