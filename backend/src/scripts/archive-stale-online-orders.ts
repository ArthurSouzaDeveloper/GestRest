/**
 * Arquiva pedidos online (delivery/retirada) que ficaram parados desde antes de hoje sem
 * pagamento nem cancelamento — normalmente porque a equipe esqueceu de clicar em "Marcar
 * Entregue"/pagar. Sem isso, um pedido esquecido fica pra sempre nas abas "Em preparo"/
 * "Prontos" do painel de pedidos online (Cozinha, Motoboy), acumulando dia após dia.
 *
 * Só marca `archivedAt` — não muda status nem apaga nada. O pedido some das telas do dia a
 * dia (orderService.list() já filtra archivedAt=null por padrão) mas continua acessível e
 * pagável pela aba "Histórico" do mesmo painel (ver OnlineOrdersPanel.tsx).
 *
 * Pedidos de mesa (DINE_IN) ficam de fora de propósito — têm giro de mesa (Tables.tsx) como
 * força natural pra serem fechados no mesmo dia, diferente de um delivery/retirada que não
 * tem ninguém fisicamente esperando no local.
 *
 * O corte é "meia-noite de hoje" no fuso horário LOCAL do processo (variável de ambiente TZ,
 * ver docker-compose.prod.yml) — pedidos abertos ANTES disso (ou seja, de ontem pra trás)
 * são arquivados; um pedido aberto nos últimos minutos (ex.: 00:05, ainda madrugada de hoje)
 * não é tocado.
 *
 * Idempotente: rodar de novo não re-arquiva quem já tem archivedAt preenchido.
 *
 * Uso (dentro do container backend, imagem já compilada):
 *   node dist/scripts/archive-stale-online-orders.js
 *
 * Cron do host (diariamente às 2h da manhã, mesmo fuso do host — confira com `timedatectl`):
 *   0 2 * * * docker exec gestrest-backend node dist/scripts/archive-stale-online-orders.js >> /var/log/gestrest-archive.log 2>&1
 */
import { OrderStatus, OrderType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STALE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.OPEN,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY_FOR_PAYMENT,
];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

async function main() {
  const cutoff = startOfToday();
  const result = await prisma.order.updateMany({
    where: {
      orderType: { not: OrderType.DINE_IN },
      status: { in: STALE_STATUSES },
      archivedAt: null,
      openedAt: { lt: cutoff },
    },
    data: { archivedAt: new Date() },
  });
  console.log(
    `✅ ${result.count} pedido(s) online parado(s) desde antes de hoje (corte ${cutoff.toISOString()}) arquivado(s).`,
  );
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
