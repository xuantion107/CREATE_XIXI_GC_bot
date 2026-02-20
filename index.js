// ╔══════════════════════════════════════════════════════════════╗
// ║           TELEGRAM BOT - CARI CUAN PRO                      ║
// ║   Storage : database.json (lokal, tidak perlu MongoDB)       ║
// ║   Deploy  : Railway.app                                      ║
// ╚══════════════════════════════════════════════════════════════╝

// ================================================================
//  ⚙️  KONFIGURASI UTAMA — EDIT BAGIAN INI
// ================================================================

const BOT_TOKEN    = process.env.BOT_TOKEN  || '7596953618:AAFLpibLwDG3ZrT2yeiILPoYhO52-mMyh_Y';
//                                              ↑ Token dari @BotFather

const ADMIN_ID     = Number(process.env.ADMIN_ID || 8496726839);
//                                                   ↑ ID Telegram kamu (cek di @userinfobot)

const BOT_USERNAME = 'GroupA1securitybot';
//                    ↑ Username bot tanpa @  (contoh: 'CariCuanBot')

const MIN_WITHDRAW  = 20000;   // Minimal penarikan dalam Rupiah
const REFERRAL_BONUS = 100;    // Bonus referral per orang (Rupiah)

// ================================================================
//  📋  DAFTAR TUGAS (edit sesukamu)
// ================================================================
const DAFTAR_TUGAS = [
  { id: 'tugas_1', nama: 'Klik Iklan Website A', reward: 500,  link: 'https://example.com/iklan1' },
  { id: 'tugas_2', nama: 'Klik Iklan Website B', reward: 750,  link: 'https://example.com/iklan2' },
  { id: 'tugas_3', nama: 'Follow Instagram @contoh', reward: 1000, link: 'https://instagram.com/contoh' },
  { id: 'tugas_4', nama: 'Subscribe YouTube contoh', reward: 1500, link: 'https://youtube.com/contoh' },
  { id: 'tugas_5', nama: 'Join Telegram Channel', reward: 500,  link: 'https://t.me/contoh' },
];

// ================================================================
//  📦  IMPORT LIBRARY
// ================================================================
const { Telegraf, Markup, session } = require('telegraf');
const fs   = require('fs');
const path = require('path');

// ================================================================
//  💾  SISTEM DATABASE (File JSON)
// ================================================================
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { users: {}, withdraws: [], iklan: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), 'utf8');
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {}, withdraws: [], iklan: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function getUser(db, from) {
  const id = from.id;
  if (!db.users[id]) {
    db.users[id] = {
      userId:        id,
      username:      from.username   || 'unknown',
      firstName:     from.first_name || 'User',
      saldo:         0,
      referralBy:    null,
      referralCount: 0,
      tugasSelesai:  [],   // id tugas yang sudah approved
      tugasPending:  [],   // { tugasId, fileId, msgId } menunggu validasi
      joinedAt:      new Date().toISOString(),
    };
  } else {
    // Selalu update username terbaru
    db.users[id].username  = from.username   || db.users[id].username;
    db.users[id].firstName = from.first_name || db.users[id].firstName;
    if (!db.users[id].tugasPending) db.users[id].tugasPending = [];
  }
  return db.users[id];
}

// ================================================================
//  🛠️  HELPER
// ================================================================
const toRp  = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const nowId  = ()  => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

// ================================================================
//  🤖  INISIALISASI BOT
// ================================================================
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ================================================================
//  🎨  KEYBOARD
// ================================================================

// Menu utama user — tombol lebar 1 kolom
const menuUtama = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('💰  CARI CUAN',     'menu_cuan')],
    [Markup.button.callback('📢  PASANG IKLAN',  'menu_iklan')],
    [Markup.button.callback('👤  PROFIL SAYA',   'menu_profil')],
    [Markup.button.callback('👫  UNDANG TEMAN',  'menu_referral')],
    [Markup.button.callback('💸  TARIK SALDO',   'menu_tarik')],
    [Markup.button.callback('🛠   CARA KERJA',    'menu_cara')],
  ]);

// Panel admin
const menuAdmin = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📊  Statistik',            'adm_stats')],
    [Markup.button.callback('📢  Broadcast',             'adm_broadcast')],
    [Markup.button.callback('📥  Download Data (.txt)', 'adm_download')],
    [Markup.button.callback('✅  Validasi Tugas',        'adm_validasi')],
    [Markup.button.callback('💳  Konfirmasi Withdraw',   'adm_withdraw')],
  ]);

const btnKembali = (action = 'back_main') =>
  Markup.inlineKeyboard([[Markup.button.callback('🔙  Kembali ke Menu', action)]]);


