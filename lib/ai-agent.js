// Header doc: AI agent — OpenAI-compatible client targeting 9router GG
// Implements abuse prevention layers BEFORE calling LLM:
//   1. Daily message count cap per phone
//   2. Daily token cost cap per phone
//   3. Global daily budget cap
//   4. Pre-filter regex (off-topic patterns)
//   5. Length cap on input
//   6. Customer mute window
// LLM uses function calling with tool execution loop:
//   - FAQ tools (get_services, get_location, get_hours, get_payment) query DB → return formatted data
//   - Action tools (create_qris_payment, escalate_to_human, set_customer_identity) trigger side effects
//   - Loop continues until LLM produces a text reply (no more tool calls)

import OpenAI from 'openai';
import { prisma } from './db.js';

const ABUSE_PATTERNS = [
  /\b(translate|terjemahkan ke (english|inggris|chinese|korea))\b/i,
  /\b(write|tulis|buatkan)\s+(essay|esai|artikel|skripsi|tugas|paper|cerita)\b/i,
  /\b(code|coding|program|script|fungsi|function)\b/i,
  /\b(matematika|kalkulus|fisika|kimia|matkul|pr|homework)\b/i,
  /\b(jelaskan|explain)\s+(quantum|relativity|filsafat|sejarah dunia)\b/i,
];

const INPUT_HARD_CAP = 800; // characters

function todayResetNeeded(lastResetAt) {
  if (!lastResetAt) return true;
  const last = new Date(lastResetAt);
  const now = new Date();
  return last.getUTCFullYear() !== now.getUTCFullYear()
    || last.getUTCMonth() !== now.getUTCMonth()
    || last.getUTCDate() !== now.getUTCDate();
}

export async function getSettings() {
  let s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await prisma.settings.create({ data: { id: 1 } });
  }
  return s;
}

export async function preflightAbuseCheck({ customer, message, settings }) {
  // 1. Mute window
  if (customer?.mutedUntil && customer.mutedUntil > new Date()) {
    return { allowed: false, reason: 'muted', reply: settings.aiOffTopicReply };
  }

  // 2. Reset daily counters if needed
  if (customer && todayResetNeeded(customer.lastResetAt)) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { dailyMessageCount: 0, dailyTokenCost: 0, lastResetAt: new Date() },
    });
    customer.dailyMessageCount = 0;
    customer.dailyTokenCost = 0;
  }
  if (todayResetNeeded(settings.globalCostResetAt)) {
    await prisma.settings.update({
      where: { id: 1 },
      data: { globalDailyCost: 0, globalCostResetAt: new Date() },
    });
    settings.globalDailyCost = 0;
  }

  // 3. Per-phone message cap
  if (customer && customer.dailyMessageCount >= settings.abuseDailyMsgPerPhone) {
    return { allowed: false, reason: 'rate_limit_msg', reply: 'Pesan harian sudah mencapai batas. Silakan hubungi staff langsung ya.' };
  }

  // 4. Per-phone cost cap
  if (customer && customer.dailyTokenCost >= settings.abuseDailyCostPerPhone) {
    return { allowed: false, reason: 'rate_limit_cost', reply: 'Maaf, sesi otomatis hari ini sudah penuh. Staff akan bantu via balas manual.' };
  }

  // 5. Global budget
  if (settings.globalDailyCost >= settings.abuseGlobalDailyBudget) {
    return { allowed: false, reason: 'global_budget', reply: settings.aiOffTopicReply };
  }

  // 6. Length cap
  if (message.length > INPUT_HARD_CAP) {
    return { allowed: false, reason: 'too_long', reply: 'Pesan terlalu panjang. Tolong ringkas atau langsung sebut layanan yang ditanyakan ya.' };
  }

  // 7. Pre-filter regex
  for (const re of ABUSE_PATTERNS) {
    if (re.test(message)) {
      // Increment abuse flag
      if (customer) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { abuseFlags: { increment: 1 } },
        });
        if (customer.abuseFlags + 1 >= settings.abuseFlagThreshold) {
          // mute 1 hour and create handoff
          const muteUntil = new Date(Date.now() + 60 * 60 * 1000);
          await prisma.customer.update({ where: { id: customer.id }, data: { mutedUntil: muteUntil } });
          await prisma.handoff.create({
            data: {
              customer: { connect: { id: customer.id } },
              normalizedPhone: customer.normalizedPhone,
              reason: 'Repeated off-topic / abuse pattern',
              triggerKeyword: 'abuse_filter',
              status: 'pending',
            },
          });
        }
      }
      return { allowed: false, reason: 'off_topic_pattern', reply: settings.aiOffTopicReply };
    }
  }

  // 8. Handoff keywords (medical/refund/complaint) — allow LLM to know but flag
  const handoffHit = (settings.aiHandoffKeywords || []).find(k => message.toLowerCase().includes(k.toLowerCase()));
  return { allowed: true, handoffHit: handoffHit || null };
}

