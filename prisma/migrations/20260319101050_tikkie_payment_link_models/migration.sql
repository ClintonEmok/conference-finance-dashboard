-- CreateTable
CREATE TABLE "TikkiePaymentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerOrderId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentRequestToken" TEXT NOT NULL,
    "paymentRequestUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "statusSource" TEXT NOT NULL DEFAULT 'create',
    "providerStatus" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "expiryDate" DATETIME NOT NULL,
    "referenceId" TEXT,
    "providerPayload" JSONB NOT NULL,
    "providerLastCheckedAt" DATETIME,
    "statusUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TikkiePaymentLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketTailorOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TikkiePaymentLinkTransition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentLinkId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "reason" TEXT,
    "providerPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TikkiePaymentLinkTransition_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "TikkiePaymentLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TikkiePaymentLink_paymentRequestToken_key" ON "TikkiePaymentLink"("paymentRequestToken");

-- CreateIndex
CREATE INDEX "TikkiePaymentLink_providerOrderId_providerEventId_idx" ON "TikkiePaymentLink"("providerOrderId", "providerEventId");

-- CreateIndex
CREATE INDEX "TikkiePaymentLink_status_statusUpdatedAt_idx" ON "TikkiePaymentLink"("status", "statusUpdatedAt");

-- CreateIndex
CREATE INDEX "TikkiePaymentLinkTransition_paymentLinkId_createdAt_idx" ON "TikkiePaymentLinkTransition"("paymentLinkId", "createdAt");
