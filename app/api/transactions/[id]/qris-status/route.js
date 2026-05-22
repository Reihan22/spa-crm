// GET /api/transactions/[id]/qris-status — poll midtrans status, sync DB, return current state
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getStatus, mapStatus } from '@/lib/midtrans';
import { sendWaConfirmation } from '@/lib/wa-notify';

export async function GET(req, { params }) {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: { appointment: { include: { customer: true } } },
  });
  if (!tx) return jsonError('Transaction not found', 404);
  if (!tx.midtransOrderId) return jsonOk({ status: tx.status, midtrans: null });

  let mid;
  try { mid = await getStatus(tx.midtransOrderId); } catch (e) {
    return jsonError('Midtrans status fetch failed', 502, { detail: String(e) });
  }

  const newStatus = mapStatus(mid);
  const isPaid = newStatus === 'paid';
  if (newStatus !== tx.status) {
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
    if (isPaid) await sendWaConfirmation(tx, 'paid');
  }

  return jsonOk({
    status: newStatus,
    midtrans: {
      transaction_status: mid.transaction_status,
      fraud_status: mid.fraud_status,
      gross_amount: mid.gross_amount,
      transaction_time: mid.transaction_time,
      settlement_time: mid.settlement_time,
    },
    qrString: tx.midtransQrString,
    qrUrl: tx.midtransQrUrl,
    expiresAt: tx.midtransExpiresAt,
  });
}
