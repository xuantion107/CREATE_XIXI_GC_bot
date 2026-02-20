// ╔══════════════════════════════════════════════════════════════════╗
// ║         TELEGRAM BOT - CARI CUAN PRO v3.0                       ║
// ║   Storage  : database.json (File System lokal)                   ║
// ║   Safelink : safelinku.com API                                   ║
// ║   Deploy   : Railway.app                                         ║
// ╚══════════════════════════════════════════════════════════════════╝

// ================================================================
//  ⚙️  KONFIGURASI UTAMA — EDIT JIKA DIPERLUKAN
// ================================================================

const BOT_TOKEN       = '7596953618:AAFLpibLwDG3ZrT2yeiILPoYhO52-mMyh_Y';
const ADMIN_ID        = 8496726839;
const BOT_USERNAME    = 'GroupA1securitybot';
const ADMIN_USERNAME  = '@xuantionzang';

// Safelink API — ganti API_KEY dengan key milikmu
const SAFELINK_API    = 'https://safelinku.com/api?api=04cb8650fa3abed9f459c8e1a0482dde20adae4b&url=';

// ================================================================
//  🔧  KONSTANTA SISTEM
// ================================================================
const MIN_WITHDRAW    = 20000;   // Minimal penarikan (Rupiah)
const REFERRAL_BONUS  = 100;     // Bonus referral per orang (Rupiah)
const MAX_TUGAS_USER  = 5;       // Maksimal tugas ditampilkan ke user

// ================================================================
//  📦  IMPORT
// ================================================================
const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

// ================================================================
//  💾  DATABASE (File JSON)
// ================================================================
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = {
      users    : {},   // { [userId]: UserObject }
      tugas    : [],   // daftar tugas dari admin
      withdraws: [],   // riwayat penarikan
      buktiQueue: [],  // antrian bukti menunggu validasi
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), 'utf8');
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {}, tugas: [], withdraws: [], buktiQueue: [] };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[saveDB] Gagal simpan:', err.message);
  }
}

function getUser(db, from) {
  const id = String(from.id);
  if (!db.users[id]) {
    db.users[id] = {
      userId       : from.id,
      username     : from.username   || 'unknown',
      firstName    : from.first_name || 'User',
      saldo        : 0,
      referralBy   : null,
      referralCount: 0,
      tugasAmbil   : [],   // { tugasId, safelinkUrl, ambilAt }
      tugasSelesai : [],   // id tugas yang sudah divalidasi & dibayar
      joinedAt     : new Date().toISOString(),
    };
  } else {
    db.users[id].username  = from.username   || db.users[id].username;
    db.users[id].firstName = from.first_name || db.users[id].firstName;
    if (!db.users[id].tugasAmbil)   db.users[id].tugasAmbil   = [];
    if (!db.users[id].tugasSelesai) db.users[id].tugasSelesai = [];
  }
  return db.users[id];
}

// ================================================================
//  🛠️  HELPER
// ================================================================
const toRp  = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const nowId = ()  => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
const genId = ()  => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Panggil Safelink API dan kembalikan URL pendek
async function getSafelink(targetUrl) {
  try {
    const encoded  = encodeURIComponent(targetUrl);
    const apiUrl   = SAFELINK_API + encoded;
    const response = await axios.get(apiUrl, { timeout: 10000 });
    // Respons safelinku: { status: 'success', shortenedUrl: '...' }
    const data = response.data;
    if (data && data.shortenedUrl) return data.shortenedUrl;
    if (data && data.short_url)    return data.short_url;
    if (data && typeof data === 'string' && data.startsWith('http')) return data;
    console.error('[safelink] Respons tidak terduga:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('[safelink] Error:', err.message);
    return null;
  }
}

// ================================================================
//  🤖  BOT
// ================================================================
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ================================================================
//  🎨  KEYBOARD
// ================================================================
const menuUtama = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('💰  DAFTAR TUGAS',   'menu_tugas')],
    [Markup.button.callback('📸  KONFIRMASI TUGAS', 'menu_konfirmasi')],
    [Markup.button.callback('📢  PASANG IKLAN',   'menu_iklan')],
    [Markup.button.callback('👤  PROFIL SAYA',    'menu_profil')],
    [Markup.button.callback('👫  UNDANG TEMAN',   'menu_referral')],
    [Markup.button.callback('💸  TARIK SALDO',    'menu_tarik')],
  ]);

