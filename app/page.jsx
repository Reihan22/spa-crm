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
  if (error) return <p className="text-rose-600">{error}</p>;
  if (!stats) return <p className="text-muted">Memuat…</p>;
  const max = Math.max(1, ...chart.map(d => d.revenue));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Appointment Hari Ini" value={stats.today_appointments} />
        <Stat label="Revenue Hari Ini" value={formatRupiah(stats.today_revenue)} />
        <Stat label="Revenue Bulan Ini" value={formatRupiah(stats.month_revenue)} hint={`${stats.new_customers_month} pelanggan baru`} />
        <Stat label="Total Pelanggan" value={stats.total_customers} hint={`${stats.total_appointments} appointment total`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3">Revenue 30 Hari</h2>
          <div className="flex items-end gap-1 h-40">
            {chart.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-primary/80 rounded-t" style={{ height: `${(d.revenue / max) * 100}%`, minHeight: d.revenue ? 4 : 1 }} title={`${d.day}: ${formatRupiah(d.revenue)}`} />
                <span className="text-[8px] text-muted">{d.day}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold mb-3">Status WhatsApp</h2>
          {waStatus ? (
            <div className="space-y-2 text-sm">
              <p>Engine: <Badge>{waStatus.engine || 'baileys'}</Badge></p>
              <p>Status: <Badge color={waStatus.connected ? 'green' : 'yellow'}>{waStatus.status || 'unknown'}</Badge></p>
              {waStatus.phone && <p className="text-muted">Nomor: {waStatus.phone}</p>}
              {!waStatus.connected && <p className="text-xs text-muted">Buka menu WhatsApp untuk pairing.</p>}
            </div>
          ) : <p className="text-muted text-sm">Worker belum aktif.</p>}
        </Card>
      </div>
      <Card>
        <h2 className="text-sm font-semibold mb-3">Appointment Mendatang</h2>
        {stats.upcoming_appointments.length === 0 ? <p className="text-muted text-sm">Belum ada.</p> : (
          <ul className="divide-y divide-blush">
            {stats.upcoming_appointments.map(a => (
              <li key={a.id} className="py-2 flex justify-between text-sm">
                <span>{formatDateTime(a.scheduledAt)} · {a.customer?.name} · {a.service?.name}</span>
                <Badge color={a.status === 'confirmed' ? 'green' : 'yellow'}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
