-- Teto mensal de gasto com IA, em centavos de dolar.
-- O padrao de 2000 (US$ 20) vale para as credenciais ja cadastradas:
-- sem DEFAULT, um workspace existente ficaria com limite nulo e a
-- trava trataria isso como "sem teto", que e o oposto do desejado.
ALTER TABLE "ai_credentials" ADD COLUMN "monthlyLimitCents" INTEGER NOT NULL DEFAULT 2000;

-- Consumo de IA por workspace, mes e tipo de chamada.
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "call" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- A unicidade e o que permite somar com upsert em vez de ler,
-- calcular e gravar -- que perderia contagem sob concorrencia.
CREATE UNIQUE INDEX "ai_usage_workspaceId_period_call_key" ON "ai_usage"("workspaceId", "period", "call");

-- A leitura quente: "quanto este workspace gastou neste mes", que
-- roda antes de toda chamada de IA.
CREATE INDEX "ai_usage_workspaceId_period_idx" ON "ai_usage"("workspaceId", "period");

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
