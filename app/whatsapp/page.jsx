'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { AuthGuard, Shell, Card, Btn, Input, Badge } from '@/components/Shell';
import { api, formatDateTime, getToken } from '@/lib/client';
import {
  Search, Send, Radio, Wifi, WifiOff, RotateCcw, LogOut,
  MessageCircle, Users, DollarSign, BarChart3, Megaphone,
  RefreshCw, ChevronLeft, X, Trash2, Bot, BotOff,
} from 'lucide-react';

/* ── Helpers ── */
function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/\D/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('620')) s = '62' + s.slice(3);
  if (!s.startsWith('62') && s.length >= 8) s = '62' + s;
  return s;
}
function shortPhone(p) {
  if (!p) return '-';
  const d = p.replace(/\D/g, '');
  return d.length > 10 ? d.slice(0, 4) + '...' + d.slice(-4) : d;
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'baru';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'j';
  return Math.floor(diff / 86400000) + 'h';
}
function trunc(s, n = 60) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function WhatsAppPage() {
  return <AuthGuard><Shell title="WhatsApp"><Body /></Shell></AuthGuard>;
}

/* ── Main Body ── */
function Body() {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [convos, setConvos] = useState([]);
  const [activePhone, setActivePhone] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatTotal, setChatTotal] = useState(0);
  const [searchQ, setSearchQ] = useState('');
  const [sendText, setSendText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qr, setQr] = useState(null);
  const chatEndRef = useRef(null);
  const esRef = useRef(null);
  const activePhoneRef = useRef(null);
  const sseClosedRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => { activePhoneRef.current = activePhone; }, [activePhone]);

  /* ── SSE real-time ── */
  const startSSE = useCallback(function startSSE() {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/wa/stream?token=${encodeURIComponent(getToken() || '')}`);
    sseClosedRef.current = false;
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'message') {
          const msg = payload.data;
          // Update conversation list
          setConvos(prev => {
            const idx = prev.findIndex(c => c.phone === msg.normalizedPhone);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                lastMessage: msg,
                unread: msg.direction === 'in' ? (updated[idx].unread || 0) + 1 : updated[idx].unread,
                stats: {
                  ...updated[idx].stats,
                  total: (updated[idx].stats?.total || 0) + 1,
                },
              };
              // Move to top
              const [item] = updated.splice(idx, 1);
              return [item, ...updated];
            }
            // New conversation
            return [{
              phone: msg.normalizedPhone,
              customer: null,
              lastMessage: msg,
              stats: { total: 1, inbound: msg.direction === 'in' ? 1 : 0, outbound: msg.direction === 'out' ? 1 : 0, blocked: false },
              unread: msg.direction === 'in' ? 1 : 0,
            }, ...prev];
          });
          // Append to active chat
          if (activePhoneRef.current && msg.normalizedPhone === activePhoneRef.current) {
            setChatMsgs(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        } else if (payload.type === 'status') {
          setStatus(payload.data);
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      if (!sseClosedRef.current) setTimeout(startSSE, 5000);
    };
    esRef.current = es;
  }, []);

  /* ── Initial load ── */
  useEffect(() => {
    loadConvos();
    loadStats();
    pollStatus();
    startSSE();
    return () => {
      sseClosedRef.current = true;
      if (esRef.current) esRef.current.close();
    };
  }, []);

  /* ── Scroll to bottom on new messages ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  /* ── Load active chat when phone changes ── */
  useEffect(() => {
    if (activePhone) loadChat(activePhone);
  }, [activePhone]);

  async function pollStatus() {
    try {
      const s = await api('/api/wa/status').catch(() => null);
      setStatus(s);
    } catch {}
  }

  async function loadConvos() {
    try {
      const r = await api('/api/wa/conversations?limit=100');
      setConvos(r.conversations || []);
    } catch (e) { setErr(e.message); }
  }

  async function loadStats() {
    try {
      const r = await api('/api/wa/stats');
      setStats(r);
    } catch {}
  }

  async function loadChat(phone) {
    try {
      const r = await api(`/api/wa/messages?phone=${encodeURIComponent(phone)}&size=100`);
      setChatMsgs((r.items || []).reverse());
      setChatTotal(r.total || 0);
      // Clear unread
      setConvos(prev => prev.map(c => c.phone === phone ? { ...c, unread: 0 } : c));
      // Load customer info
      const conv = convos.find(c => c.phone === phone);
      setActiveCustomer(conv?.customer || null);
    } catch (e) { setErr(e.message); }
  }

  async function doSend(e) {
    e.preventDefault();
    if (!sendText.trim() || !activePhone) return;
    setErr('');
    try {
      await api('/api/wa/send', {
        method: 'POST',
        body: JSON.stringify({ phone: activePhone, content: sendText }),
      });
      setSendText('');
      loadChat(activePhone);
      loadConvos();
    } catch (e) { setErr(e.message); }
  }

  async function doReset(mode) {
    if (!confirm(mode === 'logout' ? 'Logout WA & hapus session?' : 'Reset session & re-pair QR?')) return;
    setBusy(true); setErr('');
    try {
      await api('/api/wa/reset', { method: 'POST', body: JSON.stringify({ mode }) });
      setQr(null);
      setTimeout(pollStatus, 1500);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doDeleteChat(phone) {
    if (!confirm('Hapus semua percakapan ini? Tidak bisa di-undo.')) return;
    setBusy(true); setErr('');
    try {
      await api(`/api/wa/conversations?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' });
      setConvos(prev => prev.filter(c => c.phone !== phone));
      if (activePhone === phone) {
        setActivePhone(null);
        setActiveCustomer(null);
        setChatMsgs([]);
        setShowMobileChat(false);
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doToggleAI(phone, currentEnabled) {
    setBusy(true); setErr('');
    try {
      await api('/api/wa/toggle-ai', {
        method: 'PATCH',
        body: JSON.stringify({ phone, aiEnabled: !currentEnabled }),
      });
      // Update convos state
      setConvos(prev => prev.map(c =>
        c.phone === phone ? { ...c, customer: { ...c.customer, aiEnabled: !currentEnabled } } : c
      ));
      if (activeCustomer) setActiveCustomer(ac => ac ? { ...ac, aiEnabled: !currentEnabled } : ac);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  /* ── Filtered convos ── */
  const filtered = searchQ
    ? convos.filter(c =>
        c.phone.includes(searchQ) ||
        c.customer?.name?.toLowerCase().includes(searchQ.toLowerCase()) ||
        c.lastMessage?.content?.toLowerCase().includes(searchQ.toLowerCase())
      )
    : convos;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* ── Stats Bar ── */}
      <StatsBar stats={stats} status={status} onBroadcast={() => setShowBroadcast(true)} onQR={() => { setShowQR(!showQR); if (!showQR) api('/api/wa/qr').then(r => setQr(r?.qr)).catch(() => {}); }} onReset={doReset} busy={busy} />

      {/* ── Main 3-col layout ── */}
      <div className="flex-1 flex overflow-hidden mt-3">
        {/* ── Col 1: Conversations list ── */}
        <div className={`${showMobileChat ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 xl:w-96 border-r border-border flex-shrink-0`}>
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Cari nomor, nama, pesan…"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Conversation list */}
          <ul className="flex-1 overflow-y-auto divide-y divide-border/60">
            {filtered.map(c => (
              <li
                key={c.phone}
                onClick={() => { setActivePhone(c.phone); setShowMobileChat(true); }}
                className={`px-3 py-3 cursor-pointer transition hover:bg-surface/50 ${activePhone === c.phone ? 'bg-primary/5 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {c.customer?.name?.[0]?.toUpperCase() || shortPhone(c.phone).slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink truncate">
                        {c.customer?.name || shortPhone(c.phone)}
                      </span>
                      <span className="text-[11px] text-muted ml-2 flex-shrink-0">
                        {timeAgo(c.lastMessage?.sentAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted truncate pr-2">
                        {c.lastMessage?.direction === 'out' && <span className="text-primary">Anda: </span>}
                        {trunc(c.lastMessage?.content)}
                      </p>
                      {c.unread > 0 && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-medium">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    {c.stats?.blocked && <Badge color="red" className="mt-1">blocked</Badge>}
                  </div>
                </div>
              </li>
            ))}
            {!filtered.length && (
              <li className="py-12 text-center text-muted text-xs">
                {searchQ ? 'Tidak ditemukan' : 'Belum ada percakapan'}
              </li>
            )}
          </ul>
        </div>

        {/* ── Col 2: Chat view ── */}
        <div className={`${showMobileChat ? 'flex' : 'hidden lg:flex'} flex-col flex-1 min-w-0`}>
          {activePhone ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button onClick={() => setShowMobileChat(false)} className="lg:hidden p-1.5 rounded-md hover:bg-surface">
                  <ChevronLeft className="w-5 h-5 text-muted" />
                </button>
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {activeCustomer?.name?.[0]?.toUpperCase() || shortPhone(activePhone).slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{activeCustomer?.name || shortPhone(activePhone)}</h3>
                  <p className="text-[11px] text-muted font-mono">{activePhone}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {activeCustomer?.totalBookings > 0 && <Badge color="blue">{activeCustomer.totalBookings} booking</Badge>}
                  {activeCustomer?.tags?.length > 0 && <Badge>{activeCustomer.tags[0]}</Badge>}
                  <button
                    onClick={() => doToggleAI(activePhone, activeCustomer?.aiEnabled !== false)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition ${
                      activeCustomer?.aiEnabled !== false
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-surface text-muted hover:bg-rose-50 hover:text-rose-600'
                    }`}
                    title={activeCustomer?.aiEnabled !== false ? 'AI aktif — klik untuk matikan' : 'AI mati — klik untuk aktifkan'}
                  >
                    {activeCustomer?.aiEnabled !== false ? <Bot className="w-3.5 h-3.5" /> : <BotOff className="w-3.5 h-3.5" />}
                    AI {activeCustomer?.aiEnabled !== false ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => doDeleteChat(activePhone)}
                    className="p-1.5 rounded-md hover:bg-rose-50 text-muted hover:text-rose-600 transition"
                    title="Hapus percakapan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-surface/20">
                {chatMsgs.map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      m.direction === 'out'
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-card border border-border text-ink rounded-bl-md'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div className={`flex items-center gap-1.5 mt-1 ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[10px] ${m.direction === 'out' ? 'text-white/60' : 'text-muted'}`}>
                          {formatDateTime(m.sentAt)}
                        </span>
                        {m.source && m.source !== 'human' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            m.direction === 'out' ? 'bg-white/10 text-white/60' : 'bg-surface text-muted'
                          }`}>
                            {m.source === 'ai_agent' ? 'AI' : m.source}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Send bar */}
              <form onSubmit={doSend} className="px-4 py-3 border-t border-border flex items-center gap-2">
                <input
                  value={sendText}
                  onChange={e => setSendText(e.target.value)}
                  placeholder="Kirim pesan…"
                  className="flex-1 px-4 py-2.5 rounded-full border border-border bg-card text-sm focus:border-primary outline-none"
                />
                <button
                  type="submit"
                  disabled={!sendText.trim() || !status?.connected}
                  className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Pilih percakapan untuk mulai</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Error toast ── */}
      {err && (
        <div className="fixed bottom-4 right-4 bg-rose-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg flex items-center gap-2 z-50">
          {err}
          <button onClick={() => setErr('')} className="hover:bg-white/20 rounded p-0.5"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* ── QR Modal ── */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowQR(false)}>
          <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Koneksi WhatsApp</h3>
            {!status && <p className="text-muted text-sm animate-pulse">Worker tidak merespons…</p>}
            {status && <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Status</span><Badge color={status.connected ? 'green' : 'yellow'}>{status.status}</Badge></div>
              {status.phone && <div className="flex justify-between"><span className="text-muted">Nomor</span><span className="font-mono text-xs">{status.phone}</span></div>}
              {qr && <img alt="QR" src={qr} className="w-full rounded-md border-2 border-border mt-2" />}
              {!status.connected && !qr && <p className="text-xs text-muted text-center py-2">Menunggu QR… coba Reset.</p>}
              <div className="pt-3 mt-3 border-t border-border flex flex-col gap-2">
                <button disabled={busy} onClick={() => doReset('reset')} className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition"><RotateCcw className="w-4 h-4" /> Reset session</button>
                <button disabled={busy} onClick={() => doReset('logout')} className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50 transition"><LogOut className="w-4 h-4" /> Logout & ganti nomor</button>
              </div>
            </div>}
          </Card>
        </div>
      )}

      {/* ── Broadcast Modal ── */}
      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}
    </div>
  );
}

/* ── Stats Bar ── */
function StatsBar({ stats, status, onBroadcast, onQR, onReset, busy }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Status badge */}
      <button onClick={onQR} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs hover:bg-surface transition">
        {status?.connected
          ? <><Wifi className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-emerald-600 font-medium">Online</span></>
          : <><WifiOff className="w-3.5 h-3.5 text-amber-500" /> <span className="text-amber-600 font-medium">Offline</span></>
        }
      </button>

      {/* Stats pills */}
      {stats && <>
        <StatPill icon={MessageCircle} label="Hari ini" value={stats.today?.total || 0} color="primary" />
        <StatPill icon={Users} label="Customer" value={stats.today?.customers || 0} color="blue" />
        <StatPill icon={BarChart3} label="Minggu ini" value={stats.week?.total || 0} color="purple" />
        <StatPill icon={DollarSign} label="AI cost" value={`$${(stats.cost?.todayUsd || 0).toFixed(3)}`} color="amber" />
        {stats.handoffPending > 0 && <StatPill icon={Users} label="Handoff" value={stats.handoffPending} color="rose" />}
      </>}

      {/* Actions */}
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onBroadcast} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition">
          <Megaphone className="w-3.5 h-3.5" /> Broadcast
        </button>
        <button onClick={() => { onReset('reset'); }} disabled={busy} className="p-1.5 rounded-md hover:bg-surface text-muted transition" title="Reset session">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface text-xs">
      <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

/* ── Broadcast Modal ── */
function BroadcastModal({ onClose }) {
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('all');
  const [tags, setTags] = useState('');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  async function doBroadcast() {
    if (!content.trim()) return;
    setBusy(true); setErr(''); setResult(null);
    try {
      const body = { content, target };
      if (target === 'segment' && tags) body.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (target === 'inactive') body.minDaysSinceVisit = parseInt(days) || 30;
      const r = await api('/api/wa/broadcast', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" /> Broadcast
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted font-medium mb-1 block">Pesan</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Tulis pesan broadcast…"
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted font-medium mb-1 block">Target</label>
            <select value={target} onChange={e => setTarget(e.target.value)} className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:border-primary outline-none">
              <option value="all">Semua customer aktif</option>
              <option value="segment">Segment (tag tertentu)</option>
              <option value="inactive">Inactive (belum visit X hari)</option>
            </select>
          </div>

          {target === 'segment' && (
            <div>
              <label className="text-xs text-muted font-medium mb-1 block">Tags (pisah koma)</label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="VIP, regular, promo" />
            </div>
          )}

          {target === 'inactive' && (
            <div>
              <label className="text-xs text-muted font-medium mb-1 block">Min hari sejak visit terakhir</label>
              <Input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="30" />
            </div>
          )}

          {err && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-md">{err}</p>}

          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm">
              <p className="font-medium text-emerald-700">Broadcast terkirim!</p>
              <p className="text-emerald-600 text-xs mt-1">Terkirim: {result.sent} · Gagal: {result.failed} · Total: {result.total}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Btn onClick={doBroadcast} disabled={busy || !content.trim()} className="flex-1">
              {busy ? 'Mengirim…' : 'Kirim Broadcast'}
            </Btn>
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-surface transition">Tutup</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
