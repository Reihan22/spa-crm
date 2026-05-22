// GET /api/wa/messages — paginated chat history with filter
// DELETE /api/wa/messages?id=... | ?phone=... | ?all=1 — bulk/single deletion
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const size = Math.min(100, parseInt(searchParams.get('size') || '50'));
  const phone = searchParams.get('phone');
  const direction = searchParams.get('direction');     // 'in' | 'out'
  const source = searchParams.get('source');           // 'ai_agent' | 'human' | 'system'
  const blocked = searchParams.get('blocked');         // '1' | '0'
  const q = searchParams.get('q');                     // content text search
  const from = searchParams.get('from');               // ISO
  const to = searchParams.get('to');

  const where = {};
  if (phone) where.normalizedPhone = phone;
  if (direction === 'in' || direction === 'out') where.direction = direction;
  if (source) where.source = source;
  if (blocked === '1') where.aiBlocked = true;
  if (blocked === '0') where.aiBlocked = false;
  if (q) where.content = { contains: q, mode: 'insensitive' };
  if (from || to) {
    where.sentAt = {};
    if (from) where.sentAt.gte = new Date(from);
    if (to) where.sentAt.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.waMessage.findMany({
      where,
      include: { customer: true },
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.waMessage.count({ where }),
  ]);
  return jsonOk({ items, total, page, pages: Math.ceil(total / size) || 1 });
}

export async function DELETE(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const phone = searchParams.get('phone');
  const all = searchParams.get('all') === '1';

  if (id) {
    const r = await prisma.waMessage.delete({ where: { id } }).catch(() => null);
    if (!r) return jsonError('not found', 404);
    return jsonOk({ ok: true, deleted: 1 });
  }
  if (phone) {
    const r = await prisma.waMessage.deleteMany({ where: { normalizedPhone: phone } });
    return jsonOk({ ok: true, deleted: r.count, scope: `phone=${phone}` });
  }
  if (all) {
    const r = await prisma.waMessage.deleteMany({});
    return jsonOk({ ok: true, deleted: r.count, scope: 'all' });
  }
  return jsonError('id, phone, or all=1 required', 400);
}
