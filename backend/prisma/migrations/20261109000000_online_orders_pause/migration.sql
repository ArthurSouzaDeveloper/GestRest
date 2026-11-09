-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ONLINE_ORDERS_PAUSE_CHANGED';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "onlineOrdersPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onlineOrdersPausedAt" TIMESTAMP(3),
ADD COLUMN     "onlineOrdersPausedReason" TEXT;
