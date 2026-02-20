// ============================================================
//  TELEGRAM BOT - CARI CUAN
//  Jalankan di Railway.app + MongoDB Atlas
// ============================================================
//  CARA ISI ENV DI RAILWAY:
//  1. Buka project di Railway → Settings → Variables
//  2. Tambahkan variabel berikut:
//     BOT_TOKEN   = token dari @BotFather
//     MONGO_URI   = mongodb+srv://user:pass@cluster.mongodb.net/botdb
//     ADMIN_ID    = ID Telegram kamu (cek via @userinfobot)
// ============================================================

const { Telegraf, Markup, session } = require('telegraf');
const mongoose = require('mongoose');

// ─── KONFIGURASI (ISI DI SINI JIKA TIDAK PAKAI ENV) ────────
const BOT_TOKEN = process.env.BOT_TOKEN || '7596953618:AAFLpibLwDG3ZrT2yeiILPoYhO52-mMyh_Y';
const MONGO_URI  = process.env.MONGO_URI  || 'ISI_MONGO_URI_DISINI';
const ADMIN_ID   = Number(process.env.ADMIN_ID  || 0); // 8496726839
// ─────────────────────────────────────────────────────────────

const BOT_USERNAME = 'GroupA1securitybot'; // Ganti dengan username bot kamu (tanpa @)
const MIN_WITHDRAW = 20000;     // Minimal penarikan dalam Rupiah

// ─── MONGOOSE SCHEMA ─────────────────────────────────────────
const userSchema = new mongoose.Schema({
  userId:     { type: Number, required: true, unique: true },
  username:   { type: String, default: 'unknown' },
  firstName:  { type: String, default: '' },
  saldo:      { type: Number, default: 0 },
  referralBy: { type: Number, default: null },
  referralCount: { type: Number, default: 0 },
  joinedAt:   { type: Date, default: Date.now },
  adClicked:  { type: [String], default: [] }, // task IDs yang sudah dikerjakan
});

