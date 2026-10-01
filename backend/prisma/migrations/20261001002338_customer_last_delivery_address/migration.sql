-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "lastDeliveryCep" TEXT,
ADD COLUMN     "lastDeliveryComplement" TEXT,
ADD COLUMN     "lastDeliveryLat" DOUBLE PRECISION,
ADD COLUMN     "lastDeliveryLng" DOUBLE PRECISION,
ADD COLUMN     "lastDeliveryNumber" TEXT,
ADD COLUMN     "lastDeliveryStreet" TEXT,
ADD COLUMN     "lastDeliveryZoneId" TEXT;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_lastDeliveryZoneId_fkey" FOREIGN KEY ("lastDeliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
