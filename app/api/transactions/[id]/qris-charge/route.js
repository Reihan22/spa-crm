// POST /api/transactions/[id]/qris-charge
// Auth required. Idempotent: if midtransOrderId exists & not expired, return existing QR.
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { chargeQris } from '@/lib/midtrans';

export async function POST(req, { params }) {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { appointment: { include: { customer: true } } },
  });
  if (!tx) return jsonError('Transaction not found', 404);
  if (tx.status === 'paid') return jsonError('Already paid', 400);

  // Reuse existing pending QR if not expired
  if (tx.midtransQrString && tx.midtransExpiresAt && tx.midtransExpiresAt > new Date()) {
    return jsonOk({
      orderId: tx.midtransOrderId,
      qrString: tx.midtransQrString,
      qrUrl: tx.midtransQrUrl,
      expiresAt: tx.midtransExpiresAt,
      reused: true,
    });
  }

  const orderId = `TX-${tx.id}-${Date.now()}`;
  const amount = Number(tx.total);
  if (!amount || amount < 1) return jsonError('Invalid amount', 400);

  let charge;
  try {
    charge = await chargeQris({ orderId, amount });
  } catch (e) {
    return jsonError('Midtrans charge failed', 502, { detail: String(e) });
  }

  const updated = await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      paymentMethod: 'qris',
      midtransOrderId: charge.orderId,
      midtransTxnId: charge.transactionId,
      midtransQrString: charge.qrString,
      midtransQrUrl: charge.qrUrl,
      midtransExpiresAt: charge.expiresAt,
      midtransLastStatus: 'pending',
    },
  });

  return jsonOk({
    orderId: updated.midtransOrderId,
    qrString: updated.midtransQrString,
    qrUrl: updated.midtransQrUrl,
    expiresAt: updated.midtransExpiresAt,
    reused: false,
  });
}
