// POST /api/wa/reset — admin force re-pair.
// Modes: 'reset' (clear local auth, keep WA session — use when worker already disconnected),
//        'logout' (tell WA to logout this device, then clear auth — use to switch number cleanly).
import { jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const WORKER_BASE = `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}`;
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN;

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'logout' ? 'logout' : 'reset';
  try {
    const r = await fetch(`${WORKER_BASE}/${mode}`, {
      method: 'POST',
      headers: { 'x-worker-token': WORKER_TOKEN, 'content-type': 'application/json' },
      body: '{}',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return jsonError(`worker ${mode} failed: ${r.status}`, 502);
    return jsonOk({ ok: true, mode, ...data });
  } catch (e) {
    return jsonError(String(e?.message || e), 502);
  }
}
