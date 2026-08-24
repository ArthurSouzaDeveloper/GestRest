-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PRINTER_AGENT_KEY_GENERATED';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "printerAgentKeyHash" TEXT,
ADD COLUMN     "printerHost" TEXT,
ADD COLUMN     "printerPort" INTEGER DEFAULT 9100;

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "station" "Station" NOT NULL,
    "payload" BYTEA NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_jobs_restaurantId_status_idx" ON "print_jobs"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
