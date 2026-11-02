-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AdditionalIngredients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ProductIngredients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_restaurantId_name_key" ON "ingredients"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "_AdditionalIngredients_AB_unique" ON "_AdditionalIngredients"("A", "B");

-- CreateIndex
CREATE INDEX "_AdditionalIngredients_B_index" ON "_AdditionalIngredients"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProductIngredients_AB_unique" ON "_ProductIngredients"("A", "B");

-- CreateIndex
CREATE INDEX "_ProductIngredients_B_index" ON "_ProductIngredients"("B");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdditionalIngredients" ADD CONSTRAINT "_AdditionalIngredients_A_fkey" FOREIGN KEY ("A") REFERENCES "additionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdditionalIngredients" ADD CONSTRAINT "_AdditionalIngredients_B_fkey" FOREIGN KEY ("B") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductIngredients" ADD CONSTRAINT "_ProductIngredients_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductIngredients" ADD CONSTRAINT "_ProductIngredients_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