const menuAdmin = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('➕  Tambah Tugas',        'adm_tambah')],
    [Markup.button.callback('✅  Validasi Bukti',       'adm_validasi')],
    [Markup.button.callback('📊  Statistik Bot',        'adm_stats')],
    [Markup.button.callback('📢  Broadcast',            'adm_broadcast')],
    [Markup.button.callback('📥  Data User (.txt)',     'adm_download')],
  ]);

const btnMenu = () =>
  Markup.inlineKeyboard([[Markup.button.callback('🔙  Menu Utama', 'back_main')]]);


// ================================================================
//  🚀  /start
// ================================================================
bot.start(async (ctx) => {
  try {
    const db    = loadDB();
    const from  = ctx.from;
    const isNew = !db.users[String(from.id)];
    const user  = getUser(db, from);

    // Proses referral untuk user baru
    const payload = ctx.startPayload;
    if (isNew && payload && /^\d+$/.test(payload)) {
      const refId = String(payload);
      if (refId !== String(from.id) && db.users[refId]) {
        user.referralBy = Number(refId);
        db.users[refId].saldo         += REFERRAL_BONUS;
        db.users[refId].referralCount += 1;
        saveDB(db);
        try {
          await bot.telegram.sendMessage(Number(refId),
            `🎉 <b>Temanmu bergabung!</b>\n\n` +
            `👤 <b>${from.first_name}</b> baru saja join via link referralmu.\n` +
            `💰 +${toRp(REFERRAL_BONUS)} sudah masuk ke saldomu!`,
            { parse_mode: 'HTML' }
          );
        } catch (_) {}
      }
    }

    saveDB(db);

    await ctx.replyWithHTML(
      `👋 Halo, <b>${from.first_name}</b>!\n\n` +
      (isNew ? `🎊 <b>Selamat datang!</b> Akun kamu sudah terdaftar.\n\n` : `Selamat datang kembali!\n\n`) +
      `Pilih menu di bawah untuk mulai cari cuan:`,
      menuUtama()
    );
  } catch (err) {
    console.error('[/start]', err.message);
    ctx.reply('Terjadi kesalahan. Ketik /start lagi.');
  }
});


