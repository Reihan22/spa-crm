// PATCH /api/wa/toggle-ai — toggle AI auto-reply for a customer
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PATCH(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { phone, aiEnabled } = await req.json();
  if (!phone || typeof aiEnabled !== 'boolean') return jsonError('phone + aiEnabled required', 400);

  const customer = await prisma.customer.update({
    where: { normalizedPhone: phone },
    data: { aiEnabled },
    select: { id: true, name: true, phone: true, aiEnabled: true },
  });
  return jsonOk(customer);
}
