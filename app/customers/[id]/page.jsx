'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard, Shell, Card, Btn, Input, Textarea, Badge } from '@/components/Shell';
import { api, formatDateTime, formatRupiah } from '@/lib/client';

export default function CustomerDetailPage() {
  return <AuthGuard><Shell title="Detail Pelanggan"><Body /></Shell></AuthGuard>;
}
function Body() {
  const { id } = useParams();
  const router = useRouter();
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  async function load() {
    try { setC(await api(`/api/customers/${id}`)); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [id]);
  async function save(payload) {
    await api(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    load();
  }
  async function del() {
    if (!confirm('Hapus pelanggan ini?')) return;
    await api(`/api/customers/${id}`, { method: 'DELETE' });
    router.push('/customers');
  }
  if (err) return <p className="text-rose-600">{err}</p>;
  if (!c) return <p className="text-muted">Memuat…</p>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <h2 className="text-sm font-semibold mb-3">Profil</h2>
        <Editable c={c} onSave={save} onDelete={del} />
      </Card>
      <Card>
        <h2 className="text-sm font-semibold mb-3">Tracking AI</h2>
        <p className="text-xs text-muted">Pesan hari ini: <Badge>{c.dailyMessageCount}</Badge></p>
        <p className="text-xs text-muted mt-1">Biaya hari ini: <Badge>${(c.dailyTokenCost || 0).toFixed(4)}</Badge></p>
        <p className="text-xs text-muted mt-1">Flag abuse: <Badge color={c.abuseFlags > 0 ? 'red' : 'gray'}>{c.abuseFlags}</Badge></p>
        {c.mutedUntil && <p className="text-xs text-rose-600 mt-1">Muted hingga {formatDateTime(c.mutedUntil)}</p>}
      </Card>
      <Card className="lg:col-span-3">
        <h2 className="text-sm font-semibold mb-3">Riwayat Appointment</h2>
        {c.appointments.length === 0 ? <p className="text-muted text-sm">Belum ada.</p> : (
          <ul className="divide-y divide-blush text-sm">
            {c.appointments.map(a => (
              <li key={a.id} className="py-2 flex justify-between">
                <span>{formatDateTime(a.scheduledAt)} · {a.service?.name} · {a.therapist?.name || '-'}</span>
                <span className="flex items-center gap-2"><Badge color={a.status==='completed'?'green':a.status==='cancelled'?'red':'yellow'}>{a.status}</Badge>{a.transaction && <span className="text-muted">{formatRupiah(a.transaction.total)}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Editable({ c, onSave, onDelete }) {
  const [form, setForm] = useState({
    name: c.name, phone: c.phone, email: c.email || '',
    birth_date: c.birthDate ? c.birthDate.slice(0,10) : '',
    address: c.address || '', skinType: c.skinType || '',
    allergies: c.allergies || '', notes: c.notes || '',
  });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function submit(e) { e.preventDefault(); await onSave(form); }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label className="text-xs text-muted">Nama</label><Input required value={form.name} onChange={e=>set('name',e.target.value)} /></div>
      <div><label className="text-xs text-muted">Nomor</label><Input required value={form.phone} onChange={e=>set('phone',e.target.value)} /></div>
      <div><label className="text-xs text-muted">Email</label><Input type="email" value={form.email} onChange={e=>set('email',e.target.value)} /></div>
      <div><label className="text-xs text-muted">Tgl lahir</label><Input type="date" value={form.birth_date} onChange={e=>set('birth_date',e.target.value)} /></div>
      <div className="md:col-span-2"><label className="text-xs text-muted">Alamat</label><Input value={form.address} onChange={e=>set('address',e.target.value)} /></div>
      <div><label className="text-xs text-muted">Tipe kulit</label><Input value={form.skinType} onChange={e=>set('skinType',e.target.value)} /></div>
      <div><label className="text-xs text-muted">Alergi</label><Input value={form.allergies} onChange={e=>set('allergies',e.target.value)} /></div>
      <div className="md:col-span-2"><label className="text-xs text-muted">Catatan</label><Textarea rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
      <div className="md:col-span-2 flex gap-2"><Btn>Simpan</Btn><button type="button" onClick={onDelete} className="px-4 py-2 rounded-xl bg-rose-100 text-rose-700 text-sm font-medium">Hapus</button></div>
    </form>
  );
}