const withdrawSchema = new mongoose.Schema({
  userId:    { type: Number, required: true },
  username:  { type: String },
  jumlah:    { type: Number, required: true },
  ewallet:   { type: String, required: true },
  status:    { type: String, enum: ['pending', 'sukses', 'ditolak'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

const User     = mongoose.model('User', userSchema);
const Withdraw = mongoose.model('Withdraw', withdrawSchema);

// ─── FORMAT RUPIAH ────────────────────────────────────────────
const toRp = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

// ─── KONEKSI MONGODB ──────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB terhubung'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

// ─── BOT INSTANCE ────────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ─── HELPER: PASTIKAN USER ADA DI DB ─────────────────────────
async function getOrCreateUser(ctx) {
  const tg = ctx.from;
  let user = await User.findOne({ userId: tg.id });
  if (!user) {
    user = new User({
      userId:    tg.id,
      username:  tg.username || 'unknown',
      firstName: tg.first_name || '',
    });
    await user.save();
  } else {
    // Update username jika berubah
    if (user.username !== (tg.username || 'unknown')) {
      user.username = tg.username || 'unknown';
      await user.save();
    }
  }
  return user;
}

// ─── MENU UTAMA ───────────────────────────────────────────────
function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💰 Cari Cuan', 'menu_cuan'),   Markup.button.callback('👫 Undang Teman', 'menu_referral')],
    [Markup.button.callback('👤 Profil',    'menu_profil'),  Markup.button.callback('📜 Riwayat',     'menu_riwayat')],
    [Markup.button.callback('💸 Tarik Saldo', 'menu_tarik')],
    [Markup.button.callback('🛠 Bantuan',    'menu_bantuan')],
  ]);
}

// ─── /start ───────────────────────────────────────────────────
bot.start(async (ctx) => {
  try {
    const tg   = ctx.from;
    let   user = await User.findOne({ userId: tg.id });
    const isNew = !user;

    if (isNew) {
      user = new User({
        userId:    tg.id,
        username:  tg.username || 'unknown',
        firstName: tg.first_name || '',
      });

      // Cek referral
      const payload = ctx.startPayload;
      if (payload && !isNaN(payload)) {
        const refId = Number(payload);
        if (refId !== tg.id) {
          user.referralBy = refId;
          // Beri bonus ke referrer
          await User.findOneAndUpdate(
            { userId: refId },
            { $inc: { saldo: 100, referralCount: 1 } }
          );
          // Notifikasi ke referrer
          try {
            await bot.telegram.sendMessage(refId,
              `🎉 Seseorang bergabung menggunakan link referral kamu!\n+${toRp(100)} telah ditambahkan ke saldo kamu.`
            );
          } catch (_) {}
        }
      }
      await user.save();
    }

    await ctx.replyWithHTML(
      `Halo, <b>${tg.first_name}</b>! 👋\n\n` +
      (isNew ? '🎊 Selamat datang! Akun kamu sudah terdaftar.\n\n' : '') +
      '🤖 <b>Bot Cari Cuan</b> siap membantu kamu menghasilkan uang.\n\n' +
      'Pilih menu di bawah ini:',
      mainMenu()
    );
  } catch (err) {
    console.error('start error:', err);
    ctx.reply('Terjadi kesalahan, coba lagi.');
  }
});

// ─── MENU: CARI CUAN ─────────────────────────────────────────
const TASKS = [
  { id: 'iklan1', label: '🖱 Klik Iklan #1 (+Rp500)',   reward: 500,  url: 'https://example.com/iklan1' },
  { id: 'iklan2', label: '🖱 Klik Iklan #2 (+Rp750)',   reward: 750,  url: 'https://example.com/iklan2' },
  { id: 'follow1', label: '📱 Follow Instagram (+Rp300)', reward: 300, url: 'https://instagram.com/example' },
  { id: 'follow2', label: '🐦 Follow Twitter (+Rp300)',   reward: 300, url: 'https://twitter.com/example' },
];

bot.action('menu_cuan', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx);

  const buttons = TASKS.map(t => {
    const done = user.adClicked.includes(t.id);
    return [Markup.button.callback(
      done ? `✅ ${t.label} (Selesai)` : t.label,
      done ? `done_${t.id}` : `do_task_${t.id}`
    )];
  });
  buttons.push([Markup.button.callback('🔙 Kembali', 'back_main')]);

  await ctx.editMessageText(
    '💰 <b>Cari Cuan</b>\n\nSelesaikan tugas berikut untuk mendapatkan saldo:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

// Klik tugas
TASKS.forEach(task => {
  bot.action(`do_task_${task.id}`, async (ctx) => {
    await ctx.answerCbQuery('Memproses...');
    try {
      const user = await User.findOne({ userId: ctx.from.id });
      if (!user) return ctx.answerCbQuery('Akun tidak ditemukan.');
      if (user.adClicked.includes(task.id)) return ctx.answerCbQuery('Tugas sudah diselesaikan!');

      user.adClicked.push(task.id);
      user.saldo += task.reward;
      await user.save();

      await ctx.editMessageText(
        `✅ <b>Tugas selesai!</b>\n\n` +
        `📌 ${task.label}\n` +
        `💵 +${toRp(task.reward)} ditambahkan ke saldo kamu!\n` +
        `💰 Saldo sekarang: <b>${toRp(user.saldo)}</b>\n\n` +
        `🔗 Link: ${task.url}`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali ke Tugas', 'menu_cuan')]]) }
      );
    } catch (err) {
      console.error('task error:', err);
      ctx.reply('Terjadi kesalahan.');
    }
  });

  bot.action(`done_${task.id}`, async (ctx) => {
    await ctx.answerCbQuery('Tugas ini sudah kamu selesaikan!', { show_alert: true });
  });
});

// ─── MENU: REFERRAL ───────────────────────────────────────────
bot.action('menu_referral', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx);
  const link = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;

  await ctx.editMessageText(
    `👫 <b>Undang Teman</b>\n\n` +
    `Bagikan link referral kamu dan dapatkan <b>Rp100</b> untuk setiap teman yang bergabung!\n\n` +
    `🔗 Link kamu:\n<code>${link}</code>\n\n` +
    `👥 Total referral: <b>${user.referralCount} orang</b>\n` +
    `💰 Bonus terkumpul: <b>${toRp(user.referralCount * 100)}</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
  );
});

// ─── MENU: PROFIL ─────────────────────────────────────────────
bot.action('menu_profil', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx);

  await ctx.editMessageText(
    `👤 <b>Profil Kamu</b>\n\n` +
    `📛 Nama: <b>${user.firstName || ctx.from.first_name}</b>\n` +
    `🆔 ID Telegram: <code>${user.userId}</code>\n` +
    `💰 Saldo: <b>${toRp(user.saldo)}</b>\n` +
    `👥 Referral: <b>${user.referralCount} orang</b>\n` +
    `📅 Bergabung: <b>${user.joinedAt.toLocaleDateString('id-ID')}</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
  );
});

