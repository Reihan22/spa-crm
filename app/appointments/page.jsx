'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard, Shell, Card, Btn, Input, Select, Badge } from '@/components/Shell';
import { api, formatDateTime, formatRupiah } from '@/lib/client';
import { Search, Filter, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';

const STATUS = ['pending','confirmed','in_progress','completed','cancelled','no_show'];
const STATUS_COLOR = { pending:'yellow', confirmed:'blue', in_progress:'blue', completed:'green', cancelled:'red', no_show:'gray' };
const STATUS_LABEL = { pending:'Menunggu', confirmed:'Dikonfirmasi', in_progress:'Berlangsung', completed:'Selesai', cancelled:'Batal', no_show:'No Show' };

export default function AppointmentsPage() { return <AuthGuard><Shell title="Appointment" actions={<NewBtn />}><Body /></Shell></AuthGuard>; }
function NewBtn() { return <Link href="/appointments/new"><span className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition">+ Tambah</span></Link>; }

function Body() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ status: '', date: '', q: '', from: '', to: '' });
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);

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
        {/* Quick filter tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => { set('status', ''); load(1); }} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${!filters.status ? 'bg-primary text-white' : 'bg-cream text-muted hover:bg-blush'}`}>Semua</button>
          {STATUS.map(s => (
            <button key={s} onClick={() => { set('status', s); load(1); }} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${filters.status === s ? 'bg-primary text-white' : 'bg-cream text-muted hover:bg-blush'}`}>
              {STATUS_LABEL[s] || s}
            </button>
          ))}
          <button type="button" onClick={() => setShowFilter(!showFilter)} className={`ml-auto p-2 rounded-xl border transition ${showFilter ? 'border-primary bg-blush text-primary' : 'border-blush hover:bg-cream text-muted'}`}>
            <Filter className="w-4 h-4" />
          </button>
        </div>
        {showFilter && (
          <div className="pt-3 border-t border-blush">
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
                  className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Sampai</label>
                <input type="datetime-local" value={filters.to} onChange={e => set('to', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none" />
              </div>
              <div className="flex items-end gap-2">
                <Btn onClick={() => load(1)}>Terapkan</Btn>
                {hasFilters && <button onClick={clearFilters} className="p-2 rounded-xl hover:bg-cream text-muted"><X className="w-4 h-4" /></button>}
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
                <tr className="border-b border-blush bg-cream/60">
                  {['Jadwal', 'Pelanggan', 'Layanan', 'Terapis', 'Status', '', ''].map(h => (
                    <th key={h} className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((a, i) => (
                  <tr key={a.id} className={`border-b border-blush/40 hover:bg-blush/30 transition ${i % 2 === 1 ? 'bg-cream/20' : ''}`}>
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
        <div className="flex justify-between items-center px-5 py-3 border-t border-blush bg-cream/30">
          <span className="text-xs text-muted">Menampilkan {data.items.length} dari {data.total}</span>
          <div className="flex items-center gap-1">
            <button disabled={data.page <= 1} onClick={() => load(data.page - 1)} className="p-1.5 rounded-lg hover:bg-cream disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-muted px-2">Hal {data.page}/{data.pages}</span>
            <button disabled={data.page >= data.pages} onClick={() => load(data.page + 1)} className="p-1.5 rounded-lg hover:bg-cream disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </Card>

      {data.total > 0 && (
        <div className="flex justify-end">
          <button onClick={delAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 transition">
            <Trash2 className="w-3 h-3" /> Hapus semua ({data.total})
          </button>
        </div>
      )}
    </div>
  );
}
