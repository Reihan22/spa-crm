// GET /api/customers — list with filter + pagination
//   query: page, size, q, from, to (createdAt range, ISO datetime)
// POST /api/customers — create
// DELETE /api/customers — bulk delete (admin only)
//   query: ?id=<customerId> | ?all=1
import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const size = Math.min(100, parseInt(searchParams.get('size') || '20'));
  const q = (searchParams.get('q') || '').trim();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const where = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { normalizedPhone: { contains: normalizePhone(q) } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size, take: size,
    }),
    prisma.customer.count({ where }),
  ]);
  return jsonOk({ items, total, page, pages: Math.ceil(total / size) || 1 });
}

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { name, phone, email, birth_date, address, skin_type, allergies, notes } = body || {};
  if (!name || !phone) return jsonError('name & phone required', 400);
  const normalized = normalizePhone(phone);
  try {
    const c = await prisma.customer.create({
      data: {
        name, phone, normalizedPhone: normalized, email: email || null,
        birthDate: birth_date ? new Date(birth_date) : null,
        address: address || null, skinType: skin_type || null,
        allergies: allergies || null, notes: notes || null,
      },
    });
    return jsonOk(c, 201);
  } catch (e) {
    if (e.code === 'P2002') return jsonError('Phone or email already exists', 409);
    throw e;
  }
}

// Bulk delete — admin only. Cascades manual delete of dependent records.
export async function DELETE(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const all = searchParams.get('all') === '1';
  if (!id && !all) return jsonError('id or all=1 required', 400);

  // collect target ids
  let ids = [];
  if (id) ids = [id];
  else if (all) {
    const rows = await prisma.customer.findMany({ select: { id: true } });
    ids = rows.map(r => r.id);
  }
  if (!ids.length) return jsonOk({ ok: true, deleted: 0 });

  // wipe dependents first to bypass FK
  const result = await prisma.$transaction(async (tx) => {
    const m = await tx.waMessage.deleteMany({ where: { customerId: { in: ids } } });
    const h = await tx.handoff.deleteMany({ where: { customerId: { in: ids } } });
    // appointments: delete transactions first
    const appts = await tx.appointment.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
    const apptIds = appts.map(x => x.id);
    let txDel = 0;
    if (apptIds.length) {
      const t = await tx.transaction.deleteMany({ where: { appointmentId: { in: apptIds } } });
      txDel = t.count;
    }
    const ap = await tx.appointment.deleteMany({ where: { customerId: { in: ids } } });
    const c = await tx.customer.deleteMany({ where: { id: { in: ids } } });
    return { customers: c.count, appointments: ap.count, transactions: txDel, waMessages: m.count, handoffs: h.count };
  });
  return jsonOk({ ok: true, ...result });
}
