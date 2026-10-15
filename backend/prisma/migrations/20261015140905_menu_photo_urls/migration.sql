-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "menuPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
