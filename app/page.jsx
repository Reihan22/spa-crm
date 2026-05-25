'use client';
import { useEffect, useState } from 'react';
import { AuthGuard, Shell, Card, Stat, Badge } from '@/components/Shell';
import { api, formatRupiah, formatDateTime } from '@/lib/client';

export default function DashboardPage() {
  return <AuthGuard><Shell title="Dashboard"><DashboardBody /></Shell></AuthGuard>;
}

function DashboardBody() {
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [waStatus, setWaStatus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const [s, c, w] = await Promise.all([
          api('/api/dashboard/stats'),
          api('/api/dashboard/revenue'),
          api('/api/wa/status').catch(() => null),
        ]);
        setStats(s); setChart(c); setWaStatus(w);
      } catch (e) { setError(e.message); }
    })();
  }, []);
  if (error) return <p className="text-rose-600 text-sm">{error}</p>;
  if (!stats) return <p className="text-muted text-sm">Memuat…</p>;
  const max = Math.max(1, ...chart.map(d => d.revenue));
  const totalRevenue = chart.reduce((s, d) => s + d.revenue, 0);
  
  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:gap-4 lg:grid-cols-4">
        <Stat label="Appointment Hari Ini" value={stats.today_appointments} />
        <Stat label="Revenue Hari Ini" value={formatRupiah(stats.today_revenue)} />
        <Stat label="Revenue Bulan Ini" value={formatRupiah(stats.month_revenue)} hint={`${stats.new_customers_month} pelanggan baru`} />
        <Stat label="Total Pelanggan" value={stats.total_customers} hint={`${stats.total_appointments} appointment total`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <h2 className="text-[13px] font-semibold text-ink">Revenue 30 Hari</h2>
            <span className="text-xs text-muted font-medium">{formatRupiah(totalRevenue)}</span>
          </div>
          
          {/* Mobile: horizontal scroll, Desktop: full width */}
          <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
            <div className="flex items-end gap-[6px] lg:gap-1 h-32 lg:h-40" style={{ minWidth: chart.length > 15 ? `${chart.length * 24}px` : 'auto' }}>
              {chart.map((d, i) => {
                const date = new Date(d.date);
                const dayNum = date.getDate();
                const showLabel = chart.length <= 15 || dayNum % 5 === 1 || dayNum === date.getDate();
                
                return (
                  <div key={d.date} className="flex-1 min-w-[20px] lg:min-w-0 flex flex-col items-center gap-1 group relative">
                    <div className="w-full bg-primary/80 hover:bg-primary rounded-t-sm transition-colors" 
                      style={{ 
                        height: `${(d.revenue / max) * 100}%`, 
                        minHeight: d.revenue ? 4 : 1 
                      }} 
                    />
                    {showLabel && (
                      <span className="text-[9px] lg:text-[10px] text-muted font-medium">
                        {dayNum}
                      </span>
                    )}
                    
                    {/* Tooltip */}
                    {d.revenue > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                        <div className="bg-ink text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-medium shadow-lg">
                          {formatRupiah(d.revenue)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Scroll hint on mobile */}
          {chart.length > 15 && (
            <p className="lg:hidden text-[10px] text-muted text-center mt-2">← Geser untuk lihat semua →</p>
          )}
        </Card>
        <Card>
          <h2 className="text-[13px] font-semibold text-ink mb-3 lg:mb-4">Status WhatsApp</h2>
          {waStatus ? (
            <div className="space-y-2 lg:space-y-2.5 text-[13px]">
              <div className="flex justify-between"><span className="text-muted">Engine</span><Badge>{waStatus.engine || 'baileys'}</Badge></div>
              <div className="flex justify-between"><span className="text-muted">Status</span><Badge color={waStatus.connected ? 'green' : 'yellow'}>{waStatus.status || 'unknown'}</Badge></div>
              {waStatus.phone && <div className="flex justify-between"><span className="text-muted">Nomor</span><span className="text-ink font-medium">{waStatus.phone}</span></div>}
              {!waStatus.connected && <p className="text-xs text-muted pt-1 border-t border-border">Buka menu WhatsApp untuk pairing.</p>}
            </div>
          ) : <p className="text-muted text-[13px]">Worker belum aktif.</p>}
        </Card>
      </div>
      <Card>
        <h2 className="text-[13px] font-semibold text-ink mb-3 lg:mb-4">Appointment Mendatang</h2>
        {stats.upcoming_appointments.length === 0 ? <p className="text-muted text-[13px]">Belum ada.</p> : (
          <ul className="divide-y divide-border">
            {stats.upcoming_appointments.map(a => (
              <li key={a.id} className="py-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 text-[13px]">
                <span className="text-ink">{formatDateTime(a.scheduledAt)} · {a.customer?.name} · {a.service?.name}</span>
                <Badge color={a.status === 'confirmed' ? 'green' : 'yellow'}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
