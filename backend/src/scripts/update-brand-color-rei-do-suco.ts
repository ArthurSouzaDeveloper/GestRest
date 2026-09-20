/**
 * Troca só a cor da identidade visual de "O Rei do Suco" (logo fica como está — ver
 * set-branding-rei-do-suco.ts pra isso). Idempotente: sempre grava a mesma cor, seguro
 * rodar de novo.
 *
 * Uso:
 *   node dist/scripts/update-brand-color-rei-do-suco.js --slug=rei-do-suco --color=#750F94
 */
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

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  const color = args.color;
  if (!slug || !color) {
    console.error('Uso: node dist/scripts/update-brand-color-rei-do-suco.js --slug=rei-do-suco --color=#750F94');
    process.exit(1);
  }
  if (!HEX_RE.test(color)) {
    console.error(`❌ Cor inválida: "${color}". Use o formato #RRGGBB.`);
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }

  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { brandColor: color } });

  console.log(`✅ Cor de "${restaurant.name}" atualizada para ${color}.`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
