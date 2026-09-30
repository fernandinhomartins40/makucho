-- O diagnóstico da última criação de animações (o que a direção pediu, o que entrou, o que saiu e por quê).
ALTER TABLE "projects" ADD COLUMN "animationReport" JSONB;
