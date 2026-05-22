// GET/PATCH/DELETE /api/appointments/:id
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const ap = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { customer: true, service: true, therapist: true, transaction: true },
  });
  if (!ap) return jsonError('Not found', 404);
  return jsonOk(ap);
}
export async function PATCH(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  for (const k of ['customerId','serviceId','therapistId','status','notes']) if (body[k] !== undefined) data[k] = body[k] || null;
  if (body.scheduledAt) {
    data.scheduledAt = new Date(body.scheduledAt);
    const sid = body.serviceId || (await prisma.appointment.findUnique({ where: { id: params.id } })).serviceId;
    const service = await prisma.service.findUnique({ where: { id: sid } });
    if (service) data.endsAt = new Date(data.scheduledAt.getTime() + service.durationMinutes * 60_000);
  }
  const ap = await prisma.appointment.update({ where: { id: params.id }, data, include: { customer: true, service: true, therapist: true } });
  return jsonOk(ap);
}
export async function DELETE(req, { params }) {
  const a = requireAuth(req, ['admin','receptionist']); if (a instanceof Response) return a;
  await prisma.appointment.delete({ where: { id: params.id } });
  return jsonOk({ ok: true });
}
