-- Uma chave por banco de mídia (Pexels, Pixabay) em cada workspace.
DROP INDEX "stock_credentials_workspaceId_key";
CREATE UNIQUE INDEX "stock_credentials_workspaceId_provider_key" ON "stock_credentials"("workspaceId", "provider");
