// ============================================================
//  TELEGRAM BOT - CARI CUAN
//  Storage: File JSON lokal (tidak perlu database apapun!)
//  Deploy: Railway.app
// ============================================================
//  CARA ISI ENV DI RAILWAY:
//  1. Buka project Railway → Settings → Variables
//  2. Tambahkan:
//     BOT_TOKEN  = token dari @BotFather
//     ADMIN_ID   = ID Telegram kamu (cek via @userinfobot)
// ============================================================

const { Telegraf, Markup, session } = require('telegraf');
const fs   = require('fs');
const path = require('path');

// ─── KONFIGURASI ─────────────────────────────────────────────
const BOT_TOKEN    = process.env.BOT_TOKEN  || '7596953618:AAFLpibLwDG3ZrT2yeiILPoYhO52-mMyh_Y';
const ADMIN_ID     = Number(process.env.ADMIN_ID || 8496726839);
const BOT_USERNAME = 'GroupA1securitybot'; // ← ganti username bot kamu (tanpa @)
const MIN_WITHDRAW = 20000;

// ─── PATH FILE DATABASE ───────────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');

// ─── FUNGSI DATABASE (baca/tulis file JSON) ───────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const empty = { users: {}, withdraws: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { users: {}, withdraws: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getUser(db, userId, from = {}) {
  if (!db.users[userId]) {
    db.users[userId] = {
      userId,
      username:      from.username    || 'unknown',
      firstName:     from.first_name  || '',
      saldo:         0,
      referralBy:    null,
      referralCount: 0,
      tasksDone:     [],
      joinedAt:      new Date().toISOString(),
    };
  }
  return db.users[userId];
}

// ─── FORMAT RUPIAH ────────────────────────────────────────────
const toRp = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

// ─── DAFTAR TUGAS ─────────────────────────────────────────────
const TASKS = [
  { id: 'iklan1',  label: '🖱 Klik Iklan #1',     reward: 500,  url: 'https://example.com/iklan1' },
  { id: 'iklan2',  label: '🖱 Klik Iklan #2',     reward: 750,  url: 'https://example.com/iklan2' },
  { id: 'iklan3',  label: '🖱 Klik Iklan #3',     reward: 600,  url: 'https://example.com/iklan3' },
  { id: 'follow1', label: '📱 Follow Instagram',  reward: 300,  url: 'https://instagram.com/example' },
  { id: 'follow2', label: '🐦 Follow Twitter/X',  reward: 300,  url: 'https://twitter.com/example' },
];

// ─── BOT ──────────────────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ─── KEYBOARD MENU UTAMA ─────────────────────────────────────
const mainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('💰 Cari Cuan',    'menu_cuan'),
   Markup.button.callback('👫 Undang Teman', 'menu_referral')],
  [Markup.button.callback('👤 Profil',       'menu_profil'),
   Markup.button.callback('📜 Riwayat',      'menu_riwayat')],
  [Markup.button.callback('💸 Tarik Saldo',  'menu_tarik')],
  [Markup.button.callback('🛠 Bantuan',       'menu_bantuan')],
]);

// ═══════════════════════════════════════════════════════════════
//  /start
// ═══════════════════════════════════════════════════════════════
bot.start(async (ctx) => {
  try {
    const db     = loadDB();
    const tgUser = ctx.from;
    const isNew  = !db.users[tgUser.id];
    const user   = getUser(db, tgUser.id, tgUser);

    // Update username kalau berubah
    user.username  = tgUser.username   || 'unknown';
    user.firstName = tgUser.first_name || '';

    // Proses referral (hanya untuk user baru)
    const payload = ctx.startPayload;
    if (isNew && payload && !isNaN(payload)) {
      const refId = Number(payload);
      if (refId !== tgUser.id && db.users[refId]) {
        user.referralBy = refId;
        db.users[refId].saldo         += 100;
        db.users[refId].referralCount += 1;
        saveDB(db);
        try {
          await bot.telegram.sendMessage(refId,
            `🎉 Seseorang bergabung lewat link referral kamu!\n💰 +${toRp(100)} ditambahkan ke saldo kamu.`
          );
        } catch (_) {}
      }
    }

    saveDB(db);

    await ctx.replyWithHTML(
      `Halo, <b>${tgUser.first_name}</b>! 👋\n\n` +
      (isNew ? '🎊 Selamat datang! Akun kamu sudah terdaftar.\n\n' : '') +
      '🤖 <b>Bot Cari Cuan</b> siap membantu kamu menghasilkan uang.\n\n' +
      'Pilih menu di bawah:',
      mainMenu()
    );
  } catch (err) {
    console.error('start error:', err);
    ctx.reply('Terjadi kesalahan, coba lagi.');
  }
});

