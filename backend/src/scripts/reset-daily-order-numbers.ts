/**
 * Reseta o contador de número do pedido (Order.number, "Pedido #N") de volta pro início —
 * pedido explícito do cliente/dono: sem isso o número crescia pra sempre (#1847 em vez de
 * recomeçar a cada dia), estranho no ticket e na tela. Só reseta o CONTADOR (a sequence do
 * Postgres por trás do autoincrement) pro PRÓXIMO pedido criado voltar a começar em 1 —
 * pedidos já existentes (de hoje ou de qualquer dia anterior) não são tocados, mantêm o
 * number que já tinham. Isso não causa colisão: Order.number não tem nenhuma restrição de
 * unicidade no schema (a identidade de verdade de um pedido é sempre o `id`, nunca o
 * number — só um rótulo de exibição pra equipe/ticket).
 *
 * Roda uma vez e sai; agende num cron do servidor. Mesmo padrão de
 * archive-stale-online-orders.ts (2h) e cleanup-refresh-tokens.ts.
 *
 * Uso (dentro do container backend, imagem já compilada):
 *   node dist/scripts/reset-daily-order-numbers.js
 *
 * Cron do host (diariamente às 3h da manhã, mesmo fuso do host — confira com `timedatectl`):
 *   0 3 * * * docker exec gestrest-backend node dist/scripts/reset-daily-order-numbers.js >> /var/log/gestrest-reset-numbers.log 2>&1
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ seq: string | null }[]>`SELECT pg_get_serial_sequence('orders', 'number') AS seq`;
  const seq = rows[0]?.seq;
  if (!seq) throw new Error('Não achei a sequence por trás de orders.number — o schema mudou?');

  // Nome vem de pg_get_serial_sequence (não é entrada do usuário) — seguro interpolar
  // direto; $executeRaw normal não aceita identificador de sequence como parâmetro.
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
  console.log(`✅ Contador de número de pedido resetado — o próximo pedido criado vai ser #1 (sequence: ${seq}).`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
