-- Excluir produto/adicional pelo painel: se já foi usado em pedido, ele é arquivado
-- (some do painel e do cardápio) em vez de apagado, pra não quebrar o histórico.
ALTER TABLE "products" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "additionals" ADD COLUMN "deletedAt" TIMESTAMP(3);
