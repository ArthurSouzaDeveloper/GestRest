-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "phoneNormalized" TEXT;

-- Backfill: deriva phoneNormalized dos telefones já cadastrados, pra clientes antigos
-- também conseguirem ser encontrados pelo login por nome+telefone do site público.
UPDATE "customers" SET "phoneNormalized" = regexp_replace("phone", '\D', '', 'g') WHERE "phone" IS NOT NULL;

-- CreateIndex
CREATE INDEX "customers_restaurantId_phoneNormalized_idx" ON "customers"("restaurantId", "phoneNormalized");
