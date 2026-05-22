// GET /api/transactions — list with filter
//   query: page, size, status, paymentMethod, date (today|YYYY-MM-DD), from, to, q (customer/service)
// POST /api/transactions — create
// DELETE /api/transactions — bulk delete (admin)
//   query: ?id= | ?status= | ?all=1
import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

function buildWhere(searchParams) {
  const where = {};
  const status = searchParams.get('status');
  const paymentMethod = searchParams.get('paymentMethod');
  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const q = (searchParams.get('q') || '').trim();
  if (status) where.status = status;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (date === 'today') {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    where.createdAt = { gte: start, lte: end };
  } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59');
    where.createdAt = { gte: start, lte: end };
  } else if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (q) {
    where.appointment = {
      OR: [
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { customer: { normalizedPhone: { contains: normalizePhone(q) } } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
      ],
    };
  }
  return where;
}

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const size = Math.min(100, parseInt(searchParams.get('size') || '20'));
  const where = buildWhere(searchParams);
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { appointment: { include: { customer: true, service: true, therapist: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size, take: size,
    }),
    prisma.transaction.count({ where }),
  ]);
  return jsonOk({ items, total, page, pages: Math.ceil(total / size) || 1 });
}

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { appointmentId, subtotal, discount = 0, tax = 0, paymentMethod, paidAt, status = 'paid' } = body || {};
  if (!appointmentId || subtotal === undefined) return jsonError('appointmentId & subtotal required', 400);
  const total = Number(subtotal) - Number(discount) + Number(tax);
  const tx = await prisma.transaction.create({
    data: {
      appointmentId,
      subtotal: String(subtotal), discount: String(discount), tax: String(tax), total: String(total),
      paymentMethod: paymentMethod || null,
      paidAt: paidAt ? new Date(paidAt) : (status === 'paid' ? new Date() : null),
      status,
    },
  });
  if (status === 'paid') await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'completed' } });
  return jsonOk(tx, 201);
}

export async function DELETE(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const all = searchParams.get('all') === '1';
  if (!id && !status && !all) return jsonError('id, status, or all=1 required', 400);

  let where = {};
  if (id) where.id = id;
  else if (status) where.status = status;

  const r = await prisma.transaction.deleteMany({ where });
  return jsonOk({ ok: true, deleted: r.count });
}
