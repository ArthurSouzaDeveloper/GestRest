/*
  Warnings:

  - You are about to drop the column `phoneNormalized` on the `customer_addresses` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "customer_addresses_restaurantId_phoneNormalized_idx";

-- AlterTable
ALTER TABLE "customer_addresses" DROP COLUMN "phoneNormalized",
ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "cpfNormalized" TEXT;

-- CreateIndex
CREATE INDEX "customer_addresses_restaurantId_customerId_idx" ON "customer_addresses"("restaurantId", "customerId");

-- CreateIndex
CREATE INDEX "customers_restaurantId_cpfNormalized_idx" ON "customers"("restaurantId", "cpfNormalized");

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
