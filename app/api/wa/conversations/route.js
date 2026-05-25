// GET /api/wa/conversations — grouped by phone, last message, unread count
// DELETE /api/wa/conversations?phone=xxx — delete all messages for a phone
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function DELETE(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone') || '';
  if (!phone) return jsonError('phone required', 400);

  const deleted = await prisma.waMessage.deleteMany({ where: { normalizedPhone: phone } });
  return jsonOk({ deleted: deleted.count, phone });
}

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(200, parseInt(searchParams.get('limit') || '100'));

  // Get distinct phones with latest message
  const raw = await prisma.$queryRaw`
    SELECT
      "normalizedPhone",
      MAX("sentAt") as last_at,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE direction = 'in')::int as inbound,
      COUNT(*) FILTER (WHERE direction = 'out')::int as outbound,
      COUNT(*) FILTER (WHERE "aiBlocked" = true)::int as blocked_count
    FROM "WaMessage"
    WHERE "normalizedPhone" IS NOT NULL
    GROUP BY "normalizedPhone"
    ORDER BY MAX("sentAt") DESC
    LIMIT ${limit}
  `;

  // Fetch last message + customer info per phone
  const conversations = await Promise.all(raw.map(async (row) => {
    const lastMsg = await prisma.waMessage.findFirst({
      where: { normalizedPhone: row.normalizedPhone },
      orderBy: { sentAt: 'desc' },
      select: { id: true, content: true, direction: true, source: true, sentAt: true, aiBlocked: true },
    });
    const customer = await prisma.customer.findFirst({
      where: { phone: row.normalizedPhone },
      select: { id: true, name: true, tags: true, totalBookings: true, totalSpent: true, lastVisit: true, aiEnabled: true },
    });
    // Count recent inbound (last 5 min) as "unread"
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const unread = await prisma.waMessage.count({
      where: {
        normalizedPhone: row.normalizedPhone,
        direction: 'in',
        sentAt: { gte: fiveMinAgo },
      },
    });
    return {
      phone: row.normalizedPhone,
      customer,
      lastMessage: lastMsg,
      stats: {
        total: row.total,
        inbound: row.inbound,
        outbound: row.outbound,
        blocked: row.blocked_count > 0,
      },
      unread,
    };
  }));

  // Filter by search query
  const filtered = q
    ? conversations.filter(c =>
        c.phone.includes(q) ||
        c.customer?.name?.toLowerCase().includes(q.toLowerCase()) ||
        c.lastMessage?.content?.toLowerCase().includes(q.toLowerCase())
      )
    : conversations;

  return jsonOk({ conversations: filtered, total: filtered.length });
}
