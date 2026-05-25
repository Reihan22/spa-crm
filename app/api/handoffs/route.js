// GET/POST /api/handoffs — staff queue when AI escalates
// GET query: status, q (customer/phone), from, to
// DELETE /api/handoffs — bulk delete
//   query: ?id= | ?status= | ?all=1
import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const auth = requireAuth(req); if (auth instanceof Response) return auth;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const q = (searchParams.get('q') || '').trim();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const where = {};
  if (status !== 'all') where.status = status;
  if (q) {
    where.OR = [
      { normalizedPhone: { contains: normalizePhone(q) } },
      { reason: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  const items = await prisma.handoff.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { customer: true },
  });
  return jsonOk({ items, total: items.length });
}

// Internal endpoint — worker can create handoff. Also accept user-auth.
export async function POST(req) {
  const internal = process.env.APP_INTERNAL_TOKEN && (req.headers.get('x-internal-token') === process.env.APP_INTERNAL_TOKEN);
  if (!internal) {
    const auth = requireAuth(req); if (auth instanceof Response) return auth;
  }
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { customerId, normalizedPhone, reason, triggerKeyword } = body || {};
  if (!customerId || !reason) return jsonError('customerId & reason required', 400);
  const h = await prisma.handoff.create({ data: { customer: { connect: { id: customerId } }, sessionId: `handoff-${Date.now()}`, reason, status: 'pending' } });
  return jsonOk(h, 201);
}

export async function DELETE(req) {
  const a = requireAuth(req, ['admin','receptionist']); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const all = searchParams.get('all') === '1';
  if (!id && !status && !all) return jsonError('id, status, or all=1 required', 400);
  let where = {};
  if (id) where.id = id;
  else if (status) where.status = status;
  const r = await prisma.handoff.deleteMany({ where });
  return jsonOk({ ok: true, deleted: r.count });
}
