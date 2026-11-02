-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "removedIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "_ProductOptionalIngredients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ProductOptionalIngredients_AB_unique" ON "_ProductOptionalIngredients"("A", "B");

-- CreateIndex
CREATE INDEX "_ProductOptionalIngredients_B_index" ON "_ProductOptionalIngredients"("B");

-- AddForeignKey
ALTER TABLE "_ProductOptionalIngredients" ADD CONSTRAINT "_ProductOptionalIngredients_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductOptionalIngredients" ADD CONSTRAINT "_ProductOptionalIngredients_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

