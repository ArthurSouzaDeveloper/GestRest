-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "autoDeliverPickupMinutes" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "readyAt" TIMESTAMP(3);
