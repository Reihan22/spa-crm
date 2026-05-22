// GET/PATCH/DELETE /api/transactions/:id
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const tx = await prisma.transaction.findUnique({ where: { id: params.id }, include: { appointment: { include: { customer: true, service: true, therapist: true } } } });
  if (!tx) return jsonError('Not found', 404);
  return jsonOk(tx);
}
export async function PATCH(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  for (const k of ['paymentMethod','status']) if (body[k] !== undefined) data[k] = body[k];
  for (const k of ['subtotal','discount','tax','total']) if (body[k] !== undefined) data[k] = String(body[k]);
  if (body.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  const tx = await prisma.transaction.update({ where: { id: params.id }, data });
  return jsonOk(tx);
}
export async function DELETE(req, { params }) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  await prisma.transaction.delete({ where: { id: params.id } });
  return jsonOk({ ok: true });
}
