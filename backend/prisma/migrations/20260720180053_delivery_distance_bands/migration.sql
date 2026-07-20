-- CreateEnum
CREATE TYPE "DeliveryPricingMode" AS ENUM ('ZONE', 'DISTANCE_BANDS');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryDistanceKm" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "deliveryOriginAddress" TEXT,
ADD COLUMN     "deliveryOriginLat" DECIMAL(9,6),
ADD COLUMN     "deliveryOriginLng" DECIMAL(9,6),
ADD COLUMN     "deliveryPricingMode" "DeliveryPricingMode" NOT NULL DEFAULT 'ZONE';

-- CreateTable
CREATE TABLE "delivery_distance_bands" (
    "id" TEXT NOT NULL,
    "maxDistanceKm" DECIMAL(6,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_distance_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_distance_bands_restaurantId_active_idx" ON "delivery_distance_bands"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_distance_bands_restaurantId_maxDistanceKm_key" ON "delivery_distance_bands"("restaurantId", "maxDistanceKm");

-- AddForeignKey
ALTER TABLE "delivery_distance_bands" ADD CONSTRAINT "delivery_distance_bands_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
