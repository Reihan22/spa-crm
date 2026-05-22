# Reihan Spa CRM

WhatsApp-first AI CRM untuk operasional spa di Indonesia. Customer chat ke nomor bisnis lewat WhatsApp, AI auto-reply, booking dibuatkan otomatis, QRIS dikirim, konfirmasi pembayaran masuk balik ke chat. Admin punya web UI buat handover ke human, kelola customer, jadwal, transaksi, dan tweak intent router/knowledge base.

## Stack

- **Frontend:** Next.js 14 App Router, TailwindCSS, Zustand
- **Backend:** Next.js API Routes, Prisma 5 ORM, PostgreSQL
- **WhatsApp:** Baileys 6.7 (multi-device, satu socket per auth dir)
- **Pembayaran:** Midtrans QRIS (sandbox/prod), webhook + poller hybrid
- **AI:** Provider-agnostic OpenAI-compatible client (Claude / GPT / MiMo via gateway)
- **Deploy:** systemd × 3 unit (`spa-crm`, `spa-crm-worker`, `spa-crm-midtrans-poller`) di belakang Cloudflare + Nginx

## Fitur Inti

- **WA reply pipeline 2-stage**
  1. Deterministic regex intent router (12 grup pattern, ~95% inbound dijawab tanpa hit LLM, latency ~50ms)
  2. LLM fallback hanya buat intent kompleks / ambiguous
- **AI booking flow:** kumpulin nama → layanan → tanggal/jam → jumlah orang → generate QRIS per booking, push ke chat
- **Auto-konfirmasi pembayaran:** webhook Midtrans → status booking → auto WA confirmation
- **Handoff ke human:** keyword trigger ("admin", "complain", "marah") flag chat ke menu Handoffs
- **Admin Web UI:**
  - Customers / Appointments / Transactions / Handoffs / WhatsApp pages, semua punya filter + bulk delete + chevron pagination
  - Settings: model & koneksi (base URL masked by default), knowledge base (token counter + preview), safety rules (chip input topic & keyword), abuse prevention, **intent patterns editor** (regex langsung dari UI, save → langsung berlaku)
  - Worker auto-reset auth dir on `loggedOut` 401, recovery via QR scan

## Arsitektur Singkat

```
WA  ─►  Baileys worker  ─►  /api/wa/inbound  ─┐
                                              ▼
                                    intent-router (regex, 0 token)
                                              │
                                          fallback?
                                              ▼
                                    AI agent (LLM, OpenAI-compatible)
                                              │
                                              ▼
                            Prisma write + WA reply via worker
                                              │
                                       (booking?) ─► Midtrans QRIS ─► WA QR
                                                                          │
                                            Midtrans webhook + poller ◄───┘
                                                          │
                                                          ▼
                                                Auto WA confirmation
```

## Setup

```bash
git clone https://github.com/USER/spa-crm.git
cd spa-crm
cp .env.example .env       # isi semua key
npm install
npx prisma db push
npm run seed               # admin user + sample data
npm run build && npm start # port 3010
node worker/wa-worker.js   # WhatsApp worker, port 3020
node scripts/midtrans-poller.mjs
```

Login admin default ada di `scripts/seed.mjs`.

## Status

Production di [spa.reihan.site](https://spa.reihan.site). Intent router hit-rate 94.9% (112/118 inbound zero-token). Cost per 100 message: ~$0.0098.

## License

MIT (atau sesuaikan)
