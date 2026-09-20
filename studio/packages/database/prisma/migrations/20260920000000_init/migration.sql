-- CreateEnum
CREATE TYPE "StudioUserRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectState" AS ENUM ('DRAFT', 'UPLOADING', 'INGESTING', 'TRANSCRIBING', 'ANALYZING', 'PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'RENDERING', 'QUALITY_CHECK', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCEL_REQUESTED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('ORIGINAL', 'PROXY', 'AUDIO', 'THUMBNAIL', 'KEYFRAME');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT', 'WATERMARK', 'FONT', 'IMAGE', 'VIDEO', 'LOTTIE', 'MUSIC', 'SOUND_EFFECT', 'INTRO', 'OUTRO', 'TRANSITION');

-- CreateEnum
CREATE TYPE "ScriptMode" AS ENUM ('FULL', 'TOPICS', 'BULLETS', 'GUIDED_IMPROV', 'STORYTELLING');

-- CreateEnum
CREATE TYPE "ClipRole" AS ENUM ('HOOK', 'PROBLEM', 'CONTEXT', 'CURIOSITY_GAP', 'AUTHORITY', 'INTRODUCTION', 'PROOF', 'INSIGHT', 'SOLUTION', 'PATTERN_INTERRUPT', 'PAYOFF', 'OFFER', 'CTA');

-- CreateEnum
CREATE TYPE "SemanticRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('WAITING', 'ACTIVE', 'RETRY_DELAY', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('MEDIA_INGEST', 'MEDIA_PROXY', 'TRANSCRIPTION_RUN', 'ANALYSIS_RUN', 'RENDER_RUN');

