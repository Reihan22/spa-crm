// Header doc: shared utilities — phone normalization, JWT, prisma singleton, fetch helper
// Used by API routes (auth required) and worker (token required)

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('8')) s = '62' + s;
  return s;
}

export function jsonError(message, status = 400, extra = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
