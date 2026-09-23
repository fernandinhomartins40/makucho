-- Gestão comercial de anúncios: formato, competição por valor, cobrança.
-- Só adiciona tipos, valores de enum e colunas com padrão: anúncios
-- existentes continuam válidos (formato nulo, cobrança FIXED/PENDING).

-- CreateEnum
CREATE TYPE "AdFormat" AS ENUM ('LEADERBOARD', 'BILLBOARD', 'RECTANGLE', 'HALF_PAGE');

-- CreateEnum
CREATE TYPE "AdPricingModel" AS ENUM ('FIXED', 'CPM', 'CPC');

-- CreateEnum
CREATE TYPE "AdBillingStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'OVERDUE', 'COURTESY');

-- AlterEnum
ALTER TYPE "ImagePreset" ADD VALUE 'AD_LEADERBOARD';
ALTER TYPE "ImagePreset" ADD VALUE 'AD_BILLBOARD';
ALTER TYPE "ImagePreset" ADD VALUE 'AD_RECTANGLE';
ALTER TYPE "ImagePreset" ADD VALUE 'AD_HALF_PAGE';

-- AlterTable
ALTER TABLE "advertisements"
    ADD COLUMN "format" "AdFormat",
    ADD COLUMN "is_exclusive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "pricing_model" "AdPricingModel" NOT NULL DEFAULT 'FIXED',
    ADD COLUMN "price" DECIMAL(12,2),
    ADD COLUMN "impression_goal" INTEGER,
    ADD COLUMN "billing_status" "AdBillingStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "billing_due_date" TIMESTAMP(3),
    ADD COLUMN "paid_at" TIMESTAMP(3),
    ADD COLUMN "contact_name" VARCHAR(160),
    ADD COLUMN "contact_email" VARCHAR(255),
    ADD COLUMN "contact_phone" VARCHAR(40),
    ADD COLUMN "billing_notes" VARCHAR(2000);

-- CreateIndex
CREATE INDEX "advertisements_billing_status_billing_due_date_idx" ON "advertisements"("billing_status", "billing_due_date");
