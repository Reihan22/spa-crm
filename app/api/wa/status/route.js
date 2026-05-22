// GET /api/wa/status & /api/wa/qr — proxy to internal worker
// Worker holds Baileys session; UI calls these to know connection state.
import { jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const WORKER_BASE = `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}`;
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN;

async function workerGet(path) {
  try {
    const r = await fetch(WORKER_BASE + path, { headers: { 'x-worker-token': WORKER_TOKEN } });
    if (!r.ok) return { status: 'offline', error: 'worker_error' };
    return await r.json();
  } catch {
    return { status: 'offline', connected: false, qr_available: false };
  }
}

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const data = await workerGet('/status');
  return jsonOk(data);
}
