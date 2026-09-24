-- Custo exato da IA em micro-dolares (antes: centavos arredondados
-- para cima a cada chamada). O historico e convertido 1 centavo = 10.000.
ALTER TABLE "ai_usage" ADD COLUMN "costMicros" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN "savedMicros" INTEGER NOT NULL DEFAULT 0;
UPDATE "ai_usage" SET "costMicros" = "costCents" * 10000, "savedMicros" = "savedCents" * 10000;