export async function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL,
  });
}

// ── Tool definitions ──────────────────────────────────────────────────
function getToolDefs() {
  return [
    {
      type: 'function',
      function: {
        name: 'get_location',
        description: 'Ambil alamat, nomor telepon, dan link Google Maps bisnis.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_hours',
        description: 'Ambil informasi jam operasional bisnis.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_payment',
        description: 'Ambil informasi metode pembayaran dan instruksi bayar.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'escalate_to_human',
        description: 'Escalate when medical, complaint, refund, or off-policy issue arises',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            keyword: { type: 'string' },
          },
          required: ['reason'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_customer_identity',
        description: 'Save or update customer identity. Use when customer first introduces themselves OR confirms/corrects their existing name.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full name customer provided' },
            email: { type: 'string', description: 'Optional email if mentioned' },
            address: { type: 'string', description: 'Optional address if mentioned' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_qris_payment',
        description: 'Create appointment + transaction and generate QRIS payment. Use ONLY when customer confirms they want to proceed to payment for a specific service & time.',
        parameters: {
          type: 'object',
          properties: {
            service_name: { type: 'string', description: 'Exact service name from LAYANAN AKTIF' },
            scheduled_at: { type: 'string', description: 'ISO 8601 datetime, e.g. 2026-05-23T10:00:00+07:00' },
            party_size: { type: 'integer', description: 'Jumlah orang/peserta. Default 1 jika tidak disebut.', minimum: 1 },
            notes: { type: 'string' },
          },
          required: ['service_name', 'scheduled_at'],
        },
      },
    },
  ];
}

// ── Execute a single tool call and return the result string ───────────
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'get_location': {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        return JSON.stringify({
          address: settings?.address || null,
          phone: settings?.phone || null,
          waNumber: settings?.waNumber || null,
          googleMapsLink: settings?.address ? `https://maps.google.com/?q=${encodeURIComponent(settings.address)}` : null,
        });
      }

      case 'get_hours': {
        // Hours not in DB yet — return standard from aiKnowledgeBase or default
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        return settings?.aiKnowledgeBase?.match(/jam\s*(operasional|buka|kerja)[^\n]*/i)?.[0]
          || 'Senin–Sabtu 09:00–21:00, Minggu tutup. Untuk jam pasti, silakan tanya staff.';
      }

      case 'get_payment': {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        return JSON.stringify({
          instructions: settings?.bookingPaymentInstructions || 'Hubungi staff untuk info pembayaran.',
          qrisImageUrl: settings?.qrisImageUrl || null,
        });
      }

      default:
        return null; // not a data tool — handled elsewhere
    }
  } catch (e) {
    return `Error mengambil data: ${e.message}`;
  }
}

