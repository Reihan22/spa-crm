// GET/POST /api/services
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const { searchParams } = new URL(req.url);
  const onlyActive = searchParams.get('active') === '1';
  const items = await prisma.service.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return jsonOk(items);
}

export async function POST(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { name, category, durationMinutes, price, description, isActive } = body || {};
  if (!name || !category || !durationMinutes || price === undefined) return jsonError('name, category, durationMinutes, price required', 400);
  const s = await prisma.service.create({
    data: {
      name, category,
      durationMinutes: parseInt(durationMinutes),
      price: String(price),
      description: description || null,
      isActive: isActive !== false,
    },
  });
  return jsonOk(s, 201);
}
