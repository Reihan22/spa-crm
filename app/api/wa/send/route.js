// POST /api/wa/send — staff sends manual message via worker
// For @lid customers: looks up last inbound remoteJid and passes to worker.
import { jsonOk, jsonError, prisma, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const WORKER_BASE = `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}`;
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN;

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { phone, content } = body || {};
  if (!phone || !content) return jsonError('phone & content required', 400);
  const normalized = normalizePhone(phone);
  try {
    // Look up customer + last inbound remoteJid for @lid support
    const customer = await prisma.customer.findUnique({ where: { normalizedPhone: normalized } });
    let lastRemoteJid = null;
    if (customer) {
      const lastInbound = await prisma.waMessage.findFirst({
        where: { customerId: customer.id, direction: 'in', remoteJid: { not: null } },
        orderBy: { sentAt: 'desc' },
        select: { remoteJid: true },
      });
      lastRemoteJid = lastInbound?.remoteJid || null;
    }
    const r = await fetch(WORKER_BASE + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({ phone: normalized, content, remote_jid: lastRemoteJid }),
    });
    if (!r.ok) return jsonError('Worker send failed', 502, { detail: await r.text() });
    const data = await r.json();
    // Persist outgoing message
    await prisma.waMessage.create({
      data: {
        customer: customer?.id ? { connect: { id: customer.id } } : undefined,
        normalizedPhone: normalized,
        remoteJid: data.remote_jid || lastRemoteJid || null,
        waMessageId: data.wa_message_id || null,
        direction: 'out',
        source: 'human',
        content,
        status: 'sent',
      },
    });
    return jsonOk({ ok: true, ...data });
  } catch (e) {
    return jsonError('Worker offline', 502, { detail: String(e) });
  }
}