// ═══════════════════════════════════════════════════════════════
//  MENU: CARI CUAN
// ═══════════════════════════════════════════════════════════════
bot.action('menu_cuan', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from);

  const buttons = TASKS.map(t => {
    const done = user.tasksDone.includes(t.id);
    return [Markup.button.callback(
      done ? `✅ ${t.label} (+${toRp(t.reward)}) — Selesai` : `${t.label} (+${toRp(t.reward)})`,
      done ? `task_done_${t.id}` : `do_task_${t.id}`
    )];
  });
  buttons.push([Markup.button.callback('🔙 Kembali', 'back_main')]);

  await ctx.editMessageText(
    '💰 <b>Cari Cuan</b>\n\nSelesaikan tugas untuk mendapatkan saldo!\nTugas yang sudah ✅ tidak bisa diulang.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

// Kerjakan tugas
TASKS.forEach(task => {
  bot.action(`do_task_${task.id}`, async (ctx) => {
    await ctx.answerCbQuery('Memproses...');
    const db   = loadDB();
    const user = getUser(db, ctx.from.id, ctx.from);

    if (user.tasksDone.includes(task.id)) {
      return ctx.answerCbQuery('Tugas sudah diselesaikan!', { show_alert: true });
    }

    user.tasksDone.push(task.id);
    user.saldo += task.reward;
    saveDB(db);

    await ctx.editMessageText(
      `✅ <b>Tugas Selesai!</b>\n\n` +
      `📌 ${task.label}\n` +
      `💵 +${toRp(task.reward)} ditambahkan!\n` +
      `💰 Saldo kamu: <b>${toRp(user.saldo)}</b>\n\n` +
      `🔗 Link: ${task.url}`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('◀ Kembali ke Tugas', 'menu_cuan')],
      ])}
    );
  });

  bot.action(`task_done_${task.id}`, async (ctx) => {
    await ctx.answerCbQuery('Tugas ini sudah kamu selesaikan!', { show_alert: true });
  });
});

// ═══════════════════════════════════════════════════════════════
//  MENU: REFERRAL
// ═══════════════════════════════════════════════════════════════
bot.action('menu_referral', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from);
  const link = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;

  await ctx.editMessageText(
    `👫 <b>Undang Teman</b>\n\n` +
    `Bagikan link kamu dan dapatkan <b>${toRp(100)}</b> per teman yang bergabung!\n\n` +
    `🔗 <b>Link Referral:</b>\n<code>${link}</code>\n\n` +
    `👥 Total referral: <b>${user.referralCount} orang</b>\n` +
    `🎁 Bonus didapat: <b>${toRp(user.referralCount * 100)}</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
  );
});

// ═══════════════════════════════════════════════════════════════
//  MENU: PROFIL
// ═══════════════════════════════════════════════════════════════
bot.action('menu_profil', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from);
  const tgl  = new Date(user.joinedAt).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

  await ctx.editMessageText(
    `👤 <b>Profil Kamu</b>\n\n` +
    `📛 Nama     : <b>${user.firstName}</b>\n` +
    `🆔 ID       : <code>${user.userId}</code>\n` +
    `💰 Saldo    : <b>${toRp(user.saldo)}</b>\n` +
    `👥 Referral : <b>${user.referralCount} orang</b>\n` +
    `✅ Tugas    : <b>${user.tasksDone.length}/${TASKS.length} selesai</b>\n` +
    `📅 Bergabung: <b>${tgl}</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
  );
});

// ═══════════════════════════════════════════════════════════════
//  MENU: RIWAYAT
// ═══════════════════════════════════════════════════════════════
bot.action('menu_riwayat', async (ctx) => {
  await ctx.answerCbQuery();
  const db       = loadDB();
  const riwayat  = (db.withdraws || [])
    .filter(w => w.userId === ctx.from.id)
    .slice(-5)
    .reverse();

  let text = '📜 <b>Riwayat Penarikan</b>\n\n';

  if (riwayat.length === 0) {
    text += '📭 Belum ada riwayat penarikan.';
  } else {
    riwayat.forEach((w, i) => {
      const emoji = w.status === 'sukses' ? '✅' : w.status === 'ditolak' ? '❌' : '⏳';
      const tgl   = new Date(w.createdAt).toLocaleDateString('id-ID');
      text += `${i + 1}. ${emoji} <b>${toRp(w.jumlah)}</b>\n`;
      text += `   📱 ${w.ewallet}  |  ${w.status.toUpperCase()}\n`;
      text += `   📅 ${tgl}\n\n`;
    });
  }

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]])
  });
});

