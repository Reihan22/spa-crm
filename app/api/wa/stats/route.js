// GET /api/wa/stats — dashboard stats
import { prisma, jsonOk } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    todayTotal, todayIn, todayOut,
    todayCustomers,
    weekTotal, monthTotal,
    todayCost,
    blockedCount,
    handoffPending,
  ] = await Promise.all([
    prisma.waMessage.count({ where: { sentAt: { gte: startOfDay } } }),
    prisma.waMessage.count({ where: { sentAt: { gte: startOfDay }, direction: 'in' } }),
    prisma.waMessage.count({ where: { sentAt: { gte: startOfDay }, direction: 'out' } }),
    prisma.waMessage.findMany({
      where: { sentAt: { gte: startOfDay }, direction: 'in' },
      distinct: ['normalizedPhone'],
      select: { normalizedPhone: true },
    }).then(r => r.length),
    prisma.waMessage.count({ where: { sentAt: { gte: startOfWeek } } }),
    prisma.waMessage.count({ where: { sentAt: { gte: startOfMonth } } }),
    prisma.waMessage.aggregate({
      where: { sentAt: { gte: startOfDay }, direction: 'out', aiCostUsd: { not: null } },
      _sum: { aiCostUsd: true },
    }),
    prisma.waMessage.count({ where: { aiBlocked: true } }),
    prisma.handoff.count({ where: { status: 'pending' } }),
  ]);

  return jsonOk({
    today: { total: todayTotal, inbound: todayIn, outbound: todayOut, customers: todayCustomers },
    week: { total: weekTotal },
    month: { total: monthTotal },
    cost: { todayUsd: todayCost._sum.aiCostUsd || 0 },
    blocked: blockedCount,
    handoffPending,
  });
}
