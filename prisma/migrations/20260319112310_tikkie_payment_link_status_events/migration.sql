-- AlterTable
ALTER TABLE "TikkiePaymentLinkTransition" ADD COLUMN "providerNotificationKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TikkiePaymentLinkTransition_providerNotificationKey_key" ON "TikkiePaymentLinkTransition"("providerNotificationKey");
