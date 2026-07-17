-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'DELIVERY', 'PICKUP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PUBLIC_ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_ACCEPTED';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "changeFor" DECIMAL(10,2),
ADD COLUMN     "declaredPaymentMethod" "PaymentMethod",
ADD COLUMN     "deliveryComplement" TEXT,
ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryNumber" TEXT,
ADD COLUMN     "deliveryStreet" TEXT,
ADD COLUMN     "deliveryZoneId" TEXT,
ADD COLUMN     "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN',
ALTER COLUMN "tableId" DROP NOT NULL,
ALTER COLUMN "waiterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_zones_restaurantId_active_idx" ON "delivery_zones"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_restaurantId_name_key" ON "delivery_zones"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "orders_restaurantId_orderType_status_idx" ON "orders"("restaurantId", "orderType", "status");

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
