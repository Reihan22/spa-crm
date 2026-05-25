// POST /api/wa/broadcast — bulk send message to customers
// For @lid customers: looks up last inbound remoteJid and passes to worker.
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const WORKER_BASE = `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}`;
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN || '';

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;

  let body;
  try { body = await req.json(); } catch { return jsonError('invalid json', 400); }

  const { content, target, tags, minDaysSinceVisit } = body;
  if (!content || typeof content !== 'string' || content.trim().length < 2) {
    return jsonError('content required (min 2 chars)', 400);
  }

  // Build target list with customer IDs
  let customers = [];

  if (target === 'all') {
    customers = await prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true, phone: true, normalizedPhone: true },
    });
  } else if (target === 'segment' && tags?.length) {
    customers = await prisma.customer.findMany({
      where: {
        isActive: true,
        tags: { hasSome: tags },
      },
      select: { id: true, phone: true, normalizedPhone: true },
    });
  } else if (target === 'inactive' && minDaysSinceVisit) {
    const cutoff = new Date(Date.now() - minDaysSinceVisit * 24 * 60 * 60 * 1000);
    customers = await prisma.customer.findMany({
      where: {
        isActive: true,
        OR: [
          { lastVisit: null },
          { lastVisit: { lt: cutoff } },
        ],
      },
      select: { id: true, phone: true, normalizedPhone: true },
    });
  } else {
    return jsonError('target required: all | segment (with tags) | inactive (with minDaysSinceVisit)', 400);
  }

  if (!customers.length) return jsonError('no customers found for target', 404);

  // Pre-fetch last inbound remoteJid for each customer (for @lid support)
  const jidMap = {};
  const customerIds = customers.map(c => c.id);
  const lastInbounds = await prisma.waMessage.findMany({
    where: { customerId: { in: customerIds }, direction: 'in', remoteJid: { not: null } },
    orderBy: { sentAt: 'desc' },
    select: { customerId: true, remoteJid: true },
    distinct: ['customerId'],
  });
  for (const msg of lastInbounds) {
    jidMap[msg.customerId] = msg.remoteJid;
  }

  // Send with rate limiting (1 msg per 500ms to avoid WA throttle)
  const results = { sent: 0, failed: 0, errors: [] };
  for (const cust of customers) {
    const phone = cust.phone;
    const remoteJid = jidMap[cust.id] || null;
    try {
      const r = await fetch(WORKER_BASE + '/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
        body: JSON.stringify({ phone, content, remote_jid: remoteJid }),
      });
      const data = r.ok ? await r.json() : null;
      if (r.ok) {
        results.sent++;
        await prisma.waMessage.create({
          data: {
            customer: { connect: { id: cust.id } },
            normalizedPhone: cust.normalizedPhone || phone,
            remoteJid: data?.remote_jid || remoteJid || null,
            waMessageId: data?.wa_message_id || null,
            direction: 'out',
            source: 'system',
            content: `[BROADCAST] ${content}`,
            status: 'sent',
          },
        }).catch(() => {});
      } else {
        results.failed++;
        results.errors.push({ phone, status: r.status });
      }
    } catch (e) {
      results.failed++;
      results.errors.push({ phone, error: e.message });
    }
    // Rate limit delay
    await new Promise(r => setTimeout(r, 500));
  }

  return jsonOk({
    ...results,
    total: customers.length,
    target,
  });
}
