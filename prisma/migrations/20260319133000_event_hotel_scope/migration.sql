-- CreateTable
CREATE TABLE "AccommodationEventHotel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccommodationEventHotel_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketTailorEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccommodationEventHotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "AccommodationHotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationEventHotel_eventId_hotelId_key" ON "AccommodationEventHotel"("eventId", "hotelId");

-- CreateIndex
CREATE INDEX "AccommodationEventHotel_hotelId_idx" ON "AccommodationEventHotel"("hotelId");
