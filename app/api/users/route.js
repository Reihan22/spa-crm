// GET/POST /api/users — admin only
import bcrypt from 'bcryptjs';
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  const items = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } });
  return jsonOk(items);
}

export async function POST(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { email, password, name, role } = body || {};
  if (!email || !password || !name) return jsonError('email, password, name required', 400);
  try {
    const u = await prisma.user.create({
      data: {
        email: String(email).toLowerCase(),
        passwordHash: await bcrypt.hash(password, 10),
        name,
        role: role || 'receptionist',
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    return jsonOk(u, 201);
  } catch (e) {
    if (e.code === 'P2002') return jsonError('Email exists', 409);
    throw e;
  }
}
