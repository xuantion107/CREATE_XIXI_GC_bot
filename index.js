// ============================================================
// KONFIGURASI UTAMA - Letakkan variabel di sini
// ============================================================
const BOT_TOKEN = '8219268200:AAGNF8otuDit6Ojd01ofDD8lL2wRJx1UDl4';
const ADMIN_ID = 8496726839;
const SAFELINK_API_URL = 'https://safelinku.com/api?api=b28d306541fad2272ed9c4acd1a725a2a27b0460';
// ============================================================

const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

// ─── DATABASE HELPERS ────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { users: {}, tasks: [], submissions: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(db, userId, ctx) {
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      username: ctx?.from?.username || '',
      name: ctx?.from?.first_name || 'User',
      balance: 0,
      referrals: 0,
      referredBy: null,
      completedTasks: [],
      claimedTasks: {},
      joinedAt: Date.now(),
    };
  }
  return db.users[userId];
}

// ─── SAFELINK API ────────────────────────────────────────────
async function getSafelinkUrl(originalUrl) {
  const apiUrl = SAFELINK_API_URL + encodeURIComponent(originalUrl);
  const res = await axios.get(apiUrl, { timeout: 10000 });
  // Respons API biasanya { status: 'success', shortenedUrl: '...' } atau field lain
  const data = res.data;
  if (data && (data.shortenedUrl || data.short_url || data.url || data.result)) {
    return data.shortenedUrl || data.short_url || data.url || data.result;
  }
  // Jika API mengembalikan string langsung
  if (typeof data === 'string' && data.startsWith('http')) return data;
  throw new Error('Safelink API tidak mengembalikan URL valid: ' + JSON.stringify(data));
}

// ─── BOT SETUP ───────────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

function initSession(ctx) {
  if (!ctx.session) ctx.session = {};
}

// ─── KEYBOARDS ───────────────────────────────────────────────
const userKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('💰 DAFTAR TUGAS', 'menu_tasks')],
  [Markup.button.callback('📸 KONFIRMASI TUGAS', 'menu_confirm')],
  [Markup.button.callback('📢 PASANG IKLAN', 'menu_ads')],
  [Markup.button.callback('👤 PROFIL SAYA', 'menu_profile')],
  [Markup.button.callback('👫 UNDANG TEMAN', 'menu_referral')],
  [Markup.button.callback('💸 TARIK SALDO', 'menu_withdraw')],
]);

const adminKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➕ TAMBAH TUGAS', 'admin_add_task')],
  [Markup.button.callback('📊 STATISTIK BOT', 'admin_stats')],
  [Markup.button.callback('📢 BROADCAST', 'admin_broadcast')],
  [Markup.button.callback('📥 DATA USER (.txt)', 'admin_export')],
]);

// ─── START ───────────────────────────────────────────────────
bot.start(async (ctx) => {
  initSession(ctx);
  const db = loadDB();
  const userId = ctx.from.id.toString();
  const user = getUser(db, userId, ctx);

  // Referral handling
  const startPayload = ctx.startPayload;
  if (startPayload && startPayload.startsWith('ref_')) {
    const refId = startPayload.replace('ref_', '');
    if (refId !== userId && !user.referredBy && db.users[refId]) {
      user.referredBy = refId;
      db.users[refId].referrals = (db.users[refId].referrals || 0) + 1;
      db.users[refId].balance += 100;
      await bot.telegram.sendMessage(refId, `🎉 Seseorang bergabung menggunakan link referral Anda! +Rp100 telah ditambahkan ke saldo Anda.`).catch(() => {});
    }
  }

  saveDB(db);

  await ctx.replyWithHTML(
    `👋 Selamat datang, <b>${ctx.from.first_name}</b>!\n\n` +
    `🤖 Bot ini memungkinkan kamu mengerjakan tugas iklan dan mendapatkan penghasilan.\n\n` +
    `Pilih menu di bawah ini:`,
    userKeyboard
  );
});

// ─── MAIN MENU ───────────────────────────────────────────────
bot.command('menu', async (ctx) => {
  await ctx.reply('📋 Menu Utama:', userKeyboard);
});

// ─── ADMIN COMMAND ───────────────────────────────────────────
bot.command('admin1922', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses ditolak.');
  await ctx.reply('🔐 Panel Admin:', adminKeyboard);
});

