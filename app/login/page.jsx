'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, setSession } from '@/lib/client';

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal');
      setSession(data.access_token, data.user);
      r.push('/');
    } catch (e) {
      clearSession();
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface p-6">
      <form onSubmit={submit} className="bg-card rounded-lg shadow p-8 w-full max-w-sm border border-border">
        <div className="mb-6 text-center">
          <div className="w-10 h-10 mx-auto rounded-md bg-primary text-white grid place-items-center font-semibold mb-3 text-sm">R</div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">Rspa CRM</h1>
          <p className="text-[13px] text-muted mt-1">Masuk ke dashboard</p>
        </div>
        <label className="block text-[11px] font-medium text-muted mb-1.5 uppercase tracking-wider">Email</label>
        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="w-full mb-4 px-3 py-2 rounded-md border border-border text-[13px] focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors" />
        <label className="block text-[11px] font-medium text-muted mb-1.5 uppercase tracking-wider">Password</label>
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required className="w-full mb-5 px-3 py-2 rounded-md border border-border text-[13px] focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors" />
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        <button disabled={loading} className="w-full px-4 py-2.5 rounded-md bg-primary text-white text-[13px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{loading?'Memproses…':'Masuk'}</button>
      </form>
    </div>
  );
}
