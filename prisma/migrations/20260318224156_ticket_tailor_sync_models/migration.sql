-- CreateTable
CREATE TABLE "TicketTailorEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerEventId" TEXT NOT NULL,
    "name" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "timezone" TEXT,
    "currency" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TicketTailorOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerOrderId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "normalizedStatus" TEXT NOT NULL DEFAULT 'pending',
    "providerStatus" TEXT,
    "normalizationNote" TEXT,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "currency" TEXT,
    "totalAmountMinor" INTEGER,
    "orderedAt" DATETIME,
    "refundedAt" DATETIME,
    "cancelledAt" DATETIME,
    "rawPayload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketTailorOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketTailorEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketTailorSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "eventsScanned" INTEGER NOT NULL DEFAULT 0,
    "ordersFetched" INTEGER NOT NULL DEFAULT 0,
    "ordersUpserted" INTEGER NOT NULL DEFAULT 0,
    "normalizedFallbackCount" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "diagnostics" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketTailorEvent_providerEventId_key" ON "TicketTailorEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "TicketTailorEvent_startsAt_idx" ON "TicketTailorEvent"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTailorOrder_providerOrderId_key" ON "TicketTailorOrder"("providerOrderId");

-- CreateIndex
CREATE INDEX "TicketTailorOrder_eventId_idx" ON "TicketTailorOrder"("eventId");

-- CreateIndex
CREATE INDEX "TicketTailorOrder_orderedAt_idx" ON "TicketTailorOrder"("orderedAt");

-- CreateIndex
CREATE INDEX "TicketTailorOrder_normalizedStatus_idx" ON "TicketTailorOrder"("normalizedStatus");

-- CreateIndex
CREATE INDEX "TicketTailorSyncRun_startedAt_idx" ON "TicketTailorSyncRun"("startedAt");
