-- CreateTable
CREATE TABLE "AccommodationHotel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccommodationRoomType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "defaultCapacity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccommodationRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "occupiedBeds" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccommodationRoom_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "AccommodationHotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccommodationRoom_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "AccommodationRoomType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TicketTailorAttendee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerAttendeeId" TEXT,
    "providerIssuedTicketId" TEXT,
    "providerTicketTypeId" TEXT,
    "providerEventId" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "assignedRoomId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "ticketTypeLabel" TEXT,
    "ticketStatus" TEXT,
    "checkedInAt" DATETIME,
    "rawPayload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketTailorAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketTailorEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketTailorAttendee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketTailorOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketTailorAttendee_assignedRoomId_fkey" FOREIGN KEY ("assignedRoomId") REFERENCES "AccommodationRoom" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TicketTailorAttendee" ("checkedInAt", "createdAt", "email", "eventId", "id", "name", "orderId", "providerAttendeeId", "providerEventId", "providerIssuedTicketId", "providerOrderId", "providerTicketTypeId", "rawPayload", "ticketStatus", "ticketTypeLabel", "updatedAt") SELECT "checkedInAt", "createdAt", "email", "eventId", "id", "name", "orderId", "providerAttendeeId", "providerEventId", "providerIssuedTicketId", "providerOrderId", "providerTicketTypeId", "rawPayload", "ticketStatus", "ticketTypeLabel", "updatedAt" FROM "TicketTailorAttendee";
DROP TABLE "TicketTailorAttendee";
ALTER TABLE "new_TicketTailorAttendee" RENAME TO "TicketTailorAttendee";
CREATE UNIQUE INDEX "TicketTailorAttendee_providerAttendeeId_key" ON "TicketTailorAttendee"("providerAttendeeId");
CREATE UNIQUE INDEX "TicketTailorAttendee_providerIssuedTicketId_key" ON "TicketTailorAttendee"("providerIssuedTicketId");
CREATE INDEX "TicketTailorAttendee_eventId_idx" ON "TicketTailorAttendee"("eventId");
CREATE INDEX "TicketTailorAttendee_orderId_idx" ON "TicketTailorAttendee"("orderId");
CREATE INDEX "TicketTailorAttendee_assignedRoomId_idx" ON "TicketTailorAttendee"("assignedRoomId");
CREATE INDEX "TicketTailorAttendee_providerEventId_providerOrderId_idx" ON "TicketTailorAttendee"("providerEventId", "providerOrderId");
CREATE INDEX "TicketTailorAttendee_email_idx" ON "TicketTailorAttendee"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationHotel_name_key" ON "AccommodationHotel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationRoomType_label_key" ON "AccommodationRoomType"("label");

-- CreateIndex
CREATE INDEX "AccommodationRoom_roomTypeId_idx" ON "AccommodationRoom"("roomTypeId");

-- CreateIndex
CREATE INDEX "AccommodationRoom_hotelId_capacity_idx" ON "AccommodationRoom"("hotelId", "capacity");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationRoom_hotelId_label_key" ON "AccommodationRoom"("hotelId", "label");
