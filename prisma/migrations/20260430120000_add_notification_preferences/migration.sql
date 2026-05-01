-- Add notificationPreferences JSON column to users.
-- Nullable so existing rows don't need backfill; the API treats NULL as
-- "use defaults" and never reads malformed JSON without Zod-parsing it.
ALTER TABLE "users" ADD COLUMN "notificationPreferences" JSONB;
