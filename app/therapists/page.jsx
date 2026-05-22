'use client';
import { useEffect, useState } from 'react';
import { AuthGuard, Shell, Card, Btn, Input, Textarea, Badge } from '@/components/Shell';
import { api } from '@/lib/client';

export default function TherapistsPage(){return <AuthGuard><Shell title="Terapis"><Body/></Shell></AuthGuard>}
function Body(){
 const [items,setItems]=useState([]),[open,setOpen]=useState(false),[edit,setEdit]=useState(null);
 async function load(){setItems(await api('/api/therapists'))} useEffect(()=>{load()},[]);
 return <div className="space-y-4"><Card><div className="flex justify-between mb-3"><h2 className="text-sm font-semibold">Daftar Terapis</h2><Btn onClick={()=>{setEdit(null);setOpen(true)}}>+ Tambah</Btn></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{items.map(t=><button key={t.id} onClick={()=>{setEdit(t);setOpen(true)}} className="text-left p-4 rounded-xl border border-blush hover:border-primary bg-white"><div className="flex justify-between"><h3 className="font-semibold">{t.name}</h3><Badge color={t.isActive?'green':'gray'}>{t.isActive?'Aktif':'Nonaktif'}</Badge></div><p className="text-xs text-muted">{t.phone||'-'}</p><p className="text-xs text-muted mt-2">{t.specialization||'-'}</p></button>)}</div></Card>{open&&<Modal initial={edit} onClose={()=>setOpen(false)} onSaved={()=>{setOpen(false);load()}}/>}</div>
}
function Modal({initial,onClose,onSaved}){
 const [form,setForm]=useState(initial?{name:initial.name,phone:initial.phone||'',specialization:initial.specialization||'',bio:initial.bio||'',isActive:initial.isActive}:{name:'',phone:'',specialization:'',bio:'',isActive:true}); const [err,setErr]=useState('');
 function set(k,v){setForm(f=>({...f,[k]:v}))}
 async function submit(e){e.preventDefault();setErr('');try{if(initial)await api(`/api/therapists/${initial.id}`,{method:'PATCH',body:JSON.stringify(form)});else await api('/api/therapists',{method:'POST',body:JSON.stringify(form)});onSaved()}catch(e){setErr(e.message)}}
 async function del(){if(!confirm('Hapus terapis?'))return;await api(`/api/therapists/${initial.id}`,{method:'DELETE'});onSaved()}
 return <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onClose}><form onClick={e=>e.stopPropagation()} onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3"><h3 className="font-semibold text-lg">{initial?'Edit':'Tambah'} Terapis</h3><div><label className="text-xs text-muted">Nama</label><Input required value={form.name} onChange={e=>set('name',e.target.value)}/></div><div><label className="text-xs text-muted">Phone</label><Input value={form.phone} onChange={e=>set('phone',e.target.value)}/></div><div><label className="text-xs text-muted">Spesialisasi</label><Input value={form.specialization} onChange={e=>set('specialization',e.target.value)}/></div><div><label className="text-xs text-muted">Bio</label><Textarea rows={2} value={form.bio} onChange={e=>set('bio',e.target.value)}/></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e=>set('isActive',e.target.checked)}/>Aktif</label>{err&&<p className="text-sm text-rose-600">{err}</p>}<div className="flex justify-between"><Btn>Simpan</Btn>{initial&&<button type="button" onClick={del} className="px-4 py-2 rounded-xl bg-rose-100 text-rose-700 text-sm">Hapus</button>}</div></form></div>
}
