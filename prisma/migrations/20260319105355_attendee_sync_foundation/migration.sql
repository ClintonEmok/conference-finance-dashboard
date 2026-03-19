-- CreateTable
CREATE TABLE "TicketTailorAttendee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerAttendeeId" TEXT,
    "providerIssuedTicketId" TEXT,
    "providerTicketTypeId" TEXT,
    "providerEventId" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "ticketTypeLabel" TEXT,
    "ticketStatus" TEXT,
    "checkedInAt" DATETIME,
    "rawPayload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketTailorAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketTailorEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketTailorAttendee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketTailorOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketTailorAttendee_providerAttendeeId_key" ON "TicketTailorAttendee"("providerAttendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTailorAttendee_providerIssuedTicketId_key" ON "TicketTailorAttendee"("providerIssuedTicketId");

-- CreateIndex
CREATE INDEX "TicketTailorAttendee_eventId_idx" ON "TicketTailorAttendee"("eventId");

-- CreateIndex
CREATE INDEX "TicketTailorAttendee_orderId_idx" ON "TicketTailorAttendee"("orderId");

-- CreateIndex
CREATE INDEX "TicketTailorAttendee_providerEventId_providerOrderId_idx" ON "TicketTailorAttendee"("providerEventId", "providerOrderId");

-- CreateIndex
CREATE INDEX "TicketTailorAttendee_email_idx" ON "TicketTailorAttendee"("email");
