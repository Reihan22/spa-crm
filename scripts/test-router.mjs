#!/usr/bin/env node
// scripts/test-router.mjs — Stress-test the intent router.
// Fires N variations across categories, measures router hit-rate, token cost,
// and dumps fall-through cases for further pattern mining.
//
// Run: APP_INTERNAL_TOKEN=$(grep APP_INTERNAL_TOKEN .env | cut -d'"' -f2) \
//      node scripts/test-router.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '..', '.env');
let APP_INTERNAL_TOKEN = process.env.APP_INTERNAL_TOKEN;
if (!APP_INTERNAL_TOKEN) {
  try {
    const env = readFileSync(envPath, 'utf8');
    const m = env.match(/APP_INTERNAL_TOKEN="([^"]+)"/);
    if (m) APP_INTERNAL_TOKEN = m[1];
  } catch {}
}
if (!APP_INTERNAL_TOKEN) {
  console.error('❌ APP_INTERNAL_TOKEN not found');
  process.exit(1);
}

const URL = process.env.INGEST_URL || 'http://127.0.0.1:3010/api/wa/ingest';

// ── Test corpus ────────────────────────────────────────────────────────────
// Each entry: { category, msgs[], expectRouted, multiTurn?: true }
// multiTurn=true ⇒ uses one phone for the whole array (preserves draft state).
const CASES = [
  // Greetings (independent — fresh phone each)
  { category: 'greet', expectRouted: true, msgs: [
    'halo', 'Halo', 'hi', 'Hai', 'hai kak', 'helo', 'p', 'Hello', 'hei',
    'pagi', 'siang', 'sore', 'malam', 'assalamualaikum', 'Assalamu\'alaikum',
    'salam', 'ping', 'selamat pagi kak',
  ]},
  // Info / list requests
  { category: 'list', expectRouted: true, msgs: [
    'info', 'menu', 'layanan', 'paket', 'treatment', 'harga', 'list',
    'tarif', 'ada apa aja', 'apa aja', 'apa saja', 'service', 'mau lihat menu',
    'info layanan', 'info dong', 'mau info', 'list paket dong', 'kasih menu',
    'apa aja paketnya', 'tarifnya berapa',
  ]},
  // Location
  { category: 'location', expectRouted: true, msgs: [
    'alamat', 'lokasi', 'dimana', 'di mana', 'maps', 'tempat', 'cabang',
    'alamat dimana', 'lokasi dimana kak', 'cabangnya dimana', 'tempatnya dimana',
    'maps nya', 'alamat google maps',
  ]},
  // Hours
  { category: 'hours', expectRouted: true, msgs: [
    'jam buka', 'jam operasional', 'jam tutup', 'buka jam berapa',
    'tutup jam berapa', 'open jam berapa', 'close jam berapa',
  ]},
  // Payment
  { category: 'payment', expectRouted: true, msgs: [
    'transfer kemana', 'cara bayar', 'metode bayar', 'pembayaran',
    'qris', 'rekening', 'bayarnya gimana',
  ]},
  // Hard off-topic
  { category: 'offtopic', expectRouted: true, msgs: [
    'siapa presiden indonesia', 'antek antek asing', 'translate ke english',
    'tolong terjemahkan', 'buatin script python', 'coding js',
    'pr matematika dong', 'esai tentang sejarah', 'guard pid gimana',
    'jelaskan quantum physics',
  ]},
  // Cancel
  { category: 'cancel', expectRouted: true, msgs: [
    'batal', 'batalin', 'cancel', 'gajadi', 'gak jadi', 'ga jadi', 'ndak jadi',
  ]},
  // Slot-fill full (service + date + time in one message)
  { category: 'slotfull', expectRouted: true, msgs: [
    'combo besok jam 2 siang',
    'facial besok jam 10 pagi',
    'pijat lusa jam 14:00',
    'massage besok jam 15.00',
    'scrub 24 mei jam 11 pagi',
    'therapeutic 25/05 jam 13:00',
    'combo 26 mei 2026 jam 4 sore',
    'paket lengkap besok pukul 16:00',
    'yang paling mahal lusa jam 10 pagi',
    'combo besok jam 14',
  ]},
  // Slot-fill: partial then confirm (multi-turn, same phone)
  { category: 'multiturn-confirm', expectRouted: true, multiTurn: true, msgs: [
    'combo besok jam 2 siang', 'iya',
  ]},
  { category: 'multiturn-confirm', expectRouted: true, multiTurn: true, msgs: [
    'facial 26 mei jam 11', 'oke',
  ]},
  { category: 'multiturn-confirm', expectRouted: true, multiTurn: true, msgs: [
    'massage besok jam 15', 'gas',
  ]},
  // Slot-fill: only service (should route a follow-up question, not LLM)
  { category: 'slot-service-only', expectRouted: true, msgs: [
    'combo', 'facial', 'pijat', 'massage', 'scrub', 'paket lengkap',
    'yang paling mahal', 'paling murah',
  ]},
  // Slot-fill: only time (should route follow-up)
  { category: 'slot-time-only', expectRouted: true, msgs: [
    'besok jam 10 pagi', 'lusa jam 14:00', '24 mei jam 11', 'besok pukul 13',
  ]},
  // Genuinely ambiguous — expected fall-through to LLM
  { category: 'ambiguous-llm', expectRouted: false, msgs: [
    'kak aku alergi minyak kelapa, bisa ga ya?',
    'tipe kulit ku berminyak, cocoknya yang mana?',
    'massage nya enak ga?',
    'aman buat ibu hamil ga?',
    'minimal usia berapa boleh treatment?',
    'tempatnya bersih ga sih?',
    'ada promo couple ga?',
    'kalau telat 30 menit gimana?',
  ]},
];

