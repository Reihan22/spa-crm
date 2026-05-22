// GET/PATCH/DELETE /api/services/:id
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const s = await prisma.service.findUnique({ where: { id: params.id } });
  if (!s) return jsonError('Not found', 404);
  return jsonOk(s);
}
export async function PATCH(req, { params }) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  for (const k of ['name','category','description']) if (body[k] !== undefined) data[k] = body[k];
  if (body.durationMinutes !== undefined) data.durationMinutes = parseInt(body.durationMinutes);
  if (body.price !== undefined) data.price = String(body.price);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  const s = await prisma.service.update({ where: { id: params.id }, data });
  return jsonOk(s);
}
export async function DELETE(req, { params }) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  await prisma.service.delete({ where: { id: params.id } });
  return jsonOk({ ok: true });
}
