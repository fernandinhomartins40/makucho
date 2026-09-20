-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'AUTHOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "VideoPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'OTHER');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('HOME_TOP', 'HOME_AFTER_HERO', 'HOME_MIDDLE', 'SIDEBAR_TOP', 'SIDEBAR_MIDDLE', 'ARTICLE_TOP', 'ARTICLE_MIDDLE', 'ARTICLE_BOTTOM', 'FOOTER');

-- CreateEnum
CREATE TYPE "AdDeviceTarget" AS ENUM ('ALL', 'DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'PENDING');

-- CreateEnum
CREATE TYPE "HomepageSectionType" AS ENUM ('HERO', 'LATEST_POSTS', 'TRENDING', 'VIDEOS', 'CATEGORIES', 'MOST_READ', 'NEWSLETTER', 'AD_SLOT', 'CUSTOM_POSTS');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MediaVariantType" AS ENUM ('ORIGINAL', 'LARGE', 'MEDIUM', 'SMALL', 'THUMBNAIL');

-- CreateEnum
CREATE TYPE "ImagePreset" AS ENUM ('HERO', 'POST_CARD', 'VIDEO_THUMBNAIL', 'SQUARE', 'SOCIAL', 'SIDEBAR', 'AVATAR', 'CATEGORY', 'FREEFORM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'AUTHOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatar_media_id" UUID,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "password_reset_token" VARCHAR(255),
    "password_reset_expires_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "resource" VARCHAR(40) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_token_hash" VARCHAR(255),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "filename" VARCHAR(255) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" VARCHAR(64),
    "storage_key" VARCHAR(512) NOT NULL,
    "bucket" VARCHAR(120) NOT NULL,
    "alt" VARCHAR(320),
    "caption" VARCHAR(500),
    "credit" VARCHAR(160),
    "title" VARCHAR(255),
    "preset" "ImagePreset" NOT NULL DEFAULT 'FREEFORM',
    "dominant_color" VARCHAR(9),
    "blur_data_url" TEXT,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "type" "MediaVariantType" NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" VARCHAR(500),
    "color" VARCHAR(9),
    "icon" VARCHAR(60),
    "cover_media_id" UUID,
    "parent_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "show_in_menu" BOOLEAN NOT NULL DEFAULT true,
    "show_in_homepage" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(320),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(320),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "post_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id","tag_id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "bio" TEXT,
    "role" VARCHAR(120),
    "avatar_media_id" UUID,
    "email" VARCHAR(255),
    "instagram" VARCHAR(255),
    "tiktok" VARCHAR(255),
    "youtube" VARCHAR(255),
    "twitter" VARCHAR(255),
    "linkedin" VARCHAR(255),
    "website" VARCHAR(255),
    "user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(280) NOT NULL,
    "subtitle" VARCHAR(320),
    "excerpt" VARCHAR(600),
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB,
    "content_html" JSONB,
    "content_text" TEXT,
    "reading_time_minutes" INTEGER NOT NULL DEFAULT 1,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "cover_image_id" UUID,
    "thumbnail_id" UUID,
    "category_id" UUID NOT NULL,
    "author_id" UUID,
    "created_by_id" UUID,
    "video_platform" "VideoPlatform",
    "video_url" VARCHAR(600),
    "video_embed_id" VARCHAR(160),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_homepage_top" BOOLEAN NOT NULL DEFAULT false,
    "is_trending" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "allow_comments" BOOLEAN NOT NULL DEFAULT false,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(320),
    "canonical_url" VARCHAR(600),
    "robots" VARCHAR(80) NOT NULL DEFAULT 'index,follow',
    "og_image_id" UUID,
    "published_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_relations" (
    "post_id" UUID NOT NULL,
    "related_post_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_relations_pkey" PRIMARY KEY ("post_id","related_post_id")
);

-- CreateTable
CREATE TABLE "post_revisions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "subtitle" VARCHAR(320),
    "excerpt" VARCHAR(600),
    "content" JSONB,
    "revision_number" INTEGER NOT NULL,
    "change_type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "change_summary" VARCHAR(320),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(280) NOT NULL,
    "description" TEXT,
    "platform" "VideoPlatform" NOT NULL,
    "url" VARCHAR(600) NOT NULL,
    "embed_id" VARCHAR(160),
    "duration_seconds" INTEGER,
    "thumbnail_id" UUID,
    "category_id" UUID,
    "author_id" UUID,
    "post_id" UUID,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisements" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "advertiser" VARCHAR(160),
    "media_id" UUID,
    "mobile_media_id" UUID,
    "target_url" VARCHAR(800) NOT NULL,
    "alt" VARCHAR(320) NOT NULL,
    "open_in_new_tab" BOOLEAN NOT NULL DEFAULT true,
    "link_rel" VARCHAR(120) NOT NULL DEFAULT 'sponsored noopener noreferrer',
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "device" "AdDeviceTarget" NOT NULL DEFAULT 'ALL',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_placement_assignments" (
    "id" UUID NOT NULL,
    "ad_id" UUID NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_placement_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_events" (
    "id" UUID NOT NULL,
    "ad_id" UUID NOT NULL,
    "type" VARCHAR(12) NOT NULL,
    "placement" "AdPlacement",
    "session_hash" VARCHAR(64),
    "device" "DeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "referrer" VARCHAR(600),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(160),
    "status" "NewsletterStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" VARCHAR(60),
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "consent_ip_hash" VARCHAR(64),
    "confirmation_token" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "unsubscribe_token" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'string',
    "group" VARCHAR(40) NOT NULL DEFAULT 'general',
    "label" VARCHAR(160),
    "description" VARCHAR(400),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" UUID NOT NULL,
    "platform" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "url" VARCHAR(600) NOT NULL,
    "handle" VARCHAR(120),
    "icon" VARCHAR(60),
    "follower_count" INTEGER,
    "follower_label" VARCHAR(60),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "show_in_header" BOOLEAN NOT NULL DEFAULT true,
    "show_in_footer" BOOLEAN NOT NULL DEFAULT true,
    "show_in_sidebar" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" UUID NOT NULL,
    "type" "HomepageSectionType" NOT NULL,
    "title" VARCHAR(160),
    "subtitle" VARCHAR(320),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_section_items" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "post_id" UUID,
    "video_id" UUID,

    CONSTRAINT "homepage_section_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_indicators" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "unit" VARCHAR(20),
    "icon" VARCHAR(60),
    "value" DECIMAL(18,4) NOT NULL,
    "change_percent" DECIMAL(8,4),
    "change_absolute" DECIMAL(18,4),
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_views" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "session_hash" VARCHAR(64) NOT NULL,
    "referrer" VARCHAR(600),
    "device" "DeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "country" VARCHAR(2),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_queries" (
    "id" UUID NOT NULL,
    "term" VARCHAR(255) NOT NULL,
    "normalized_term" VARCHAR(255) NOT NULL,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "session_hash" VARCHAR(64),
    "device" "DeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "clicked_post_slug" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "user_email" VARCHAR(255),
    "action" VARCHAR(60) NOT NULL,
    "resource" VARCHAR(60) NOT NULL,
    "resource_id" VARCHAR(64),
    "summary" VARCHAR(400),
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_type_deleted_at_idx" ON "media"("type", "deleted_at");

-- CreateIndex
CREATE INDEX "media_created_at_idx" ON "media"("created_at");

-- CreateIndex
CREATE INDEX "media_checksum_idx" ON "media"("checksum");

-- CreateIndex
CREATE INDEX "media_uploaded_by_id_idx" ON "media"("uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_storage_key_key" ON "media_variants"("storage_key");

-- CreateIndex
CREATE INDEX "media_variants_media_id_idx" ON "media_variants"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_media_id_type_format_key" ON "media_variants"("media_id", "type", "format");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_is_active_position_idx" ON "categories"("is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "tags_slug_idx" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "post_tags_tag_id_idx" ON "post_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "authors_slug_key" ON "authors"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "authors_user_id_key" ON "authors"("user_id");

-- CreateIndex
CREATE INDEX "authors_slug_idx" ON "authors"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_status_published_at_idx" ON "posts"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_category_id_status_published_at_idx" ON "posts"("category_id", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_slug_idx" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_is_featured_status_idx" ON "posts"("is_featured", "status");

-- CreateIndex
CREATE INDEX "posts_is_trending_status_idx" ON "posts"("is_trending", "status");

-- CreateIndex
CREATE INDEX "posts_scheduled_for_idx" ON "posts"("scheduled_for");

-- CreateIndex
CREATE INDEX "posts_view_count_idx" ON "posts"("view_count" DESC);

-- CreateIndex
CREATE INDEX "posts_deleted_at_idx" ON "posts"("deleted_at");

-- CreateIndex
CREATE INDEX "post_relations_related_post_id_idx" ON "post_relations"("related_post_id");

-- CreateIndex
CREATE INDEX "post_revisions_post_id_created_at_idx" ON "post_revisions"("post_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "post_revisions_post_id_revision_number_key" ON "post_revisions"("post_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "videos_slug_key" ON "videos"("slug");

-- CreateIndex
CREATE INDEX "videos_is_published_published_at_idx" ON "videos"("is_published", "published_at" DESC);

-- CreateIndex
CREATE INDEX "videos_platform_idx" ON "videos"("platform");

-- CreateIndex
CREATE INDEX "videos_slug_idx" ON "videos"("slug");

-- CreateIndex
CREATE INDEX "videos_post_id_idx" ON "videos"("post_id");

-- CreateIndex
CREATE INDEX "advertisements_status_starts_at_ends_at_idx" ON "advertisements"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "advertisements_priority_idx" ON "advertisements"("priority" DESC);

-- CreateIndex
CREATE INDEX "ad_placement_assignments_placement_idx" ON "ad_placement_assignments"("placement");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placement_assignments_ad_id_placement_key" ON "ad_placement_assignments"("ad_id", "placement");

-- CreateIndex
CREATE INDEX "ad_events_ad_id_type_created_at_idx" ON "ad_events"("ad_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "ad_events_created_at_idx" ON "ad_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_confirmation_token_key" ON "newsletter_subscribers"("confirmation_token");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_key" ON "newsletter_subscribers"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers"("status");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_created_at_idx" ON "newsletter_subscribers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_key" ON "site_settings"("key");

-- CreateIndex
CREATE INDEX "site_settings_group_idx" ON "site_settings"("group");

-- CreateIndex
CREATE INDEX "social_profiles_is_active_position_idx" ON "social_profiles"("is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_platform_key" ON "social_profiles"("platform");

-- CreateIndex
CREATE INDEX "homepage_sections_position_idx" ON "homepage_sections"("position");

-- CreateIndex
CREATE INDEX "homepage_section_items_section_id_position_idx" ON "homepage_section_items"("section_id", "position");

-- CreateIndex
CREATE INDEX "homepage_section_items_post_id_idx" ON "homepage_section_items"("post_id");

-- CreateIndex
CREATE INDEX "homepage_section_items_video_id_idx" ON "homepage_section_items"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_indicators_symbol_key" ON "market_indicators"("symbol");

-- CreateIndex
CREATE INDEX "market_indicators_is_active_position_idx" ON "market_indicators"("is_active", "position");

-- CreateIndex
CREATE INDEX "post_views_post_id_created_at_idx" ON "post_views"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "post_views_created_at_idx" ON "post_views"("created_at");

-- CreateIndex
CREATE INDEX "post_views_session_hash_post_id_idx" ON "post_views"("session_hash", "post_id");

-- CreateIndex
CREATE INDEX "search_queries_normalized_term_idx" ON "search_queries"("normalized_term");

-- CreateIndex
CREATE INDEX "search_queries_created_at_idx" ON "search_queries"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_image_id_fkey" FOREIGN KEY ("cover_image_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_thumbnail_id_fkey" FOREIGN KEY ("thumbnail_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_og_image_id_fkey" FOREIGN KEY ("og_image_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_relations" ADD CONSTRAINT "post_relations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_relations" ADD CONSTRAINT "post_relations_related_post_id_fkey" FOREIGN KEY ("related_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_thumbnail_id_fkey" FOREIGN KEY ("thumbnail_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_placement_assignments" ADD CONSTRAINT "ad_placement_assignments_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_section_items" ADD CONSTRAINT "homepage_section_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "homepage_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_section_items" ADD CONSTRAINT "homepage_section_items_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_section_items" ADD CONSTRAINT "homepage_section_items_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