// ================================================================
//  💰  MENU: DAFTAR TUGAS
// ================================================================
bot.action('menu_tugas', async (ctx) => {
  await ctx.answerCbQuery();
  const db    = loadDB();
  const user  = getUser(db, ctx.from);
  const tugas = (db.tugas || []).filter(t => t.aktif !== false).slice(-MAX_TUGAS_USER).reverse();
  saveDB(db);

  if (tugas.length === 0) {
    return ctx.editMessageText(
      `💰 <b>DAFTAR TUGAS</b>\n\n📭 Belum ada tugas tersedia. Cek kembali nanti!`,
      { parse_mode: 'HTML', ...btnMenu() }
    );
  }

  const buttons = tugas.map((t, i) => {
    const sudah = user.tugasSelesai.includes(t.id);
    const ambil = (user.tugasAmbil || []).find(a => a.tugasId === t.id);
    let   label;
    if      (sudah) label = `✅  ${t.nama}  (Selesai)`;
    else if (ambil) label = `⏳  ${t.nama}  (Menunggu Konfirmasi)`;
    else            label = `▶️  ${t.nama}  +${toRp(t.reward)}`;
    return [Markup.button.callback(label, sudah ? 'noop' : `ambil_${t.id}`)];
  });
  buttons.push([Markup.button.callback('🔙  Menu Utama', 'back_main')]);

  await ctx.editMessageText(
    `💰 <b>DAFTAR TUGAS</b>\n\n` +
    `Klik tugas untuk mendapatkan <b>link iklan unik</b> milikmu.\n` +
    `Setelah selesai, temukan <b>Kode Rahasia</b> di halaman akhir iklan\n` +
    `lalu konfirmasi via menu 📸 <b>Konfirmasi Tugas</b>.\n\n` +
    `<i>✅ = selesai | ⏳ = menunggu validasi admin</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

// Ambil tugas — generate safelink unik untuk user ini
bot.action(/^ambil_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Memproses link unikmu...');

  const tugasId = ctx.match[1];
  const db      = loadDB();
  const user    = getUser(db, ctx.from);
  const tugas   = (db.tugas || []).find(t => t.id === tugasId);

  if (!tugas || tugas.aktif === false) {
    return ctx.answerCbQuery('Tugas ini sudah tidak tersedia.', { show_alert: true });
  }
  if (user.tugasSelesai.includes(tugasId)) {
    return ctx.answerCbQuery('Kamu sudah menyelesaikan tugas ini!', { show_alert: true });
  }

  const existing = (user.tugasAmbil || []).find(a => a.tugasId === tugasId);
  if (existing) {
    // Tampilkan link yang sudah ada
    return ctx.editMessageText(
      `📌 <b>${tugas.nama}</b>\n\n` +
      `🔗 <b>Link Iklan Unikmu:</b>\n${existing.safelinkUrl}\n\n` +
      `💵 Reward: <b>${toRp(tugas.reward)}</b>\n\n` +
      `<b>Langkah:</b>\n` +
      `1️⃣  Buka link di atas\n` +
      `2️⃣  Tunggu hingga halaman akhir muncul\n` +
      `3️⃣  Catat <b>Kode Rahasia</b> yang tampil\n` +
      `4️⃣  Screenshot halaman tersebut\n` +
      `5️⃣  Klik 📸 <b>Konfirmasi Tugas</b> di menu utama\n\n` +
      `<i>⚠️ Link ini unik untukmu. Jangan bagikan ke orang lain.</i>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('📸  Konfirmasi Sekarang', 'menu_konfirmasi')],
        [Markup.button.callback('🔙  Kembali',              'menu_tugas')],
      ])}
    );
  }

  // Generate safelink baru
  await ctx.editMessageText(
    `⏳ Sedang membuat link iklan unik untukmu...\nMohon tunggu sebentar.`,
    { parse_mode: 'HTML' }
  );

  const safelinkUrl = await getSafelink(tugas.linkTujuan);

  if (!safelinkUrl) {
    return ctx.editMessageText(
      `❌ <b>Gagal membuat link iklan.</b>\n\nSilakan coba lagi dalam beberapa menit atau hubungi admin.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄  Coba Lagi',  `ambil_${tugasId}`)],
        [Markup.button.callback('🔙  Kembali',    'menu_tugas')],
      ])}
    );
  }

  // Simpan link unik ke data user
  user.tugasAmbil = user.tugasAmbil || [];
  user.tugasAmbil.push({
    tugasId,
    safelinkUrl,
    ambilAt: new Date().toISOString(),
  });
  saveDB(db);

  await ctx.editMessageText(
    `📌 <b>${tugas.nama}</b>\n\n` +
    `🔗 <b>Link Iklan Unikmu (simpan baik-baik!):</b>\n<code>${safelinkUrl}</code>\n\n` +
    `💵 Reward: <b>${toRp(tugas.reward)}</b>\n\n` +
    `<b>Langkah selanjutnya:</b>\n` +
    `1️⃣  Buka link di atas\n` +
    `2️⃣  Tunggu hingga halaman akhir muncul\n` +
    `3️⃣  Catat <b>Kode Rahasia</b> yang tampil di sana\n` +
    `4️⃣  Screenshot halaman tersebut sebagai bukti\n` +
    `5️⃣  Klik 📸 <b>Konfirmasi Tugas</b> di menu utama\n\n` +
    `<i>⚠️ Link ini unik untukmu. Jangan bagikan!</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('📸  Konfirmasi Sekarang', 'menu_konfirmasi')],
      [Markup.button.callback('🔙  Kembali ke Tugas',   'menu_tugas')],
    ])}
  );
});

bot.action('noop', async (ctx) => ctx.answerCbQuery('Tugas ini sudah selesai.'));


