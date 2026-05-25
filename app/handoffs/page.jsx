'use client';
import { useEffect, useState } from 'react';
import { AuthGuard, Shell, Card, Btn, Badge } from '@/components/Shell';
import { api, formatDateTime } from '@/lib/client';
import { Filter, Trash2, X, Clock, UserCheck, CheckCircle, AlertTriangle } from 'lucide-react';

const TABS = [
  { key: 'pending', label: 'Menunggu', icon: Clock, color: 'yellow' },
  { key: 'active', label: 'Aktif', icon: UserCheck, color: 'blue' },
  { key: 'resolved', label: 'Selesai', icon: CheckCircle, color: 'green' },
  { key: 'expired', label: 'Expired', icon: AlertTriangle, color: 'gray' },
  { key: 'all', label: 'Semua', icon: null, color: 'blush' },
];

export default function HandoffsPage() { return <AuthGuard><Shell title="Handoff Queue"><Body /></Shell></AuthGuard>; }

function Body() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('pending');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  async function load() {
    const qs = new URLSearchParams({ status: filter });
    if (q) qs.set('q', q);
    if (from) qs.set('from', new Date(from).toISOString());
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); qs.set('to', d.toISOString()); }
    const r = await api('/api/handoffs?' + qs);
    setItems(r.items);
    setTotal(r.total);
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [filter, q, from, to]);

  async function update(id, status, notes) { await api(`/api/handoffs/${id}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }); load(); }
  async function delOne(id) {
    if (!confirm('Hapus handoff ini?')) return;
    await api(`/api/handoffs?id=${id}`, { method: 'DELETE' });
    load();
  }
  async function delByStatus() {
    if (!confirm(`Hapus semua handoff status "${filter}"?`)) return;
    const r = await api(`/api/handoffs?status=${filter}`, { method: 'DELETE' });
    alert(`Terhapus: ${r.deleted}`);
    load();
  }
  async function delAll() {
    if (!confirm(`⚠ HAPUS SEMUA ${total} handoff?`)) return;
    if (!confirm('Konfirmasi sekali lagi?')) return;
    const r = await api('/api/handoffs?all=1', { method: 'DELETE' });
    alert(`Terhapus: ${r.deleted}`);
    load();
  }

  const hasFilters = q || from || to;
  function clearFilters() { setQ(''); setFrom(''); setTo(''); }

  const STATUS_STYLE = { pending: 'border-l-amber-400', active: 'border-l-blue-400', resolved: 'border-l-emerald-400', expired: 'border-l-gray-400' };
  const STATUS_BG = { pending: 'bg-amber-50', active: 'bg-blue-50', resolved: 'bg-emerald-50', expired: 'bg-gray-50' };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium transition ${filter === t.key ? 'bg-primary text-white shadow' : 'bg-card text-muted hover:bg-surface border border-border'}`}>
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          );
        })}
        <button onClick={() => setShowFilter(!showFilter)} className={`ml-auto p-2 rounded-md border transition ${showFilter ? 'border-primary bg-surface text-primary' : 'border-border bg-card hover:bg-surface text-muted'}`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Cari</label>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nomor / alasan / nama…" className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Dari</label>
              <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-muted font-medium uppercase tracking-wide mb-1 block">Sampai</label>
              <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none" />
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3 flex items-center gap-2">
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted hover:text-rose-600 transition"><X className="w-3 h-3" /> Clear filter</button>
              <span className="text-[11px] text-muted ml-auto">Total: {total}</span>
            </div>
          )}
        </Card>
      )}

      {/* Cards list */}
      <div className="space-y-3">
        {items.map(h => (
          <Card key={h.id} className={`border-l-4 ${STATUS_STYLE[h.status] || 'border-l-gray-300'} ${STATUS_BG[h.status] || ''}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-ink">{h.customer?.name || h.normalizedPhone}</p>
                <p className="text-xs text-muted mt-0.5">{h.normalizedPhone} · {formatDateTime(h.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={h.status === 'pending' ? 'yellow' : h.status === 'active' ? 'blue' : h.status === 'resolved' ? 'green' : 'gray'}>{h.status}</Badge>
                <button onClick={() => delOne(h.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-600 hover:bg-rose-50 transition" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <p className="text-sm mt-2 text-ink/80"><span className="text-muted">Alasan:</span> {h.reason}</p>
            {h.triggerKeyword && <p className="text-xs text-muted mt-1">Trigger: <code className="bg-surface px-1.5 py-0.5 rounded text-primary">{h.triggerKeyword}</code></p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {h.status === 'pending' && <Btn onClick={() => update(h.id, 'active')} className="text-xs py-1.5">Take over</Btn>}
              {h.status !== 'resolved' && <button onClick={() => { const n = prompt('Catatan resolusi (opsional)'); update(h.id, 'resolved', n || undefined); }} className="px-4 py-1.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 transition">Tandai selesai</button>}
            </div>
          </Card>
        ))}
        {!items.length && (
          <Card><p className="text-muted text-sm text-center py-6">Tidak ada handoff {filter !== 'all' ? `dengan status "${filter}"` : ''}.</p></Card>
        )}
      </div>

      {/* Danger */}
      {total > 0 && (
        <Card className="flex flex-wrap gap-2 justify-between items-center">
          <span className="text-xs text-muted">{total} handoff ditampilkan</span>
          <div className="flex gap-2">
            {filter !== 'all' && <button onClick={delByStatus} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-orange-600 hover:bg-orange-50 border border-orange-200 transition"><Trash2 className="w-3 h-3" /> Hapus status "{filter}"</button>}
            <button onClick={delAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 transition"><Trash2 className="w-3 h-3" /> Hapus semua</button>
          </div>
        </Card>
      )}
    </div>
  );
}
