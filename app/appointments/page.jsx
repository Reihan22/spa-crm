'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard, Shell, Card, Btn, Input, Select, Textarea, Badge, Fab, Modal } from '@/components/Shell';
import { api, formatDateTime, formatRupiah } from '@/lib/client';
import { Search, Filter, Trash2, ChevronLeft, ChevronRight, X, Plus } from 'lucide-react';

const STATUS = ['pending','confirmed','in_progress','completed','cancelled','no_show'];
const STATUS_COLOR = { pending:'yellow', confirmed:'blue', in_progress:'blue', completed:'green', cancelled:'red', no_show:'gray' };
const STATUS_LABEL = { pending:'Menunggu', confirmed:'Dikonfirmasi', in_progress:'Berlangsung', completed:'Selesai', cancelled:'Batal', no_show:'No Show' };

export default function AppointmentsPage() {
  return <AuthGuard><Shell title="Appointment"><Body /></Shell></AuthGuard>;
}

/* ── Tambah modal ── */
function AppointmentModal({ open, onClose, onSaved }) {
  const [services, setServices] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ customerId: '', serviceId: '', therapistId: '', scheduledAt: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setServices(await api('/api/services'));
      setTherapists(await api('/api/therapists'));
      setCustomers((await api('/api/customers?size=20')).items);
    })();
  }, [open]);

  async function searchCust() {
    const r = await api('/api/customers?q=' + encodeURIComponent(q));
    setCustomers(r.items);
  }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api('/api/appointments', { method: 'POST', body: JSON.stringify(form) });
      setForm({ customerId: '', serviceId: '', therapistId: '', scheduledAt: '', notes: '' });
      onSaved?.();
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Appointment">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-[11px] text-muted font-medium uppercase tracking-wider mb-1 block">Cari pelanggan</label>
          <div className="flex gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="nama / nomor" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchCust())} />
            <Btn type="button" onClick={searchCust}>Cari</Btn>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-muted font-medium uppercase tracking-wider mb-1 block">Pelanggan *</label>
          <Select required value={form.customerId} onChange={e => set('customerId', e.target.value)}>
            <option value="">— pilih —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted font-medium uppercase tracking-wider mb-1 block">Layanan *</label>
            <Select required value={form.serviceId} onChange={e => set('serviceId', e.target.value)}>
              <option value="">— pilih —</option>
              {services.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes}m</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted font-medium uppercase tracking-wider mb-1 block">Terapis</label>
            <Select value={form.therapistId} onChange={e => set('therapistId', e.target.value)}>
              <option value="">— pilih —</option>
              {therapists.filter(t => t.isActive).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-muted font-medium uppercase tracking-wider mb-1 block">Jadwal *</label>
          <Input type="datetime-local" required value={form.scheduledAt} onChange={e => set('scheduledAt', e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-muted font-medium uppercase tracking-wider mb-1 block">Catatan</label>
          <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2 pt-2">
          <Btn disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Btn>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-[13px] text-muted hover:bg-surface transition-colors">Batal</button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Main body ── */
function Body() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ status: '', date: '', q: '', from: '', to: '' });
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  async function load(page = 1) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page, size: 20 });
      if (filters.status) qs.set('status', filters.status);
      if (filters.date) qs.set('date', filters.date);
      if (filters.q) qs.set('q', filters.q);
      if (filters.from) qs.set('from', new Date(filters.from).toISOString());
      if (filters.to) { const d = new Date(filters.to); d.setHours(23,59,59,999); qs.set('to', d.toISOString()); }
      setData(await api('/api/appointments?' + qs));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(1); }, []);

  function set(k, v) { setFilters(f => ({ ...f, [k]: v })); }
  function clearFilters() { setFilters({ status: '', date: '', q: '', from: '', to: '' }); setTimeout(() => load(1), 50); }
  const hasFilters = filters.status || filters.date || filters.q || filters.from || filters.to;

  async function statusChange(id, status) { await api(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(data.page); }
  async function delOne(id) {
    if (!confirm('Hapus appointment ini? Transaksi terkait ikut terhapus!')) return;
    await api(`/api/appointments?id=${id}`, { method: 'DELETE' });
    load(data.page);
  }
  async function delAll() {
    if (!confirm(`⚠ HAPUS SEMUA ${data.total} appointment?`)) return;
    if (!confirm('Konfirmasi sekali lagi: hapus semua?')) return;
    const r = await api('/api/appointments?all=1', { method: 'DELETE' });
    alert(`Terhapus: ${r.appointments} appointment, ${r.transactions} transaksi`);
    load(1);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => { set('status', ''); load(1); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${!filters.status ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-surface'}`}>Semua</button>
          {STATUS.map(s => (
            <button key={s} onClick={() => { set('status', s); load(1); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filters.status === s ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-surface'}`}>
              {STATUS_LABEL[s] || s}
            </button>
          ))}
          <button type="button" onClick={() => setShowFilter(!showFilter)} className={`ml-auto p-2 rounded-md border transition ${showFilter ? 'border-primary bg-surface text-primary' : 'border-border hover:bg-surface text-muted'}`}>
            <Filter className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setShowModal(true)} className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-[13px] font-medium hover:bg-primary-hover transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2} /> Tambah
          </button>
        </div>
        {showFilter && (
          <div className="pt-3 border-t border-border">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Cari</label>
                <Input value={filters.q} onChange={e => set('q', e.target.value)} placeholder="Nama / nomor…" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Tanggal</label>
                <Input type="date" value={filters.date} onChange={e => set('date', e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Dari</label>
                <input type="datetime-local" value={filters.from} onChange={e => set('from', e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm text-ink focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Sampai</label>
                <input type="datetime-local" value={filters.to} onChange={e => set('to', e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm text-ink focus:border-primary outline-none" />
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
                  {['Jadwal', 'Pelanggan', 'Layanan', 'Terapis', 'Status', '', ''].map(h => (
                    <th key={h} className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((a, i) => (
                  <tr key={a.id} className={`border-b border-border/40 hover:bg-surface/30 transition ${i % 2 === 1 ? 'bg-surface/20' : ''}`}>
                    <td className="px-5 py-3 font-medium">{formatDateTime(a.scheduledAt)}</td>
                    <td className="px-5 py-3"><Link href={`/customers/${a.customer?.id}`} className="text-primary hover:underline">{a.customer?.name}</Link></td>
                    <td className="px-5 py-3">{a.service?.name} <span className="text-muted text-xs">({formatRupiah(a.service?.price)})</span></td>
                    <td className="px-5 py-3 text-muted">{a.therapist?.name || '—'}</td>
                    <td className="px-5 py-3"><Badge color={STATUS_COLOR[a.status] || 'gray'}>{STATUS_LABEL[a.status] || a.status}</Badge></td>
                    <td className="px-5 py-3"><Select value={a.status} onChange={e => statusChange(a.id, e.target.value)} className="text-xs py-1 px-2">{STATUS.map(s => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}</Select></td>
                    <td className="px-5 py-3"><button onClick={() => delOne(a.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-600 hover:bg-rose-50 transition" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan="7" className="py-12 text-center text-muted">Belum ada appointment.</td></tr>}
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

      <Fab onClick={() => setShowModal(true)} label="Tambah Appointment" />
      <AppointmentModal open={showModal} onClose={() => setShowModal(false)} onSaved={() => load(1)} />
    </div>
  );
}
