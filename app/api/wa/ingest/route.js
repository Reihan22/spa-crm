// Header doc: POST /api/wa/ingest — INTERNAL endpoint called by Baileys worker on inbound message.
// Pipeline: persist inbound → abuse preflight → LLM agent (with tool loop) → record cost → if reply, persist + ask worker to send
// LLM handles all classification + data fetching via function calling tools.

import { prisma, jsonOk, jsonError, normalizePhone } from '@/lib/db';
import { requireInternal } from '@/lib/auth';
import { getSettings, preflightAbuseCheck, callAgent, recordCost } from '@/lib/ai-agent';

const WORKER_BASE = `http://127.0.0.1:${process.env.WA_WORKER_PORT || 3011}`;
const WORKER_TOKEN = process.env.WA_WORKER_TOKEN;

export async function POST(req) {
  const auth = requireInternal(req);
  if (auth instanceof Response) return auth;

  let body; try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { phone, name, content, remote_jid, wa_message_id, message_type = 'text' } = body || {};
  if (!phone || !content) return jsonError('phone & content required', 400);
  const normalized = normalizePhone(phone);

  // Find or create customer
  let customer = await prisma.customer.findUnique({ where: { normalizedPhone: normalized } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: name || `WA ${normalized.slice(-4)}`,
        phone,
        normalizedPhone: normalized,
      },
    });
  }

  // Persist inbound message
  await prisma.waMessage.create({
    data: {
      customer: { connect: { id: customer.id } },
      normalizedPhone: normalized,
      remoteJid: remote_jid || null,
      waMessageId: wa_message_id || null,
      direction: 'in',
      source: 'human',
      messageType: message_type,
      content,
      status: 'received',
    },
  });

  // Refresh customer to get aiEnabled flag
  customer = await prisma.customer.findUnique({ where: { id: customer.id } });

  // AI disabled for this customer — persist inbound but skip AI call
  if (!customer.aiEnabled) {
    return jsonOk({ ok: true, handled: false, reason: 'ai_disabled' });
  }

  // Settings + abuse preflight
  const settings = await getSettings();
  const pre = await preflightAbuseCheck({ customer, message: content, settings });

  if (!pre.allowed) {
    await persistAndSend({ customer, normalized, remote_jid, reply: pre.reply, source: 'system', blocked: true, blockReason: pre.reason });
    return jsonOk({ ok: true, blocked: true, reason: pre.reason });
  }

  // Recent context + services (for system prompt + create_qris_payment validation)
  const recent = await prisma.waMessage.findMany({
    where: { customerId: customer.id },
    orderBy: { sentAt: 'desc' },
    take: 20,
  });
  recent.reverse();
  const services = await prisma.service.findMany({ where: { isActive: true } });

  // ── LLM agent (tool execution loop) ────────────────────────────────
  let reply, escalateInfo, usage, identityUpdate, qrisRequest;
  try {
    const out = await callAgent({ customer, message: content, settings, services, recentMessages: recent });
    reply = out.reply || '';
    escalateInfo = out.escalateInfo;
    identityUpdate = out.identityUpdate;
    qrisRequest = out.qrisRequest;
    usage = out.usage;
  } catch (e) {
    return jsonError('AI call failed', 502, { detail: String(e) });
  }

  await recordCost({ customer, costUsd: usage.costUsd });

  // Apply identity update (if AI parsed name from message)
  if (identityUpdate?.name) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: identityUpdate.name.trim().slice(0, 100),
        ...(identityUpdate.email ? { email: identityUpdate.email.trim().slice(0, 200) } : {}),
        ...(identityUpdate.address ? { address: identityUpdate.address.trim().slice(0, 500) } : {}),
      },
    });
  }

  let alreadySent = false;
  // Execute QRIS payment intent (creates appointment + transaction + sends QR via WA)
  if (qrisRequest && (qrisRequest.service_name || qrisRequest.scheduled_at)) {
    if (!qrisRequest.service_name) {
      reply = `Layanan apa yang mau dipesan kak? ${services.map(s => s.name).join(', ')}.`;
    } else if (!qrisRequest.scheduled_at) {
      reply = `Untuk ${qrisRequest.service_name}, kapan jadwalnya kak? (tanggal & jam)`;
    } else {
      const qrisOutcome = await executeQrisIntent({ customer, normalized, remote_jid, qrisRequest, services, settings });
      if (qrisOutcome.reply) reply = qrisOutcome.reply;
      alreadySent = true;
      // Persist outbound log without re-sending
      await prisma.waMessage.create({
        data: {
          customer: { connect: { id: customer.id } },
          normalizedPhone: normalized,
          remoteJid: remote_jid || null,
          direction: 'out',
          source: 'ai_agent',
          content: reply,
          status: 'sent',
          aiTokensIn: usage?.in,
          aiTokensOut: usage?.out,
          aiCostUsd: usage?.costUsd,
        },
      });
    }
  }

  // Fallback: AI emitted no text and no actionable tool — never leave customer hanging
  if (!reply || !reply.trim()) {
    reply = identityUpdate?.name
      ? `Oke kak ${identityUpdate.name}, ada yang bisa dibantu? Mau lihat layanan atau langsung booking?`
      : `Maaf kak, bisa diulang? Mau booking layanan apa & kapan?`;
  }

  if (escalateInfo || pre.handoffHit) {
    await prisma.handoff.create({
      data: {
        customer: { connect: { id: customer.id } },
        sessionId: `handoff-${normalized}-${Date.now()}`,
        reason: escalateInfo?.reason || `Keyword match: ${pre.handoffHit}`,
        status: 'pending',
      },
    });
  }

  // Empty reply fallback (AI may emit only tool_calls with no text). Skip send if no reply.
  if (!alreadySent && reply && reply.trim()) {
    await persistAndSend({ customer, normalized, remote_jid, reply, source: 'ai_agent', usage });
  }
  return jsonOk({ ok: true, reply, usage });
}