// ================================================================
//  🚀  /start
// ================================================================
bot.start(async (ctx) => {
  try {
    const db    = loadDB();
    const from  = ctx.from;
    const isNew = !db.users[from.id];
    const user  = getUser(db, from);

    // Proses referral hanya untuk user baru
    const payload = ctx.startPayload;
    if (isNew && payload && !isNaN(payload)) {
      const refId = Number(payload);
      if (refId !== from.id && db.users[refId]) {
        user.referralBy = refId;
        db.users[refId].saldo         += REFERRAL_BONUS;
        db.users[refId].referralCount += 1;
        saveDB(db);
        try {
          await bot.telegram.sendMessage(
            refId,
            `🎉 Yeay! Temanmu <b>${from.first_name}</b> baru saja bergabung!\n` +
            `💰 +${toRp(REFERRAL_BONUS)} sudah masuk ke saldo kamu.`,
            { parse_mode: 'HTML' }
          );
        } catch (_) {}
      }
    }

    saveDB(db);

    const teks =
      `👋 Halo, <b>${from.first_name}</b>!\n\n` +
      (isNew
        ? `🎊 Selamat datang di <b>Bot Cari Cuan</b>!\nAkun kamu sudah terdaftar.\n\n`
        : `Selamat datang kembali!\n\n`) +
      `Pilih menu di bawah untuk mulai:`;

    await ctx.replyWithHTML(teks, menuUtama());
  } catch (err) {
    console.error('[/start]', err.message);
    ctx.reply('Terjadi kesalahan. Ketik /start lagi.');
  }
});


