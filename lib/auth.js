// Header doc: JWT helpers + auth middleware for API routes
// Verifies bearer token from Authorization header, returns user payload or 401

import jwt from 'jsonwebtoken';
import { jsonError } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, SECRET, { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export function getBearer(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

// Returns { user } on success, or Response 401 on failure.
// Roles array filters access. Pass [] or omit for any authenticated user.
export function requireAuth(req, roles = null) {
  const token = getBearer(req);
  if (!token) return jsonError('Unauthorized', 401);
  const payload = verifyToken(token);
  if (!payload) return jsonError('Invalid token', 401);
  if (roles && roles.length && !roles.includes(payload.role)) {
    return jsonError('Forbidden', 403);
  }
  return { user: payload };
}

// Internal token check used by Baileys worker → main app
export function requireInternal(req) {
  const token = getBearer(req) || req.headers.get('x-internal-token') || '';
  if (token !== process.env.APP_INTERNAL_TOKEN) {
    return jsonError('Unauthorized internal call', 401);
  }
  return { ok: true };
}
