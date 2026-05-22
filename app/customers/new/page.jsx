'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard, Shell, Card, Btn, Input, Textarea } from '@/components/Shell';
import { api } from '@/lib/client';

export default function NewCustomerPage() {
  return <AuthGuard><Shell title="Pelanggan baru"><Body /></Shell></AuthGuard>;
}
function Body() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', phone: '', email: '', birth_date: '', address: '', skin_type: '', allergies: '', notes: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const c = await api('/api/customers', { method: 'POST', body: JSON.stringify(form) });
      router.push(`/customers/${c.id}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
        <div><label className="text-xs text-muted">Nama</label><Input required value={form.name} onChange={e=>set('name',e.target.value)} /></div>
        <div><label className="text-xs text-muted">Nomor WA</label><Input required value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="08xxx atau 62xxx" /></div>
        <div><label className="text-xs text-muted">Email</label><Input type="email" value={form.email} onChange={e=>set('email',e.target.value)} /></div>
        <div><label className="text-xs text-muted">Tanggal lahir</label><Input type="date" value={form.birth_date} onChange={e=>set('birth_date',e.target.value)} /></div>
        <div className="md:col-span-2"><label className="text-xs text-muted">Alamat</label><Input value={form.address} onChange={e=>set('address',e.target.value)} /></div>
        <div><label className="text-xs text-muted">Tipe kulit</label><Input value={form.skin_type} onChange={e=>set('skin_type',e.target.value)} /></div>
        <div><label className="text-xs text-muted">Alergi</label><Input value={form.allergies} onChange={e=>set('allergies',e.target.value)} /></div>
        <div className="md:col-span-2"><label className="text-xs text-muted">Catatan</label><Textarea rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
        {err && <p className="md:col-span-2 text-sm text-rose-600">{err}</p>}
        <div className="md:col-span-2"><Btn disabled={busy}>{busy?'Menyimpan…':'Simpan'}</Btn></div>
      </form>
    </Card>
  );
}
