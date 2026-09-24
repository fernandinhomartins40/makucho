-- Preferencias de video do Kit de marca: estilo de legenda, logo,
-- trilha, zoom, transicao e efeitos sonoros dos videos novos.
-- Nullable: perfis existentes seguem com o acabamento padrao.
ALTER TABLE "brand_profiles" ADD COLUMN "videoDefaults" JSONB;
