-- AlterTable
ALTER TABLE "media_sources" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_credentials" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "originalDays" INTEGER NOT NULL DEFAULT 30,
    "renderDays" INTEGER NOT NULL DEFAULT 60,
    "derivedDays" INTEGER NOT NULL DEFAULT 15,
    "permanentQuotaBytes" BIGINT NOT NULL DEFAULT 4294967296,
    "editingQuotaBytes" BIGINT NOT NULL DEFAULT 6442450944,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_credentials_workspaceId_key" ON "ai_credentials"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "retention_settings_workspaceId_key" ON "retention_settings"("workspaceId");

-- AddForeignKey
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_settings" ADD CONSTRAINT "retention_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

