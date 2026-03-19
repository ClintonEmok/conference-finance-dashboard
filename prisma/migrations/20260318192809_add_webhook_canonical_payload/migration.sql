-- AlterTable
ALTER TABLE "TicketTailorWebhookEvent" ADD COLUMN "canonicalFetchedAt" DATETIME;
ALTER TABLE "TicketTailorWebhookEvent" ADD COLUMN "canonicalPayload" JSONB;