// ================================================================
//  💰  MENU: CARI CUAN
// ================================================================
bot.action('menu_cuan', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from);
  saveDB(db);

  // Buat tombol tugas
  const tombolTugas = DAFTAR_TUGAS.map(t => {
    const approved = user.tugasSelesai.includes(t.id);
    const pending  = (user.tugasPending || []).some(p => p.tugasId === t.id);
    let   label;
    if      (approved) label = `✅  ${t.nama}  (Selesai)`;
    else if (pending)  label = `⏳  ${t.nama}  (Menunggu Validasi)`;
    else               label = `▶️  ${t.nama}  +${toRp(t.reward)}`;
    return [Markup.button.callback(label, approved ? `noop` : `buka_tugas_${t.id}`)];
  });
  tombolTugas.push([Markup.button.callback('🔙  Kembali ke Menu', 'back_main')]);

  await ctx.editMessageText(
    `💰 <b>CARI CUAN</b>\n\n` +
    `Klik tugas di bawah, buka link-nya, lalu kirim <b>Screenshot Bukti</b>.\n` +
    `Admin akan memvalidasi dan saldo langsung masuk! ✅\n\n` +
    `<i>⏳ = Menunggu validasi admin</i>\n` +
    `<i>✅ = Sudah selesai & saldo masuk</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(tombolTugas) }
  );
});

// Klik salah satu tugas — tampilkan link + instruksi kirim SS
DAFTAR_TUGAS.forEach(tugas => {
  bot.action(`buka_tugas_${tugas.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    const db   = loadDB();
    const user = getUser(db, ctx.from);
    saveDB(db);

    if (user.tugasSelesai.includes(tugas.id)) {
      return ctx.answerCbQuery('Tugas ini sudah kamu selesaikan!', { show_alert: true });
    }
    if ((user.tugasPending || []).some(p => p.tugasId === tugas.id)) {
      return ctx.answerCbQuery('Tugasmu sedang divalidasi admin. Sabar ya!', { show_alert: true });
    }

    // Simpan state sesi: user sedang mengerjakan tugas ini
    ctx.session           = ctx.session || {};
    ctx.session.tugasAktif = tugas.id;

    await ctx.editMessageText(
      `📌 <b>${tugas.nama}</b>\n\n` +
      `💵 Reward: <b>${toRp(tugas.reward)}</b>\n\n` +
      `<b>Langkah:</b>\n` +
      `1️⃣  Klik link di bawah & selesaikan tugasnya\n` +
      `2️⃣  Screenshot halaman sebagai bukti\n` +
      `3️⃣  Kirim foto screenshot ke chat ini\n\n` +
      `🔗 <b>Link Tugas:</b>\n${tugas.link}\n\n` +
      `<i>⚠️ Bukti foto WAJIB dikirim — saldo tidak otomatis masuk.</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙  Batal / Kembali', 'menu_cuan')],
        ])
      }
    );
  });
});

// Noop (tombol disabled)
bot.action('noop', async (ctx) => ctx.answerCbQuery());


// ================================================================
//  📢  MENU: PASANG IKLAN
// ================================================================
bot.action('menu_iklan', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📢 <b>PASANG IKLAN</b>\n\n` +
    `Mau promosikan link, produk, atau channel kamu ke semua member bot ini?\n\n` +
    `<b>Paket Iklan:</b>\n` +
    `📌 Broadcast 1x ke semua user  → <b>Rp5.000</b>\n` +
    `📌 Iklan di menu Cari Cuan 7hr → <b>Rp15.000</b>\n\n` +
    `<b>Cara order:</b>\n` +
    `1. Hubungi admin via tombol di bawah\n` +
    `2. Kirim link/materi iklanmu\n` +
    `3. Transfer sesuai paket\n` +
    `4. Iklan langsung tayang!\n\n` +
    `<i>Slot terbatas. Hubungi admin sekarang!</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('💬  Hubungi Admin', `https://t.me/${BOT_USERNAME.replace('@', '')}`)],
        [Markup.button.callback('🔙  Kembali ke Menu', 'back_main')],
      ])
    }
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

  const tglGabung = new Date(user.joinedAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  const selesai  = user.tugasSelesai.length;
  const pending  = (user.tugasPending || []).length;

  await ctx.editMessageText(
    `👤 <b>PROFIL SAYA</b>\n\n` +
    `📛  Nama      : <b>${user.firstName}</b>\n` +
    `🆔  ID         : <code>${user.userId}</code>\n` +
    `👤  Username  : @${user.username}\n` +
    `💰  Saldo     : <b>${toRp(user.saldo)}</b>\n` +
    `✅  Tugas OK  : <b>${selesai}</b> tugas\n` +
    `⏳  Pending   : <b>${pending}</b> tugas\n` +
    `👫  Referral  : <b>${user.referralCount} orang</b>\n` +
    `📅  Bergabung : <b>${tglGabung}</b>`,
    { parse_mode: 'HTML', ...btnKembali() }
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

  const link   = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;
  const total  = user.referralCount;
  const bonus  = total * REFERRAL_BONUS;

  await ctx.editMessageText(
    `👫 <b>UNDANG TEMAN</b>\n\n` +
    `Ajak temanmu bergabung dan dapatkan <b>${toRp(REFERRAL_BONUS)}</b> per orang!\n\n` +
    `🔗 <b>Link Referral Kamu:</b>\n` +
    `<code>${link}</code>\n\n` +
    `📊 <b>Statistik Referral:</b>\n` +
    `👥  Teman bergabung : <b>${total} orang</b>\n` +
    `💵  Total bonus     : <b>${toRp(bonus)}</b>\n\n` +
    `<i>Copy link di atas dan bagikan ke teman-temanmu!</i>`,
    { parse_mode: 'HTML', ...btnKembali() }
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
      `❌ Saldo kamu belum mencukupi!\n\n` +
      `💰  Saldo kamu    : <b>${toRp(user.saldo)}</b>\n` +
      `📋  Minimal tarik : <b>${toRp(MIN_WITHDRAW)}</b>\n` +
      `📉  Kurang         : <b>${toRp(MIN_WITHDRAW - user.saldo)}</b>\n\n` +
      `Yuk selesaikan lebih banyak tugas dulu! 💪`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰  Cari Cuan Sekarang', 'menu_cuan')],
          [Markup.button.callback('🔙  Kembali ke Menu',    'back_main')],
        ])
      }
    );
  }

  ctx.session         = ctx.session || {};
  ctx.session.tarik   = true;
  ctx.session.nominal = user.saldo;

  await ctx.editMessageText(
    `💸 <b>TARIK SALDO</b>\n\n` +
    `💰  Saldo tersedia : <b>${toRp(user.saldo)}</b>\n\n` +
    `Ketik nomor <b>DANA / OVO / GoPay</b> kamu di chat ini:\n\n` +
    `Format: <code>085123456789</code>\n\n` +
    `⚠️  Pastikan nomor benar sebelum mengirim.\n` +
    `<i>Proses 1×24 jam hari kerja.</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'batal_tarik')]])
    }
  );
});

bot.action('batal_tarik', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session       = ctx.session || {};
  ctx.session.tarik = false;
  await ctx.editMessageText('❌ Penarikan dibatalkan.', menuUtama());
});


// ================================================================
//  🛠️  MENU: CARA KERJA
// ================================================================
bot.action('menu_cara', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🛠 <b>CARA KERJA BOT</b>\n\n` +
    `<b>1. Cari Cuan</b>\n` +
    `   ➜ Pilih tugas yang tersedia\n` +
    `   ➜ Buka link & selesaikan tugasnya\n` +
    `   ➜ Screenshot halaman sebagai bukti\n` +
    `   ➜ Kirim foto ke bot ini\n` +
    `   ➜ Admin validasi → saldo masuk!\n\n` +
    `<b>2. Undang Teman</b>\n` +
    `   ➜ Bagikan link referral unikmu\n` +
    `   ➜ Dapat ${toRp(REFERRAL_BONUS)} per teman yang join\n\n` +
    `<b>3. Tarik Saldo</b>\n` +
    `   ➜ Minimal ${toRp(MIN_WITHDRAW)}\n` +
    `   ➜ Via DANA / OVO / GoPay\n` +
    `   ➜ Proses 1×24 jam\n\n` +
    `<b>4. Pasang Iklan</b>\n` +
    `   ➜ Promosikan link/produkmu\n` +
    `   ➜ Hubungi admin untuk harga\n\n` +
    `❓ Ada pertanyaan? Hubungi admin.`,
    { parse_mode: 'HTML', ...btnKembali() }
  );
});


