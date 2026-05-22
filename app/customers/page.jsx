'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard, Shell, Card, Btn, Input, Badge } from '@/components/Shell';
import { api, formatDateTime } from '@/lib/client';
import { Search, Filter, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';

function displayPhone(dbPhone) {
  if (!dbPhone) return '—';
  let s = String(dbPhone).replace(/\D/g, '');
  if (s.startsWith('62')) s = '0' + s.slice(2);
  return s;
}

export default function CustomersPage() {
  return <AuthGuard><Shell title="Pelanggan" actions={<NewBtn />}><Body /></Shell></AuthGuard>;
}
function NewBtn() {
  return <Link href="/customers/new"><span className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition">+ Tambah</span></Link>;
}

function Body() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(page = 1) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page, size: 20 });
      if (q) qs.set('q', q);
      if (from) qs.set('from', new Date(from).toISOString());
      if (to) { const d = new Date(to); d.setHours(23,59,59,999); qs.set('to', d.toISOString()); }
      setData(await api('/api/customers?' + qs));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(1); }, []);

  function clearFilters() { setQ(''); setFrom(''); setTo(''); setTimeout(() => load(1), 50); }
  const hasFilters = q || from || to;

  async function delOne(id, name) {
    if (!confirm(`Hapus pelanggan "${name}"?\nSemua data terkait ikut terhapus!`)) return;
    await api(`/api/customers?id=${id}`, { method: 'DELETE' });
    load(data.page);
  }
  async function delAll() {
    if (!confirm(`⚠ HAPUS SEMUA ${data.total} pelanggan?\nSemua data terkait ikut terhapus!`)) return;
    if (!confirm('Konfirmasi sekali lagi: hapus semua pelanggan?')) return;
    const r = await api('/api/customers?all=1', { method: 'DELETE' });
    alert(`Terhapus: ${r.customers} pelanggan, ${r.appointments} appt, ${r.transactions} transaksi, ${r.waMessages} chat, ${r.handoffs} handoff`);
    load(1);
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter bar */}
      <Card>
        <form onSubmit={e => { e.preventDefault(); load(1); }} className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama / nomor / email…" className="pl-9" />
          </div>
          <Btn type="submit">Cari</Btn>
          <button type="button" onClick={() => setShowFilter(!showFilter)} className={`p-2 rounded-xl border transition ${showFilter ? 'border-primary bg-blush text-primary' : 'border-blush hover:bg-cream text-muted'}`}>
            <Filter className="w-4 h-4" />
          </button>
        </form>
        {/* Expanded filter panel */}
        {showFilter && (
          <div className="mt-3 pt-3 border-t border-blush">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Dari tanggal</label>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Sampai tanggal</label>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none" />
              </div>
              <div className="flex items-end gap-2">
                <Btn onClick={() => load(1)}>Terapkan</Btn>
                {hasFilters && <button onClick={clearFilters} className="p-2 rounded-xl hover:bg-cream text-muted"><X className="w-4 h-4" /></button>}
              </div>
            </div>
          </div>
        )}
        {hasFilters && !showFilter && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {from && <Badge>{`Dari: ${new Date(from).toLocaleDateString('id-ID')}`}</Badge>}
            {to && <Badge>{`Sampai: ${new Date(to).toLocaleDateString('id-ID')}`}</Badge>}
            <button onClick={clearFilters} className="text-muted hover:text-rose-600 ml-1">✕ Clear</button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-muted text-sm animate-pulse">Memuat…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blush bg-cream/60">
                  <th className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">Nama</th>
                  <th className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">Nomor</th>
                  <th className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">Email</th>
                  <th className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">Catatan</th>
                  <th className="text-left text-[11px] text-muted font-semibold uppercase tracking-wide px-5 py-3">Dibuat</th>
                  <th className="px-5 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c, i) => (
                  <tr key={c.id} className={`border-b border-blush/40 hover:bg-blush/30 transition ${i % 2 === 1 ? 'bg-cream/20' : ''}`}>
                    <td className="px-5 py-3 font-medium"><Link href={`/customers/${c.id}`} className="text-primary hover:underline">{c.name}</Link></td>
                    <td className="px-5 py-3 font-mono text-xs">{displayPhone(c.phone)}</td>
                    <td className="px-5 py-3 text-muted">{c.email || '—'}</td>
                    <td className="px-5 py-3 text-muted truncate max-w-[200px]">{c.notes || '—'}</td>
                    <td className="px-5 py-3 text-muted text-xs">{formatDateTime(c.createdAt)}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => delOne(c.id, c.name)} className="p-1.5 rounded-lg text-muted hover:text-rose-600 hover:bg-rose-50 transition" title="Hapus">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!data.items.length && (
                  <tr><td colSpan="6" className="py-12 text-center text-muted">Belum ada pelanggan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* Footer */}
        <div className="flex justify-between items-center px-5 py-3 border-t border-blush bg-cream/30">
          <span className="text-xs text-muted">Menampilkan {data.items.length} dari {data.total} pelanggan</span>
          <div className="flex items-center gap-1">
            <button disabled={data.page <= 1} onClick={() => load(data.page - 1)} className="p-1.5 rounded-lg hover:bg-cream disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-muted px-2">Hal {data.page}/{data.pages}</span>
            <button disabled={data.page >= data.pages} onClick={() => load(data.page + 1)} className="p-1.5 rounded-lg hover:bg-cream disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </Card>

      {/* Danger zone */}
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
