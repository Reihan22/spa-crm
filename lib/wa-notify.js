// Send WA reply to a customer (best-effort). Used by webhook + status-poll fallback.
import { prisma } from '@/lib/db';

export async function sendWaConfirmation(tx, type = 'paid') {
  const cust = tx.appointment?.customer;
  if (!cust?.normalizedPhone) return { ok: false, reason: 'no phone' };

  let reply;
  if (type === 'paid') {
    reply = `Pembayaran diterima ✅\nOrder: ${tx.midtransOrderId}\nTotal: Rp ${Number(tx.total).toLocaleString('id-ID')}\nTerima kasih kak.`;
  } else if (type === 'expired') {
    reply = `Pembayaran expired ⏱️\nOrder: ${tx.midtransOrderId}\nKalau masih mau lanjut, balas pesan ini ya kak.`;
  } else {
    return { ok: false, reason: 'unknown type' };
  }

  // Pull last inbound message for this customer to reuse @lid remoteJid
  const lastInbound = await prisma.waMessage.findFirst({
    where: { customerId: cust.id, direction: 'in' },
    orderBy: { sentAt: 'desc' },
    select: { remoteJid: true },
  }).catch(() => null);

  try {
    const r = await fetch(
      `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}/send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-token': process.env.WA_WORKER_TOKEN,
        },
        body: JSON.stringify({
          phone: cust.normalizedPhone,
          content: reply,
          remote_jid: lastInbound?.remoteJid || undefined,
        }),
      }
    );
    if (!r.ok) return { ok: false, reason: `worker ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
