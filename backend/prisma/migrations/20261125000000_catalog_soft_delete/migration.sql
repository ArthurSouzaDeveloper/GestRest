-- Excluir produto/adicional pelo painel: o que já saiu em pedido fica arquivado.
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "additionals" ADD COLUMN     "deletedAt" TIMESTAMP(3);