// ═══════════════════════════════════════════════════════════════
//  MENU: TARIK SALDO
// ═══════════════════════════════════════════════════════════════
bot.action('menu_tarik', async (ctx) => {
  await ctx.answerCbQuery();
  const db   = loadDB();
  const user = getUser(db, ctx.from.id, ctx.from);

  if (user.saldo < MIN_WITHDRAW) {
    return ctx.editMessageText(
      `💸 <b>Tarik Saldo</b>\n\n` +
      `❌ Saldo kamu belum mencukupi!\n\n` +
      `💰 Saldo kamu     : <b>${toRp(user.saldo)}</b>\n` +
      `📋 Minimal tarik  : <b>${toRp(MIN_WITHDRAW)}</b>\n` +
      `📉 Kurang          : <b>${toRp(MIN_WITHDRAW - user.saldo)}</b>\n\n` +
      `Yuk selesaikan lebih banyak tugas! 💪`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('💰 Cari Cuan', 'menu_cuan')],
        [Markup.button.callback('🔙 Kembali',   'back_main')],
      ])}
    );
  }

  ctx.session           = ctx.session || {};
  ctx.session.withdraw  = true;

  await ctx.editMessageText(
    `💸 <b>Tarik Saldo</b>\n\n` +
    `💰 Saldo tersedia: <b>${toRp(user.saldo)}</b>\n\n` +
    `Ketik nomor DANA / OVO / GoPay kamu:\n` +
    `Contoh: <code>085123456789</code>\n\n` +
    `⚠️ Pastikan nomor benar sebelum mengirim.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'cancel_tarik')]]) }
  );
});

bot.action('cancel_tarik', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session          = ctx.session || {};
  ctx.session.withdraw = false;
  await ctx.editMessageText('❌ Penarikan dibatalkan.', mainMenu());
});

// ═══════════════════════════════════════════════════════════════
//  MENU: BANTUAN
// ═══════════════════════════════════════════════════════════════
bot.action('menu_bantuan', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🛠 <b>Bantuan</b>\n\n` +
    `<b>Cara Menggunakan Bot:</b>\n\n` +
    `1️⃣ Ketik /start untuk memulai\n` +
    `2️⃣ Pilih 💰 <b>Cari Cuan</b> → selesaikan tugas → saldo otomatis masuk\n` +
    `3️⃣ Ajak teman pakai link 👫 <b>Undang Teman</b> → dapat ${toRp(100)}/orang\n` +
    `4️⃣ Kalau saldo ≥ ${toRp(MIN_WITHDRAW)}, klik 💸 <b>Tarik Saldo</b>\n` +
    `5️⃣ Cek status penarikan di 📜 <b>Riwayat</b>\n\n` +
    `❓ Ada masalah? Hubungi admin.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
  );
});

// ─── KEMBALI KE MENU UTAMA ───────────────────────────────────
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🏠 <b>Menu Utama</b>\n\nPilih menu di bawah:',
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

// ═══════════════════════════════════════════════════════════════
//  HANDLER TEKS MASUK
// ═══════════════════════════════════════════════════════════════
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text.trim();

    // ── ADMIN COMMAND ──────────────────────────────────────────
    if (text === '/admin1922') {
      if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses ditolak.');
      return ctx.replyWithHTML(
        '🔐 <b>Panel Admin</b>\n\nSelamat datang Admin! Pilih aksi:',
        Markup.inlineKeyboard([
          [Markup.button.callback('📊 Statistik',          'adm_stats')],
          [Markup.button.callback('📢 Broadcast',           'adm_broadcast')],
          [Markup.button.callback('📥 Download Data User',  'adm_download')],
          [Markup.button.callback('💳 Konfirmasi Withdraw', 'adm_withdraws')],
        ])
      );
    }

    // ── PROSES INPUT NOMOR EWALLET ─────────────────────────────
    ctx.session = ctx.session || {};
    if (ctx.session.withdraw) {
      const noHp = text.replace(/\D/g, '');

      if (!/^0[0-9]{9,12}$/.test(noHp)) {
        return ctx.reply(
          '❌ Format nomor tidak valid!\n\n' +
          'Harus diawali 0 dan 10–13 digit.\n' +
          'Contoh: <code>085123456789</code>',
          { parse_mode: 'HTML' }
        );
      }

      const db   = loadDB();
      const user = getUser(db, ctx.from.id, ctx.from);

      if (user.saldo < MIN_WITHDRAW) {
        ctx.session.withdraw = false;
        return ctx.reply(`❌ Saldo tidak mencukupi (${toRp(user.saldo)}).`);
      }

      const jumlah  = user.saldo;
      user.saldo    = 0;

      const wdEntry = {
        id:        Date.now().toString(),
        userId:    ctx.from.id,
        username:  user.username,
        jumlah,
        ewallet:   noHp,
        status:    'pending',
        createdAt: new Date().toISOString(),
      };

      db.withdraws = db.withdraws || [];
      db.withdraws.push(wdEntry);
      saveDB(db);

      ctx.session.withdraw = false;

      await ctx.replyWithHTML(
        `✅ <b>Permintaan Penarikan Terkirim!</b>\n\n` +
        `💰 Jumlah : <b>${toRp(jumlah)}</b>\n` +
        `📱 Nomor  : <code>${noHp}</code>\n` +
        `⏳ Status : <b>PENDING</b>\n\n` +
        `Proses 1×24 jam. Notifikasi akan dikirim otomatis.`,
        mainMenu()
      );

      // Notif ke admin
      try {
        await bot.telegram.sendMessage(ADMIN_ID,
          `🔔 <b>Withdraw Baru!</b>\n\n` +
          `👤 @${user.username} (ID: <code>${ctx.from.id}</code>)\n` +
          `💰 Jumlah : ${toRp(jumlah)}\n` +
          `📱 Nomor  : <code>${noHp}</code>\n` +
          `🆔 WD ID  : <code>${wdEntry.id}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      return;
    }

    // ── PROSES INPUT BROADCAST ─────────────────────────────────
    if (ctx.session.broadcast && ctx.from.id === ADMIN_ID) {
      ctx.session.broadcast = false;
      const db    = loadDB();
      const users = Object.values(db.users);
      let sukses  = 0, gagal = 0;

      await ctx.reply(`📡 Mengirim ke ${users.length} user...`);

      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.userId,
            `📢 <b>Pengumuman</b>\n\n${text}`,
            { parse_mode: 'HTML' }
          );
          sukses++;
        } catch (_) { gagal++; }
        await new Promise(r => setTimeout(r, 60)); // hindari flood
      }

      return ctx.replyWithHTML(
        `✅ <b>Broadcast Selesai!</b>\n\n📨 Terkirim: <b>${sukses}</b>\n❌ Gagal: <b>${gagal}</b>`
      );
    }

  } catch (err) {
    console.error('text handler error:', err);
    ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.');
  }
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN ACTIONS
// ═══════════════════════════════════════════════════════════════

