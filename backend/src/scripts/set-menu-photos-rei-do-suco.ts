/**
 * Configura as fotos do cardápio físico de "O Rei do Suco" — pedido do cliente/dono: em
 * vez do cliente só poder navegar o cardápio digital interativo em "Só quero ver o
 * cardápio" no site público, ele também ganha acesso à foto de verdade do cardápio, com
 * botão de baixar (ver PublicOrder.tsx#IntroStep e Restaurant.menuPhotoUrls no schema).
 *
 * Idempotente: copia as 2 páginas pra dentro de uploads/branding (sobrescreve se já
 * existir) e grava menuPhotoUrls — seguro rodar de novo.
 *
 * Uso:
 *   node dist/scripts/set-menu-photos-rei-do-suco.js --slug=rei-do-suco
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

const PAGES = ['cardapio-rei-do-suco-p1.jpg', 'cardapio-rei-do-suco-p2.jpg'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/set-menu-photos-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }

  const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
  const brandingDir = path.resolve(process.cwd(), uploadDir, 'branding');
  fs.mkdirSync(brandingDir, { recursive: true });

  const menuPhotoUrls: string[] = [];
  PAGES.forEach((page, i) => {
    const source = path.resolve(__dirname, 'assets', page);
    const filename = `${restaurant.id}-cardapio-${i + 1}.jpg`;
    fs.copyFileSync(source, path.join(brandingDir, filename));
    menuPhotoUrls.push(`/uploads/branding/${filename}`);
  });

  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { menuPhotoUrls } });

  console.log(`✅ ${menuPhotoUrls.length} foto(s) de cardápio configurada(s) pra "${restaurant.name}":`);
  for (const url of menuPhotoUrls) console.log(`   ${url}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
