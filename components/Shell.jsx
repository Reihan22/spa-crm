// Header doc: shared client UI primitives (sidebar, layout shell, auth guard, header).
'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Calendar, Sparkles, HeartPulse,
  Receipt, MessageCircle, UserCheck, Settings as SettingsIcon, LogOut,
  Menu, X, Sun, Moon, Plus,
} from 'lucide-react';
import { clearSession, getUser } from '@/lib/client';

/* ── Theme context ── */
const ThemeCtx = createContext({ dark: false, toggle: () => {} });
export function useTheme() { return useContext(ThemeCtx); }

function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('spa_theme');
    if (saved === 'dark') { setDark(true); document.documentElement.classList.add('dark'); }
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('spa_theme', next ? 'dark' : 'light');
  }
  return <ThemeCtx.Provider value={{ dark, toggle }}>{children}</ThemeCtx.Provider>;
}

/* ── Navigation config ── */
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

function isActivePath(pathname, to, end) {
  return end ? pathname === to : pathname === to || pathname.startsWith(to + '/');
}

/* ── Sidebar content (shared between desktop sidebar & mobile sheet) ── */
function SidebarContent({ onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const user = getUser();

  function logout() {
    clearSession();
    router.push('/login');
  }

  return (
    <>
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary text-white grid place-items-center text-sm font-semibold">R</div>
            <div>
              <h1 className="text-sm font-semibold text-ink tracking-tight">Rspa</h1>
              <p className="text-[11px] text-muted font-normal">CRM & WA AI</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-md hover:bg-surface">
              <X className="w-5 h-5 text-muted" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.to, item.end);
          return (
            <Link key={item.to} href={item.to} onClick={onClose} className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface hover:text-ink'}`}>
              <Icon className="w-4 h-4" strokeWidth={active ? 2 : 1.5} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-border pt-3 space-y-1">
        <button onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-muted hover:bg-surface hover:text-ink transition-colors">
          {dark ? <Sun className="w-4 h-4" strokeWidth={1.5} /> : <Moon className="w-4 h-4" strokeWidth={1.5} />}
          <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        {user && (
          <div className="px-3 py-2">
            <p className="text-[13px] font-medium text-ink">{user.name}</p>
            <p className="text-[11px] text-muted">{user.role} · {user.email}</p>
          </div>
        )}
        <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-muted hover:bg-surface hover:text-ink transition-colors">
          <LogOut className="w-4 h-4" strokeWidth={1.5} /> Keluar
        </button>
      </div>
    </>
  );
}

/* ── Desktop sidebar ── */
function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 bg-card border-r border-border flex-col h-screen sticky top-0">
      <SidebarContent />
    </aside>
  );
}

/* ── Shell / layout ── */
export function Shell({ children, title, actions }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setMobileMenu(false); }, [pathname]);

  return (
    <ThemeProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />

        {/* Mobile slide-over */}
        {mobileMenu && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenu(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-card shadow-xl flex flex-col animate-slide-right">
              <SidebarContent onClose={() => setMobileMenu(false)} />
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0">
          {/* Mobile header */}
          <div className="lg:hidden sticky top-0 z-40 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
            <button onClick={() => setMobileMenu(true)} className="p-1.5 -ml-1.5 rounded-md hover:bg-surface">
              <Menu className="w-5 h-5 text-ink" />
            </button>
            <h1 className="text-sm font-semibold text-ink">{title}</h1>
            <div className="w-8" /> {/* spacer for centering */}
          </div>

          {/* Mobile actions bar — below header, full width */}
          {actions && (
            <div className="lg:hidden px-4 py-3 border-b border-border bg-card">
              {actions}
            </div>
          )}

          {/* Content */}
          <div className="px-4 lg:px-10 py-6 lg:py-8 max-w-screen-2xl">
            <header className="hidden lg:flex items-center justify-between mb-8">
              <h1 className="text-xl font-semibold text-ink tracking-tight">{title}</h1>
              <div>{actions}</div>
            </header>
            {children}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}

/* ── Auth guard ── */
export function AuthGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const u = getUser();
    if (!u) router.push('/login');
    else setReady(true);
  }, [router]);
  if (!ready) return <div className="p-10 text-muted text-sm">Memuat…</div>;
  return children;
}

/* ── Floating Action Button (mobile only) ── */
export function Fab({ onClick, icon: Icon = Plus, label }) {
  return (
    <button onClick={onClick} className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-white grid place-items-center shadow-fab hover:bg-primary-hover active:scale-95 transition-all" title={label}>
      <Icon className="w-6 h-6" strokeWidth={2} />
    </button>
  );
}

/* ── Modal ── */
export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-t-xl sm:rounded-xl border border-border w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-slide-up sm:animate-none shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface"><X className="w-4 h-4 text-muted" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Primitives ── */
export function Card({ children, className = '', ...rest }) {
  return <div className={`bg-card rounded-lg border border-border p-4 lg:p-5 ${className}`} {...rest}>{children}</div>;
}

export function Stat({ label, value, hint }) {
  return (
    <Card>
      <p className="text-[11px] text-muted uppercase tracking-wider font-medium">{label}</p>
      <p className="text-xl lg:text-2xl font-semibold mt-1.5 text-ink tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </Card>
  );
}

export function Btn({ children, className = '', variant = 'primary', ...rest }) {
  const base = 'px-4 py-2 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50';
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover',
    secondary: 'bg-card text-ink border border-border hover:bg-surface',
    ghost: 'text-muted hover:text-ink hover:bg-surface',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...rest}>{children}</button>;
}

export function Input(props) {
  return <input {...props} className={`w-full px-3 py-2 rounded-md border border-border bg-card text-[13px] text-ink placeholder:text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors ${props.className || ''}`} />;
}

export function Select(props) {
  return <select {...props} className={`w-full px-3 py-2 rounded-md border border-border bg-card text-[13px] text-ink focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors ${props.className || ''}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-md border border-border bg-card text-[13px] text-ink placeholder:text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors resize-none ${props.className || ''}`} />;
}

export function Badge({ children, color = 'default' }) {
  const map = {
    default: 'bg-surface text-muted',
    primary: 'bg-primary/10 text-primary',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    yellow: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    gray: 'bg-surface text-muted',
  };
  return <span className={`px-2 py-0.5 rounded text-[11px] font-medium inline-block ${map[color] || map.default}`}>{children}</span>;
}
