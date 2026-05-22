// Header doc: Deterministic intent router — handles common cases with 0 LLM tokens.
// Pipeline: classify by regex/keywords + slot-fill from recent msgs. Returns:
//   { handled: true, reply, qrisRequest?, escalateInfo? } when deterministic match,
//   { handled: false }                                   when ambiguous (caller falls back to LLM).
//
// Slot-filling derives draft booking state from recent waMessages instead of a separate table:
//   - service: last bot or user message that mentions an active service name
//   - scheduledAt: last user message containing a parseable date+time
//   - partySize: last user message with "X orang" / digit
//
// Keep this file framework-free; pure functions for easy unit testing.

const TZ_OFFSET_MIN = 7 * 60; // WIB (Asia/Jakarta)

const GREET_RE = /^(p|hai+|halo+|hello+|hi+|hei+|helo+|assalamu?'?alaikum|salam|selamat\s+(pagi|siang|sore|malam)|pagi|siang|sore|malam|ping)\b/i;
const ASK_LIST_RE = /\b(info|menu|layanan|paket|treatment|harga(nya)?|price|list|tarif(nya)?|biaya(nya)?|berapa\s+harga|ada apa aja|apa aja|apa saja|service)\b/i;
const ASK_LOCATION_RE = /\b(alamat|lokasi|dimana|di mana|maps|map|tempat|cabang)\b/i;
const ASK_HOURS_RE = /\b(jam (buka|operasional|tutup)|buka jam|tutup jam|open|close)\b/i;
const ASK_PAYMENT_RE = /\b(transfer kemana|cara bayar|metode bayar|pembayaran|bayar(nya)?|qris|rekening|dp)\b/i;
const CANCEL_RE = /\b(batal(in|kan)?|cancel|gajadi|gak jadi|ga jadi|ndak jadi|tunda)\b/i;
const CONFIRM_RE = /^\s*(iya+|y|ya|yes|sip|oke+|ok+|gas|lanjut|setuju|deal|betul|bener|benar|cocok)\s*[!.?]*$/i;
const NEGATE_RE = /^\s*(ng?gak|nggak|gak|tidak|no|engga+|enggak)\s*[!.?]*$/i;
const OFFTOPIC_HARD = [
  /\b(presiden|pemilu|antek|asing|asink|politik|partai)\b/i,
  /\b(translate|terjemahkan|english|inggris)\b/i,
  /\b(coding|program(ming)?|script|fungsi|function)\b/i,
  /\b(matematika|kalkulus|fisika|physics|quantum|matkul|pr|homework|skripsi|esai|essay)\b/i,
  /\bguard\b.*\bpid\b/i,
];
const PARTY_RE = /\b(\d{1,2})\s*(orang|org|pax|peserta|pasang|couple)\b/i;
const COUPLE_RE = /\b(berdua|couple|pasangan|2 orang|dua orang)\b/i;
const SOLO_RE = /\b(sendiri|solo|1 orang|satu orang)\b/i;

// ── Resolve pattern overrides from settings.patternsJson ──
// Returns merged pattern map. Invalid regex falls back to defaults silently.
function resolvePatterns(patternsJson) {
  const defaults = {
    greet: GREET_RE, ask_list: ASK_LIST_RE, ask_location: ASK_LOCATION_RE,
    ask_hours: ASK_HOURS_RE, ask_payment: ASK_PAYMENT_RE, cancel: CANCEL_RE,
    confirm: CONFIRM_RE, negate: NEGATE_RE, offtopic_hard: OFFTOPIC_HARD,
    party_size: PARTY_RE, couple: COUPLE_RE, solo: SOLO_RE,
  };
  if (!patternsJson || typeof patternsJson !== 'object') return defaults;
  const out = { ...defaults };
  for (const [k, src] of Object.entries(patternsJson)) {
    if (!src || !defaults[k]) continue;
    try {
      out[k] = k === 'offtopic_hard' ? [new RegExp(src, 'i')] : new RegExp(src, 'i');
    } catch { /* invalid → keep default */ }
  }
  return out;
}

// Common Indonesian relative-date keywords.
const REL_DATE = {
  'hari ini': 0, 'sekarang': 0,
  'besok': 1, 'esok': 1,
  'lusa': 2,
  'kemarin': -1,
};

const MONTHS = {
  jan: 0, januari: 0, feb: 1, februari: 1, mar: 2, maret: 2, apr: 3, april: 3,
  mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, agu: 7, agt: 7, agustus: 7,
  sep: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, des: 11, desember: 11,
};

function todayWIB() {
  const now = new Date();
  // shift to WIB then take Y/M/D
  const utc = now.getTime() + (now.getTimezoneOffset() * 60_000);
  const wib = new Date(utc + TZ_OFFSET_MIN * 60_000);
  return { y: wib.getUTCFullYear(), m: wib.getUTCMonth(), d: wib.getUTCDate() };
}

// Build ISO 8601 with +07:00 offset for given Y/M/D + hour:min.
function isoWIB(y, m, d, hh, mm) {
  const pad = n => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+07:00`;
}

// Try to parse a date+time from free text. Returns ISO string or null.
// Requires EXPLICIT time markers — won't match bare digits like "1." in numbered lists.
export function parseDateTime(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const t = todayWIB();
  let y = t.y, m = t.m, d = t.d, hh = null, mm = 0, foundDate = false;

  // 1. Relative date keyword
  for (const [k, off] of Object.entries(REL_DATE)) {
    if (lower.includes(k)) {
      const dt = new Date(Date.UTC(y, m, d + off));
      y = dt.getUTCFullYear(); m = dt.getUTCMonth(); d = dt.getUTCDate();
      foundDate = true;
      break;
    }
  }

  // 2. "DD month [YYYY]"
  const dm = lower.match(/\b(\d{1,2})\s+(jan|januari|feb|februari|mar|maret|apr|april|mei|jun|juni|jul|juli|agu|agt|agustus|sep|september|okt|oktober|nov|november|des|desember)(?:\s+(\d{4}))?\b/i);
  if (dm) {
    d = parseInt(dm[1], 10);
    m = MONTHS[dm[2].toLowerCase()];
    if (dm[3]) y = parseInt(dm[3], 10);
    foundDate = true;
  }

  // 3. "DD/MM[/YYYY]" or "DD-MM[-YYYY]"
  const ds = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (ds && !dm) {
    d = parseInt(ds[1], 10); m = parseInt(ds[2], 10) - 1;
    if (ds[3]) y = parseInt(ds[3], 10);
    if (y < 100) y += 2000;
    foundDate = true;
  }

  // 4. Time — REQUIRE explicit marker:
  //    - "jam HH" / "pukul HH"
  //    - "HH:MM" or "HH.MM" with colon/dot separator
  //    - "HH (pagi|siang|sore|malam)"
  // This prevents bare numbers like "1." in numbered lists from being parsed as 01:00.
  let timeMatch =
    lower.match(/\b(?:jam|pukul)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam)?\b/) ||
    lower.match(/\b(\d{1,2})[:.](\d{2})\s*(pagi|siang|sore|malam)?\b/) ||
    lower.match(/\b(\d{1,2})()\s+(pagi|siang|sore|malam)\b/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const ampm = timeMatch[3];
    if (h >= 1 && h <= 11 && ampm === 'siang') h += (h < 11 ? 12 : 0);
    else if (ampm === 'sore' || ampm === 'malam') h = h < 12 ? h + 12 : h;
    else if (ampm === 'pagi') h = h === 12 ? 0 : h;
    if (h >= 0 && h <= 23) { hh = h; if (timeMatch[2]) mm = parseInt(timeMatch[2], 10) || 0; }
  }

  if (!foundDate && hh === null) return null;
  if (hh === null) hh = 10; // default 10:00 if only date provided
  return isoWIB(y, m, d, hh, mm);
}

// Fuzzy match service name against active list (case-insensitive substring + token overlap).
export function findService(text, services) {
  if (!text || !services?.length) return null;
  const lower = text.toLowerCase();
  // exact substring first
  let hit = services.find(s => lower.includes(s.name.toLowerCase()));
  if (hit) return hit;
  // single-token short-form (e.g. "combo", "facial", "scrub", "massage", "pijat")
  const tokenMap = [
    ['combo', /\bcombo|paket( lengkap| spa)?\b/i],
    ['facial', /\bfacial\b/i],
    ['scrub', /\bscrub|lulur\b/i],
    ['therapeutic', /\btherapeutic|terapi\b/i],
    ['relaxing', /\brelaxing|relax\b/i],
    ['massage', /\bmassage|pijat\b/i],
  ];
  for (const [needle, re] of tokenMap) {
    if (re.test(text)) {
      hit = services.find(s => s.name.toLowerCase().includes(needle));
      if (hit) return hit;
    }
  }
  // pricing intent: "yang paling mahal" / "termurah"
  if (/paling mahal|termahal|sultan|premium|terlengkap/i.test(text)) {
    return [...services].sort((a, b) => Number(b.price) - Number(a.price))[0];
  }
  if (/paling murah|termurah|hemat/i.test(text)) {
    return [...services].sort((a, b) => Number(a.price) - Number(b.price))[0];
  }
  return null;
}

function parsePartySize(text) {
  if (!text) return null;
  if (COUPLE_RE.test(text)) return 2;
  if (SOLO_RE.test(text)) return 1;
  const m = text.match(PARTY_RE);
  if (m) return Math.max(1, Math.min(20, parseInt(m[1], 10)));
  return null;
}

// Walk recent messages newest-first to reconstruct latest draft booking state.
// Ignore bot menu/list replies to avoid matching numbered service lists as actual user intent.
export function reconstructDraft(recentMessages, services) {
  const draft = { service: null, scheduledAt: null, partySize: null, lastBotAsk: null };
  for (const msg of [...recentMessages].reverse()) {
    const text = msg.content || '';
    if (msg.direction === 'out') {
      const t = text.toLowerCase();
      if (!draft.lastBotAsk) {
        if (/jam berapa|kapan/i.test(t)) draft.lastBotAsk = 'time';
        else if (/berapa orang|jumlah orang/i.test(t)) draft.lastBotAsk = 'party';
        else if (/layanan apa|treatment apa|pilih layanan/i.test(t)) draft.lastBotAsk = 'service';
        else if (/setuju|konfirmasi.*lanjut|lanjut bayar/i.test(t)) draft.lastBotAsk = 'confirm_pay';
      }
      // Only parse booking confirmation bot messages, not generic menu lists.
      if (/konfirmasi booking/i.test(t)) {
        if (!draft.service) {
          const svc = findService(text, services);
          if (svc) draft.service = svc;
        }
        if (!draft.scheduledAt) {
          const dt = parseDateTime(text);
          if (dt) draft.scheduledAt = dt;
        }
        if (!draft.partySize) {
          const ps = parsePartySize(text);
          if (ps) draft.partySize = ps;
        }
      }
      continue;
    }
    if (!draft.service) {
      const svc = findService(text, services);
      if (svc) draft.service = svc;
    }
    if (!draft.scheduledAt) {
      const dt = parseDateTime(text);
      if (dt) draft.scheduledAt = dt;
    }
    if (!draft.partySize) {
      const ps = parsePartySize(text);
      if (ps) draft.partySize = ps;
    }
  }
  return draft;
}

function rupiah(n) { return Number(n).toLocaleString('id-ID'); }

function formatServiceList(services) {
  if (!services?.length) return 'Belum ada layanan aktif.';
  return services.map((s, i) => `${i + 1}. ${s.name} — ${s.durationMinutes} mnt, Rp ${rupiah(s.price)}`).join('\n');
}

function formatSchedule(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  } catch { return iso; }
}

// Main entry. settings, services, customer, message, recentMessages all required.
export function routeIntent({ message, settings, services, recentMessages }) {
  const text = (message || '').trim();
  if (!text) return { handled: false };

  // Resolve pattern overrides from settings.patternsJson
  const P = resolvePatterns(settings?.patternsJson);

  // 1. Hard off-topic — refuse without LLM
  for (const re of P.offtopic_hard) {
    if (re.test(text)) return { handled: true, reply: settings.aiOffTopicReply || 'Maaf, saya hanya bantu seputar layanan & booking ya.' };
  }

  // 2. Cancel intent → escalate to human
  if (P.cancel.test(text)) {
    return {
      handled: true,
      reply: 'Oke kak, dicatat ya. Staff kami akan bantu konfirmasi sebentar.',
      escalateInfo: { reason: 'Customer cancel/batal request', keyword: 'cancel' },
    };
  }

  // 3. Location / hours / payment quick FAQ
  if (P.ask_location.test(text)) {
    const addr = settings.businessAddress || 'Alamat akan dikirim staff sebentar ya.';
    return { handled: true, reply: `📍 Lokasi: ${addr}` };
  }
  if (P.ask_hours.test(text)) {
    const hours = settings.businessHours || 'Senin–Minggu, 09:00–21:00 WIB';
    return { handled: true, reply: `🕐 Jam buka: ${hours}` };
  }
  if (P.ask_payment.test(text)) {
    const pay = settings.bookingPaymentInstructions || 'Pembayaran via QRIS, link akan dikirim setelah booking dikonfirmasi.';
    return { handled: true, reply: pay };
  }

  // 4. Greeting + ask-list → unified menu reply
  const isGreet = P.greet.test(text);
  const isList = P.ask_list.test(text);
  if (isGreet || isList) {
    const list = formatServiceList(services);
    const greet = isGreet ? `Halo kak! 👋\n\n` : '';
    return {
      handled: true,
      reply: `${greet}Berikut layanan ${settings.businessName || 'kami'}:\n${list}\n\nMau pilih yang mana? Sebut nama layanan + tanggal & jam ya.`,
    };
  }

  // 5. Slot-fill booking flow
  const draft = reconstructDraft(recentMessages, services);
  // Update draft from current message
  const svcNow = findService(text, services);
  if (svcNow) draft.service = svcNow;
  const dtNow = parseDateTime(text);
  if (dtNow) draft.scheduledAt = dtNow;
  const psNow = parsePartySize(text);
  if (psNow) draft.partySize = psNow;

  // Confirmation handling — only meaningful if we have a pending ask
  if (P.confirm.test(text)) {
    if (draft.service && draft.scheduledAt) {
      // proceed to QRIS
      return {
        handled: true,
        qrisRequest: {
          service_name: draft.service.name,
          scheduled_at: draft.scheduledAt,
          party_size: draft.partySize || 1,
        },
      };
    }
    if (draft.service && !draft.scheduledAt) {
      return { handled: true, reply: `Sip kak ${draft.service.name}. Mau tanggal & jam berapa?` };
    }
    // generic ack — drop into menu
    const list = formatServiceList(services);
    return { handled: true, reply: `Mantap kak. Mau pilih layanan apa nih?\n${list}` };
  }
  if (P.negate.test(text)) {
    return { handled: true, reply: 'Oke kak, mau lihat opsi lain atau ada yang bisa dibantu?' };
  }

  // If user gave new info (service / date / party) — advance the flow
  const gaveSomething = svcNow || dtNow || psNow;
  if (gaveSomething) {
    if (draft.service && draft.scheduledAt) {
      const total = Number(draft.service.price) * (draft.partySize || 1);
      const partyLine = (draft.partySize || 1) > 1
        ? `\nJumlah orang: ${draft.partySize} (Rp ${rupiah(draft.service.price)} × ${draft.partySize})`
        : '';
      return {
        handled: true,
        reply: `Konfirmasi booking ya kak:\nLayanan: ${draft.service.name}${partyLine}\nJadwal: ${formatSchedule(draft.scheduledAt)}\nTotal: Rp ${rupiah(total)}\n\nLanjut bayar? Balas "iya" untuk dapat QRIS.`,
      };
    }
    if (draft.service && !draft.scheduledAt) {
      return { handled: true, reply: `Mantap kak ${draft.service.name} (Rp ${rupiah(draft.service.price)}). Mau tanggal & jam berapa?` };
    }
    if (!draft.service && draft.scheduledAt) {
      const list = formatServiceList(services);
      return { handled: true, reply: `Oke jadwalnya ${formatSchedule(draft.scheduledAt)}. Mau layanan apa kak?\n${list}` };
    }
  }

  // 6. Genuinely ambiguous → fall through to LLM
  return { handled: false };
}

export default routeIntent;
