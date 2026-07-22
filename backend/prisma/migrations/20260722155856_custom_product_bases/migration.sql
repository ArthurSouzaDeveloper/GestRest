-- CreateEnum
CREATE TYPE "AdditionalKind" AS ENUM ('ADDON', 'BASE');

-- AlterTable
ALTER TABLE "additionals" ADD COLUMN     "kind" "AdditionalKind" NOT NULL DEFAULT 'ADDON';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;
