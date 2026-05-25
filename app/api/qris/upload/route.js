// POST /api/qris/upload — upload QR image or paste payload → decode + validate + store
// GET /api/qris/upload — get current stored payload info
import { requireAuth } from '@/lib/auth';
import { prisma, jsonOk, jsonError } from '@/lib/db';
import { validateQris, extractInfo } from '@/lib/qris';
import sharp from 'sharp';
import jsQR from 'jsqr';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;
  const s = await prisma.settings.findFirst({ where: { id: 1 } });
  const payload = s?.qrisPayload || null;
  const info = payload ? extractInfo(payload) : null;
  return jsonOk({ payload, info, hasPayload: !!payload });
}

export async function POST(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;

  const contentType = req.headers.get('content-type') || '';
  let rawPayload = '';

  if (contentType.includes('multipart/form-data')) {
    // Image upload — decode QR from image
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') return jsonError('No file uploaded', 400);

    const buffer = Buffer.from(await file.arrayBuffer());

    // Use sharp to get raw RGBA pixels
    const { data, info: imgInfo } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Decode QR
    const qr = jsQR(new Uint8ClampedArray(data), imgInfo.width, imgInfo.height);
    if (!qr?.data) return jsonError('Tidak bisa decode QR dari gambar', 400);
    rawPayload = qr.data;
  } else {
    // Text payload
    const body = await req.json().catch(() => null);
    rawPayload = body?.payload || '';
  }

  if (!rawPayload) return jsonError('Payload kosong', 400);

  // Validate QRIS
  const v = validateQris(rawPayload);
  if (!v.valid) return jsonError(`QRIS tidak valid: ${v.error}`, 400);

  // Store
  await prisma.settings.update({
    where: { id: 1 },
    data: { qrisPayload: rawPayload },
  });

  const info = extractInfo(rawPayload);
  return jsonOk({ ok: true, info, payload: rawPayload });
}
