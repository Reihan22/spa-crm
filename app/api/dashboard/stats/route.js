// GET /api/dashboard/stats — key CRM KPIs
import { prisma, jsonOk } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const [todayAppointments, totalCustomers, totalAppointments, upcomingAppointments, monthTx, todayTx, newCustomersMonth] = await Promise.all([
    prisma.appointment.count({ where: { scheduledAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.customer.count(),
    prisma.appointment.count(),
    prisma.appointment.findMany({ where: { scheduledAt: { gte: new Date() }, status: { in: ['pending','confirmed'] } }, include: { customer: true, service: true, therapist: true }, orderBy: { scheduledAt: 'asc' }, take: 5 }),
    prisma.transaction.findMany({ where: { status: 'paid', paidAt: { gte: monthStart } } }),
    prisma.transaction.findMany({ where: { status: 'paid', paidAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
  ]);
  const sum = arr => arr.reduce((n, x) => n + Number(x.total || 0), 0);
  return jsonOk({
    today_appointments: todayAppointments,
    today_revenue: sum(todayTx),
    month_revenue: sum(monthTx),
    new_customers_month: newCustomersMonth,
    total_customers: totalCustomers,
    total_appointments: totalAppointments,
    upcoming_appointments: upcomingAppointments,
  });
}
