// PATCH /api/handoffs/:id — take/resolve
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PATCH(req, { params }) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  if (body.status) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.status === 'active') { data.takenBy = a.user.id; data.takenAt = new Date(); }
  if (body.status === 'resolved') data.resolvedAt = new Date();
  const h = await prisma.handoff.update({ where: { id: params.id }, data });
  return jsonOk(h);
}