// ================================================================
//  🔙  KEMBALI KE MENU
// ================================================================
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = ctx.session || {};
  ctx.session.tugasAktif = null;
  ctx.session.tarik      = false;
  ctx.session.broadcast  = false;
  await ctx.editMessageText(
    `🏠 <b>MENU UTAMA</b>\n\nPilih menu di bawah:`,
    { parse_mode: 'HTML', ...menuUtama() }
  );
});


// ================================================================
//  📨  HANDLER SEMUA PESAN TEKS MASUK
// ================================================================
bot.on('text', async (ctx) => {
  try {
    const teks = ctx.message.text.trim();
    ctx.session = ctx.session || {};

    // ── COMMAND ADMIN ───────────────────────────────────────────
    if (teks === '/admin1922') {
      if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses ditolak.');
      return ctx.replyWithHTML(
        `🔐 <b>PANEL ADMIN</b>\n\nSelamat datang, Admin!\nWaktu: ${nowId()}`,
        menuAdmin()
      );
    }

    // ── INPUT NOMOR TARIK SALDO ─────────────────────────────────
    if (ctx.session.tarik) {
      const noHp = teks.replace(/\D/g, '');
      if (!/^0[0-9]{9,12}$/.test(noHp)) {
        return ctx.replyWithHTML(
          `❌ Format nomor tidak valid!\n\n` +
          `Harus diawali <b>0</b> dan 10–13 digit.\n` +
          `Contoh: <code>085123456789</code>`
        );
      }

      const db   = loadDB();
      const user = getUser(db, ctx.from);

      if (user.saldo < MIN_WITHDRAW) {
        ctx.session.tarik = false;
        return ctx.reply('❌ Saldo tidak mencukupi saat ini.');
      }

      const jumlah  = user.saldo;
      user.saldo    = 0;
      const wdEntry = {
        id:        `wd_${Date.now()}`,
        userId:    ctx.from.id,
        username:  user.username,
        firstName: user.firstName,
        jumlah,
        ewallet:   noHp,
        status:    'pending',
        createdAt: new Date().toISOString(),
      };
      db.withdraws = db.withdraws || [];
      db.withdraws.push(wdEntry);
      saveDB(db);
      ctx.session.tarik = false;

      await ctx.replyWithHTML(
        `✅ <b>Permintaan Penarikan Dikirim!</b>\n\n` +
        `💰  Jumlah  : <b>${toRp(jumlah)}</b>\n` +
        `📱  Nomor   : <code>${noHp}</code>\n` +
        `⏳  Status  : <b>PENDING</b>\n\n` +
        `Proses 1×24 jam. Notifikasi akan dikirim otomatis.`,
        menuUtama()
      );

      // Notif ke admin
      try {
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `🔔 <b>WITHDRAW BARU!</b>\n\n` +
          `👤  @${user.username} (ID: <code>${ctx.from.id}</code>)\n` +
          `💰  Jumlah : <b>${toRp(jumlah)}</b>\n` +
          `📱  Nomor  : <code>${noHp}</code>\n` +
          `🕐  Waktu  : ${nowId()}\n` +
          `🆔  WD ID  : <code>${wdEntry.id}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      return;
    }

    // ── INPUT BROADCAST ─────────────────────────────────────────
    if (ctx.session.broadcast && ctx.from.id === ADMIN_ID) {
      ctx.session.broadcast = false;
      const db    = loadDB();
      const users = Object.values(db.users);
      let ok = 0, fail = 0;

      const pesanBroadcast = teks;
      await ctx.reply(`📡 Mengirim ke ${users.length} user...`);

      for (const u of users) {
        try {
          await bot.telegram.sendMessage(
            u.userId,
            `📢 <b>PENGUMUMAN</b>\n\n${pesanBroadcast}`,
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

    // ── INPUT NOMINAL VALIDASI MANUAL ───────────────────────────
    if (ctx.session.inputValidasi && ctx.from.id === ADMIN_ID) {
      // Format: userId:tugasId
      const [targetId, tugasId] = ctx.session.inputValidasi.split(':');
      const nominal = parseInt(teks.replace(/\D/g, ''));

      if (!nominal || nominal <= 0) {
        return ctx.reply('❌ Nominal tidak valid. Masukkan angka (contoh: 500)');
      }

      const db   = loadDB();
      const user = db.users[targetId];
      if (!user) {
        ctx.session.inputValidasi = null;
        return ctx.reply('❌ User tidak ditemukan.');
      }

      user.saldo         += nominal;
      user.tugasSelesai   = user.tugasSelesai || [];
      if (!user.tugasSelesai.includes(tugasId)) user.tugasSelesai.push(tugasId);
      user.tugasPending   = (user.tugasPending || []).filter(p => p.tugasId !== tugasId);
      saveDB(db);

      ctx.session.inputValidasi = null;

      await ctx.replyWithHTML(
        `✅ <b>Validasi berhasil!</b>\n\n` +
        `👤  User   : @${user.username}\n` +
        `💰  Reward : +${toRp(nominal)}\n` +
        `💳  Saldo baru : ${toRp(user.saldo)}`
      );

      try {
        await bot.telegram.sendMessage(
          user.userId,
          `✅ <b>Tugasmu Disetujui!</b>\n\n` +
          `💰 +${toRp(nominal)} sudah masuk ke saldo kamu!\n` +
          `💳 Saldo sekarang: <b>${toRp(user.saldo)}</b>\n\n` +
          `Yuk selesaikan tugas lain untuk cuan lebih banyak! 💪`,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      return;
    }

  } catch (err) {
    console.error('[text handler]', err.message);
    ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.');
  }
});


// ================================================================
//  📸  HANDLER FOTO (Bukti Tugas dari User)
// ================================================================
bot.on('photo', async (ctx) => {
  try {
    ctx.session = ctx.session || {};
    const tugasId = ctx.session.tugasAktif;

    if (!tugasId) {
      return ctx.reply('⚠️ Kamu belum memilih tugas. Pilih tugas dulu dari menu 💰 Cari Cuan.');
    }

    const db   = loadDB();
    const user = getUser(db, ctx.from);

    if (user.tugasSelesai.includes(tugasId)) {
      return ctx.reply('✅ Tugas ini sudah selesai dan divalidasi sebelumnya!');
    }
    if ((user.tugasPending || []).some(p => p.tugasId === tugasId)) {
      return ctx.reply('⏳ Buktimu sudah diterima dan sedang menunggu validasi admin. Sabar ya!');
    }

    // Ambil file_id foto terbesar
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    const tugas  = DAFTAR_TUGAS.find(t => t.id === tugasId);

    if (!tugas) return ctx.reply('⚠️ Tugas tidak ditemukan. Silakan pilih tugas kembali.');

    // Simpan ke pending
    user.tugasPending = user.tugasPending || [];
    user.tugasPending.push({ tugasId, fileId, submittedAt: new Date().toISOString() });
    saveDB(db);

    ctx.session.tugasAktif = null;

    await ctx.replyWithHTML(
      `📸 <b>Bukti Diterima!</b>\n\n` +
      `📌 Tugas    : <b>${tugas.nama}</b>\n` +
      `💵 Reward  : <b>${toRp(tugas.reward)}</b>\n` +
      `⏳ Status   : <b>Menunggu Validasi Admin</b>\n\n` +
      `Kamu akan mendapat notifikasi setelah admin memvalidasi. Terima kasih! 🙏`,
      menuUtama()
    );

    // ── Kirim notifikasi + foto ke admin ──────────────────────
    try {
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `🔔 <b>BUKTI TUGAS MASUK!</b>\n\n` +
        `👤  User    : @${user.username} (ID: <code>${ctx.from.id}</code>)\n` +
        `📌  Tugas   : <b>${tugas.nama}</b>\n` +
        `💵  Reward  : <b>${toRp(tugas.reward)}</b>\n` +
        `🕐  Waktu   : ${nowId()}\n\n` +
        `👇 Foto bukti di bawah. Klik <b>Validasi Tugas</b> di panel admin untuk approve.`,
        { parse_mode: 'HTML' }
      );
      // Kirim fotonya ke admin
      await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
        caption:    `📸 Bukti dari @${user.username} untuk tugas: <b>${tugas.nama}</b>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`✅ Validasi (+${toRp(tugas.reward)})`, `quick_val_${ctx.from.id}_${tugasId}_${tugas.reward}`)],
          [Markup.button.callback(`❌ Tolak Bukti`,                        `quick_tolak_${ctx.from.id}_${tugasId}`)],
        ])
      });
    } catch (_) {}

  } catch (err) {
    console.error('[photo handler]', err.message);
    ctx.reply('⚠️ Terjadi kesalahan saat mengunggah foto.');
  }
});


