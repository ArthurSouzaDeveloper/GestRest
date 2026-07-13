/**
 * Cria (ou atualiza) um SUPER ADMIN da plataforma com e-mail e senha próprios.
 *
 * Uso (dentro do container backend, imagem já compilada) — parâmetros nomeados,
 * em qualquer ordem, para evitar erro de digitação (posição errada):
 *
 *   node dist/scripts/create-superadmin.js --email=voce@exemplo.com --senha=SuaSenha123 --nome="Seu Nome"
 *
 * Se o e-mail já existir, promove/atualiza para SUPERADMIN e redefine a senha.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

function usageAndExit(message?: string): never {
  if (message) console.error(`❌ ${message}\n`);
  console.error('Uso:');
  console.error(
    '  node dist/scripts/create-superadmin.js --email=voce@exemplo.com --senha=SuaSenha123 --nome="Seu Nome"',
  );
  console.error('\n(Os parâmetros podem vir em qualquer ordem.)');
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const password = args.senha ?? args.password;
  const name = args.nome ?? args.name ?? 'Super Admin';

  if (!email || !email.includes('@')) usageAndExit('Informe um e-mail válido em --email=...');
  if (!password || password.length < 6) {
    usageAndExit('Informe uma senha com pelo menos 6 caracteres em --senha=...');
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.SUPERADMIN, name, active: true, restaurantId: null },
    create: { email, passwordHash, role: Role.SUPERADMIN, name },
  });

  console.log(`✅ Super admin pronto: ${user.email} (nome: ${user.name}) — acesse em /super`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
