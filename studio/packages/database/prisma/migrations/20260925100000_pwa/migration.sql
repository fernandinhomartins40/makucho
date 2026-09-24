-- Configuracao do aplicativo instalavel (PWA): nome, cores, icones e
-- capturas de tela da instalacao.
CREATE TABLE "pwa_config" (
    "id" TEXT NOT NULL DEFAULT 'padrao',
    "name" TEXT NOT NULL DEFAULT 'MAKUCHO Studio',
    "shortName" TEXT NOT NULL DEFAULT 'Studio',
    "description" TEXT NOT NULL DEFAULT 'Seus vídeos, editados por IA',
    "themeColor" TEXT NOT NULL DEFAULT '#06132d',
    "backgroundColor" TEXT NOT NULL DEFAULT '#06132d',
    "iconKey" TEXT,
    "maskableKey" TEXT,
    "screenshots" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pwa_config_pkey" PRIMARY KEY ("id")
);
