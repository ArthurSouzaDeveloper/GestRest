-- Destaque: produto marcado pelo dono aparece no topo da própria categoria no cardápio.
-- featuredAt guarda quando foi marcado, só pra ordenar entre vários destaques.
ALTER TABLE "products" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "featuredAt" TIMESTAMP(3);
