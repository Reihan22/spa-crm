// POST /api/wa/read — mark conversation as read (set lastReadAt = now)
import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;

  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { phone } = body || {};
  if (!phone) return jsonError('phone required', 400);

  const normalized = normalizePhone(phone);
  const customer = await prisma.customer.findFirst({ where: { phone: normalized } });
  if (!customer) return jsonError('Customer not found', 404);

  await prisma.customer.update({
    where: { id: customer.id },
    data: { lastReadAt: new Date() },
  });

  return jsonOk({ ok: true, phone: normalized });
}
