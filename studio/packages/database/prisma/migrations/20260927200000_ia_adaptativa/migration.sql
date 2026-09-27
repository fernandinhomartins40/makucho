-- IA adaptativa: tipo de áudio, tipo de vídeo e resumo no projeto; ramo do negócio.
ALTER TABLE "projects" ADD COLUMN "audioProfile" JSONB;
ALTER TABLE "projects" ADD COLUMN "videoKind" TEXT;
ALTER TABLE "projects" ADD COLUMN "contentBrief" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "businessType" TEXT;