// ================================================================
//  ✅  QUICK VALIDASI DARI FOTO (Inline di chat admin)
// ================================================================
bot.action(/^quick_val_(\d+)_(.+)_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');

  const userId  = ctx.match[1];
  const tugasId = ctx.match[2];
  const reward  = Number(ctx.match[3]);

  const db   = loadDB();
  const user = db.users[userId];
  if (!user) return ctx.answerCbQuery('User tidak ditemukan.', { show_alert: true });

  const sudahAcc = user.tugasSelesai?.includes(tugasId);
  if (sudahAcc)  return ctx.answerCbQuery('Tugas ini sudah divalidasi sebelumnya.', { show_alert: true });

  user.saldo        += reward;
  user.tugasSelesai  = user.tugasSelesai || [];
  user.tugasSelesai.push(tugasId);
  user.tugasPending  = (user.tugasPending || []).filter(p => p.tugasId !== tugasId);
  saveDB(db);

  await ctx.answerCbQuery(`✅ +${toRp(reward)} diberikan ke @${user.username}`);
  await ctx.editMessageCaption(
    `✅ <b>SUDAH DIVALIDASI</b>\n\n` +
    `👤  User   : @${user.username}\n` +
    `💰  Reward : +${toRp(reward)}\n` +
    `🕐  Waktu  : ${nowId()}`,
    { parse_mode: 'HTML' }
  );

  try {
    await bot.telegram.sendMessage(
      user.userId,
      `✅ <b>Tugasmu Disetujui!</b>\n\n` +
      `💰 +${toRp(reward)} sudah masuk ke saldo kamu!\n` +
      `💳 Saldo sekarang: <b>${toRp(user.saldo)}</b>\n\n` +
      `Yuk selesaikan tugas lain! 💪`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

bot.action(/^quick_tolak_(\d+)_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');

  const userId  = ctx.match[1];
  const tugasId = ctx.match[2];

  const db   = loadDB();
  const user = db.users[userId];
  if (!user) return ctx.answerCbQuery('User tidak ditemukan.', { show_alert: true });

  user.tugasPending = (user.tugasPending || []).filter(p => p.tugasId !== tugasId);
  saveDB(db);

  await ctx.answerCbQuery('❌ Bukti ditolak.');
  await ctx.editMessageCaption(
    `❌ <b>BUKTI DITOLAK</b>\n\n` +
    `👤  User   : @${user.username}\n` +
    `📌  Tugas  : ${tugasId}\n` +
    `🕐  Waktu  : ${nowId()}`,
    { parse_mode: 'HTML' }
  );

  try {
    await bot.telegram.sendMessage(
      user.userId,
      `❌ <b>Bukti Tugasmu Ditolak</b>\n\n` +
      `Buktimu tidak memenuhi syarat. Silakan coba lagi dengan screenshot yang lebih jelas.\n\n` +
      `Hubungi admin jika ada pertanyaan.`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});


// ================================================================
//  🔧  ADMIN ACTIONS
// ================================================================

// ── STATISTIK ───────────────────────────────────────────────────
bot.action('adm_stats', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery();
  const db    = loadDB();
  const users = Object.values(db.users);
  const totalSaldo  = users.reduce((s, u) => s + (u.saldo || 0), 0);
  const pendingWd   = (db.withdraws || []).filter(w => w.status === 'pending').length;
  const suksesWd    = (db.withdraws || []).filter(w => w.status === 'sukses').length;
  const pendingTugas = users.reduce((s, u) => s + (u.tugasPending?.length || 0), 0);

  await ctx.editMessageText(
    `📊 <b>STATISTIK BOT</b>\n\n` +
    `👥  Total User         : <b>${users.length}</b>\n` +
    `💰  Total Saldo Aktif  : <b>${toRp(totalSaldo)}</b>\n` +
    `⏳  Tugas Pending      : <b>${pendingTugas}</b>\n` +
    `💳  Withdraw Pending   : <b>${pendingWd}</b>\n` +
    `✅  Withdraw Sukses    : <b>${suksesWd}</b>\n` +
    `🕐  Update             : ${nowId()}`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙  Kembali', 'adm_back')]]) }
  );
});

// ── BROADCAST ───────────────────────────────────────────────────
bot.action('adm_broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery();
  ctx.session           = ctx.session || {};
  ctx.session.broadcast = true;
  await ctx.editMessageText(
    `📢 <b>BROADCAST</b>\n\nKetik pesan yang ingin dikirim ke semua user di chat ini:`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'adm_back')]]) }
  );
});