// ================================================================
//  📸  MENU: KONFIRMASI TUGAS
// ================================================================
bot.action('menu_konfirmasi', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from);
  saveDB(db);

  // Ambil tugas yang sudah diambil tapi belum selesai
  const belumSelesai = (user.tugasAmbil || []).filter(
    a => !user.tugasSelesai.includes(a.tugasId)
  );

  if (belumSelesai.length === 0) {
    return ctx.editMessageText(
      `📸 <b>KONFIRMASI TUGAS</b>\n\n` +
      `📭 Kamu belum mengambil tugas apapun atau semua sudah selesai.\n\n` +
      `Ambil tugas dulu dari menu 💰 <b>Daftar Tugas</b>.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('💰  Ambil Tugas',  'menu_tugas')],
        [Markup.button.callback('🔙  Menu Utama',   'back_main')],
      ])}
    );
  }

  const buttons = belumSelesai.map(a => {
    const info    = (db.tugas || []).find(t => t.id === a.tugasId);
    const sudahKirim = (db.buktiQueue || []).some(
      b => b.userId === ctx.from.id && b.tugasId === a.tugasId && b.status === 'pending'
    );
    const label = sudahKirim
      ? `⏳  ${info?.nama || a.tugasId}  (Menunggu Validasi)`
      : `📸  ${info?.nama || a.tugasId}  (+${toRp(info?.reward || 0)})`;
    return [Markup.button.callback(label, sudahKirim ? 'noop_konfirm' : `kirim_bukti_${a.tugasId}`)];
  });
  buttons.push([Markup.button.callback('🔙  Menu Utama', 'back_main')]);

  await ctx.editMessageText(
    `📸 <b>KONFIRMASI TUGAS</b>\n\n` +
    `Pilih tugas yang sudah kamu selesaikan:`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

bot.action('noop_konfirm', async (ctx) => {
  await ctx.answerCbQuery('Bukti tugasmu sedang divalidasi admin. Sabar ya! ⏳', { show_alert: true });
});

// User memilih tugas untuk dikonfirmasi → minta kode + foto
bot.action(/^kirim_bukti_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tugasId = ctx.match[1];
  const db      = loadDB();
  const tugas   = (db.tugas || []).find(t => t.id === tugasId);

  ctx.session              = ctx.session || {};
  ctx.session.konfirmasiId = tugasId;
  ctx.session.stepKonfirm  = 'kode'; // langkah: minta kode dulu

  await ctx.editMessageText(
    `📸 <b>KONFIRMASI TUGAS</b>\n` +
    `📌 ${tugas?.nama || tugasId}\n\n` +
    `<b>Langkah 1/2:</b> Ketik <b>Kode Rahasia</b> yang kamu temukan di halaman akhir iklan:\n\n` +
    `<i>Kode berupa kombinasi huruf/angka. Tulis dengan benar!</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'batal_konfirm')]]) }
  );
});

bot.action('batal_konfirm', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session              = ctx.session || {};
  ctx.session.konfirmasiId = null;
  ctx.session.stepKonfirm  = null;
  await ctx.editMessageText('❌ Konfirmasi dibatalkan.', menuUtama());
});


// ================================================================
//  📢  MENU: PASANG IKLAN
// ================================================================
bot.action('menu_iklan', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📢 <b>PASANG IKLAN</b>\n\n` +
    `Promosikan link, produk, atau channel kamu ke semua member!\n\n` +
    `<b>Paket Tersedia:</b>\n` +
    `📌 Broadcast 1x ke semua user  → <b>Rp10.000</b>\n` +
    `📌 Iklan di Daftar Tugas 7 hari → <b>Rp25.000</b>\n\n` +
    `<b>Cara Order:</b>\n` +
    `1. Hubungi Admin via tombol di bawah\n` +
    `2. Kirim link & materi iklanmu\n` +
    `3. Transfer sesuai paket\n` +
    `4. Iklan langsung tayang!\n\n` +
    `<i>Slot terbatas. Hubungi admin sekarang!</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.url(`💬  Hubungi Admin (${ADMIN_USERNAME})`, `https://t.me/${BOT_USERNAME}`)],
      [Markup.button.callback('🔙  Menu Utama', 'back_main')],
    ])}
  );
});