// Build QRIS for the agent: validate service, create appointment+transaction, charge, send QR via WA.
// If qrisPayload stored → generate dynamic QR locally (no Midtrans). Otherwise fallback to Midtrans.
import { toDynamic } from '@/lib/qris';
import QRCode from 'qrcode';

async function executeQrisIntent({ customer, normalized, remote_jid, qrisRequest, services, settings }) {
  const wanted = (qrisRequest.service_name || '').toLowerCase();
  const svc = services.find(s => s.name.toLowerCase() === wanted)
    || services.find(s => s.name.toLowerCase().includes(wanted))
    || services.find(s => wanted.includes(s.name.toLowerCase()));
  if (!svc) {
    const fallback = `Maaf kak, layanan "${qrisRequest.service_name}" belum ada. Layanan tersedia: ${services.map(s => s.name).join(', ')}.`;
    await sendDirect(normalized, remote_jid, fallback);
    return { reply: fallback };
  }
  let when;
  try { when = new Date(qrisRequest.scheduled_at); if (isNaN(when.getTime())) throw 0; }
  catch {
    const m = `Format jadwal belum bener kak. Tolong sebut tanggal & jam (contoh: besok jam 14:00).`;
    await sendDirect(normalized, remote_jid, m);
    return { reply: m };
  }
  const ends = new Date(when.getTime() + svc.durationMinutes * 60_000);
  const partySize = Math.max(1, Math.min(20, parseInt(qrisRequest.party_size, 10) || 1));
  const totalPrice = Number(svc.price) * partySize;
  const apptNotes = [
    qrisRequest.notes || null,
    partySize > 1 ? `Untuk ${partySize} orang` : null,
  ].filter(Boolean).join(' • ') || null;
  const appt = await prisma.appointment.create({
    data: {
      customer: { connect: { id: customer.id } },
      serviceId: svc.id,
      scheduledAt: when,
      endsAt: ends,
      status: 'pending',
      notes: apptNotes,
    },
  });
  const tx = await prisma.transaction.create({
    data: {
      appointmentId: appt.id,
      subtotal: totalPrice,
      total: totalPrice,
      paymentMethod: 'qris',
      status: 'unpaid',
    },
  });

  const fmt = when.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const total = Number(totalPrice).toLocaleString('id-ID');
  const partyLine = partySize > 1 ? `\nJumlah orang: ${partySize} (Rp ${Number(svc.price).toLocaleString('id-ID')} × ${partySize})` : '';

  // ── Dynamic QRIS (local, no Midtrans) ──
  if (settings?.qrisPayload) {
    try {
      const dynamicPayload = toDynamic(settings.qrisPayload, totalPrice);
      const qrBuffer = await QRCode.toBuffer(dynamicPayload, {
        type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M',
      });
      // Send QR as image via worker
      const text = `Booking dicatat ✅\nLayanan: ${svc.name}${partyLine}\nJadwal: ${fmt}\nTotal: Rp ${total}\n\nSilakan scan QRIS di atas untuk membayar.\nBerlaku 15 menit. Setelah dibayar, kakak akan dapat konfirmasi otomatis.`;
      await sendImageDirect(normalized, remote_jid, qrBuffer, text);
      return { reply: text };
    } catch (e) {
      console.error('Dynamic QRIS generate failed, fallback to Midtrans:', e);
      // fall through to Midtrans
    }
  }

  // ── Midtrans fallback ──
  let charge;
  try {
    const { chargeQris } = await import('@/lib/midtrans');
    const res = await chargeQris({ orderId: `TX-${tx.id}-${Date.now()}`, amount: totalPrice });
    charge = res;
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        midtransOrderId: res.orderId,
        midtransTxnId: res.transactionId,
        midtransQrString: res.qrString,
        midtransQrUrl: res.qrUrl,
        midtransExpiresAt: res.expiresAt,
        midtransLastStatus: 'pending',
      },
    });
  } catch (e) {
    const m = `Maaf kak, lagi ada kendala bikin QR pembayaran. Coba lagi sebentar ya.`;
    await sendDirect(normalized, remote_jid, m);
    return { reply: m };
  }
  const text = `Booking dicatat ✅\nLayanan: ${svc.name}${partyLine}\nJadwal: ${fmt}\nTotal: Rp ${total}\n\nSilakan bayar via QRIS:\n${charge.qrUrl}\n\nBerlaku 15 menit. Setelah dibayar, kakak akan dapat konfirmasi otomatis.`;
  await sendDirect(normalized, remote_jid, text);
  return { reply: text };
}

