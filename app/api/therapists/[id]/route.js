// GET/PATCH/DELETE /api/therapists/:id
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const t = await prisma.therapist.findUnique({ where: { id: params.id } });
  if (!t) return jsonError('Not found', 404);
  return jsonOk(t);
}
export async function PATCH(req, { params }) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  for (const k of ['name','phone','specialization']) if (body[k] !== undefined) data[k] = body[k];
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  const t = await prisma.therapist.update({ where: { id: params.id }, data });
  return jsonOk(t);
}
export async function DELETE(req, { params }) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  await prisma.therapist.delete({ where: { id: params.id } });
  return jsonOk({ ok: true });
}