// ── DOWNLOAD DATA ───────────────────────────────────────────────
bot.action('adm_download', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery('Membuat file...');

  const db    = loadDB();
  const users = Object.values(db.users);

  let isi = `DATA USER BOT CARI CUAN\n`;
  isi    += `Diekspor: ${nowId()}\n`;
  isi    += `Total   : ${users.length} user\n`;
  isi    += '='.repeat(70) + '\n';
  isi    += `${'No'.padEnd(4)} | ${'User ID'.padEnd(12)} | ${'Username'.padEnd(20)} | ${'Nama'.padEnd(16)} | Saldo\n`;
  isi    += '-'.repeat(70) + '\n';

  users.forEach((u, i) => {
    isi += `${String(i + 1).padEnd(4)} | `;
    isi += `${String(u.userId).padEnd(12)} | `;
    isi += `${('@' + u.username).padEnd(20)} | `;
    isi += `${u.firstName.padEnd(16)} | `;
    isi += `${toRp(u.saldo)}\n`;
  });

  isi += '-'.repeat(70) + '\n';
  isi += `Total saldo beredar: ${toRp(users.reduce((s, u) => s + (u.saldo || 0), 0))}\n`;

  const tmpPath = path.join('/tmp', `data_user_${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, isi, 'utf8');

  try {
    await bot.telegram.sendDocument(
      ADMIN_ID,
      { source: fs.createReadStream(tmpPath), filename: 'data_user.txt' },
      { caption: `📥 <b>Data ${users.length} user</b> berhasil diekspor.`, parse_mode: 'HTML' }
    );
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ── VALIDASI TUGAS (panel) ──────────────────────────────────────
bot.action('adm_validasi', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery();

  const db      = loadDB();
  const pending = [];

  Object.values(db.users).forEach(u => {
    (u.tugasPending || []).forEach(p => {
      const info = DAFTAR_TUGAS.find(t => t.id === p.tugasId);
      pending.push({
        userId:    u.userId,
        username:  u.username,
        tugasId:   p.tugasId,
        tugasNama: info?.nama || p.tugasId,
        reward:    info?.reward || 0,
        fileId:    p.fileId,
      });
    });
  });

  if (pending.length === 0) {
    return ctx.editMessageText(
      `✅ Tidak ada tugas yang menunggu validasi.`,
      { ...Markup.inlineKeyboard([[Markup.button.callback('🔙  Kembali', 'adm_back')]]) }
    );
  }

  let teks = `✅ <b>VALIDASI TUGAS</b>\n\n<b>${pending.length} tugas</b> menunggu:\n\n`;
  const btns = [];

  pending.slice(0, 6).forEach((p, i) => {
    teks += `${i + 1}. @${p.username} → <b>${p.tugasNama}</b> (+${toRp(p.reward)})\n`;
    btns.push([
      Markup.button.callback(`✅ ACC #${i + 1} (+${toRp(p.reward)})`, `val_acc_${p.userId}_${p.tugasId}_${p.reward}`),
      Markup.button.callback(`❌ Tolak #${i + 1}`, `val_rej_${p.userId}_${p.tugasId}`),
    ]);
  });

  btns.push([Markup.button.callback('🔙  Kembali', 'adm_back')]);

  await ctx.editMessageText(teks, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) });
});

