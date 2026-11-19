-- Exclusão de usuário passa a ser arquivamento: o cadastro nunca é apagado.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_RESTORED';
