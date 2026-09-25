-- Chave do banco de imagens e vídeos (Pexels) do workspace, cifrada.
CREATE TABLE "stock_credentials" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pexels',
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_credentials_workspaceId_key" ON "stock_credentials"("workspaceId");

ALTER TABLE "stock_credentials" ADD CONSTRAINT "stock_credentials_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
