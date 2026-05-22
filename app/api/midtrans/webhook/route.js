// POST /api/midtrans/webhook — public, no JWT, but verified via signature_key
// Midtrans pushes here on settlement / expire / cancel.
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { verifyNotif, mapStatus } from '@/lib/midtrans';
import { sendWaConfirmation } from '@/lib/wa-notify';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { order_id, status_code, gross_amount, signature_key } = body || {};
  if (!order_id || !status_code || !signature_key) {
    return jsonError('Missing fields', 400);
  }
  if (!verifyNotif({ order_id, status_code, gross_amount, signature_key })) {
    return jsonError('Invalid signature', 401);
  }

  const tx = await prisma.transaction.findUnique({
    where: { midtransOrderId: order_id },
    include: { appointment: { include: { customer: true } } },
  });
  if (!tx) {
    // Sandbox simulator may push for unknown order — ack to stop retries.
    return jsonOk({ ok: true, ignored: 'order not found' });
  }

  const newStatus = mapStatus(body);
  const isPaid = newStatus === 'paid';

  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      status: newStatus,
      paidAt: isPaid ? new Date() : tx.paidAt,
      midtransLastStatus: body.transaction_status,
      midtransRawNotif: body,
    },
  });

  // Confirm appointment on paid (only if still pending)
  if (isPaid && tx.appointmentId) {
    await prisma.appointment.updateMany({
      where: { id: tx.appointmentId, status: 'pending' },
      data: { status: 'confirmed' },
    });
  }

  // If now paid, send WA confirmation to customer (best-effort). Guard: only on first paid transition.
  if (isPaid && tx.status !== 'paid') {
    await sendWaConfirmation(tx, 'paid');
  }

  return jsonOk({ ok: true, status: newStatus });
}
