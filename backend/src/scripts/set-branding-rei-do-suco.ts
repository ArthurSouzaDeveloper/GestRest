/**
 * Configura a identidade visual (cor + logo) de "O Rei do Suco" — a cor e a logo antes
 * ficavam fixas no código do front (só fazia sentido enquanto ele era o único tenant); a
 * partir de agora isso é configurável por restaurante (ver branding.service.ts), e este
 * script só preenche os dados dele com o que já estava em uso.
 *
 * Idempotente: copia a logo pra dentro de uploads/branding (sobrescreve se já existir) e
 * grava brandColor/logoUrl — seguro rodar de novo.
 *
 * Uso:
 *   node dist/scripts/set-branding-rei-do-suco.js --slug=rei-do-suco
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

const BRAND_COLOR = '#9D1CC4'; // extraído por amostragem de pixel do arquivo de logo do cliente

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/set-branding-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}". Crie-o em /super primeiro.`);
    process.exit(1);
  }

  const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
  const brandingDir = path.resolve(process.cwd(), uploadDir, 'branding');
  fs.mkdirSync(brandingDir, { recursive: true });

  const sourceLogo = path.resolve(__dirname, 'assets', 'logo-rei-do-suco.png');
  const filename = `${restaurant.id}-logo.png`;
  fs.copyFileSync(sourceLogo, path.join(brandingDir, filename));

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { brandColor: BRAND_COLOR, logoUrl: `/uploads/branding/${filename}` },
  });

  console.log(`✅ Identidade visual de "${restaurant.name}" configurada: cor ${BRAND_COLOR}, logo em uploads/branding/${filename}.`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