bot.action(/^val_acc_(\d+)_(.+)_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  const userId  = ctx.match[1];
  const tugasId = ctx.match[2];
  const reward  = Number(ctx.match[3]);

  const db   = loadDB();
  const user = db.users[userId];
  if (!user) return ctx.answerCbQuery('User tidak ditemukan.', { show_alert: true });

  user.saldo        += reward;
  user.tugasSelesai  = user.tugasSelesai || [];
  if (!user.tugasSelesai.includes(tugasId)) user.tugasSelesai.push(tugasId);
  user.tugasPending  = (user.tugasPending || []).filter(p => p.tugasId !== tugasId);
  saveDB(db);

  await ctx.answerCbQuery(`✅ +${toRp(reward)} → @${user.username}`);

  try {
    await bot.telegram.sendMessage(
      user.userId,
      `✅ <b>Tugasmu Disetujui!</b>\n\n💰 +${toRp(reward)} masuk ke saldo kamu!\n💳 Saldo: <b>${toRp(user.saldo)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}

  // Refresh panel validasi
  setTimeout(() => ctx.callbackQuery && bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'adm_validasi' } }).catch(() => {}), 500);
});

bot.action(/^val_rej_(\d+)_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  const userId  = ctx.match[1];
  const tugasId = ctx.match[2];

  const db   = loadDB();
  const user = db.users[userId];
  if (!user) return ctx.answerCbQuery('User tidak ditemukan.', { show_alert: true });

  user.tugasPending = (user.tugasPending || []).filter(p => p.tugasId !== tugasId);
  saveDB(db);

  await ctx.answerCbQuery('❌ Tugas ditolak.');

  try {
    await bot.telegram.sendMessage(
      user.userId,
      `❌ <b>Bukti Tugasmu Ditolak</b>\n\nBukti tidak memenuhi syarat. Silakan coba lagi dengan screenshot yang lebih jelas.`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

// ── KONFIRMASI WITHDRAW (panel) ─────────────────────────────────
bot.action('adm_withdraw', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery();

  const db      = loadDB();
  const pending = (db.withdraws || []).filter(w => w.status === 'pending').slice(0, 6);

  if (pending.length === 0) {
    return ctx.editMessageText(
      `✅ Tidak ada withdraw yang menunggu.`,
      { ...Markup.inlineKeyboard([[Markup.button.callback('🔙  Kembali', 'adm_back')]]) }
    );
  }

  let teks = `💳 <b>KONFIRMASI WITHDRAW</b>\n\n`;
  const btns = [];

  pending.forEach((w, i) => {
    teks += `${i + 1}. @${w.username} | <b>${toRp(w.jumlah)}</b> → <code>${w.ewallet}</code>\n`;
    btns.push([
      Markup.button.callback(`✅ Kirim #${i + 1}`, `wd_ok_${w.id}`),
      Markup.button.callback(`❌ Tolak #${i + 1}`, `wd_no_${w.id}`),
    ]);
  });

  btns.push([Markup.button.callback('🔙  Kembali', 'adm_back')]);

  await ctx.editMessageText(teks, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) });
});

