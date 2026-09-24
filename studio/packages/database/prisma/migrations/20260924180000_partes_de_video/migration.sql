-- Varios videos por projeto: cada envio vira uma parte (PART), com
-- ordem e nome, e o worker de midia as junta num ORIGINAL so quando a
-- pessoa decide ir para a edicao.
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'PART';
ALTER TABLE "media_sources" ADD COLUMN "position" INTEGER;
ALTER TABLE "media_sources" ADD COLUMN "originalName" TEXT;
