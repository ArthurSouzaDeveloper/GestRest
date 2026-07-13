/**
 * Cria (ou atualiza) um SUPER ADMIN da plataforma com e-mail e senha próprios.
 *
 * Uso (dentro do container backend, imagem já compilada):
 *   node dist/scripts/create-superadmin.js <email> <senha> "<nome>"
 *
 * Se o e-mail já existir, promove/atualiza para SUPERADMIN e redefine a senha.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv.slice(4).join(' ') || 'Super Admin';

  if (!email || !password) {
    console.error('Uso: node dist/scripts/create-superadmin.js <email> <senha> "<nome>"');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('A senha deve ter pelo menos 6 caracteres.');
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.SUPERADMIN, name, active: true, restaurantId: null },
    create: { email, passwordHash, role: Role.SUPERADMIN, name },
  });

  console.log(`✅ Super admin pronto: ${user.email} (acesse em /super)`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
