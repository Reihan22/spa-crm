// Midtrans QRIS poller — runs every 30s, scans unpaid transactions with active QR,
// queries Midtrans status, updates DB on settlement, sends WA confirmation.
// Independent from web app and WA worker; reads same DB and uses worker /send.
// Env injected by systemd EnvironmentFile (.env), no dotenv needed.
import { PrismaClient } from '@prisma/client';

const BASE = process.env.MIDTRANS_BASE || 'https://api.sandbox.midtrans.com';
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const WORKER_BASE = process.env.WA_WORKER_BASE || 'http://127.0.0.1:3011';
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN;
const POLL_INTERVAL_MS = parseInt(process.env.MIDTRANS_POLL_MS || '30000', 10);

if (!SERVER_KEY) {
  console.error('[midtrans-poll] MIDTRANS_SERVER_KEY missing — exiting');
  process.exit(1);
}

const prisma = new PrismaClient();

function authHeader() {
  return 'Basic ' + Buffer.from(SERVER_KEY + ':').toString('base64');
}

async function getStatus(orderId) {
  const r = await fetch(`${BASE}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: 'application/json', Authorization: authHeader() },
  });
  return r.json();
}

function mapStatus(notif) {
  const s = notif.transaction_status;
  if (s === 'settlement' || s === 'capture') {
    if (notif.fraud_status && notif.fraud_status !== 'accept') return 'pending';
    return 'paid';
  }
  if (s === 'pending') return 'unpaid';
  if (['cancel', 'expire', 'failure', 'deny'].includes(s)) return 'cancelled';
  return 'unpaid';
}

async function sendWa(phone, remoteJid, text) {
  try {
    const r = await fetch(WORKER_BASE + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({ phone, content: text, remote_jid: remoteJid || null }),
    });
    return r.ok;
  } catch (e) {
    console.error('[midtrans-poll] wa send failed:', e?.message || e);
    return false;
  }
}

async function processTx(tx) {
  let mid;
  try { mid = await getStatus(tx.midtransOrderId); }
  catch (e) { console.error('[midtrans-poll]', tx.midtransOrderId, 'status fetch err:', e?.message); return; }

  const newStatus = mapStatus(mid);
  const isPaid = newStatus === 'paid';
  if (newStatus === tx.status) return;

  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      status: newStatus,
      paidAt: isPaid && !tx.paidAt ? new Date() : tx.paidAt,
      midtransLastStatus: mid.transaction_status,
    },
  });

  if (isPaid && tx.appointmentId) {
    await prisma.appointment.updateMany({
      where: { id: tx.appointmentId, status: 'pending' },
      data: { status: 'confirmed' },
    });
  }

  if (isPaid) {
    const cust = tx.appointment?.customer;
    if (!cust) return;
    const lastIn = await prisma.waMessage.findFirst({
      where: { customerId: cust.id, direction: 'in' },
      orderBy: { sentAt: 'desc' },
      select: { remoteJid: true },
    });
    const totalFmt = Number(tx.total).toLocaleString('id-ID');
    const text =
`Pembayaran diterima ✅

Total: Rp ${totalFmt}
Layanan: ${tx.appointment.service.name}
Jadwal: ${new Date(tx.appointment.scheduledAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' })}

Makasih ya kak! Booking sudah confirmed.`;
    const ok = await sendWa(cust.normalizedPhone, lastIn?.remoteJid, text);
    if (ok) {
      await prisma.waMessage.create({
        data: {
          customerId: cust.id,
          normalizedPhone: cust.normalizedPhone,
          remoteJid: lastIn?.remoteJid || null,
          direction: 'out',
          source: 'system',
          content: text,
          status: 'sent',
        },
      });
    }
    console.log('[midtrans-poll] paid:', tx.id, '→ WA', ok ? 'sent' : 'FAILED');
  } else {
    console.log('[midtrans-poll] sync:', tx.id, '→', newStatus);
  }
}

async function tick() {
  const now = new Date();
  const txs = await prisma.transaction.findMany({
    where: {
      paymentMethod: 'qris',
      status: { in: ['unpaid', 'partial'] },
      midtransOrderId: { not: null },
      OR: [
        { midtransExpiresAt: null },
        { midtransExpiresAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } }, // up to 1h after expiry, in case settlement late
      ],
    },
    take: 50,
    include: { appointment: { include: { customer: true, service: true } } },
  });
  if (!txs.length) return;
  for (const tx of txs) {
    try { await processTx(tx); } catch (e) { console.error('[midtrans-poll] processTx err:', e?.message); }
  }
}

console.log(`[midtrans-poll] started, interval=${POLL_INTERVAL_MS}ms base=${BASE}`);
setInterval(() => { tick().catch(e => console.error('[midtrans-poll] tick err:', e?.message)); }, POLL_INTERVAL_MS);
tick().catch(e => console.error('[midtrans-poll] initial tick err:', e?.message));