// ─── DAFTAR TUGAS ────────────────────────────────────────────
bot.action('menu_tasks', async (ctx) => {
  initSession(ctx);
  await ctx.answerCbQuery();
  const db = loadDB();
  const userId = ctx.from.id.toString();
  const user = getUser(db, userId, ctx);
  const activeTasks = db.tasks.filter(t => t.active);

  if (activeTasks.length === 0) {
    return ctx.reply('😔 Belum ada tugas tersedia saat ini. Coba lagi nanti!');
  }

  const latest5 = activeTasks.slice(-5).reverse();
  let msg = '💰 <b>DAFTAR TUGAS TERSEDIA</b>\n\n';
  const buttons = [];

  for (const task of latest5) {
    const done = user.completedTasks.includes(task.id);
    msg += `📌 <b>${task.name}</b>\n`;
    msg += `   💵 Reward: Rp${task.reward.toLocaleString('id-ID')}\n`;
    msg += `   ${done ? '✅ Sudah dikerjakan' : '🔓 Tersedia'}\n\n`;
    if (!done) {
      buttons.push([Markup.button.callback(`🔗 Ambil Tugas: ${task.name}`, `take_task_${task.id}`)]);
    }
  }

  if (buttons.length === 0) {
    msg += '✅ Kamu sudah mengerjakan semua tugas yang tersedia!';
    return ctx.replyWithHTML(msg);
  }

  await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
  saveDB(db);
});

