-- AlterTable
ALTER TABLE "orders" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_restaurantId_orderType_archivedAt_idx" ON "orders"("restaurantId", "orderType", "archivedAt");
