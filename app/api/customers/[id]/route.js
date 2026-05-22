// GET/PATCH/DELETE /api/customers/:id
import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const c = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      appointments: { orderBy: { scheduledAt: 'desc' }, take: 20, include: { service: true, therapist: true } },
      handoffs: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!c) return jsonError('Not found', 404);
  return jsonOk(c);
}

export async function PATCH(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  for (const k of ['name','phone','email','address','skinType','allergies','notes']) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.birth_date !== undefined) data.birthDate = body.birth_date ? new Date(body.birth_date) : null;
  if (body.phone) data.normalizedPhone = normalizePhone(body.phone);
  const c = await prisma.customer.update({ where: { id: params.id }, data });
  return jsonOk(c);
}

export async function DELETE(req, { params }) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  await prisma.customer.delete({ where: { id: params.id } });
  return jsonOk({ ok: true });
}
