-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "autoPauseAfterClose" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onlineOrdersAutoPausedOn" TEXT,
ADD COLUMN     "onlineOrdersPausedAuto" BOOLEAN NOT NULL DEFAULT false;
