// GET/POST /api/therapists
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const items = await prisma.therapist.findMany({ orderBy: { name: 'asc' } });
  return jsonOk(items);
}

export async function POST(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { name, phone, specialization, isActive } = body || {};
  if (!name) return jsonError('name required', 400);
  const t = await prisma.therapist.create({ data: { name, phone: phone || null, specialization: specialization || null, isActive: isActive !== false } });
  return jsonOk(t, 201);
}
