// Header doc: seed admin + default settings + sample services/therapists
// Run: node scripts/seed.mjs

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@spa.reihan.site';
const ADMIN_PASS  = process.env.SEED_ADMIN_PASS  || 'admin123';

async function main() {
  // Settings (singleton id=1)
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      businessName: 'Rspa',
      address: 'Jakarta, Indonesia',
      phone: '021-0000000',
      email: 'cs@spa.reihan.site',
      waNumber: '6281234567890',
      bookingPaymentInstructions: 'Untuk amankan slot, lakukan DP via QRIS atau transfer. Kirim bukti pembayaran di chat ini.',
      aiKnowledgeBase: `LAYANAN & SOP RSPA
- Spa untuk dewasa: relaksasi, therapeutic, body scrub, facial.
- Treatment dilakukan oleh terapis bersertifikat.
- Customer wajib jujur soal kondisi medis (alergi, hamil, luka, operasi).
- Booking minimal 2 jam sebelumnya.
- DP wajib untuk amankan slot.
`,
      aiSafetyRules: `ATURAN SAFETY AI
- Jangan beri diagnosis medis, resep obat, atau klaim menyembuhkan.
- Customer hamil/pasca operasi/luka terbuka: sarankan konsultasi staff dulu.
- Komplain, refund, marah, kasus di luar SOP: panggil escalate_to_human.
- Jangan jawab pertanyaan di luar layanan spa (translate, tugas sekolah, coding, dll).
`,
      aiHandoffKeywords: ['demam','kejang','sesak','muntah','dehidrasi','alergi','luka','infeksi','operasi','komplain','refund','marah','kecewa','tipu'],
      aiAllowedTopics: ['layanan','harga','jadwal','booking','reschedule','cancel','lokasi','pembayaran','terapis','durasi','paket','promo'],
      aiOffTopicReply: 'Maaf, saya hanya bantu seputar layanan & booking Rspa ya. Untuk hal lain, silakan hubungi staff kami langsung.',
      aiMaxOutputTokens: 280,
      abuseDailyMsgPerPhone: 30,
      abuseDailyCostPerPhone: 0.05,
      abuseGlobalDailyBudget: 5.0,
      abuseFlagThreshold: 3,
    },
  });
  console.log('Settings ok:', settings.businessName);

  // Admin user
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(ADMIN_PASS, 10),
        name: 'Admin Spa',
        role: 'admin',
      },
    });
    console.log('Admin created:', ADMIN_EMAIL, '/', ADMIN_PASS);
  } else {
    console.log('Admin exists:', ADMIN_EMAIL);
  }

  // Sample services
  const sampleServices = [
    { name: 'Relaxing Body Massage',  category: 'body',    durationMinutes: 60, price: 200000, description: 'Pijat relaksasi seluruh tubuh dengan minyak aromaterapi' },
    { name: 'Therapeutic Massage',    category: 'body',    durationMinutes: 90, price: 300000, description: 'Pijat terapi untuk pegal, otot tegang, recovery' },
    { name: 'Body Scrub',             category: 'body',    durationMinutes: 45, price: 180000, description: 'Eksfoliasi alami dengan scrub natural' },
    { name: 'Facial Treatment',       category: 'face',    durationMinutes: 60, price: 220000, description: 'Perawatan wajah lengkap untuk kulit cerah' },
    { name: 'Combo Spa Package',      category: 'combo',   durationMinutes: 150, price: 480000, description: 'Massage + scrub + facial dalam 1 sesi' },
  ];
  for (const s of sampleServices) {
    const exists = await prisma.service.findFirst({ where: { name: s.name } });
    if (!exists) await prisma.service.create({ data: s });
  }
  console.log('Services seeded');

  // Sample therapists
  const sampleTherapists = [
    { name: 'Dewi',  phone: '081200000001', specialization: 'Relaxing & Body Massage' },
    { name: 'Rina',  phone: '081200000002', specialization: 'Therapeutic & Sports Massage' },
    { name: 'Sari',  phone: '081200000003', specialization: 'Facial & Skincare' },
  ];
  for (const t of sampleTherapists) {
    const exists = await prisma.therapist.findFirst({ where: { name: t.name } });
    if (!exists) await prisma.therapist.create({ data: t });
  }
  console.log('Therapists seeded');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
