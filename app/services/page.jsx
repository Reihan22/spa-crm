'use client';
import { useEffect, useState } from 'react';
import { AuthGuard, Shell, Card, Btn, Input, Select, Textarea, Badge } from '@/components/Shell';
import { api, formatRupiah } from '@/lib/client';

export default function ServicesPage() {
  return <AuthGuard><Shell title="Layanan"><Body /></Shell></AuthGuard>;
}
function Body() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  async function load() { setItems(await api('/api/services')); }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex justify-between mb-3"><h2 className="text-sm font-semibold">Daftar Layanan</h2>
          <Btn onClick={() => { setEdit(null); setOpen(true); }}>+ Tambah</Btn></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(s => (
            <button key={s.id} onClick={() => { setEdit(s); setOpen(true); }} className="text-left p-4 rounded-md border border-border hover:border-primary bg-card">
              <div className="flex justify-between"><h3 className="font-semibold text-ink">{s.name}</h3><Badge color={s.isActive?'green':'gray'}>{s.isActive?'Aktif':'Nonaktif'}</Badge></div>
              <p className="text-xs text-muted capitalize">{s.category} · {s.durationMinutes} menit</p>
              <p className="text-sm font-semibold text-primary mt-1">{formatRupiah(s.price)}</p>
              {s.description && <p className="text-xs text-muted mt-2 line-clamp-2">{s.description}</p>}
            </button>
          ))}
        </div>
      </Card>
      {open && <Modal initial={edit} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function Modal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(initial ? {
    name: initial.name, category: initial.category, durationMinutes: initial.durationMinutes,
    price: initial.price, description: initial.description || '', isActive: initial.isActive,
  } : { name: '', category: 'body', durationMinutes: 60, price: 200000, description: '', isActive: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (isEdit) await api(`/api/services/${initial.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await api('/api/services', { method: 'POST', body: JSON.stringify(form) });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm('Hapus layanan ini?')) return;
    await api(`/api/services/${initial.id}`, { method: 'DELETE' });
    onSaved();
  }
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onClose}>
      <form onClick={e=>e.stopPropagation()} onSubmit={submit} className="bg-card rounded-lg p-6 w-full max-w-lg space-y-3">
        <h3 className="font-semibold text-lg">{isEdit?'Edit':'Tambah'} Layanan</h3>
        <div><label className="text-xs text-muted">Nama</label><Input required value={form.name} onChange={e=>set('name',e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-muted">Kategori</label>
            <Select value={form.category} onChange={e=>set('category',e.target.value)}>
              <option value="body">Body</option><option value="face">Face</option><option value="combo">Combo</option><option value="other">Lainnya</option>
            </Select></div>
          <div><label className="text-xs text-muted">Durasi (menit)</label><Input type="number" value={form.durationMinutes} onChange={e=>set('durationMinutes',+e.target.value)} /></div>
        </div>
        <div><label className="text-xs text-muted">Harga (Rp)</label><Input type="number" value={form.price} onChange={e=>set('price',+e.target.value)} /></div>
        <div><label className="text-xs text-muted">Deskripsi</label><Textarea rows={2} value={form.description} onChange={e=>set('description',e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e=>set('isActive',e.target.checked)} />Aktif</label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-between"><Btn disabled={busy}>{busy?'…':'Simpan'}</Btn>
          {isEdit && <button type="button" onClick={del} className="px-4 py-2 rounded-md bg-rose-100 text-rose-700 text-sm">Hapus</button>}</div>
      </form>
    </div>
  );
}
