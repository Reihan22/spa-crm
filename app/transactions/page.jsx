'use client';
import { useEffect, useState } from 'react';
import { AuthGuard, Shell, Card, Btn, Input, Select, Badge } from '@/components/Shell';
import { api, formatDateTime, formatRupiah } from '@/lib/client';
import { Search, Filter, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';

const TX_STATUS = ['paid', 'unpaid', 'partial', 'refunded', 'cancelled'];
const TX_COLOR = { paid: 'green', unpaid: 'yellow', partial: 'yellow', refunded: 'red', cancelled: 'gray' };
const TX_LABEL = { paid: 'Lunas', unpaid: 'Belum bayar', partial: 'Sebagian', refunded: 'Refund', cancelled: 'Batal' };
const PAYMENT = ['cash', 'qris', 'transfer', 'card'];
const PAY_LABEL = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer', card: 'Kartu' };

export default function TransactionsPage() { return <AuthGuard><Shell title="Transaksi"><Body /></Shell></AuthGuard>; }

function Body() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [open, setOpen] = useState(false), [appts, setAppts] = useState([]);
  const [qris, setQris] = useState(null);
  const [filters, setFilters] = useState({ status: '', paymentMethod: '', q: '', from: '', to: '' });
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(page = 1) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page, size: 20 });
      if (filters.status) qs.set('status', filters.status);
      if (filters.paymentMethod) qs.set('paymentMethod', filters.paymentMethod);
      if (filters.q) qs.set('q', filters.q);
      if (filters.from) qs.set('from', new Date(filters.from).toISOString());
      if (filters.to) { const d = new Date(filters.to); d.setHours(23,59,59,999); qs.set('to', d.toISOString()); }
      setData(await api('/api/transactions?' + qs));
    } finally { setLoading(false); }
  }
  async function loadAppts() { const r = await api('/api/appointments?status=in_progress&size=50'); const r2 = await api('/api/appointments?status=confirmed&size=50'); setAppts([...r.items, ...r2.items]); }
  useEffect(() => { load(1); }, []);

  function set(k, v) { setFilters(f => ({ ...f, [k]: v })); }
  function clearFilters() { setFilters({ status: '', paymentMethod: '', q: '', from: '', to: '' }); setTimeout(() => load(1), 50); }
  const hasFilters = filters.status || filters.paymentMethod || filters.q || filters.from || filters.to;

  async function delOne(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    await api(`/api/transactions?id=${id}`, { method: 'DELETE' });
    load(data.page);
  }
  async function delAll() {
    if (!confirm(`⚠ HAPUS SEMUA ${data.total} transaksi?`)) return;
    if (!confirm('Konfirmasi sekali lagi?')) return;
    const r = await api('/api/transactions?all=1', { method: 'DELETE' });
    alert(`Terhapus: ${r.deleted} transaksi`);
    load(1);
  }

  return (
    <div className="space-y-4">
      <Card>
        {/* Quick status tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => { set('status', ''); load(1); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${!filters.status ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-surface'}`}>Semua</button>
          {TX_STATUS.map(s => (
            <button key={s} onClick={() => { set('status', s); load(1); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filters.status === s ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-surface'}`}>
              {TX_LABEL[s] || s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Btn onClick={async () => { await loadAppts(); setOpen(true); }}>+ Buat Pembayaran</Btn>
            <button type="button" onClick={() => setShowFilter(!showFilter)} className={`p-2 rounded-md border transition ${showFilter ? 'border-primary bg-surface text-primary' : 'border-border hover:bg-surface text-muted'}`}>
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>
        {showFilter && (
          <div className="pt-3 border-t border-border">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Cari</label>
                <Input value={filters.q} onChange={e => set('q', e.target.value)} placeholder="Nama / layanan…" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Metode</label>
                <Select value={filters.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}><option value="">Semua</option>{PAYMENT.map(p => <option key={p} value={p}>{PAY_LABEL[p] || p}</option>)}</Select>
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Dari</label>
                <input type="datetime-local" value={filters.from} onChange={e => set('from', e.target.value)} className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Sampai</label>
                <input type="datetime-local" value={filters.to} onChange={e => set('to', e.target.value)} className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none" />
              </div>
              <div className="flex items-end gap-2">
                <Btn onClick={() => load(1)}>Terapkan</Btn>
                {hasFilters && <button onClick={clearFilters} className="p-2 rounded-md hover:bg-surface text-muted"><X className="w-4 h-4" /></button>}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? <div className="p-6 text-center text-muted text-sm animate-pulse">Memuat…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/60">
                  {['Tanggal', 'Pelanggan', 'Layanan', 'Metode', 'Total', 'Status', '', ''].map(h => (
                    <th key={h} className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((t, i) => (
                  <tr key={t.id} className={`border-b border-border/40 hover:bg-surface/30 transition ${i % 2 === 1 ? 'bg-surface/20' : ''}`}>
                    <td className="px-5 py-3">{formatDateTime(t.paidAt || t.createdAt)}</td>
                    <td className="px-5 py-3 font-medium">{t.appointment?.customer?.name || '—'}</td>
                    <td className="px-5 py-3 text-muted">{t.appointment?.service?.name || '—'}</td>
                    <td className="px-5 py-3"><span className="text-xs capitalize">{PAY_LABEL[t.paymentMethod] || t.paymentMethod || '—'}</span></td>
                    <td className="px-5 py-3 font-semibold">{formatRupiah(t.total)}</td>
                    <td className="px-5 py-3"><Badge color={TX_COLOR[t.status] || 'gray'}>{TX_LABEL[t.status] || t.status}</Badge></td>
                    <td className="px-5 py-3">
                      {(t.status === 'unpaid' || t.status === 'partial') && <button onClick={() => setQris({ txId: t.id, total: t.total })} className="text-xs text-primary hover:underline font-medium">QRIS</button>}
                    </td>
                    <td className="px-5 py-3"><button onClick={() => delOne(t.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-600 hover:bg-rose-50 transition" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan="8" className="py-12 text-center text-muted">Belum ada transaksi.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between items-center px-5 py-3 border-t border-border bg-surface/30">
          <span className="text-xs text-muted">Menampilkan {data.items.length} dari {data.total}</span>
          <div className="flex items-center gap-1">
            <button disabled={data.page <= 1} onClick={() => load(data.page - 1)} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-muted px-2">Hal {data.page}/{data.pages}</span>
            <button disabled={data.page >= data.pages} onClick={() => load(data.page + 1)} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </Card>

      {data.total > 0 && (
        <div className="flex justify-end">
          <button onClick={delAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 transition">
            <Trash2 className="w-3 h-3" /> Hapus semua ({data.total})
          </button>
        </div>
      )}

      {open && <PayModal appts={appts} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(1); }} />}
      {qris && <QrisModal txId={qris.txId} total={qris.total} onClose={() => { setQris(null); load(1); }} />}
    </div>
  );
}

function PayModal({ appts, onClose, onSaved }) {
  const [appt, setAppt] = useState('');
  const [form, setForm] = useState({ subtotal: 0, discount: 0, tax: 0, paymentMethod: 'cash', status: 'paid' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  function pickAppt(id) { setAppt(id); const a = appts.find(x => x.id === id); if (a?.service?.price) setForm(f => ({ ...f, subtotal: Number(a.service.price) })); }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function submit(e) { e.preventDefault(); setErr(''); setBusy(true); try { await api('/api/transactions', { method: 'POST', body: JSON.stringify({ appointmentId: appt, ...form }) }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); } }
  const total = Number(form.subtotal || 0) - Number(form.discount || 0) + Number(form.tax || 0);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-center z-50 p-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="bg-card rounded-lg shadow p-6 w-full max-w-lg space-y-4 border border-border">
        <h3 className="font-bold text-lg text-ink">Buat Pembayaran</h3>
        <div>
          <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Appointment</label>
          <Select required value={appt} onChange={e => pickAppt(e.target.value)}><option value="">— pilih —</option>{appts.map(a => <option key={a.id} value={a.id}>{formatDateTime(a.scheduledAt)} · {a.customer?.name} · {a.service?.name}</option>)}</Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Subtotal</label><Input type="number" value={form.subtotal} onChange={e => set('subtotal', +e.target.value)} /></div>
          <div><label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Diskon</label><Input type="number" value={form.discount} onChange={e => set('discount', +e.target.value)} /></div>
          <div><label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Pajak</label><Input type="number" value={form.tax} onChange={e => set('tax', +e.target.value)} /></div>
          <div><label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Metode</label><Select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}><option value="cash">Tunai</option><option value="qris">QRIS (Midtrans)</option><option value="transfer">Transfer</option><option value="card">Kartu</option></Select></div>
          <div><label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Status</label><Select value={form.status} onChange={e => set('status', e.target.value)}><option value="paid">Lunas</option><option value="unpaid">Belum bayar</option></Select></div>
        </div>
        <div className="text-sm flex justify-between bg-surface rounded-md px-4 py-3"><span className="text-muted">Total</span><span className="font-bold text-ink">{formatRupiah(total)}</span></div>
        {err && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-md">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm text-muted hover:bg-surface transition">Batal</button>
          <Btn disabled={busy || !appt}>{busy ? '…' : 'Simpan'}</Btn>
        </div>
      </form>
    </div>
  );
}

function QrisModal({ txId, total, onClose }) {
  const [state, setState] = useState({ phase: 'loading' });
  const [paid, setPaid] = useState(false);
  useEffect(() => { (async () => { try { const r = await api(`/api/transactions/${txId}/qris-charge`, { method: 'POST' }); setState({ phase: 'ready', ...r }); } catch (e) { setState({ phase: 'error', msg: e.message }); } })(); }, [txId]);
  useEffect(() => {
    if (state.phase !== 'ready' || paid) return;
    const t = setInterval(async () => { try { const r = await api(`/api/transactions/${txId}/qris-status`); if (r.status === 'paid') { setPaid(true); clearInterval(t); } } catch {} }, 5000);
    return () => clearInterval(t);
  }, [state.phase, paid, txId]);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-lg shadow p-6 w-full max-w-md space-y-4 text-center border border-border">
        <h3 className="font-bold text-lg text-ink">Bayar via QRIS</h3>
        <p className="text-sm text-muted">Total: <span className="font-bold text-ink">{formatRupiah(total)}</span></p>
        {state.phase === 'loading' && <p className="text-sm py-10 text-muted animate-pulse">Menyiapkan QR…</p>}
        {state.phase === 'error' && <p className="text-sm text-rose-600 py-10">{state.msg}</p>}
        {state.phase === 'ready' && !paid && <>
          <div className="flex justify-center"><img src={state.qrUrl} alt="QRIS" className="w-56 h-56 border-2 border-border rounded-lg" /></div>
          <p className="text-xs text-muted leading-relaxed">Scan pakai GoPay, OVO, DANA, ShopeePay, BCA, dll.<br />Sandbox: <a href="https://simulator.sandbox.midtrans.com/qris/index" target="_blank" className="underline text-primary">Midtrans Simulator</a></p>
          <p className="text-[11px] text-muted">Order: <span className="font-mono">{state.orderId}</span> · Exp: {state.expiresAt ? new Date(state.expiresAt).toLocaleString('id-ID') : '—'}</p>
        </>}
        {paid && <div className="py-8"><p className="text-4xl mb-2">✅</p><p className="font-bold text-emerald-600 text-lg">Pembayaran diterima</p><p className="text-xs text-muted mt-1">Konfirmasi WA otomatis terkirim.</p></div>}
        <Btn onClick={onClose}>{paid ? 'Tutup' : 'Batal'}</Btn>
      </div>
    </div>
  );
}
