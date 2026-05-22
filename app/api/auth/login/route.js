// POST /api/auth/login — email + password → JWT
import bcrypt from 'bcryptjs';
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { email, password } = body || {};
  if (!email || !password) return jsonError('email & password required', 400);
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user || !user.isActive) return jsonError('Invalid credentials', 401);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return jsonError('Invalid credentials', 401);
  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  return jsonOk({
    access_token: token,
    token_type: 'bearer',
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