// ── STATISTIK ──────────────────────────────────────────────────
bot.action('adm_stats', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();
  const db         = loadDB();
  const users      = Object.values(db.users);
  const totalSaldo = users.reduce((s, u) => s + u.saldo, 0);
  const pending    = (db.withdraws || []).filter(w => w.status === 'pending').length;
  const sukses     = (db.withdraws || []).filter(w => w.status === 'sukses').length;

  await ctx.editMessageText(
    `📊 <b>Statistik Bot</b>\n\n` +
    `👥 Total User         : <b>${users.length}</b>\n` +
    `💰 Total Saldo Beredar: <b>${toRp(totalSaldo)}</b>\n` +
    `⏳ Withdraw Pending   : <b>${pending}</b>\n` +
    `✅ Withdraw Sukses    : <b>${sukses}</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'adm_back')]]) }
  );
});

// ── BROADCAST ──────────────────────────────────────────────────
bot.action('adm_broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();
  ctx.session           = ctx.session || {};
  ctx.session.broadcast = true;

  await ctx.editMessageText(
    '📢 <b>Broadcast</b>\n\nKirim pesan yang ingin dikirimkan ke semua user:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'adm_back')]]) }
  );
});

// ── DOWNLOAD DATA USER ─────────────────────────────────────────
bot.action('adm_download', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery('Membuat file...');

  const db    = loadDB();
  const users = Object.values(db.users);

  let isi  = `DATA USER BOT CARI CUAN\n`;
  isi     += `Diekspor: ${new Date().toLocaleString('id-ID')}\n`;
  isi     += '='.repeat(65) + '\n';
  isi     += 'No  | User ID       | Username              | Saldo\n';
  isi     += '-'.repeat(65) + '\n';

  users.forEach((u, i) => {
    const no   = String(i + 1).padEnd(4);
    const id   = String(u.userId).padEnd(14);
    const name = String('@' + u.username).padEnd(22);
    const sal  = toRp(u.saldo);
    isi += `${no}| ${id}| ${name}| ${sal}\n`;
  });

  isi += '-'.repeat(65) + '\n';
  isi += `Total: ${users.length} user\n`;

  const tmpFile = path.join('/tmp', `data_user_${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, isi, 'utf8');

  try {
    await bot.telegram.sendDocument(ADMIN_ID, {
      source:   fs.createReadStream(tmpFile),
      filename: 'data_user.txt',
    }, { caption: `📥 Data <b>${users.length}</b> user berhasil diekspor.`, parse_mode: 'HTML' });
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

// ── KONFIRMASI WITHDRAW ────────────────────────────────────────
bot.action('adm_withdraws', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();

  const db      = loadDB();
  const pending = (db.withdraws || []).filter(w => w.status === 'pending').slice(0, 8);

  if (pending.length === 0) {
    return ctx.editMessageText(
      '✅ Tidak ada withdraw yang menunggu.',
      { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'adm_back')]]) }
    );
  }

  let text = '💳 <b>Antrian Withdraw</b>\n\n';
  const buttons = [];

  pending.forEach((w, i) => {
    text += `${i + 1}. @${w.username} | <b>${toRp(w.jumlah)}</b>\n`;
    text += `   📱 <code>${w.ewallet}</code>\n`;
    text += `   🆔 <code>${w.id}</code>\n\n`;
    buttons.push([
      Markup.button.callback(`✅ ACC #${i + 1}`, `wd_acc_${w.id}`),
      Markup.button.callback(`❌ Tolak #${i + 1}`, `wd_rej_${w.id}`),
    ]);
  });

  buttons.push([Markup.button.callback('🔙 Kembali', 'adm_back')]);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
});

