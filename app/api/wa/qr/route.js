// GET /api/wa/qr — fetch latest QR from worker for pairing
import { jsonOk } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const WORKER_BASE = `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}`;
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN;

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  try {
    const r = await fetch(WORKER_BASE + '/qr', { headers: { 'x-worker-token': WORKER_TOKEN } });
    if (!r.ok) return jsonOk({ qr_available: false });
    return jsonOk(await r.json());
  } catch {
    return jsonOk({ qr_available: false });
  }
}
