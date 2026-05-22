// GET /api/auth/me — return current user from JWT
import { jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req);
  if (a instanceof Response) return a;
  return jsonOk({ id: a.user.id, email: a.user.email, role: a.user.role, name: a.user.name });
}
