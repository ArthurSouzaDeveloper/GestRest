import { OrderStatus, ProductionStatus, TableStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number): Date {
  const x = startOfDay();
  x.setDate(x.getDate() - n);
  return x;
}

async function revenueSince(since: Date): Promise<number> {
  const rows = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { createdAt: { gte: since } },
  });
  return Number(rows._sum.amount ?? 0);
}

export const dashboardService = {
  async summary() {
    const [
      tables,
      waitingItems,
      producingItems,
      paidToday,
      cancelledToday,
      dailyRevenue,
      weeklyRevenue,
      monthlyRevenue,
      topProducts,
      topWaiters,
      finishedTimes,
    ] = await Promise.all([
      prisma.restaurantTable.groupBy({ by: ['status'], _count: true }),
      prisma.orderItem.count({ where: { status: ProductionStatus.WAITING } }),
      prisma.orderItem.count({ where: { status: ProductionStatus.PREPARING } }),
      prisma.order.count({ where: { status: OrderStatus.PAID, closedAt: { gte: startOfDay() } } }),
      prisma.order.count({
        where: { status: OrderStatus.CANCELLED, updatedAt: { gte: startOfDay() } },
      }),
      revenueSince(startOfDay()),
      revenueSince(daysAgo(7)),
      revenueSince(daysAgo(30)),
      prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        where: { status: { not: ProductionStatus.CANCELLED } },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      prisma.order.groupBy({
        by: ['waiterId'],
        _count: true,
        where: { status: OrderStatus.PAID },
        orderBy: { _count: { waiterId: 'desc' } },
        take: 5,
      }),
      prisma.orderItem.findMany({
        where: { startedAt: { not: null }, finishedAt: { not: null } },
        select: { startedAt: true, finishedAt: true },
        take: 200,
        orderBy: { finishedAt: 'desc' },
      }),
    ]);

    const tableCounts = Object.fromEntries(tables.map((t) => [t.status, t._count])) as Record<
      TableStatus,
      number
    >;

    // Enrich top products & waiters with names
    const products = await prisma.product.findMany({
      where: { id: { in: topProducts.map((p) => p.productId) } },
      select: { id: true, name: true },
    });
    const waiters = await prisma.user.findMany({
      where: { id: { in: topWaiters.map((w) => w.waiterId) } },
      select: { id: true, name: true },
    });

    const avgPrepMin =
      finishedTimes.length > 0
        ? finishedTimes.reduce(
            (acc, i) => acc + (i.finishedAt!.getTime() - i.startedAt!.getTime()) / 60000,
            0,
          ) / finishedTimes.length
        : 0;

    return {
      tables: {
        free: tableCounts[TableStatus.FREE] ?? 0,
        occupied: tableCounts[TableStatus.OCCUPIED] ?? 0,
        inProduction: tableCounts[TableStatus.IN_PRODUCTION] ?? 0,
        readyForPayment: tableCounts[TableStatus.READY_FOR_PAYMENT] ?? 0,
      },
      orders: {
        waitingItems,
        producingItems,
        finishedToday: paidToday,
        cancelledToday,
      },
      revenue: {
        daily: dailyRevenue,
        weekly: weeklyRevenue,
        monthly: monthlyRevenue,
      },
      avgPrepMin: Math.round(avgPrepMin * 10) / 10,
      topProducts: topProducts.map((p) => ({
        name: products.find((x) => x.id === p.productId)?.name ?? '—',
        quantity: p._sum.quantity ?? 0,
      })),
      topWaiters: topWaiters.map((w) => ({
        name: waiters.find((x) => x.id === w.waiterId)?.name ?? '—',
        orders: w._count,
      })),
    };
  },
};
