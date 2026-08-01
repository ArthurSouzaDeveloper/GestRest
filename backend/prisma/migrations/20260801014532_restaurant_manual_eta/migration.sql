-- CreateEnum
CREATE TYPE "EtaMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "etaDeliveryMinutes" INTEGER,
ADD COLUMN     "etaMode" "EtaMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "etaPickupMinutes" INTEGER;