-- CreateTable
CREATE TABLE "studio_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "StudioUserRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "colors" JSONB NOT NULL,
    "fontPrimary" TEXT,
    "fontSecond" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caption_styles" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fontFamily" TEXT NOT NULL,
    "fontSizePx" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "strokeColor" TEXT,
    "strokeWidthPx" INTEGER NOT NULL DEFAULT 0,
    "highlightColor" TEXT,
    "wordsPerBlock" INTEGER NOT NULL DEFAULT 3,
    "position" TEXT NOT NULL DEFAULT 'bottom',

    CONSTRAINT "caption_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "durationMs" INTEGER,
    "hasAlpha" BOOLEAN NOT NULL DEFAULT false,
    "license" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "energy" TEXT NOT NULL,
    "sentenceLen" TEXT NOT NULL,
    "preferredOpening" TEXT NOT NULL,
    "allowedHooks" JSONB NOT NULL,
    "allowedFrameworks" JSONB NOT NULL,
    "selfIntroPolicy" TEXT NOT NULL,
    "storytellingLevel" TEXT NOT NULL,
    "humorLevel" TEXT NOT NULL,
    "allowProfanity" BOOLEAN NOT NULL DEFAULT false,
    "ctaStyle" TEXT NOT NULL,
    "targetDurationMinMs" INTEGER NOT NULL DEFAULT 45000,
    "targetDurationMaxMs" INTEGER NOT NULL DEFAULT 75000,
    "cutAggressiveness" TEXT NOT NULL DEFAULT 'medium',
    "bannedWords" JSONB,
    "removableFillers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "ScriptMode" NOT NULL,
    "framework" TEXT NOT NULL,
    "targetDurationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_blocks" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "role" "ClipRole" NOT NULL,
    "goal" TEXT,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "script_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scriptId" TEXT,
    "title" TEXT NOT NULL,
    "state" "ProjectState" NOT NULL DEFAULT 'DRAFT',
    "objective" TEXT,
    "framework" TEXT,
    "targetDurationMs" INTEGER,
    "publicError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_sources" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "durationMs" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "fps" DOUBLE PRECISION,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcriptions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "transcriptionId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "position" INTEGER NOT NULL,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_words" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "word" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "transcript_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detected_regions" (
    "id" TEXT NOT NULL,
    "transcriptionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "detected_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rawOutput" JSONB NOT NULL,
    "parsedOk" BOOLEAN NOT NULL,
    "parseError" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "origin" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "explanations" JSONB NOT NULL,
    "overallRisk" "SemanticRisk" NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renders" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "editPlanId" TEXT NOT NULL,
    "storageKey" TEXT,
    "sizeBytes" BIGINT,
    "durationMs" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "qualityCheck" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'WAITING',
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "percent" INTEGER,
    "step" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorInternal" TEXT,
    "errorPublic" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_users_email_key" ON "studio_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "memberships_workspaceId_idx" ON "memberships"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_workspaceId_key" ON "memberships"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "brand_profiles_workspaceId_isActive_idx" ON "brand_profiles"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_workspaceId_version_key" ON "brand_profiles"("workspaceId", "version");

-- CreateIndex
CREATE INDEX "caption_styles_brandProfileId_idx" ON "caption_styles"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storageKey_key" ON "assets"("storageKey");

-- CreateIndex
CREATE INDEX "assets_workspaceId_kind_isActive_idx" ON "assets"("workspaceId", "kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "communication_profiles_workspaceId_key" ON "communication_profiles"("workspaceId");

-- CreateIndex
CREATE INDEX "scripts_workspaceId_idx" ON "scripts"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "script_blocks_scriptId_position_key" ON "script_blocks"("scriptId", "position");

-- CreateIndex
CREATE INDEX "projects_workspaceId_state_idx" ON "projects"("workspaceId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "media_sources_storageKey_key" ON "media_sources"("storageKey");

-- CreateIndex
CREATE INDEX "media_sources_projectId_kind_idx" ON "media_sources"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "transcriptions_projectId_key" ON "transcriptions"("projectId");

-- CreateIndex
CREATE INDEX "transcript_segments_transcriptionId_startMs_idx" ON "transcript_segments"("transcriptionId", "startMs");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_transcriptionId_position_key" ON "transcript_segments"("transcriptionId", "position");

-- CreateIndex
CREATE INDEX "transcript_words_segmentId_startMs_idx" ON "transcript_words"("segmentId", "startMs");

-- CreateIndex
CREATE INDEX "detected_regions_transcriptionId_kind_idx" ON "detected_regions"("transcriptionId", "kind");

-- CreateIndex
CREATE INDEX "ai_analyses_projectId_idx" ON "ai_analyses"("projectId");

-- CreateIndex
CREATE INDEX "edit_plans_projectId_isActive_idx" ON "edit_plans"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "edit_plans_projectId_version_key" ON "edit_plans"("projectId", "version");

-- CreateIndex
CREATE INDEX "engagement_reports_projectId_idx" ON "engagement_reports"("projectId");

-- CreateIndex
CREATE INDEX "renders_projectId_idx" ON "renders"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_idempotencyKey_key" ON "jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "jobs_projectId_state_idx" ON "jobs"("projectId", "state");

-- CreateIndex
CREATE INDEX "jobs_state_type_idx" ON "jobs"("state", "type");

-- CreateIndex
CREATE INDEX "audit_events_workspaceId_createdAt_idx" ON "audit_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "studio_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_styles" ADD CONSTRAINT "caption_styles_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_profiles" ADD CONSTRAINT "communication_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_blocks" ADD CONSTRAINT "script_blocks_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcriptionId_fkey" FOREIGN KEY ("transcriptionId") REFERENCES "transcriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_words" ADD CONSTRAINT "transcript_words_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "transcript_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detected_regions" ADD CONSTRAINT "detected_regions_transcriptionId_fkey" FOREIGN KEY ("transcriptionId") REFERENCES "transcriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edit_plans" ADD CONSTRAINT "edit_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_reports" ADD CONSTRAINT "engagement_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renders" ADD CONSTRAINT "renders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renders" ADD CONSTRAINT "renders_editPlanId_fkey" FOREIGN KEY ("editPlanId") REFERENCES "edit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

