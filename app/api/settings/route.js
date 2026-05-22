// GET/PATCH /api/settings — singleton, admin-only writes
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const FIELDS = [
  'businessName','address','phone','email','waNumber','logoUrl','qrisImageUrl',
  'bookingPaymentInstructions','pendingPaymentExpiryMinutes',
  'aiModel','aiBaseUrl','aiKnowledgeBase','aiSafetyRules','aiHandoffKeywords','aiAllowedTopics','aiOffTopicReply','aiMaxOutputTokens','patternsJson',
  'abuseDailyMsgPerPhone','abuseDailyCostPerPhone','abuseGlobalDailyBudget','abuseFlagThreshold',
];

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  let s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s) s = await prisma.settings.create({ data: { id: 1 } });
  return jsonOk(s);
}

export async function PATCH(req) {
  const a = requireAuth(req, ['admin']); if (a instanceof Response) return a;
  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const data = {};
  for (const k of FIELDS) if (body[k] !== undefined) data[k] = body[k];
  const s = await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  return jsonOk(s);
}
