// PATCH /api/wa/confirm-payment — staff marks transaction as paid
import { requireAuth } from '@/lib/auth';
import { prisma, jsonOk, jsonError } from '@/lib/db';

export async function PATCH(req) {
  requireAuth(req);
  const { transactionId } = await req.json();
  if (!transactionId) return jsonError('transactionId required', 400);

  const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!txn) return jsonError('Transaction not found', 404);
  if (txn.status === 'paid') return jsonOk({ already: true });

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'paid', paidAt: new Date(), paymentMethod: 'qris' },
  });

  // Also update appointment status if linked
  if (txn.appointmentId) {
    await prisma.appointment.update({
      where: { id: txn.appointmentId },
      data: { status: 'confirmed' },
    }).catch(() => {}); // ignore if already confirmed
  }

  return jsonOk({ transaction: updated });
}