// ─── MENU: RIWAYAT ────────────────────────────────────────────
bot.action('menu_riwayat', async (ctx) => {
  await ctx.answerCbQuery();
  const withdraws = await Withdraw.find({ userId: ctx.from.id }).sort({ createdAt: -1 }).limit(5);

  let text = '📜 <b>Riwayat Penarikan</b>\n\n';
  if (withdraws.length === 0) {
    text += 'Belum ada riwayat penarikan.';
  } else {
    withdraws.forEach((w, i) => {
      const statusEmoji = w.status === 'sukses' ? '✅' : w.status === 'ditolak' ? '❌' : '⏳';
      text += `${i + 1}. ${statusEmoji} <b>${toRp(w.jumlah)}</b> → <code>${w.ewallet}</code>\n`;
      text += `   Status: <b>${w.status.toUpperCase()}</b> | ${w.createdAt.toLocaleDateString('id-ID')}\n\n`;
    });
  }

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]])
  });
});

// ─── MENU: TARIK SALDO ────────────────────────────────────────
bot.action('menu_tarik', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ userId: ctx.from.id });

  if (!user || user.saldo < MIN_WITHDRAW) {
    return ctx.editMessageText(
      `💸 <b>Tarik Saldo</b>\n\n` +
      `❌ Saldo kamu tidak mencukupi!\n\n` +
      `💰 Saldo kamu: <b>${toRp(user?.saldo || 0)}</b>\n` +
      `📋 Minimal penarikan: <b>${toRp(MIN_WITHDRAW)}</b>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
    );
  }

  ctx.session = ctx.session || {};
  ctx.session.awaitWithdraw = true;
  ctx.session.withdrawAmount = user.saldo;

  await ctx.editMessageText(
    `💸 <b>Tarik Saldo</b>\n\n` +
    `💰 Saldo tersedia: <b>${toRp(user.saldo)}</b>\n\n` +
    `Kirimkan nomor DANA/OVO/GoPay kamu ke chat ini:\n` +
    `Format: <code>085XXXXXXXXX</code>\n\n` +
    `⚠️ Pastikan nomor benar, kesalahan bukan tanggung jawab bot.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'cancel_withdraw')]]) }
  );
});

bot.action('cancel_withdraw', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = ctx.session || {};
  ctx.session.awaitWithdraw = false;
  await ctx.editMessageText('❌ Penarikan dibatalkan.', mainMenu());
});

// ─── MENU: BANTUAN ────────────────────────────────────────────
bot.action('menu_bantuan', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🛠 <b>Bantuan</b>\n\n` +
    `Bot ini membantu kamu menghasilkan uang dengan cara:\n\n` +
    `💰 <b>Cari Cuan</b> - Selesaikan tugas (klik iklan/follow sosmed) dan dapatkan saldo.\n\n` +
    `👫 <b>Undang Teman</b> - Bagikan link referral, dapat Rp100 per orang yang bergabung.\n\n` +
    `💸 <b>Tarik Saldo</b> - Minimal penarikan <b>${toRp(MIN_WITHDRAW)}</b> via DANA/OVO/GoPay.\n\n` +
    `📜 <b>Riwayat</b> - Cek status penarikanmu.\n\n` +
    `❓ Butuh bantuan lebih? Hubungi admin.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_main')]]) }
  );
});

// ─── BACK TO MAIN ─────────────────────────────────────────────
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🏠 <b>Menu Utama</b>\n\nPilih menu di bawah ini:',
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

