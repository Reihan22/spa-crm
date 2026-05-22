// POST /api/wa/send — staff sends manual message via worker
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
    const r = await fetch(WORKER_BASE + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({ phone: normalized, content }),
    });
    if (!r.ok) return jsonError('Worker send failed', 502, { detail: await r.text() });
    const data = await r.json();
    // Persist outgoing message
    let customer = await prisma.customer.findUnique({ where: { normalizedPhone: normalized } });
    await prisma.waMessage.create({
      data: {
        customerId: customer?.id || null,
        normalizedPhone: normalized,
        remoteJid: data.remote_jid || null,
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