// ── Test runner ────────────────────────────────────────────────────────────
async function fire(phone, msg) {
  const wa_message_id = `STRESS_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  const body = {
    phone, content: msg,
    remoteJid: `${phone}@s.whatsapp.net`,
    wa_message_id,
    sentAt: new Date().toISOString(),
  };
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-token': APP_INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, ms, data };
}

function freshPhone() {
  return '6299' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
}

const results = [];
let total = 0, routed = 0, llmCalled = 0, totalCostUsd = 0, totalMs = 0;
const fallthroughs = [];
const failed = [];

console.log(`🔬 Stress-testing intent router @ ${URL}\n`);

for (const tc of CASES) {
  const phone = tc.multiTurn ? freshPhone() : null;
  for (const msg of tc.msgs) {
    const usePhone = phone || freshPhone();
    const r = await fire(usePhone, msg);
    total++;
    totalMs += r.ms;
    if (r.status !== 200) {
      failed.push({ category: tc.category, msg, status: r.status });
      console.log(`  ❌ ${tc.category}: "${msg}" → HTTP ${r.status}`);
      continue;
    }
    const isRouted = r.data?.routed === true;
    const isBlocked = r.data?.blocked === true;
    const zeroToken = isRouted || isBlocked;
    const tokens = r.data?.usage?.in || 0;
    const cost = r.data?.usage?.costUsd || 0;
    if (zeroToken) routed++;
    else llmCalled++;
    totalCostUsd += cost;
    results.push({
      category: tc.category, msg, routed: zeroToken,
      blocked: isBlocked,
      tokensIn: r.data?.usage?.in || 0,
      tokensOut: r.data?.usage?.out || 0,
      costUsd: cost, ms: r.ms,
    });
    if (!zeroToken && tc.expectRouted) {
      fallthroughs.push({ category: tc.category, msg, reply: r.data?.reply?.slice(0, 120) });
    }
    process.stdout.write(isRouted ? '·' : isBlocked ? 'B' : 'L');
    await new Promise(r => setTimeout(r, 50));
  }
}

console.log('\n');

// ── Report ─────────────────────────────────────────────────────────────────
const byCategory = {};
for (const r of results) {
  if (!byCategory[r.category]) byCategory[r.category] = { total: 0, routed: 0, llm: 0, cost: 0 };
  byCategory[r.category].total++;
  if (r.routed) byCategory[r.category].routed++;
  else byCategory[r.category].llm++;
  byCategory[r.category].cost += r.costUsd;
}

console.log('═══════════════════════════════════════════════════════');
console.log('  ROUTER STRESS TEST REPORT');
console.log('═══════════════════════════════════════════════════════\n');

console.log('Per-category hit rate:');
for (const [cat, s] of Object.entries(byCategory)) {
  const pct = (s.routed / s.total * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(s.routed / s.total * 20));
  console.log(`  ${cat.padEnd(22)} ${bar.padEnd(20)} ${pct}% (${s.routed}/${s.total})  $${s.cost.toFixed(6)}`);
}

console.log('\nOverall:');
console.log(`  Total tests:        ${total}`);
console.log(`  Routed (0 token):   ${routed}  (${(routed / total * 100).toFixed(1)}%)`);
console.log(`  LLM fallback:       ${llmCalled}  (${(llmCalled / total * 100).toFixed(1)}%)`);
console.log(`  Failed (HTTP err):  ${failed.length}`);
console.log(`  Total token cost:   $${totalCostUsd.toFixed(6)}`);
console.log(`  Avg latency:        ${(totalMs / total).toFixed(0)}ms`);
console.log(`  Per-100 msg cost:   $${(totalCostUsd / total * 100).toFixed(4)}`);

if (fallthroughs.length) {
  console.log(`\n⚠️  Unexpected LLM fallthroughs (${fallthroughs.length}):`);
  for (const f of fallthroughs) {
    console.log(`  • [${f.category}] "${f.msg}"`);
    if (f.reply) console.log(`    └─ reply: ${f.reply}`);
  }
  console.log('\n  → Add patterns to lib/intent-router.js to capture these.');
}

if (failed.length) {
  console.log(`\n❌ HTTP failures:`);
  for (const f of failed) console.log(`  • [${f.category}] "${f.msg}" → ${f.status}`);
}