// ================================================================
//  👤  MENU: PROFIL
// ================================================================
bot.action('menu_profil', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from);
  saveDB(db);

  const selesai = user.tugasSelesai.length;
  const pending = (db.buktiQueue || []).filter(
    b => b.userId === ctx.from.id && b.status === 'pending'
  ).length;
  const tgl = new Date(user.joinedAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  await ctx.editMessageText(
    `👤 <b>PROFIL SAYA</b>\n\n` +
    `📛  Nama       : <b>${user.firstName}</b>\n` +
    `🆔  ID          : <code>${user.userId}</code>\n` +
    `👤  Username   : @${user.username}\n` +
    `💰  Saldo      : <b>${toRp(user.saldo)}</b>\n` +
    `✅  Tugas OK   : <b>${selesai} tugas</b>\n` +
    `⏳  Pending    : <b>${pending} tugas</b>\n` +
    `👫  Referral   : <b>${user.referralCount} orang</b>\n` +
    `📅  Bergabung  : <b>${tgl}</b>`,
    { parse_mode: 'HTML', ...btnMenu() }
  );
});


// ================================================================
//  👫  MENU: REFERRAL
// ================================================================
bot.action('menu_referral', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from);
  saveDB(db);

  const link = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;

  await ctx.editMessageText(
    `👫 <b>UNDANG TEMAN</b>\n\n` +
    `Ajak temanmu bergabung dan dapatkan <b>${toRp(REFERRAL_BONUS)}</b> per orang!\n\n` +
    `🔗 <b>Link Referralmu:</b>\n<code>${link}</code>\n\n` +
    `👥  Sudah bergabung : <b>${user.referralCount} orang</b>\n` +
    `💵  Total bonus     : <b>${toRp(user.referralCount * REFERRAL_BONUS)}</b>\n\n` +
    `<i>Copy link di atas dan bagikan ke teman-temanmu!</i>`,
    { parse_mode: 'HTML', ...btnMenu() }
  );
});


