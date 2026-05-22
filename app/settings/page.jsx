'use client';
import { useEffect, useState } from 'react';
import { AuthGuard, Shell, Card, Btn, Input, Textarea, Select, Badge } from '@/components/Shell';
import { api } from '@/lib/client';
import { BookOpen, ShieldCheck, MessageSquare, X, Code, ChevronDown } from 'lucide-react';

function maskUrl(url) {
  if (!url) return '';
  try { const u = new URL(url); return u.protocol + '//******' + u.pathname + u.search + u.hash; }
  catch { return 'http://******'; }
}

const TABS = ['Bisnis', 'AI Agent', 'Abuse Prevention', 'Pengguna'];

export default function SettingsPage() { return <AuthGuard><Shell title="Pengaturan"><Body /></Shell></AuthGuard>; }

function Body() {
  const [tab, setTab] = useState('Bisnis');
  return <div className="space-y-4">
    <Card>
      <div className="flex gap-2 text-sm overflow-x-auto">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-xl font-medium transition ${tab === t ? 'bg-primary text-white' : 'bg-cream text-muted hover:bg-blush'}`}>{t}</button>)}
      </div>
    </Card>
    {tab !== 'Pengguna' ? <SettingsForm tab={tab} /> : <UsersTab />}
  </div>;
}

/* ── Chip input: comma-separated list with removable tags ── */
function ChipInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const chips = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : []);
  function addChip(v) { const t = v.trim(); if (t && !chips.includes(t)) { onChange([...chips, t]); setInput(''); } }
  function removeChip(i) { onChange(chips.filter((_, idx) => idx !== i)); }
  return (
    <div className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus-within:border-primary min-h-[42px] flex flex-wrap gap-1.5 items-center">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blush text-primary text-xs font-medium rounded-full">
          {c}
          <button type="button" onClick={() => removeChip(i)} className="hover:text-rose-600 transition"><X className="w-3 h-3" /></button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(input); } }} placeholder={chips.length ? '' : placeholder} className="flex-1 min-w-[120px] outline-none text-sm bg-transparent" />
    </div>
  );
}

/* ── Field wrapper with label, hint, counter ── */
function Field({ label, hint, children, className = '' }) {
  return <div className={className}><label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">{label}</label>{children}{hint && <p className="text-[11px] text-muted mt-1 leading-relaxed">{hint}</p>}</div>;
}

/* ── Intent Router Pattern Groups ── */
const PATTERN_GROUPS = [
  { key: 'greet', label: 'Salam', desc: 'Sapaan masuk', hint: 'hi, halo, selamat pagi, hey, helo', re: '\\b(hi+|hey+|halo+|helo+|hei+|woi+|woy+|bro+|sis+|kak+|bang+|mas+|mba+|min+|admin+|cs+|minsan+|selamat\\s+(pagi|siang|sore|malam))\\b' },
  { key: 'ask_list', label: 'Tanya Layanan/Harga', desc: 'Minta daftar menu atau harga', hint: 'harga, menu, daftar, tarif, biaya', re: '\\b(harga(nya)?|menu(nya)?|daftar|paket|tarif(nya)?|biaya(nya)?|price|list|catalog|katalog|promo|diskon|layanan|service|treatment|apa\\s+saja|ada\\s+apa)\\b' },
  { key: 'ask_location', label: 'Tanya Lokasi', desc: 'Minta alamat atau lokasi', hint: 'alamat, lokasi, maps, dimana', re: '\\b(alamat|lokasi|maps|dimana|di\\s+mana|location|address|google\\s*maps|gmaps|petanya?n|arah|route|navigasi)\\b' },
  { key: 'ask_hours', label: 'Tanya Jam Buka', desc: 'Jam operasional', hint: 'jam, buka, tutup, operasional', re: '\\b(jam|buka|tutup|operasional|jam\\s*berapa|kapan\\s*buka|open|close|jam\\s*kerja|jam\\s*operasional|hari\\s*apa)\\b' },
  { key: 'ask_payment', label: 'Tanya Pembayaran', desc: 'Metode bayar, QRIS, transfer', hint: 'bayar, qris, transfer, payment', re: '\\b(bayar|pembayaran|payment|qris|transfer|tf|bca|mandiri|bni|bri|ovo|gopay|dana|shopeepay|cash|tunai|kartu|debit|kredit|credit|card|e-wallet|ewallet)\\b' },
  { key: 'cancel', label: 'Pembatalan', desc: 'Customer mau cancel', hint: 'batal, cancel, gajadi', re: '\\b(batal(cancel)?kan?|cancel|gak\\s*jadi|ga\\s*jadi|tidak\\s*jadi|urungkan?|cabut|refund|uang\\s*kembali|ganti\\s*jadwal|reschedule|tunda|tukar|tuker|pindah\\s*tanggal|pindah\\s*waktu)\\b' },
  { key: 'confirm', label: 'Konfirmasi', desc: 'Ya, setuju, oke', hint: 'ya, ok, setuju, booking', re: '^(ya+|iya+|ok+|oke+|siap|setuju|deal|mau|booking|pesan|order|fix|mantap|sip|baik|baiklah|noted|yes|yoi|yup+|betul|bener|benar|lanjut|gas|gasss|gaskeun)$' },
  { key: 'negate', label: 'Penolakan', desc: 'Tidak, batal, nanti', hint: 'tidak, nanti, skip', re: '^(tidak|tdk|ga|gak|nggak|enggak|nope|skip|nanti|besok|lain\\s*kali|belum|batal|cancel)$' },
  { key: 'offtopic_hard', label: 'Off-Topic (Hard Block)', desc: 'Topik ga relevan — langsung blokir', hint: 'translate, cuaca, coding, berita', re: '\\b(translate|terjemah|cuaca|weather|nonton|film|anime|manga|berita|news|politik|politik|crypto|bitcoin|saham|coding|program|skripsi|tugas|matematika|math|sejarah|geografi|agama|prediksi|ramal|zodiak|horoskop|bola|sepak|football|game|gaming|musik|lagu|lyrics|lirik|resep|masak|cook|recipe)\\b' },
  { key: 'party_size', label: 'Jumlah Orang', desc: 'Berapa orang / couple / solo', hint: 'berapa orang, couple, berdua', re: '\\b(\\d+\\s*orang|berapa\\s*orang|couple|berdua|bertiga|berempat|solo|sendiri|single|dua\\s*orang|tiga\\s*orang|empat\\s*orang|lima\\s*orang|rame-rame|rombongan|keluarga|family|ibu\\s*dan\\s*anak|bapak\\s*dan\\s*anak|mother\\s*and\\s*baby|mom\\s*and\\s*baby|1\\s*orang|2\\s*orang|3\\s*orang|4\\s*orang|5\\s*orang|untuk\\s*\\d+)\\b' },
  { key: 'service_aliases', label: 'Nama Layanan', desc: 'Nama spesifik treatment', hint: 'swedish, scrub, facial, baby spa', re: '\\b(swedish|tradisional|body\\s*scrub|scrub|facial|lulur|pijat|massage|cream\\s*bath|sauna|refleksi|reflexology|totok\\s*wajah|ear\\s*candle|masker|mask|hair\\s*spa|hair\\s*treatment|manicure|pedicure|nail\\s*art|waxing|bleaching|slimming|stretching|baby\\s*spa|baby\\s*massage|kids\\s*spa|kids\\s*massage|ibu\\s*hamil|pregnancy\\s*spa|post\\s*natal|pasca\\s*melahirkan|prenatal|postnatal|detox|relax|relaksasi|therapeutic|terapi)\\b' },
  { key: 'time_parser', label: 'Waktu & Tanggal', desc: 'Deteksi jam/tanggal dalam pesan', hint: 'jam 2, besok pagi, hari senin', re: '\\b(jam\\s*\\d{1,2}(:\\d{2})?(\\s*(pagi|siang|sore|malam|am|pm))?|pukul\\s*\\d{1,2}(:\\d{2})?|\\d{1,2}\\s*(pagi|siang|sore|malam|am|pm)|besok|lusa|hari\\s*ini|nanti\\s*siang|nanti\\s*sore|senin|selasa|rabu|kamis|jumat|sabtu|minggu|tanggal\\s*\\d{1,2}|\\d{1,2}\\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec))\\b' },
];

function PatternEditor({ patterns, onChange }) {
  const [openKey, setOpenKey] = useState(null);
  const p = patterns || {};
  return <div className="space-y-2">
    {PATTERN_GROUPS.map(g => {
      const isOpen = openKey === g.key;
      const val = p[g.key] || g.re;
      return <div key={g.key} className="border border-blush rounded-xl overflow-hidden">
        <button type="button" onClick={() => setOpenKey(isOpen ? null : g.key)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-cream/50 hover:bg-blush/50 transition text-left">
          <div className="flex items-center gap-2">
            <Code className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-ink">{g.label}</span>
            <span className="text-[11px] text-muted">— {g.desc}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted transition ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="px-4 py-3 space-y-2 bg-white">
          <p className="text-[11px] text-muted">Keyword contoh: <span className="text-ink/70">{g.hint}</span></p>
          <textarea value={val} onChange={e => onChange({ ...p, [g.key]: e.target.value })}
            className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-xs font-mono leading-relaxed focus:border-primary focus:ring-0 outline-none resize-y" rows={3} spellCheck={false} />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted">{val.length} chars</span>
            {val !== g.re && <button type="button" onClick={() => { const n = { ...p }; delete n[g.key]; onChange(n); }}
              className="text-[10px] text-rose-500 hover:text-rose-700 transition">Reset ke default</button>}
          </div>
        </div>}
      </div>;
    })}
  </div>;
}

function SettingsForm({ tab }) {
  const [s, setS] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => { (async () => setS(await api('/api/settings')))(); }, []);
  function set(k, v) { setS(o => ({ ...o, [k]: v })); }
  async function save() { setBusy(true); setMsg(''); try { const r = await api('/api/settings', { method: 'PATCH', body: JSON.stringify(s) }); setS(r); setMsg('Tersimpan.'); } catch (e) { setMsg(e.message); } finally { setBusy(false); } }
  if (!s) return <Card><p className="text-muted">Memuat…</p></Card>;

  return <Card>
    <div className="space-y-6 max-w-4xl">
      {/* ── BISNIS ── */}
      {tab === 'Bisnis' && <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nama bisnis"><Input value={s.businessName || ''} onChange={e => set('businessName', e.target.value)} /></Field>
          <Field label="Nomor WA" hint="Format: 628xxx"><Input value={s.waNumber || ''} onChange={e => set('waNumber', e.target.value)} /></Field>
          <Field label="Telepon"><Input value={s.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={s.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Alamat" className="md:col-span-2"><Input value={s.address || ''} onChange={e => set('address', e.target.value)} /></Field>
        </div>
        <div className="border-t border-blush" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="URL QRIS" hint="Gambar QR statis (opsional kalau pakai Midtrans)"><Input value={s.qrisImageUrl || ''} onChange={e => set('qrisImageUrl', e.target.value)} /></Field>
          <Field label="Expiry DP (menit)" hint="Berapa menit booking menunggu pembayaran"><Input type="number" value={s.pendingPaymentExpiryMinutes || 0} onChange={e => set('pendingPaymentExpiryMinutes', +e.target.value)} /></Field>
          <Field label="Instruksi pembayaran" hint="Tampil di chat WA saat AI kasih tagihan" className="md:col-span-2">
            <Textarea rows={3} value={s.bookingPaymentInstructions || ''} onChange={e => set('bookingPaymentInstructions', e.target.value)} />
          </Field>
        </div>
      </>}

      {/* ── AI AGENT ── */}
      {tab === 'AI Agent' && <>
        {/* Model & URL */}
        <section>
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wide mb-3 flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-blush grid place-items-center"><span className="text-[10px]">🤖</span></div>
            Model & Koneksi
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Model" hint="Nama model LLM (contoh: gpt-4o-mini, GG/model)">
              <Input value={s.aiModel || ''} onChange={e => set('aiModel', e.target.value)} />
            </Field>
            <Field label="Base URL" hint="Endpoint API — IP disembunyikan untuk keamanan">
              <div className="flex gap-2">
                {s._editUrl
                  ? <Input value={s.aiBaseUrl || ''} onChange={e => set('aiBaseUrl', e.target.value)} className="font-mono text-xs flex-1" autoFocus />
                  : <Input value={maskUrl(s.aiBaseUrl || '')} disabled className="font-mono text-xs bg-cream cursor-not-allowed opacity-70 flex-1" />}
                <button type="button" onClick={() => setS(o => ({ ...o, _editUrl: !o._editUrl }))} className="px-3 py-2 rounded-xl text-xs font-medium bg-cream text-muted hover:bg-blush transition shrink-0">
                  {s._editUrl ? 'Tutup' : 'Ubah'}
                </button>
              </div>
            </Field>
            <Field label="Max output tokens" hint="Batas panjang jawaban AI (default 300)">
              <Input type="number" value={s.aiMaxOutputTokens || 300} onChange={e => set('aiMaxOutputTokens', +e.target.value)} className="max-w-[160px]" />
            </Field>
          </div>
        </section>

        <div className="border-t border-blush" />

        {/* Knowledge base */}
        <section>
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wide mb-1 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" /> Knowledge Base
          </h3>
          <p className="text-[11px] text-muted mb-3">Ini yang AI tahu tentang bisnis lu. Tulis natural aja — SOP, harga, menu, kebijakan, jam operasional, dll. Semakin detail, semakin akurat jawaban AI.</p>
          <Field label="SOP, layanan, harga, kebijakan" hint={`${(s.aiKnowledgeBase || '').length} karakter · ~${Math.ceil((s.aiKnowledgeBase || '').length / 4)} tokens`}>
            <Textarea rows={10} value={s.aiKnowledgeBase || ''} onChange={e => set('aiKnowledgeBase', e.target.value)}
              className="font-mono text-xs leading-relaxed" placeholder={"Contoh:\nRspa buka setiap hari 10:00-22:00\n\nLayanan & harga:\n- Swedish Massage 60min: Rp150.000\n- Body Scrub 45min: Rp120.00n- Couple Package 90min: Rp350.000\n\nKebijakan:\n- Booking minimal 1 jam sebelum jadwal\n- DP 50% via QRIS\n- Pembatalan <2 jam sebelum = DP hangus"} />
          </Field>
        </section>

        <div className="border-t border-blush" />

        {/* Safety & Behavior */}
        <section>
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wide mb-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Safety & Perilaku
          </h3>
          <p className="text-[11px] text-muted mb-3">Atur batasan AI — apa yang boleh dan ga boleh dilakukan.</p>

          <div className="space-y-4">
            <Field label="Safety rules" hint="Rules yang AI WAJIB ikutin. Satu rule per baris.">
              <Textarea rows={5} value={s.aiSafetyRules || ''} onChange={e => set('aiSafetyRules', e.target.value)}
                className="font-mono text-xs leading-relaxed" placeholder={"Contoh:\n- Jangan kasih saran medis/obat\n- Jangan janji hasil treatment\n- Jangan kasih diskon tanpa izin admin\n- Selalu sarankan konsultasi terapis untuk keluhan kesehatan"} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Topik diizinkan" hint="Topik yang AI boleh jawab. Selain ini = tolak. Tekan Enter atau koma untuk tambah.">
                <ChipInput value={s.aiAllowedTopics || ''} onChange={v => set('aiAllowedTopics', v)} placeholder="spa, massage, harga, booking…" />
              </Field>
              <Field label="Keyword handoff" hint="Kalau customer ketik ini, langsung panggil admin.">
                <ChipInput value={s.aiHandoffKeywords || ''} onChange={v => set('aiHandoffKeywords', v)} placeholder="admin, manusia, sambungkan…" />
              </Field>
            </div>

            <Field label="Reply off-topic" hint="Pesan yang AI kirim kalau topiknya ga relevan." className="md:col-span-2">
              <Textarea rows={2} value={s.aiOffTopicReply || ''} onChange={e => set('aiOffTopicReply', e.target.value)}
                placeholder="Maaf, saya hanya bisa bantu info seputar layanan spa kami 😊" />
            </Field>
          </div>
        </section>

        {/* Preview: Knowledge base as rendered */}
        <div className="border-t border-blush" />

        {/* Intent Router Regex */}
        <section>
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wide mb-1 flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" /> Intent Router (Regex)
          </h3>
          <p className="text-[11px] text-muted mb-3">Pattern matching yang handle ~95% pesan tanpa AI (zero-token, ~50ms). Edit regex kalau mau tambah/ubah keyword. Reset buat balikin default.</p>
          <PatternEditor patterns={s.patternsJson || {}} onChange={v => set('patternsJson', v)} />
        </section>

        {s.aiKnowledgeBase && <>
          <div className="border-t border-blush" />
          <section>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Preview Knowledge Base</h3>
            <div className="bg-cream/60 border border-blush rounded-xl p-4 text-xs text-ink/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {s.aiKnowledgeBase}
            </div>
          </section>
        </>}
      </>}

      {/* ── ABUSE PREVENTION ── */}
      {tab === 'Abuse Prevention' && <>
        <p className="text-[11px] text-muted">Batas pemakaian AI per nomor & global buat cegah abuse/spam.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Pesan/hari per nomor" hint="Max chat per nomor per hari"><Input type="number" value={s.abuseDailyMsgPerPhone || 30} onChange={e => set('abuseDailyMsgPerPhone', +e.target.value)} /></Field>
          <Field label="Biaya $/hari per nomor" hint="Estimasi cost LLM per nomor"><Input type="number" step="0.01" value={s.abuseDailyCostPerPhone || 0.05} onChange={e => set('abuseDailyCostPerPhone', +e.target.value)} /></Field>
          <Field label="Budget global $/hari" hint="Total cost AI per hari, semua nomor"><Input type="number" step="0.1" value={s.abuseGlobalDailyBudget || 5} onChange={e => set('abuseGlobalDailyBudget', +e.target.value)} /></Field>
          <Field label="Flag threshold" hint="Berapa pelanggaran sebelum nomor di-flag"><Input type="number" value={s.abuseFlagThreshold || 3} onChange={e => set('abuseFlagThreshold', +e.target.value)} /></Field>
        </div>
      </>}

      {/* Save bar */}
      <div className="border-t border-blush pt-4 flex items-center gap-3">
        <Btn onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Btn>
        {msg && <span className={`text-sm ${msg === 'Tersimpan.' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
      </div>
    </div>
  </Card>;
}

function UsersTab() {
  const [items, setItems] = useState([]), [form, setForm] = useState({ email: '', password: '', name: '', role: 'receptionist' }), [err, setErr] = useState('');
  async function load() { setItems(await api('/api/users')); }
  useEffect(() => { load(); }, []);
  async function add(e) { e.preventDefault(); setErr(''); try { await api('/api/users', { method: 'POST', body: JSON.stringify(form) }); setForm({ email: '', password: '', name: '', role: 'receptionist' }); load(); } catch (e) { setErr(e.message); } }
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Card>
      <h2 className="text-sm font-semibold mb-3">Pengguna</h2>
      <ul className="divide-y divide-blush text-sm">{items.map(u => <li key={u.id} className="py-2.5 flex justify-between"><div><p className="font-medium">{u.name}</p><p className="text-xs text-muted">{u.email}</p></div><Badge>{u.role}</Badge></li>)}</ul>
      {!items.length && <p className="text-muted text-xs py-4 text-center">Belum ada pengguna.</p>}
    </Card>
    <Card>
      <h2 className="text-sm font-semibold mb-3">Tambah Pengguna</h2>
      <form onSubmit={add} className="space-y-3">
        <Input placeholder="Nama" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input type="password" placeholder="Password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        <Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="receptionist">Receptionist</option><option value="therapist">Therapist</option></Select>
        {err && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">{err}</p>}
        <Btn>Simpan</Btn>
      </form>
    </Card>
  </div>;
}