bot.action(/^take_task_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ Memproses...');
  const taskId = ctx.match[1];
  const db = loadDB();
  const userId = ctx.from.id.toString();
  const user = getUser(db, userId, ctx);
  const task = db.tasks.find(t => t.id === taskId);

  if (!task || !task.active) return ctx.reply('❌ Tugas tidak ditemukan atau sudah tidak aktif.');
  if (user.completedTasks.includes(taskId)) return ctx.reply('⚠️ Kamu sudah mengerjakan tugas ini sebelumnya.');

  // Cek apakah user sudah punya link untuk tugas ini
  if (user.claimedTasks && user.claimedTasks[taskId]) {
    return ctx.replyWithHTML(
      `✅ Kamu sudah mengambil tugas ini!\n\n` +
      `🔗 Link iklanmu: ${user.claimedTasks[taskId]}\n\n` +
      `📸 Setelah selesai, gunakan menu <b>KONFIRMASI TUGAS</b>.`
    );
  }

  try {
    const safeUrl = await getSafelinkUrl(task.link);
    if (!user.claimedTasks) user.claimedTasks = {};
    user.claimedTasks[taskId] = safeUrl;
    saveDB(db);

    // Notif admin
    await bot.telegram.sendMessage(ADMIN_ID,
      `📢 User <b>${user.name}</b> (ID: ${userId}) baru mengambil tugas: <b>${task.name}</b>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

    await ctx.replyWithHTML(
      `✅ <b>Tugas berhasil diambil!</b>\n\n` +
      `📌 Tugas: <b>${task.name}</b>\n` +
      `💵 Reward: <b>Rp${task.reward.toLocaleString('id-ID')}</b>\n\n` +
      `🔗 Link iklan unikmu:\n${safeUrl}\n\n` +
      `📋 <b>Cara kerja:</b>\n` +
      `1. Klik link di atas dan selesaikan halaman iklan\n` +
      `2. Catat <b>Kode Rahasia</b> di halaman akhir\n` +
      `3. Screenshot halaman akhir iklan\n` +
      `4. Gunakan menu 📸 KONFIRMASI TUGAS\n\n` +
      `⚠️ Kode rahasia untuk tugas ini akan diverifikasi Admin.`
    );
  } catch (err) {
    console.error('Safelink error:', err.message);
    await ctx.reply('❌ Gagal mendapatkan link iklan. Coba lagi nanti.\n\nError: ' + err.message);
  }
});

// ─── KONFIRMASI TUGAS ────────────────────────────────────────
bot.action('menu_confirm', async (ctx) => {
  initSession(ctx);
  await ctx.answerCbQuery();
  const db = loadDB();
  const userId = ctx.from.id.toString();
  const user = getUser(db, userId, ctx);

  const claimedTaskIds = Object.keys(user.claimedTasks || {});
  const pendingTasks = claimedTaskIds.filter(id => !user.completedTasks.includes(id));

  if (pendingTasks.length === 0) {
    return ctx.reply('ℹ️ Kamu belum mengambil tugas apapun atau semua tugas sudah dikonfirmasi.\n\nAmbil tugas dulu melalui menu 💰 DAFTAR TUGAS.');
  }

  const buttons = pendingTasks.map(tid => {
    const task = db.tasks.find(t => t.id === tid);
    return [Markup.button.callback(`📸 Konfirmasi: ${task ? task.name : tid}`, `confirm_task_${tid}`)];
  });

  ctx.session.confirmStep = null;
  await ctx.reply('Pilih tugas yang ingin dikonfirmasi:', Markup.inlineKeyboard(buttons));
});

bot.action(/^confirm_task_(.+)$/, async (ctx) => {
  initSession(ctx);
  await ctx.answerCbQuery();
  const taskId = ctx.match[1];
  const db = loadDB();
  const task = db.tasks.find(t => t.id === taskId);
  if (!task) return ctx.reply('❌ Tugas tidak ditemukan.');

  ctx.session.confirmStep = 'awaiting_code';
  ctx.session.confirmTaskId = taskId;

  await ctx.replyWithHTML(
    `📝 <b>Konfirmasi Tugas: ${task.name}</b>\n\n` +
    `Langkah 1: Kirim <b>Kode Rahasia</b> yang kamu temukan di halaman akhir iklan.`
  );
});

// ─── PROFILE ─────────────────────────────────────────────────
bot.action('menu_profile', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const userId = ctx.from.id.toString();
  const user = getUser(db, userId, ctx);
  saveDB(db);

  await ctx.replyWithHTML(
    `👤 <b>PROFIL SAYA</b>\n\n` +
    `👋 Nama: <b>${user.name}</b>\n` +
    `🆔 ID: <code>${userId}</code>\n` +
    `💰 Saldo: <b>Rp${user.balance.toLocaleString('id-ID')}</b>\n` +
    `👫 Referral: <b>${user.referrals || 0} orang</b>\n` +
    `✅ Tugas selesai: <b>${user.completedTasks.length}</b>`
  );
});

// ─── REFERRAL ────────────────────────────────────────────────
bot.action('menu_referral', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const botUsername = 'GroupA1securitybot';
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  await ctx.replyWithHTML(
    `👫 <b>UNDANG TEMAN</b>\n\n` +
    `Dapatkan <b>Rp100</b> setiap kali teman bergabung menggunakan link referral kamu!\n\n` +
    `🔗 Link referralmu:\n<code>${refLink}</code>\n\n` +
    `Salin dan bagikan ke teman-temanmu!`
  );
});

// ─── PASANG IKLAN ────────────────────────────────────────────
bot.action('menu_ads', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML(
    `📢 <b>PASANG IKLAN</b>\n\n` +
    `Ingin mempromosikan link/produk/layananmu kepada ribuan pengguna bot ini?\n\n` +
    `📩 Hubungi admin: @xuantionzang\n\n` +
    `Informasi yang perlu disiapkan:\n` +
    `• Link yang ingin dipromosikan\n` +
    `• Deskripsi singkat\n` +
    `• Budget promosi\n\n` +
    `Admin akan membantu kamu mengatur paket iklan yang sesuai.`
  );
});

// ─── TARIK SALDO ─────────────────────────────────────────────
bot.action('menu_withdraw', async (ctx) => {
  initSession(ctx);
  await ctx.answerCbQuery();
  const db = loadDB();
  const userId = ctx.from.id.toString();
  const user = getUser(db, userId, ctx);

  if (user.balance < 20000) {
    return ctx.replyWithHTML(
      `💸 <b>TARIK SALDO</b>\n\n` +
      `❌ Saldo kamu belum mencukupi!\n\n` +
      `💰 Saldo kamu: <b>Rp${user.balance.toLocaleString('id-ID')}</b>\n` +
      `📋 Minimum penarikan: <b>Rp20.000</b>\n\n` +
      `Kerjakan lebih banyak tugas untuk menambah saldo!`
    );
  }

  ctx.session.withdrawStep = 'awaiting_method';
  await ctx.reply(
    '💸 Pilih metode pembayaran:',
    Markup.inlineKeyboard([
      [Markup.button.callback('DANA', 'wd_dana')],
      [Markup.button.callback('GoPay', 'wd_gopay')],
    ])
  );
});

bot.action(/^wd_(dana|gopay)$/, async (ctx) => {
  initSession(ctx);
  await ctx.answerCbQuery();
  const method = ctx.match[1].toUpperCase();
  ctx.session.withdrawMethod = method;
  ctx.session.withdrawStep = 'awaiting_number';
  await ctx.reply(`📱 Masukkan nomor ${method} kamu (contoh: 08xxxxxxxxxx):`);
});

// ─── MESSAGE HANDLER ─────────────────────────────────────────
bot.on('text', async (ctx) => {
  initSession(ctx);

  // Admin broadcast step
  if (ctx.from.id === ADMIN_ID && ctx.session.adminStep === 'broadcast') {
    const db = loadDB();
    const msg = ctx.message.text;
    let sent = 0, failed = 0;
    for (const uid of Object.keys(db.users)) {
      try {
        await bot.telegram.sendMessage(uid, `📢 <b>Pesan dari Admin:</b>\n\n${msg}`, { parse_mode: 'HTML' });
        sent++;
      } catch { failed++; }
    }
    ctx.session.adminStep = null;
    return ctx.reply(`✅ Broadcast selesai!\n✅ Terkirim: ${sent}\n❌ Gagal: ${failed}`);
  }

  // Admin add task steps
  if (ctx.from.id === ADMIN_ID && ctx.session.adminStep) {
    const step = ctx.session.adminStep;
    const text = ctx.message.text;

    if (step === 'task_name') {
      ctx.session.newTask = { name: text };
      ctx.session.adminStep = 'task_link';
      return ctx.reply('🔗 Masukkan Link Tujuan (URL asli yang akan diubah menjadi link iklan):');
    }
    if (step === 'task_link') {
      ctx.session.newTask.link = text;
      ctx.session.adminStep = 'task_reward';
      return ctx.reply('💵 Masukkan Reward (angka saja, contoh: 1000):');
    }
    if (step === 'task_reward') {
      const reward = parseInt(text);
      if (isNaN(reward)) return ctx.reply('❌ Masukkan angka yang valid!');
      ctx.session.newTask.reward = reward;
      ctx.session.adminStep = 'task_secret';
      return ctx.reply('🔑 Masukkan Kode Rahasia untuk tugas ini:');
    }
    if (step === 'task_secret') {
      ctx.session.newTask.secretCode = text;
      const db = loadDB();
      const task = {
        id: 'task_' + Date.now(),
        ...ctx.session.newTask,
        active: true,
        createdAt: Date.now(),
      };
      db.tasks.push(task);
      saveDB(db);
      ctx.session.adminStep = null;
      ctx.session.newTask = null;
      return ctx.replyWithHTML(
        `✅ <b>Tugas berhasil ditambahkan!</b>\n\n` +
        `📌 Nama: ${task.name}\n` +
        `🔗 Link: ${task.link}\n` +
        `💵 Reward: Rp${task.reward.toLocaleString('id-ID')}\n` +
        `🔑 Kode Rahasia: <code>${task.secretCode}</code>`
      );
    }
  }

  // User: confirm task - awaiting secret code
  if (ctx.session.confirmStep === 'awaiting_code' && ctx.session.confirmTaskId) {
    const db = loadDB();
    const taskId = ctx.session.confirmTaskId;
    const task = db.tasks.find(t => t.id === taskId);
    const enteredCode = ctx.message.text.trim();

    if (!task) {
      ctx.session.confirmStep = null;
      return ctx.reply('❌ Tugas tidak ditemukan.');
    }

    if (enteredCode.toLowerCase() !== task.secretCode.toLowerCase()) {
      return ctx.replyWithHTML('❌ <b>Kode Rahasia salah!</b>\n\nCoba masukkan kode yang benar atau cek kembali halaman iklan.');
    }

    ctx.session.confirmStep = 'awaiting_screenshot';
    ctx.session.confirmCode = enteredCode;
    return ctx.reply('✅ Kode benar! Langkah 2: Kirim screenshot bukti sebagai foto.');
  }

  // Withdraw: awaiting number
  if (ctx.session.withdrawStep === 'awaiting_number') {
    const db = loadDB();
    const userId = ctx.from.id.toString();
    const user = getUser(db, userId, ctx);
    const number = ctx.message.text.trim();
    const method = ctx.session.withdrawMethod;

    ctx.session.withdrawStep = null;
    ctx.session.withdrawMethod = null;

    await bot.telegram.sendMessage(ADMIN_ID,
      `💸 <b>PERMINTAAN TARIK SALDO</b>\n\n` +
      `👤 Nama: ${user.name}\n` +
      `🆔 ID: ${userId}\n` +
      `💰 Jumlah: Rp${user.balance.toLocaleString('id-ID')}\n` +
      `📱 Metode: ${method}\n` +
      `📱 Nomor: ${number}\n\n` +
      `Username: @${user.username || '-'}`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

    return ctx.reply(`✅ Permintaan tarik saldo Rp${user.balance.toLocaleString('id-ID')} ke ${method} (${number}) telah dikirim ke admin.\n\nProses 1x24 jam kerja.`);
  }
});

// ─── PHOTO HANDLER (Konfirmasi screenshot) ───────────────────
bot.on('photo', async (ctx) => {
  initSession(ctx);

  if (ctx.session.confirmStep === 'awaiting_screenshot' && ctx.session.confirmTaskId) {
    const db = loadDB();
    const userId = ctx.from.id.toString();
    const user = getUser(db, userId, ctx);
    const taskId = ctx.session.confirmTaskId;
    const task = db.tasks.find(t => t.id === taskId);

    if (!task) {
      ctx.session.confirmStep = null;
      return ctx.reply('❌ Tugas tidak ditemukan.');
    }

    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const submissionId = 'sub_' + Date.now();

    const submission = {
      id: submissionId,
      userId,
      taskId,
      taskName: task.name,
      reward: task.reward,
      photoId,
      code: ctx.session.confirmCode,
      status: 'pending',
      createdAt: Date.now(),
    };

    db.submissions.push(submission);
    saveDB(db);

    ctx.session.confirmStep = null;
    ctx.session.confirmTaskId = null;
    ctx.session.confirmCode = null;

    // Kirim ke admin
    await bot.telegram.sendPhoto(ADMIN_ID, photoId, {
      caption:
        `📸 <b>BUKTI TUGAS BARU</b>\n\n` +
        `👤 User: ${user.name} (ID: ${userId})\n` +
        `📌 Tugas: ${task.name}\n` +
        `💵 Reward: Rp${task.reward.toLocaleString('id-ID')}\n` +
        `🔑 Kode: ${submission.code}\n` +
        `🆔 Submission ID: ${submissionId}`,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ TERIMA', `approve_${submissionId}`)],
        [Markup.button.callback('❌ TOLAK', `reject_${submissionId}`)],
      ]),
    }).catch(async () => {
      await ctx.reply('⚠️ Gagal mengirim bukti ke admin. Hubungi @xuantionzang secara langsung.');
    });

    await ctx.reply('✅ Bukti berhasil dikirim! Tunggu validasi dari admin (biasanya 1x24 jam).');
  }
});

// ─── ADMIN: APPROVE / REJECT ─────────────────────────────────
bot.action(/^approve_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Bukan admin!');
  await ctx.answerCbQuery('✅ Memproses...');

  const submissionId = ctx.match[1];
  const db = loadDB();
  const sub = db.submissions.find(s => s.id === submissionId);

  if (!sub) return ctx.reply('❌ Submission tidak ditemukan.');
  if (sub.status !== 'pending') return ctx.reply('⚠️ Submission ini sudah diproses sebelumnya.');

  sub.status = 'approved';
  const user = db.users[sub.userId];
  if (user) {
    user.balance += sub.reward;
    if (!user.completedTasks.includes(sub.taskId)) {
      user.completedTasks.push(sub.taskId);
    }
  }
  saveDB(db);

  await bot.telegram.sendMessage(sub.userId,
    `🎉 <b>SELAMAT! Tugas Disetujui!</b>\n\n` +
    `📌 Tugas: ${sub.taskName}\n` +
    `💵 Reward: <b>Rp${sub.reward.toLocaleString('id-ID')}</b> telah ditambahkan ke saldo kamu!\n\n` +
    `💰 Saldo baru: Rp${(user?.balance || 0).toLocaleString('id-ID')}`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  await ctx.editMessageCaption(
    (ctx.callbackQuery.message.caption || '') + '\n\n✅ <b>SUDAH DISETUJUI</b>',
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.reply(`✅ Reward Rp${sub.reward.toLocaleString('id-ID')} berhasil dikirim ke user ${sub.userId}.`);
});

bot.action(/^reject_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Bukan admin!');
  await ctx.answerCbQuery('❌ Memproses...');

  const submissionId = ctx.match[1];
  const db = loadDB();
  const sub = db.submissions.find(s => s.id === submissionId);

  if (!sub) return ctx.reply('❌ Submission tidak ditemukan.');
  if (sub.status !== 'pending') return ctx.reply('⚠️ Submission ini sudah diproses sebelumnya.');

  sub.status = 'rejected';
  saveDB(db);

  await bot.telegram.sendMessage(sub.userId,
    `❌ <b>Tugas Ditolak</b>\n\n` +
    `📌 Tugas: ${sub.taskName}\n\n` +
    `Bukti yang kamu kirimkan tidak memenuhi syarat. Pastikan screenshot jelas dan kode rahasia benar.\n\n` +
    `Hubungi admin jika ada pertanyaan: @xuantionzang`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  await ctx.editMessageCaption(
    (ctx.callbackQuery.message.caption || '') + '\n\n❌ <b>SUDAH DITOLAK</b>',
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.reply('❌ Submission ditolak.');
});

// ─── ADMIN ACTIONS ───────────────────────────────────────────
bot.action('admin_add_task', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  initSession(ctx);
  await ctx.answerCbQuery();
  ctx.session.adminStep = 'task_name';
  await ctx.reply('➕ Tambah Tugas Baru\n\nMasukkan Nama Tugas:');
});

bot.action('admin_stats', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery();
  const db = loadDB();
  const totalUsers = Object.keys(db.users).length;
  const totalBalance = Object.values(db.users).reduce((sum, u) => sum + (u.balance || 0), 0);
  const totalApproved = db.submissions.filter(s => s.status === 'approved').length;
  const totalPending = db.submissions.filter(s => s.status === 'pending').length;
  const totalTasks = db.tasks.filter(t => t.active).length;

  await ctx.replyWithHTML(
    `📊 <b>STATISTIK BOT</b>\n\n` +
    `👥 Total User: <b>${totalUsers}</b>\n` +
    `📋 Tugas Aktif: <b>${totalTasks}</b>\n` +
    `✅ Tugas Divalidasi: <b>${totalApproved}</b>\n` +
    `⏳ Menunggu Validasi: <b>${totalPending}</b>\n` +
    `💰 Total Saldo User: <b>Rp${totalBalance.toLocaleString('id-ID')}</b>`
  );
});

bot.action('admin_broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  initSession(ctx);
  await ctx.answerCbQuery();
  ctx.session.adminStep = 'broadcast';
  await ctx.reply('📢 Masukkan pesan yang ingin di-broadcast ke semua user:');
});

bot.action('admin_export', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery('📥 Membuat file...');
  const db = loadDB();
  let content = 'ID | Username | Nama | Saldo | Referral | Tugas Selesai\n';
  content += '─'.repeat(70) + '\n';
  for (const user of Object.values(db.users)) {
    content += `${user.id} | @${user.username || '-'} | ${user.name} | Rp${(user.balance || 0).toLocaleString('id-ID')} | ${user.referrals || 0} | ${(user.completedTasks || []).length}\n`;
  }

  const filePath = path.join(__dirname, 'data.txt');
  fs.writeFileSync(filePath, content, 'utf8');

  await ctx.replyWithDocument({ source: filePath, filename: 'data_user.txt' });
  fs.unlinkSync(filePath);
});

// ─── ERROR HANDLER ───────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Terjadi kesalahan. Coba lagi nanti.').catch(() => {});
});

// ─── LAUNCH ──────────────────────────────────────────────────
bot.launch().then(() => {
  console.log('✅ Bot berjalan! Username: @GroupA1securitybot');
}).catch(err => {
  console.error('❌ Gagal menjalankan bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