// ─── HANDLER TEKS: PROSES WITHDRAW ───────────────────────────
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;

    // ── ADMIN COMMAND ──
    if (text === '/admin1922') {
      if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses ditolak.');
      return ctx.replyWithHTML(
        '🔐 <b>Panel Admin</b>\n\nPilih aksi:',
        Markup.inlineKeyboard([
          [Markup.button.callback('📊 Statistik',         'adm_stats')],
          [Markup.button.callback('📢 Broadcast',          'adm_broadcast')],
          [Markup.button.callback('📥 Download Data User', 'adm_download')],
          [Markup.button.callback('💳 Konfirmasi Withdraw','adm_withdraws')],
        ])
      );
    }

    // ── PROSES INPUT NOMOR EWALLET ──
    ctx.session = ctx.session || {};
    if (ctx.session.awaitWithdraw) {
      const noHp = text.replace(/\s/g, '');
      if (!/^0[0-9]{9,12}$/.test(noHp)) {
        return ctx.reply('❌ Format nomor tidak valid. Contoh: 085123456789');
      }

      const user = await User.findOne({ userId: ctx.from.id });
      if (!user || user.saldo < MIN_WITHDRAW) {
        ctx.session.awaitWithdraw = false;
        return ctx.reply('❌ Saldo tidak mencukupi.');
      }

      const jumlah = user.saldo;
      user.saldo = 0;
      await user.save();

      const wd = new Withdraw({
        userId:   user.userId,
        username: user.username,
        jumlah,
        ewallet:  noHp,
      });
      await wd.save();

      ctx.session.awaitWithdraw = false;

      await ctx.replyWithHTML(
        `✅ <b>Permintaan penarikan dikirim!</b>\n\n` +
        `💰 Jumlah: <b>${toRp(jumlah)}</b>\n` +
        `📱 Nomor: <code>${noHp}</code>\n` +
        `⏳ Status: <b>PENDING</b>\n\n` +
        `Proses 1x24 jam. Tunggu konfirmasi admin.`,
        mainMenu()
      );

      // Notif ke admin
      try {
        await bot.telegram.sendMessage(ADMIN_ID,
          `🔔 <b>Permintaan Withdraw Baru!</b>\n\n` +
          `👤 User: @${user.username} (ID: ${user.userId})\n` +
          `💰 Jumlah: ${toRp(jumlah)}\n` +
          `📱 Nomor: ${noHp}\n` +
          `🆔 WD ID: ${wd._id}`,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      return;
    }

    // ── BROADCAST INPUT ──
    if (ctx.session.awaitBroadcast && ctx.from.id === ADMIN_ID) {
      ctx.session.awaitBroadcast = false;
      const pesan = text;
      const users = await User.find({}, 'userId');
      let sukses = 0, gagal = 0;

      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.userId, `📢 <b>Pengumuman</b>\n\n${pesan}`, { parse_mode: 'HTML' });
          sukses++;
        } catch (_) { gagal++; }
        await new Promise(r => setTimeout(r, 50)); // rate limit
      }

      return ctx.replyWithHTML(
        `✅ Broadcast selesai!\n\n📨 Terkirim: ${sukses}\n❌ Gagal: ${gagal}`
      );
    }

  } catch (err) {
    console.error('text handler error:', err);
    ctx.reply('Terjadi kesalahan.');
  }
});

