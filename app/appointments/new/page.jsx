'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard, Shell, Card, Btn, Input, Select, Textarea } from '@/components/Shell';
import { api } from '@/lib/client';

export default function NewAppointmentPage(){return <AuthGuard><Shell title="Appointment baru"><Body/></Shell></AuthGuard>}
function Body(){
  const router=useRouter();
  const [services,setServices]=useState([]),[therapists,setTherapists]=useState([]);
  const [customers,setCustomers]=useState([]),[q,setQ]=useState('');
  const [form,setForm]=useState({customerId:'',serviceId:'',therapistId:'',scheduledAt:'',notes:''});
  const [err,setErr]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{(async()=>{
    setServices(await api('/api/services'));
    setTherapists(await api('/api/therapists'));
    setCustomers((await api('/api/customers?size=20')).items);
  })()},[]);
  async function searchCust(){const r=await api('/api/customers?q='+encodeURIComponent(q));setCustomers(r.items)}
  function set(k,v){setForm(f=>({...f,[k]:v}))}
  async function submit(e){
    e.preventDefault();setErr('');setBusy(true);
    try{
      const ap=await api('/api/appointments',{method:'POST',body:JSON.stringify(form)});
      router.push('/appointments');
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  }
  return <Card><form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
    <div className="md:col-span-2"><label className="text-xs text-muted">Cari pelanggan</label>
      <div className="flex gap-2"><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="nama / nomor"/><Btn type="button" onClick={searchCust}>Cari</Btn></div></div>
    <div className="md:col-span-2"><label className="text-xs text-muted">Pilih pelanggan</label>
      <Select required value={form.customerId} onChange={e=>set('customerId',e.target.value)}><option value="">— pilih —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</Select></div>
    <div><label className="text-xs text-muted">Layanan</label><Select required value={form.serviceId} onChange={e=>set('serviceId',e.target.value)}><option value="">— pilih —</option>{services.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.name} · {s.durationMinutes}m</option>)}</Select></div>
    <div><label className="text-xs text-muted">Terapis (opsional)</label><Select value={form.therapistId} onChange={e=>set('therapistId',e.target.value)}><option value="">— pilih —</option>{therapists.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
    <div><label className="text-xs text-muted">Jadwal</label><Input type="datetime-local" required value={form.scheduledAt} onChange={e=>set('scheduledAt',e.target.value)}/></div>
    <div className="md:col-span-2"><label className="text-xs text-muted">Catatan</label><Textarea rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
    {err&&<p className="md:col-span-2 text-sm text-rose-600">{err}</p>}
    <div className="md:col-span-2"><Btn disabled={busy}>{busy?'…':'Simpan'}</Btn></div>
  </form></Card>
}
