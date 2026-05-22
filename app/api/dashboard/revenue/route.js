// GET /api/dashboard/revenue — last 30 days revenue chart
import { prisma, jsonOk } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const days = [];
  const start = new Date(); start.setDate(start.getDate() - 29); start.setHours(0,0,0,0);
  const txs = await prisma.transaction.findMany({ where: { status: 'paid', paidAt: { gte: start } }, select: { total: true, paidAt: true } });
  for (let i = 0; i < 30; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0,10);
    const same = txs.filter(t => t.paidAt && t.paidAt.toISOString().slice(0,10) === key);
    days.push({
      date: key,
      day: d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' }),
      revenue: same.reduce((n,t)=>n+Number(t.total||0),0),
      count: same.length,
    });
  }
  return jsonOk(days);
}
