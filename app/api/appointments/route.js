// GET /api/appointments — list with filter
//   query: page, size, status, customerId, date (today|upcoming|YYYY-MM-DD), from, to (ISO), q (customer name/phone)
// POST /api/appointments — create
// DELETE /api/appointments — bulk delete (admin)
//   query: ?id= | ?customerId= | ?status= | ?all=1
import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

function buildWhere(searchParams) {
  const where = {};
  const status = searchParams.get('status');
  const customerId = searchParams.get('customerId');
  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const q = (searchParams.get('q') || '').trim();
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (date === 'today') {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    where.scheduledAt = { gte: start, lte: end };
  } else if (date === 'upcoming') {
    where.scheduledAt = { gte: new Date() };
    where.status = { in: ['pending','confirmed'] };
  } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59');
    where.scheduledAt = { gte: start, lte: end };
  } else if (from || to) {
    where.scheduledAt = {};
    if (from) where.scheduledAt.gte = new Date(from);
    if (to) where.scheduledAt.lte = new Date(to);
  }
  if (q) {
    where.customer = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { normalizedPhone: { contains: normalizePhone(q) } },
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
    prisma.appointment.findMany({
      where, orderBy: { scheduledAt: 'desc' },
      skip: (page - 1) * size, take: size,
      include: { customer: true, service: true, therapist: true, transaction: true },
    }),
    prisma.appointment.count({ where }),
  ]);
  return jsonOk({ items, total, page, pages: Math.ceil(total / size) || 1 });
}

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { customerId, serviceId, therapistId, scheduledAt, notes, status } = body || {};
  if (!customerId || !serviceId || !scheduledAt) return jsonError('customerId, serviceId, scheduledAt required', 400);
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return jsonError('Service not found', 404);
  const start = new Date(scheduledAt);
  const ends = new Date(start.getTime() + service.durationMinutes * 60_000);
  const ap = await prisma.appointment.create({
    data: {
      customerId, serviceId,
      therapistId: therapistId || null,
      scheduledAt: start, endsAt: ends,
      status: status || 'pending', notes: notes || null,
    },
    include: { customer: true, service: true, therapist: true },
  });
  return jsonOk(ap, 201);
}

export async function DELETE(req) {
  const a = requireAuth(req, ['admin','receptionist']); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const customerId = searchParams.get('customerId');
  const status = searchParams.get('status');
  const all = searchParams.get('all') === '1';
  if (!id && !customerId && !status && !all) return jsonError('id, customerId, status, or all=1 required', 400);

  let where = {};
  if (id) where.id = id;
  else if (customerId) where.customerId = customerId;
  else if (status) where.status = status;
  // all => where stays {}

  // delete dependent transactions first
  const appts = await prisma.appointment.findMany({ where, select: { id: true } });
  const apptIds = appts.map(x => x.id);
  if (!apptIds.length) return jsonOk({ ok: true, deleted: 0 });

  const result = await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.deleteMany({ where: { appointmentId: { in: apptIds } } });
    const ap = await tx.appointment.deleteMany({ where: { id: { in: apptIds } } });
    return { appointments: ap.count, transactions: t.count };
  });
  return jsonOk({ ok: true, ...result });
}