// ─── ADMIN: STATISTIK ────────────────────────────────────────
bot.action('adm_stats', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();

  const totalUser  = await User.countDocuments();
  const saldoData  = await User.aggregate([{ $group: { _id: null, total: { $sum: '$saldo' } } }]);
  const totalSaldo = saldoData[0]?.total || 0;
  const pendingWd  = await Withdraw.countDocuments({ status: 'pending' });

  await ctx.editMessageText(
    `📊 <b>Statistik Bot</b>\n\n` +
    `👥 Total User: <b>${totalUser}</b>\n` +
    `💰 Total Saldo Beredar: <b>${toRp(totalSaldo)}</b>\n` +
    `⏳ Withdraw Pending: <b>${pendingWd}</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'adm_back')]]) }
  );
});

// ─── ADMIN: BROADCAST ────────────────────────────────────────
bot.action('adm_broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();
  ctx.session = ctx.session || {};
  ctx.session.awaitBroadcast = true;

  await ctx.editMessageText(
    '📢 <b>Broadcast</b>\n\nKirim pesan yang ingin di-broadcast ke semua user:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'adm_back')]]) }
  );
});

// ─── ADMIN: DOWNLOAD DATA USER ───────────────────────────────
bot.action('adm_download', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery('Memproses...');

  const fs    = require('fs');
  const path  = require('path');
  const users = await User.find().sort({ joinedAt: -1 });

  let isi = `DATA USER BOT CARI CUAN\nDiekspor: ${new Date().toLocaleString('id-ID')}\n`;
  isi += '='.repeat(60) + '\n';
  isi += 'No | User ID       | Username          | Saldo       | Referral\n';
  isi += '-'.repeat(60) + '\n';

  users.forEach((u, i) => {
    isi += `${String(i + 1).padEnd(3)}| `;
    isi += `${String(u.userId).padEnd(14)}| `;
    isi += `${String('@' + u.username).padEnd(18)}| `;
    isi += `${String(toRp(u.saldo)).padEnd(12)}| `;
    isi += `${u.referralCount} orang\n`;
  });

  isi += '-'.repeat(60) + '\n';
  isi += `Total: ${users.length} user\n`;

  const filePath = path.join('/tmp', `data_user_${Date.now()}.txt`);
  fs.writeFileSync(filePath, isi, 'utf8');

  try {
    await bot.telegram.sendDocument(ADMIN_ID, {
      source: fs.createReadStream(filePath),
      filename: 'data_user.txt',
    }, { caption: `📥 Data ${users.length} user berhasil diekspor.` });
  } finally {
    fs.unlinkSync(filePath);
  }

  await ctx.answerCbQuery('File terkirim!');
});

// ─── ADMIN: KONFIRMASI WITHDRAW ───────────────────────────────
bot.action('adm_withdraws', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();

  const pendings = await Withdraw.find({ status: 'pending' }).limit(10);

  if (pendings.length === 0) {
    return ctx.editMessageText('✅ Tidak ada withdraw pending.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'adm_back')]])
    });
  }

  let text = '💳 <b>Withdraw Pending</b>\n\n';
  const buttons = [];

  pendings.forEach((w, i) => {
    text += `${i + 1}. @${w.username} | ${toRp(w.jumlah)} | <code>${w.ewallet}</code>\n`;
    text += `   ID: <code>${w._id}</code>\n\n`;
    buttons.push([
      Markup.button.callback(`✅ Setuju #${i + 1}`, `wd_acc_${w._id}`),
      Markup.button.callback(`❌ Tolak #${i + 1}`,  `wd_rej_${w._id}`),
    ]);
  });

  buttons.push([Markup.button.callback('🔙 Kembali', 'adm_back')]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// Setujui withdraw
bot.action(/^wd_acc_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  const wdId = ctx.match[1];
  const wd = await Withdraw.findByIdAndUpdate(wdId, { status: 'sukses' }, { new: true });
  if (!wd) return ctx.answerCbQuery('Data tidak ditemukan.');

  await ctx.answerCbQuery(`✅ Withdraw ${toRp(wd.jumlah)} disetujui.`);

  // Notif ke user
  try {
    await bot.telegram.sendMessage(wd.userId,
      `✅ <b>Penarikan Disetujui!</b>\n\n` +
      `💰 Jumlah: ${toRp(wd.jumlah)}\n` +
      `📱 Ke: ${wd.ewallet}\n\n` +
      `Dana sedang dalam proses transfer.`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

// Tolak withdraw
bot.action(/^wd_rej_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  const wdId = ctx.match[1];
  const wd = await Withdraw.findByIdAndUpdate(wdId, { status: 'ditolak' }, { new: true });
  if (!wd) return ctx.answerCbQuery('Data tidak ditemukan.');

  // Kembalikan saldo
  await User.findOneAndUpdate({ userId: wd.userId }, { $inc: { saldo: wd.jumlah } });
  await ctx.answerCbQuery(`❌ Withdraw ditolak, saldo dikembalikan.`);

  try {
    await bot.telegram.sendMessage(wd.userId,
      `❌ <b>Penarikan Ditolak</b>\n\n` +
      `💰 ${toRp(wd.jumlah)} telah dikembalikan ke saldo kamu.\n` +
      `Hubungi admin untuk informasi lebih lanjut.`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {}
});

bot.action('adm_back', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Akses ditolak.');
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🔐 <b>Panel Admin</b>\n\nPilih aksi:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('📊 Statistik',         'adm_stats')],
      [Markup.button.callback('📢 Broadcast',          'adm_broadcast')],
      [Markup.button.callback('📥 Download Data User', 'adm_download')],
      [Markup.button.callback('💳 Konfirmasi Withdraw','adm_withdraws')],
    ])}
  );
});

// ─── ERROR HANDLER ────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`Bot error [${ctx.updateType}]:`, err.message);
  try { ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.'); } catch (_) {}
});

// ─── LAUNCH ───────────────────────────────────────────────────
bot.launch()
  .then(() => console.log('🤖 Bot berjalan...'))
  .catch(err => { console.error('❌ Gagal launch:', err.message); process.exit(1); });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