async function sendDirect(phone, remote_jid, content) {
  try {
    await fetch(WORKER_BASE + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({ phone, content, remote_jid: remote_jid || null }),
    });
  } catch {}
}

async function sendImageDirect(phone, remote_jid, imageBuffer, caption) {
  try {
    await fetch(WORKER_BASE + '/send-image', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({
        phone,
        remote_jid: remote_jid || null,
        image: imageBuffer.toString('base64'),
        caption: caption || '',
      }),
    });
  } catch {}
}

async function persistAndSend({ customer, normalized, remote_jid, reply, source, usage, blocked, blockReason }) {
  // Send via worker first to get wa_message_id
  let workerData = {};
  try {
    const r = await fetch(WORKER_BASE + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({ phone: normalized, content: reply, remote_jid: remote_jid || null }),
    });
    if (r.ok) workerData = await r.json();
  } catch {}
  await prisma.waMessage.create({
    data: {
      customer: customer?.id ? { connect: { id: customer.id } } : undefined,
      normalizedPhone: normalized,
      remoteJid: workerData.remote_jid || null,
      waMessageId: workerData.wa_message_id || null,
      direction: 'out',
      source,
      content: reply,
      status: workerData.wa_message_id ? 'sent' : 'failed',
      aiTokensIn: usage?.in,
      aiTokensOut: usage?.out,
      aiCostUsd: usage?.costUsd,
      aiBlocked: !!blocked,
    },
  });
}
