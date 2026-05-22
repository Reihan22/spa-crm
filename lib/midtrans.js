// Midtrans QRIS helper. Sandbox + production via env. Server-side only.
import crypto from 'node:crypto';

const BASE = process.env.MIDTRANS_BASE || 'https://api.sandbox.midtrans.com';
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

if (!SERVER_KEY) console.warn('[midtrans] MIDTRANS_SERVER_KEY missing');

function authHeader() {
  const b64 = Buffer.from(`${SERVER_KEY}:`).toString('base64');
  return `Basic ${b64}`;
}

export async function chargeQris({ orderId, amount }) {
  const r = await fetch(`${BASE}/v2/charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      payment_type: 'qris',
      transaction_details: { order_id: orderId, gross_amount: Math.round(amount) },
      qris: { acquirer: 'gopay' },
    }),
  });
  const j = await r.json();
  if (!r.ok || j.status_code >= '400') {
    throw new Error(`midtrans charge failed: ${JSON.stringify(j)}`);
  }
  const qrAction = (j.actions || []).find((a) => a.name === 'generate-qr-code');
  return {
    transactionId: j.transaction_id,
    orderId: j.order_id,
    qrString: j.qr_string || null,
    qrUrl: qrAction?.url || null,
    expiresAt: j.expiry_time ? new Date(j.expiry_time.replace(' ', 'T') + '+07:00') : null,
    raw: j,
  };
}

export async function getStatus(orderId) {
  const r = await fetch(`${BASE}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: 'application/json', Authorization: authHeader() },
  });
  return await r.json();
}

// Verify webhook signature_key per Midtrans docs:
// SHA512(order_id + status_code + gross_amount + server_key)
export function verifyNotif({ order_id, status_code, gross_amount, signature_key }) {
  const raw = `${order_id}${status_code}${gross_amount}${SERVER_KEY}`;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  return expected === signature_key;
}

// Map midtrans transaction_status → internal TransactionStatus enum
export function mapStatus(notif) {
  const s = notif.transaction_status;
  if (s === 'settlement' || s === 'capture') {
    if (notif.fraud_status && notif.fraud_status !== 'accept') return 'pending';
    return 'paid';
  }
  if (s === 'pending') return 'unpaid';
  if (s === 'cancel' || s === 'expire' || s === 'failure' || s === 'deny') return 'cancelled';
  return 'unpaid';
}
