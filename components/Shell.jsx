// Header doc: shared client UI primitives (sidebar, layout shell, auth guard, header).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Calendar, Sparkles, HeartPulse,
  Receipt, MessageCircle, UserCheck, Settings as SettingsIcon, LogOut,
} from 'lucide-react';
import { clearSession, getUser } from '@/lib/client';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Pelanggan', icon: Users },
  { to: '/appointments', label: 'Appointment', icon: Calendar },
  { to: '/services', label: 'Layanan', icon: Sparkles },
  { to: '/therapists', label: 'Terapis', icon: HeartPulse },
  { to: '/transactions', label: 'Transaksi', icon: Receipt },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/handoffs', label: 'Handoff', icon: UserCheck },
  { to: '/settings', label: 'Pengaturan', icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  function logout() {
    clearSession();
    router.push('/login');
  }
  return (
    <aside className="w-64 bg-white border-r border-blush flex flex-col h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-blush flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary text-white grid place-items-center font-bold shadow-soft">R</div>
        <div>
          <h1 className="text-base font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Reihan Spa</h1>
          <p className="text-[11px] text-muted">CRM &amp; WA AI Agent</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const Icon = item.icon;
          const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/');
          return (
            <Link key={item.to} href={item.to} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active ? 'bg-blush text-primary' : 'text-ink/80 hover:bg-cream'}`}>
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-4 border-t border-blush pt-3">
        {user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-semibold text-ink">{user.name}</p>
            <p className="text-[11px] text-muted">{user.role} · {user.email}</p>
          </div>
        )}
        <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted hover:bg-cream">
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </div>
    </aside>
  );
}

export function Shell({ children, title, actions }) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <main className="flex-1 px-8 py-6 max-w-screen-2xl">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-ink" style={{ fontFamily: "'Playfair Display', serif" }}>{title}</h1>
          <div>{actions}</div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function AuthGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const u = getUser();
    if (!u) router.push('/login');
    else setReady(true);
  }, [router]);
  if (!ready) return <div className="p-10 text-muted">Memuat…</div>;
  return children;
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl shadow-soft border border-blush p-5 ${className}`}>{children}</div>;
}
export function Stat({ label, value, hint }) {
  return (
    <Card>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 text-ink">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </Card>
  );
}
export function Btn({ children, className = '', ...rest }) {
  return <button className={`px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition ${className}`} {...rest}>{children}</button>;
}
export function Input(props) {
  return <input {...props} className={`w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none ${props.className||''}`} />;
}
export function Select(props) {
  return <select {...props} className={`w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none ${props.className||''}`} />;
}
export function Textarea(props) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-xl border border-blush bg-white text-sm focus:border-primary outline-none ${props.className||''}`} />;
}
export function Badge({ children, color = 'blush' }) {
  const map = {
    blush: 'bg-blush text-primary',
    green: 'bg-emerald-100 text-emerald-700',
    yellow: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[color] || map.blush}`}>{children}</span>;
}
