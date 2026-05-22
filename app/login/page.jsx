'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSession } from '@/lib/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@spa.reihan.site');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Login gagal');
      setSession(data.access_token, data.user);
      router.push('/');
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-blush p-6">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-soft p-8 w-full max-w-sm border border-blush">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-primary text-white grid place-items-center font-bold mb-2">R</div>
          <h1 className="text-xl font-bold text-ink" style={{ fontFamily: "'Playfair Display', serif" }}>Rspa CRM</h1>
          <p className="text-xs text-muted">Login untuk lanjut</p>
        </div>
        <label className="block text-xs font-semibold text-muted mb-1">Email</label>
        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="w-full mb-3 px-3 py-2 rounded-xl border border-blush text-sm focus:border-primary outline-none" />
        <label className="block text-xs font-semibold text-muted mb-1">Password</label>
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required className="w-full mb-4 px-3 py-2 rounded-xl border border-blush text-sm focus:border-primary outline-none" />
        {err && <p className="text-xs text-rose-600 mb-3">{err}</p>}
        <button disabled={loading} className="w-full px-4 py-2.5 rounded-xl bg-primary text-white font-medium disabled:opacity-50">{loading?'Memproses…':'Masuk'}</button>
      </form>
    </div>
  );
}
