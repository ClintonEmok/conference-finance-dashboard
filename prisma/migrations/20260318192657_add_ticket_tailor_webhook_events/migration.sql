-- CreateTable
CREATE TABLE "TicketTailorWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" DATETIME,
    "processedAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReceivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketTailorWebhookEvent_providerEventId_key" ON "TicketTailorWebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "TicketTailorWebhookEvent_status_nextRetryAt_idx" ON "TicketTailorWebhookEvent"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "TicketTailorWebhookEvent_eventType_idx" ON "TicketTailorWebhookEvent"("eventType");
