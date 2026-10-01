/*
  Warnings:

  - You are about to drop the column `lastDeliveryCep` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastDeliveryComplement` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastDeliveryLat` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastDeliveryLng` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastDeliveryNumber` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastDeliveryStreet` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastDeliveryZoneId` on the `customers` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_lastDeliveryZoneId_fkey";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "lastDeliveryCep",
DROP COLUMN "lastDeliveryComplement",
DROP COLUMN "lastDeliveryLat",
DROP COLUMN "lastDeliveryLng",
DROP COLUMN "lastDeliveryNumber",
DROP COLUMN "lastDeliveryStreet",
DROP COLUMN "lastDeliveryZoneId";

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "zoneId" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "cep" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_addresses_restaurantId_phoneNormalized_idx" ON "customer_addresses"("restaurantId", "phoneNormalized");

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
