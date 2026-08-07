/**
 * Apaga refresh tokens revogados ou expirados há mais de 30 dias — sem isso, a tabela
 * `refresh_tokens` cresce pra sempre (achado de auditoria LGPD: retenção sem prazo de
 * dado ligado a sessão de usuário real). Roda uma vez e sai; agende num cron do servidor.
 *
 * Uso (dentro do container backend, imagem já compilada):
 *   node dist/scripts/cleanup-refresh-tokens.js
 *
 * Exemplo de entrada de cron no host (diariamente às 3h) — "docker exec" no nome fixo
 * do container funciona igual independente de qual docker-compose (plain ou -prod) está
 * rodando, sem precisar acertar o "-f" certo:
 *   0 3 * * * docker exec gestrest-backend node dist/scripts/cleanup-refresh-tokens.js >> /var/log/gestrest-cleanup.log 2>&1
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RETENTION_DAYS = 30;

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.refreshToken.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [{ revoked: true }, { expiresAt: { lt: new Date() } }],
    },
  });
  console.log(`✅ ${result.count} refresh token(s) revogado(s)/expirado(s) há mais de ${RETENTION_DAYS} dias removido(s).`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