// ================================================================
//  💸  MENU: TARIK SALDO
// ================================================================
bot.action('menu_tarik', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from);
  saveDB(db);

  if (user.saldo < MIN_WITHDRAW) {
    return ctx.editMessageText(
      `💸 <b>TARIK SALDO</b>\n\n` +
      `❌ Saldo belum mencukupi!\n\n` +
      `💰  Saldo kamu     : <b>${toRp(user.saldo)}</b>\n` +
      `📋  Minimal tarik  : <b>${toRp(MIN_WITHDRAW)}</b>\n` +
      `📉  Kurang          : <b>${toRp(MIN_WITHDRAW - user.saldo)}</b>\n\n` +
      `Yuk selesaikan lebih banyak tugas! 💪`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('💰  Cari Tugas',  'menu_tugas')],
        [Markup.button.callback('🔙  Menu Utama',  'back_main')],
      ])}
    );
  }

  ctx.session       = ctx.session || {};
  ctx.session.tarik = true;

  await ctx.editMessageText(
    `💸 <b>TARIK SALDO</b>\n\n` +
    `💰  Saldo tersedia : <b>${toRp(user.saldo)}</b>\n\n` +
    `Ketik nomor <b>DANA / OVO / GoPay</b> kamu:\n\n` +
    `Contoh: <code>085123456789</code>\n\n` +
    `⚠️  Pastikan nomor benar sebelum mengirim!\n` +
    `<i>Proses 1×24 jam hari kerja.</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'batal_tarik')]]) }
  );
});

bot.action('batal_tarik', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session       = ctx.session || {};
  ctx.session.tarik = false;
  await ctx.editMessageText('❌ Penarikan dibatalkan.', menuUtama());
});


// ================================================================
//  🔙  KEMBALI KE MENU
// ================================================================
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = ctx.session || {};
  ctx.session.tarik        = false;
  ctx.session.broadcast    = false;
  ctx.session.konfirmasiId = null;
  ctx.session.stepKonfirm  = null;
  ctx.session.addTugas     = null;
  await ctx.editMessageText(
    `🏠 <b>MENU UTAMA</b>\n\nPilih menu:`,
    { parse_mode: 'HTML', ...menuUtama() }
  );
});


// ================================================================
//  📨  HANDLER TEKS
// ================================================================
bot.on('text', async (ctx) => {
  try {
    const teks = ctx.message.text.trim();
    ctx.session = ctx.session || {};

    // ── COMMAND ADMIN ──────────────────────────────────────────
    if (teks === '/admin1922') {
      if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses ditolak.');
      return ctx.replyWithHTML(
        `🔐 <b>PANEL ADMIN</b>\n\n` +
        `Selamat datang, Admin!\n🕐 ${nowId()}`,
        menuAdmin()
      );
    }

    // ── INPUT NOMOR TARIK SALDO ─────────────────────────────────
    if (ctx.session.tarik) {
      const noHp = teks.replace(/\D/g, '');
      if (!/^0[0-9]{9,12}$/.test(noHp)) {
        return ctx.replyWithHTML(
          `❌ Format nomor tidak valid!\n\nHarus diawali <b>0</b>, 10–13 digit.\n` +
          `Contoh: <code>085123456789</code>`
        );
      }

      const db   = loadDB();
      const user = getUser(db, ctx.from);
      if (user.saldo < MIN_WITHDRAW) {
        ctx.session.tarik = false;
        return ctx.reply('❌ Saldo tidak cukup saat ini.');
      }

      const jumlah = user.saldo;
      user.saldo   = 0;
      const wd     = {
        id       : genId(),
        userId   : ctx.from.id,
        username : user.username,
        firstName: user.firstName,
        jumlah,
        ewallet  : noHp,
        status   : 'pending',
        createdAt: new Date().toISOString(),
      };
      db.withdraws = db.withdraws || [];
      db.withdraws.push(wd);
      saveDB(db);
      ctx.session.tarik = false;

      await ctx.replyWithHTML(
        `✅ <b>Permintaan Penarikan Terkirim!</b>\n\n` +
        `💰  Jumlah  : <b>${toRp(jumlah)}</b>\n` +
        `📱  Nomor   : <code>${noHp}</code>\n` +
        `⏳  Status  : <b>PENDING</b>\n\n` +
        `Proses 1×24 jam. Notifikasi dikirim setelah selesai.`,
        menuUtama()
      );

      try {
        await bot.telegram.sendMessage(ADMIN_ID,
          `💸 <b>WITHDRAW BARU!</b>\n\n` +
          `👤 @${user.username} (ID: <code>${ctx.from.id}</code>)\n` +
          `💰 Jumlah : <b>${toRp(jumlah)}</b>\n` +
          `📱 Nomor  : <code>${noHp}</code>\n` +
          `🕐 Waktu  : ${nowId()}\n` +
          `🆔 WD ID  : <code>${wd.id}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      return;
    }

    // ── INPUT KODE RAHASIA (Langkah 1 konfirmasi) ──────────────
    if (ctx.session.konfirmasiId && ctx.session.stepKonfirm === 'kode') {
      const kodeInput = teks.toUpperCase();
      const db        = loadDB();
      const tugas     = (db.tugas || []).find(t => t.id === ctx.session.konfirmasiId);

      if (!tugas) {
        ctx.session.konfirmasiId = null;
        ctx.session.stepKonfirm  = null;
        return ctx.reply('❌ Tugas tidak ditemukan.');
      }

      if (kodeInput !== (tugas.kodeRahasia || '').toUpperCase()) {
        return ctx.replyWithHTML(
          `❌ <b>Kode Rahasia salah!</b>\n\nPeriksa kembali kode yang kamu temukan di halaman akhir iklan.\n\n` +
          `<i>Ketik ulang kode yang benar:</i>`
        );
      }

      // Kode benar → minta screenshot
      ctx.session.stepKonfirm = 'foto';
      await ctx.replyWithHTML(
        `✅ <b>Kode Rahasia benar!</b>\n\n` +
        `<b>Langkah 2/2:</b> Kirim <b>screenshot</b> halaman akhir iklan sebagai bukti:\n\n` +
        `<i>Upload foto langsung ke chat ini.</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'batal_konfirm')]])
      );
      return;
    }

    // ── INPUT TAMBAH TUGAS (Admin) ─────────────────────────────
    if (ctx.session.addTugas && ctx.from.id === ADMIN_ID) {
      const step = ctx.session.addTugas;

      if (step.langkah === 1) {
        step.nama    = teks;
        step.langkah = 2;
        return ctx.reply(`✅ Nama: "${teks}"\n\nLangkah 2/4 — Masukkan <b>Link Tujuan</b> (URL lengkap):`, { parse_mode: 'HTML' });
      }
      if (step.langkah === 2) {
        if (!/^https?:\/\/.+/.test(teks)) return ctx.reply('❌ URL tidak valid. Harus diawali https:// atau http://');
        step.link    = teks;
        step.langkah = 3;
        return ctx.reply(`✅ Link: ${teks}\n\nLangkah 3/4 — Masukkan <b>Reward</b> (angka Rupiah, contoh: 500):`, { parse_mode: 'HTML' });
      }
      if (step.langkah === 3) {
        const reward = parseInt(teks.replace(/\D/g, ''));
        if (!reward || reward <= 0) return ctx.reply('❌ Reward tidak valid. Masukkan angka saja (contoh: 500).');
        step.reward  = reward;
        step.langkah = 4;
        return ctx.reply(`✅ Reward: ${toRp(reward)}\n\nLangkah 4/4 — Masukkan <b>Kode Rahasia</b> untuk tugas ini:`, { parse_mode: 'HTML' });
      }
      if (step.langkah === 4) {
        const db = loadDB();
        const tugasBaru = {
          id          : genId(),
          nama        : step.nama,
          linkTujuan  : step.link,
          reward      : step.reward,
          kodeRahasia : teks.toUpperCase(),
          aktif       : true,
          createdAt   : new Date().toISOString(),
        };
        db.tugas = db.tugas || [];
        db.tugas.push(tugasBaru);
        saveDB(db);
        ctx.session.addTugas = null;

        return ctx.replyWithHTML(
          `✅ <b>Tugas Berhasil Ditambahkan!</b>\n\n` +
          `📌 Nama         : <b>${tugasBaru.nama}</b>\n` +
          `🔗 Link Tujuan  : ${tugasBaru.linkTujuan}\n` +
          `💵 Reward       : <b>${toRp(tugasBaru.reward)}</b>\n` +
          `🔑 Kode Rahasia : <b>${tugasBaru.kodeRahasia}</b>\n` +
          `🆔 ID Tugas     : <code>${tugasBaru.id}</code>`,
          menuAdmin()
        );
      }
    }

    // ── INPUT BROADCAST ─────────────────────────────────────────
    if (ctx.session.broadcast && ctx.from.id === ADMIN_ID) {
      ctx.session.broadcast = false;
      const db    = loadDB();
      const users = Object.values(db.users);
      let ok = 0, fail = 0;

      await ctx.reply(`📡 Mengirim ke ${users.length} user...`);

      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.userId,
            `📢 <b>PENGUMUMAN</b>\n\n${teks}`,
            { parse_mode: 'HTML' }
          );
          ok++;
        } catch (_) { fail++; }
        await new Promise(r => setTimeout(r, 60));
      }

      return ctx.replyWithHTML(
        `✅ <b>Broadcast Selesai!</b>\n\n📨 Terkirim: <b>${ok}</b>\n❌ Gagal: <b>${fail}</b>`
      );
    }

  } catch (err) {
    console.error('[text handler]', err.message);
    ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.');
  }
});


// ================================================================
//  📸  HANDLER FOTO (Screenshot Bukti Tugas)
// ================================================================
bot.on('photo', async (ctx) => {
  try {
    ctx.session = ctx.session || {};

    if (!ctx.session.konfirmasiId || ctx.session.stepKonfirm !== 'foto') {
      return; // Abaikan foto jika tidak dalam alur konfirmasi
    }

    const tugasId = ctx.session.konfirmasiId;
    const db      = loadDB();
    const user    = getUser(db, ctx.from);
    const tugas   = (db.tugas || []).find(t => t.id === tugasId);

    if (!tugas) {
      ctx.session.konfirmasiId = null;
      ctx.session.stepKonfirm  = null;
      return ctx.reply('❌ Tugas tidak ditemukan.');
    }

    // Cek sudah kirim bukti untuk tugas ini
    const sudahKirim = (db.buktiQueue || []).some(
      b => b.userId === ctx.from.id && b.tugasId === tugasId && b.status === 'pending'
    );
    if (sudahKirim) {
      ctx.session.konfirmasiId = null;
      ctx.session.stepKonfirm  = null;
      return ctx.reply('⏳ Bukti untuk tugas ini sudah kamu kirim dan sedang divalidasi admin.');
    }

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    const buktiId = genId();

    db.buktiQueue = db.buktiQueue || [];
    db.buktiQueue.push({
      id       : buktiId,
      userId   : ctx.from.id,
      username : user.username,
      firstName: user.firstName,
      tugasId,
      tugasNama: tugas.nama,
      reward   : tugas.reward,
      fileId,
      status   : 'pending',
      createdAt: new Date().toISOString(),
    });
    saveDB(db);

    ctx.session.konfirmasiId = null;
    ctx.session.stepKonfirm  = null;

    await ctx.replyWithHTML(
      `📸 <b>Bukti Diterima!</b>\n\n` +
      `📌 Tugas    : <b>${tugas.nama}</b>\n` +
      `💵 Reward   : <b>${toRp(tugas.reward)}</b>\n` +
      `⏳ Status   : <b>Menunggu Validasi Admin</b>\n\n` +
      `Kamu akan dapat notifikasi setelah admin memvalidasi. Terima kasih! 🙏`,
      menuUtama()
    );

    // ── Kirim notifikasi + foto ke admin ──────────────────────
    try {
      await bot.telegram.sendMessage(ADMIN_ID,
        `🔔 <b>BUKTI TUGAS MASUK!</b>\n\n` +
        `👤  User     : @${user.username} (ID: <code>${ctx.from.id}</code>)\n` +
        `📌  Tugas    : <b>${tugas.nama}</b>\n` +
        `💵  Reward   : <b>${toRp(tugas.reward)}</b>\n` +
        `🕐  Waktu    : ${nowId()}\n\n` +
        `👇 Lihat foto bukti di bawah ini:`,
        { parse_mode: 'HTML' }
      );
      await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
        caption:
          `📸 Bukti dari @${user.username}\n` +
          `📌 Tugas: <b>${tugas.nama}</b>\n` +
          `💵 Reward: <b>${toRp(tugas.reward)}</b>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`✅  TERIMA (+${toRp(tugas.reward)})`, `val_ok_${buktiId}`)],
          [Markup.button.callback(`❌  TOLAK`,                            `val_no_${buktiId}`)],
        ])
      });
    } catch (_) {}

  } catch (err) {
    console.error('[photo handler]', err.message);
    ctx.reply('⚠️ Terjadi kesalahan saat mengunggah foto.');
  }
});