bot.action(/^wd_ok_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  const wdId = ctx.match[1];
  const db   = loadDB();
  const wd   = (db.withdraws || []).find(w => w.id === wdId);
  if (!wd) return ctx.answerCbQuery('Data tidak ditemukan.', { show_alert: true });

  wd.status = 'sukses';
  saveDB(db);
  await ctx.answerCbQuery(`✅ ${toRp(wd.jumlah)} disetujui!`);

  try {
    await bot.telegram.sendMessage(
      wd.userId,
      `✅ <b>Penarikan Disetujui!</b>\n\n💰 ${toRp(wd.jumlah)} sedang ditransfer ke <code>${wd.ewallet}</code>.\n\nTerima kasih! 🙏`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

bot.action(/^wd_no_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  const wdId = ctx.match[1];
  const db   = loadDB();
  const wd   = (db.withdraws || []).find(w => w.id === wdId);
  if (!wd) return ctx.answerCbQuery('Data tidak ditemukan.', { show_alert: true });

  wd.status = 'ditolak';
  // Kembalikan saldo
  if (db.users[wd.userId]) db.users[wd.userId].saldo += wd.jumlah;
  saveDB(db);
  await ctx.answerCbQuery('❌ Withdraw ditolak, saldo dikembalikan.');

  try {
    await bot.telegram.sendMessage(
      wd.userId,
      `❌ <b>Penarikan Ditolak</b>\n\n💰 ${toRp(wd.jumlah)} dikembalikan ke saldo kamu.\nHubungi admin untuk info lebih lanjut.`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

// ── KEMBALI KE PANEL ADMIN ──────────────────────────────────────
bot.action('adm_back', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery();
  ctx.session = ctx.session || {};
  ctx.session.broadcast = false;
  await ctx.editMessageText(
    `🔐 <b>PANEL ADMIN</b>\n\nWaktu: ${nowId()}`,
    { parse_mode: 'HTML', ...menuAdmin() }
  );
});


// ================================================================
//  🛡️  ERROR GLOBAL & LAUNCH
// ================================================================
bot.catch((err, ctx) => {
  console.error(`[ERROR] ${ctx?.updateType || 'unknown'}:`, err.message);
  try { ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.'); } catch (_) {}
});

bot.launch()
  .then(() => console.log(`🤖 Bot aktif! — ${new Date().toLocaleString('id-ID')}`))
  .catch(err => { console.error('❌ Gagal launch:', err.message); process.exit(1); });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
