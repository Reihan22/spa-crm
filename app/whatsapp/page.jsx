'use client';
import { useEffect, useRef, useState } from 'react';
import { AuthGuard, Shell, Card, Btn, Input, Badge } from '@/components/Shell';
import { api, formatDateTime } from '@/lib/client';
import { Search, Filter, Trash2, X, RefreshCw, Wifi, WifiOff, RotateCcw, LogOut } from 'lucide-react';

export default function WhatsAppPage() { return <AuthGuard><Shell title="WhatsApp"><Body /></Shell></AuthGuard>; }

function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/\D/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('620')) s = '62' + s.slice(3);
  if (!s.startsWith('62') && s.length >= 8) s = '62' + s;
  return s;
}

function Body() {
  const [status, setStatus] = useState(null), [qr, setQr] = useState(null);
  const [phone, setPhone] = useState('');
  const [msgs, setMsgs] = useState([]), [total, setTotal] = useState(0);
  const [send, setSend] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [fDir, setFDir] = useState(''), [fSrc, setFSrc] = useState(''), [fBlk, setFBlk] = useState('');
  const [fQ, setFQ] = useState(''), [fFrom, setFFrom] = useState(''), [fTo, setFTo] = useState('');
  const timerRef = useRef(null);

  async function poll() {
    try {
      const s = await api('/api/wa/status').catch(() => null); setStatus(s);
      if (s && !s.connected) { const q = await api('/api/wa/qr').catch(() => null); setQr(q?.qr || null); } else setQr(null);
    } catch {}
  }
  useEffect(() => { poll(); timerRef.current = setInterval(poll, 4000); return () => clearInterval(timerRef.current); }, []);

  function buildQs(extra = {}) {
    const qs = new URLSearchParams();
    const norm = normalizePhone(phone);
    if (norm) qs.set('phone', norm);
    if (fDir) qs.set('direction', fDir);
    if (fSrc) qs.set('source', fSrc);
    if (fBlk) qs.set('blocked', fBlk);
    if (fQ) qs.set('q', fQ);
    if (fFrom) qs.set('from', new Date(fFrom).toISOString());
    if (fTo) qs.set('to', new Date(fTo).toISOString());
    for (const [k, v] of Object.entries(extra)) qs.set(k, v);
    return qs.toString();
  }

  async function loadMsgs() {
    setErr('');
    try {
      const r = await api('/api/wa/messages?' + buildQs({ size: '50' }));
      setMsgs((r.items || []).reverse());
      setTotal(r.total || 0);
    } catch (e) { setErr(e.message); }
  }

  const hasFilters = fDir || fSrc || fBlk || fQ || fFrom || fTo;
  function resetFilters() { setFDir(''); setFSrc(''); setFBlk(''); setFQ(''); setFFrom(''); setFTo(''); }

  async function doSend(e) {
    e.preventDefault(); setErr('');
    const norm = normalizePhone(phone);
    if (!norm) { setErr('Nomor tidak valid'); return; }
    try { await api('/api/wa/send', { method: 'POST', body: JSON.stringify({ phone: norm, content: send }) }); setSend(''); loadMsgs(); } catch (e) { setErr(e.message); }
  }
  async function doReset(mode) {
    if (!confirm(mode === 'logout' ? 'Logout WA & hapus session?' : 'Reset session & re-pair QR?')) return;
    setBusy(true); setErr('');
    try { await api('/api/wa/reset', { method: 'POST', body: JSON.stringify({ mode }) }); setQr(null); setTimeout(poll, 1500); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function delOne(id) { if (!confirm('Hapus pesan ini?')) return; try { await api('/api/wa/messages?id=' + encodeURIComponent(id), { method: 'DELETE' }); loadMsgs(); } catch (e) { setErr(e.message); } }
  async function delPhone() { const norm = normalizePhone(phone); if (!norm) { setErr('Isi nomor dulu'); return; } if (!confirm(`Hapus semua chat dengan ${norm}?`)) return; try { const r = await api('/api/wa/messages?phone=' + encodeURIComponent(norm), { method: 'DELETE' }); alert(`Terhapus: ${r.deleted} pesan`); loadMsgs(); } catch (e) { setErr(e.message); } }
  async function delAll() { if (!confirm('Hapus SEMUA pesan WA?')) return; if (!confirm('Konfirmasi sekali lagi?')) return; try { const r = await api('/api/wa/messages?all=1', { method: 'DELETE' }); alert(`Terhapus: ${r.deleted} pesan`); loadMsgs(); } catch (e) { setErr(e.message); } }

  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    {/* Connection card */}
    <Card>
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        {status?.connected ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-amber-500" />}
        Koneksi
      </h2>
      {!status && <p className="text-muted text-sm animate-pulse">Worker tidak merespons…</p>}
      {status && <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">Engine</span>
          <Badge>{status.engine || 'baileys'}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Status</span>
          <Badge color={status.connected ? 'green' : 'yellow'}>{status.status || 'unknown'}</Badge>
        </div>
        {status.phone && <div className="flex items-center justify-between"><span className="text-muted">Nomor</span><span className="font-mono text-xs">{status.phone}</span></div>}
        {qr && <div className="mt-3"><img alt="QR" src={qr} className="w-full rounded-xl border-2 border-blush" /><p className="text-[11px] text-muted mt-1.5 text-center">Scan via WhatsApp → Linked Devices</p></div>}
        {!status.connected && !qr && <p className="text-xs text-muted text-center py-2">Menunggu QR… coba klik Reset.</p>}
        <div className="pt-3 mt-3 border-t border-blush flex flex-col gap-2">
          <button disabled={busy} onClick={() => doReset('reset')} className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition"><RotateCcw className="w-4 h-4" /> Reset session</button>
          <button disabled={busy} onClick={() => doReset('logout')} className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50 transition"><LogOut className="w-4 h-4" /> Logout & ganti nomor</button>
        </div>
      </div>}
    </Card>

    {/* Chat + Send card */}
    <Card className="lg:col-span-2 flex flex-col">
      {/* Send form */}
      <h2 className="text-sm font-semibold mb-3">Kirim Manual</h2>
      <form onSubmit={doSend} className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxx atau 628xxx" />
        <Input value={send} onChange={e => setSend(e.target.value)} placeholder="Pesan…" className="md:col-span-2" />
        <Btn className="md:col-span-3" disabled={!status?.connected || !phone || !send}>Kirim</Btn>
        {err && <p className="md:col-span-3 text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">{err}</p>}
      </form>

      {/* Filter toggle */}
      <div className="mt-5 pt-4 border-t border-blush flex items-center justify-between">
        <button onClick={() => setShowFilter(!showFilter)} className={`flex items-center gap-1.5 text-xs font-medium transition ${showFilter ? 'text-primary' : 'text-muted hover:text-ink'}`}>
          <Filter className="w-3.5 h-3.5" /> Filter chat
          {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={loadMsgs} className="p-1.5 rounded-lg hover:bg-cream text-muted transition" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          <span className="text-[11px] text-muted">{total} pesan{phone && ` · ${normalizePhone(phone)}`}</span>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="mt-3 p-3 bg-cream/50 rounded-xl border border-blush">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <select value={fDir} onChange={e => setFDir(e.target.value)} className="px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none">
              <option value="">Arah: semua</option>
              <option value="in">Masuk</option>
              <option value="out">Keluar</option>
            </select>
            <select value={fSrc} onChange={e => setFSrc(e.target.value)} className="px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none">
              <option value="">Sumber: semua</option>
              <option value="ai_agent">AI/Router</option>
              <option value="human">Manual</option>
              <option value="system">Sistem</option>
            </select>
            <select value={fBlk} onChange={e => setFBlk(e.target.value)} className="px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none">
              <option value="">Blocked: semua</option>
              <option value="1">Hanya blocked</option>
              <option value="0">Tidak blocked</option>
            </select>
            <Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Cari isi pesan…" className="md:col-span-3" />
            <div>
              <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Dari</label>
              <input type="datetime-local" value={fFrom} onChange={e => setFFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Sampai</label>
              <input type="datetime-local" value={fTo} onChange={e => setFTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none" />
            </div>
            <div className="flex gap-2 items-end">
              <Btn type="button" onClick={loadMsgs} className="flex-1">Terapkan</Btn>
              {hasFilters && <button onClick={() => { resetFilters(); setTimeout(loadMsgs, 50); }} className="p-2 rounded-xl hover:bg-white text-muted transition"><X className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
      )}

      {/* Chat list */}
      <ul className="mt-3 flex-1 max-h-96 overflow-y-auto divide-y divide-blush/60 text-sm">
        {msgs.map(m => (
          <li key={m.id} className="py-2.5 group hover:bg-cream/30 px-2 -mx-2 rounded-lg transition">
            <div className="flex items-center gap-2">
              <Badge color={m.direction === 'in' ? 'gray' : m.source === 'ai_agent' ? 'blue' : 'green'}>{m.direction === 'in' ? 'masuk' : m.source || 'out'}</Badge>
              <span className="text-xs text-muted font-mono">{m.normalizedPhone}</span>
              <span className="text-xs text-muted">· {formatDateTime(m.sentAt)}</span>
              {m.aiBlocked && <Badge color="red">blocked</Badge>}
              <button onClick={() => delOne(m.id)} className="ml-auto p-1 rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:text-rose-600 hover:bg-rose-50 transition" title="Hapus"><Trash2 className="w-3 h-3" /></button>
            </div>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </li>
        ))}
        {!msgs.length && <p className="text-muted text-xs py-8 text-center">Belum ada chat. Klik Terapkan atau Refresh.</p>}
      </ul>

      {/* Bottom actions */}
      <div className="mt-3 pt-3 border-t border-blush flex items-center justify-between">
        <span className="text-[11px] text-muted">Menampilkan {msgs.length} dari {total}</span>
        <div className="flex gap-3">
          <button onClick={delPhone} disabled={!phone} className="flex items-center gap-1 text-xs text-rose-600 hover:underline disabled:text-muted disabled:no-underline transition">
            <Trash2 className="w-3 h-3" /> Hapus chat nomor ini
          </button>
          <button onClick={delAll} className="flex items-center gap-1 text-xs text-rose-700 hover:underline font-semibold transition">
            <Trash2 className="w-3 h-3" /> Hapus semua
          </button>
        </div>
      </div>
    </Card>
  </div>;
}