// ================================================================
//  ✅  VALIDASI CEPAT DARI FOTO (Tombol di chat admin)
// ================================================================
bot.action(/^val_ok_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');

  const buktiId = ctx.match[1];
  const db      = loadDB();
  const bukti   = (db.buktiQueue || []).find(b => b.id === buktiId);

  if (!bukti) return ctx.answerCbQuery('Data tidak ditemukan.', { show_alert: true });
  if (bukti.status !== 'pending') return ctx.answerCbQuery('Bukti ini sudah diproses.', { show_alert: true });

  const user = db.users[String(bukti.userId)];
  if (!user) return ctx.answerCbQuery('User tidak ditemukan.', { show_alert: true });

  bukti.status       = 'diterima';
  user.saldo        += bukti.reward;
  user.tugasSelesai  = user.tugasSelesai || [];
  if (!user.tugasSelesai.includes(bukti.tugasId)) user.tugasSelesai.push(bukti.tugasId);
  saveDB(db);

  await ctx.answerCbQuery(`✅ +${toRp(bukti.reward)} diberikan ke @${bukti.username}`);
  await ctx.editMessageCaption(
    `✅ <b>DIVALIDASI</b>\n\n` +
    `👤  @${bukti.username}\n` +
    `📌  ${bukti.tugasNama}\n` +
    `💰  +${toRp(bukti.reward)}\n` +
    `🕐  ${nowId()}`,
    { parse_mode: 'HTML' }
  );

  try {
    await bot.telegram.sendMessage(bukti.userId,
      `✅ <b>Tugasmu Disetujui!</b>\n\n` +
      `📌 ${bukti.tugasNama}\n` +
      `💰 +${toRp(bukti.reward)} sudah masuk ke saldo!\n` +
      `💳 Saldo sekarang: <b>${toRp(user.saldo)}</b>\n\n` +
      `Yuk ambil tugas lagi! 💪`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

bot.action(/^val_no_(.+)$/, async (ctx) => {
  if (ctx.from.id !== A                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        