// ── Build context-aware system prompt (lighter — data via tools) ──────
export function buildSystemPrompt(settings, services, customer) {
  const serviceList = services.map(s => {
    const cat = s.category ? `[${s.category}] ` : '';
    const desc = s.description ? ` — ${s.description}` : '';
    return `- ${cat}${s.name} — ${s.durationMinutes} menit — Rp ${Number(s.price).toLocaleString('id-ID')}${desc}`;
  }).join('\n');
  return `Kamu adalah CS resmi ${settings.businessName}.
TUGAS: bantu customer seputar layanan, harga, jadwal, booking, reschedule, pembayaran, dan lokasi.
DILARANG: jawab di luar topik bisnis (translate, coding, tugas sekolah, esai, dll). Jika di luar topik, jawab persis: "${settings.aiOffTopicReply}"
GAYA: ramah, singkat, bahasa Indonesia sopan (pakai "kak/Anda", JANGAN pernah pakai lu/gue/gw). Maksimal 4 kalimat per balasan.
FORMAT: WhatsApp — pakai *teks* untuk bold (1 asterisk), JANGAN pakai **teks** (2 asterisk). Jangan pakai markdown lain.

ATURAN PENTING:
- JANGAN sapa ulang setiap balasan ("halo kak X, masih atas nama ini ya?"). Sapa cuma sekali di awal percakapan.
- JANGAN tanya nama/identitas — tidak perlu validasi nama.
- JANGAN reset thread booking. Kalau customer sudah sebut layanan/tanggal/jam di pesan sebelumnya, INGAT dan lanjutkan dari situ.
- Kalau customer bingung soal jam (misal "1 pagi" → klarifikasi "siang?"), dan dia konfirmasi "iya/betul", LANGSUNG lanjut ke step berikutnya (jumlah orang atau bayar), JANGAN tanya ulang.

TOOLS: Panggil get_location untuk alamat/maps. Panggil get_hours untuk jam buka. Panggil get_payment untuk info pembayaran.

LAYANAN AKTIF:
${serviceList || '(belum ada)'}

PANDUAN:
${settings.aiKnowledgeBase || ''}

ATURAN SAFETY:
${settings.aiSafetyRules || ''}

ALUR BOOKING + BAYAR:
1. Tanya layanan + tanggal/jam + JUMLAH ORANG (default 1). Konfirmasi total harga.
2. Begitu semua info lengkap dan customer setuju, LANGSUNG panggil tool create_qris_payment dengan service_name (sesuai LAYANAN AKTIF), scheduled_at (ISO 8601, contoh 2026-05-24T13:00:00+07:00), dan party_size. Total = harga × party_size. Sistem auto-kirim QR ke customer.
3. Jangan kirim teks tambahan setelah panggil tool — sistem yang kirim instruksi pembayaran. Cukup balas singkat "Oke kak, sebentar ya" atau kosong.

ESCALATE_TO_HUMAN: kalau customer sebut keyword medis/komplain/refund, panggil tool escalate_to_human. Setelah itu jawab: "Oke, kakak akan dibantu staff kami sebentar ya."`;
}

// ── Main agent call with tool execution loop ──────────────────────────
const MAX_TOOL_ROUNDS = 5; // safety cap

export async function callAgent({ customer, message, settings, services, recentMessages }) {
  const openai = await getOpenAI();
  const system = buildSystemPrompt(settings, services, customer);
  const messages = [
    { role: 'system', content: system },
    ...recentMessages.slice(-20).map(m => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];
  const tools = getToolDefs();

  let totalIn = 0, totalOut = 0;
  let reply = '', escalateInfo = null, identityUpdate = null, qrisRequest = null;
  const t0 = Date.now();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await openai.chat.completions.create({
      model: process.env.AI_MODEL || settings.aiModel || 'GG',
      messages,
      tools,
      max_tokens: settings.aiMaxOutputTokens || 300,
      temperature: 0.4,
    });

    const usage = resp.usage || {};
    totalIn += usage.prompt_tokens || 0;
    totalOut += usage.completion_tokens || 0;

    const choice = resp.choices?.[0];
    const msg = choice?.message;
    const toolCalls = msg?.tool_calls || [];

    // Collect text from this round (may be empty if only tool calls)
    if (msg?.content) reply = msg.content;

    // No tool calls → done
    if (!toolCalls.length) break;

    // Add assistant message (with tool_calls) to conversation
    messages.push(msg);

    // Execute each tool
    for (const tc of toolCalls) {
      const fn = tc.function;
      const name = fn.name;
      let args = {};
      try { args = JSON.parse(fn.arguments || '{}'); } catch {}

      // Action tools — record intent, don't return data
      if (name === 'escalate_to_human') {
        escalateInfo = args;
      } else if (name === 'set_customer_identity') {
        identityUpdate = args;
      } else if (name === 'create_qris_payment') {
        qrisRequest = args;
      }

      // Data tools — query DB
      const result = await executeTool(name, args);

      // Add tool result to conversation
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result || `Tool ${name} executed.`,
      });
    }
  }

  const ms = Date.now() - t0;
  const costUsd = (totalIn * 0.5 + totalOut * 1.5) / 1_000_000;

  return {
    reply,
    escalateInfo,
    identityUpdate,
    qrisRequest,
    usage: { in: totalIn, out: totalOut, costUsd, ms },
  };
}

export async function recordCost({ customer, costUsd }) {
  if (customer) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        dailyMessageCount: { increment: 1 },
        dailyTokenCost: { increment: costUsd },
      },
    });
  }
  await prisma.settings.update({
    where: { id: 1 },
    data: { globalDailyCost: { increment: costUsd } },
  });
}
