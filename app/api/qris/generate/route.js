// POST /api/qris/generate — generate dynamic QRIS image from stored payload + amount
import { requireAuth } from '@/lib/auth';
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { toDynamic, extractInfo } from '@/lib/qris';
import QRCode from 'qrcode';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;

  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { amount } = body || {};
  if (!amount || amount <= 0) return jsonError('amount required (IDR)', 400);

  const s = await prisma.settings.findFirst({ where: { id: 1 } });
  if (!s?.qrisPayload) return jsonError('QRIS belum di-upload. Upload dulu di Settings.', 400);

  // Generate dynamic payload
  const dynamicPayload = toDynamic(s.qrisPayload, amount, {
    merchantName: undefined,  // keep original
    merchantCity: undefined,
    countryCode: undefined,
    postalCode: undefined,
  });

  const info = extractInfo(dynamicPayload);

  // Generate QR image as PNG buffer
  const qrBuffer = await QRCode.toBuffer(dynamicPayload, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  // Return as image
  return new NextResponse(qrBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qris-${amount}.png"`,
      'X-QRIS-Payload': dynamicPayload,
      'X-QRIS-Amount': String(amount),
      'X-QRIS-Merchant': info.merchantName || '',
    },
  });
}