// Setujui
bot.action(/^wd_acc_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  const wdId = ctx.match[1];
  const db   = loadDB();
  const wd   = (db.withdraws || []).find(w => w.id === wdId);

  if (!wd) return ctx.answerCbQuery('Data tidak ditemukan.', { show_alert: true });
  wd.status = 'sukses';
  saveDB(db);

  await ctx.answerCbQuery(`✅ Withdraw ${toRp(wd.jumlah)} disetujui!`);

  try {
    await bot.telegram.sendMessage(wd.userId,
      `✅ <b>Penarikan Disetujui!</b>\n\n` +
      `💰 ${toRp(wd.jumlah)} sedang ditransfer ke <code>${wd.ewallet}</code>.\n\n` +
      `Terima kasih sudah menggunakan bot kami! 🙏`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}

  // Refresh tampilan
  await ctx.editMessageText(
    `✅ Withdraw <code>${wdId}</code> telah disetujui.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('◀ Kembali ke Antrian', 'adm_withdraws')],
    ])}
  );
});

// Tolak
bot.action(/^wd_rej_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  const wdId = ctx.match[1];
  const db   = loadDB();
  const wd   = (db.withdraws || []).find(w => w.id === wdId);

  if (!wd) return ctx.answerCbQuery('Data tidak ditemukan.', { show_alert: true });
  wd.status = 'ditolak';

  // Kembalikan saldo
  const user = db.users[wd.userId];
  if (user) user.saldo += wd.jumlah;
  saveDB(db);

  await ctx.answerCbQuery(`❌ Withdraw ditolak, saldo dikembalikan.`);

  try {
    await bot.telegram.sendMessage(wd.userId,
      `❌ <b>Penarikan Ditolak</b>\n\n` +
      `💰 ${toRp(wd.jumlah)} telah dikembalikan ke saldo kamu.\n` +
      `Hubungi admin untuk info lebih lanjut.`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}

  await ctx.editMessageText(
    `❌ Withdraw <code>${wdId}</code> ditolak & saldo dikembalikan.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('◀ Kembali ke Antrian', 'adm_withdraws')],
    ])}
  );
});

// Kembali ke panel admin
bot.action('adm_back', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();
  ctx.session           = ctx.session || {};
  ctx.session.broadcast = false;
  await ctx.editMessageText(
    '🔐 <b>Panel Admin</b>\n\nPilih aksi:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('📊 Statistik',          'adm_stats')],
      [Markup.button.callback('📢 Broadcast',           'adm_broadcast')],
      [Markup.button.callback('📥 Download Data User',  'adm_download')],
      [Markup.button.callback('💳 Konfirmasi Withdraw', 'adm_withdraws')],
    ])}
  );
});

// ═══════════════════════════════════════════════════════════════
//  ERROR HANDLER & LAUNCH
// ═══════════════════════════════════════════════════════════════
bot.catch((err, ctx) => {
  console.error(`Error [${ctx?.updateType}]:`, err.message);
  try { ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.'); } catch (_) {}
});

bot.launch()
  .then(() => console.log('🤖 Bot berjalan!'))
  .catch(err => { console.error('❌ Gagal launch:', err.message); process.exit(1); });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
