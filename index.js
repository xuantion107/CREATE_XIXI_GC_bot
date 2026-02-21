/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║       🎯 BOT PRODUKTIF BERHADIAH v2.0                       ║
 * ║       Owner Santai | Tombol Modern | Anti-Cheat Pro         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * INSTALL  : npm install
 * JALANKAN : npm start
 * DEV MODE : npm run dev
 */

"use strict";

const TelegramBot = require("node-telegram-bot-api");
const fs          = require("fs");
const cron        = require("node-cron");

// ═══════════════════════════════════════════════════
// ⚙️  KONFIGURASI UTAMA
// ═══════════════════════════════════════════════════
const CONFIG = {
  TOKEN        : "8077707568:AAHLZdCH18aGpClqLLxr5Br07wBL3-lmXcU",  // Dari @BotFather
  ADMIN_ID     : 8496726839,                       // ID Telegram admin (ganti!)
  BOT_NAME     : "🎯 Bot Produktif Berhadiah",
  VERSION      : "2.0.0",

  // ── Poin ──────────────────────────────────────
  CHECKIN_POIN          : 100,
  CHECKIN_STREAK_BONUS  : 200,   // Setiap 7 hari streak
  KUIS_POIN             : 50,
  ARTIKEL_POIN          : 100,
  REFERRAL_POIN         : 300,
  REFERRAL_PASSIVE      : 20,    // Poin tiap teman check-in

  // ── Withdraw ──────────────────────────────────
  MIN_WITHDRAW          : 15000, // Rp 15.000
  POIN_TO_RP            : 10,    // 1 poin = Rp 10
  KOMISI_WD_PERSEN      : 10,    // Komisi owner 10%

  // ── Premium ───────────────────────────────────
  PREMIUM_HARGA         : 7500,  // Rp/bulan
  PREMIUM_TASK_EXTRA    : 2,
  PREMIUM_KUIS_EXTRA    : 5,

  // ── Anti-Cheat ────────────────────────────────
  TASK_COOLDOWN_MENIT   : 3,
  MAX_TASK_HARIAN       : 5,
  MAX_TASK_PREMIUM      : 7,
  MAX_KUIS_HARIAN       : 5,
  KUIS_TIME_LIMIT_S     : 30,   // Detik maks jawab kuis
  KUIS_MIN_S            : 2,    // Detik min (anti-bot)
  ARTIKEL_MIN_BACA_S    : 10,   // Detik min baca artikel
  TASK_MIN_KERJAKAN_S   : 15,   // Detik min kerjakan task
  MAX_SUSPICIOUS        : 5,    // Auto-ban threshold

  DB_PATH : "./database.json",
};

// ═══════════════════════════════════════════════════
// 🗄️  DATABASE
// ═══════════════════════════════════════════════════
class DB {
  static _initDb() {
    return {
      users          : {},
      tasks          : [],
      kuis           : [],
      artikel        : [],
      iklan          : [],
      withdraw_pending: [],
      stats          : { total_withdraw: 0, total_user: 0, total_task_done: 0 },
    };
  }

  static load() {
    if (!fs.existsSync(CONFIG.DB_PATH)) {
      fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(DB._initDb(), null, 2));
    }
    try {
      return JSON.parse(fs.readFileSync(CONFIG.DB_PATH, "utf8"));
    } catch {
      return DB._initDb();
    }
  }

  static save(data) {
    fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(data, null, 2));
  }

  static getUser(userId) {
    const db = DB.load();
    if (!db.users[userId]) {
      db.users[userId] = {
        id             : userId,
        nama           : "",
        username       : "",
        poin           : 0,
        total_poin     : 0,
        streak         : 0,
        last_checkin   : null,
        last_reset     : null,
        last_task_time : null,
        task_hari_ini  : 0,
        kuis_hari_ini  : 0,
        kuis_jawab     : {},
        task_selesai   : [],
        referral_code  : `REF${userId}`,
        referral_by    : null,
        referral_count : 0,
        premium        : false,
        premium_expire : null,
        total_withdraw : 0,
        joined         : new Date().toISOString(),
        banned         : false,
        // State wizard withdraw
        wd_state       : null,
        // Anti-cheat
        ac : {
          task_click  : {},
          kuis_start  : {},
          art_buka    : {},
          suspicious  : 0,
        },
      };
      db.stats.total_user++;
      DB.save(db);
    }
    return db.users[userId];
  }

  static saveUser(user) {
    const db = DB.load();
    db.users[user.id] = user;
    DB.save(db);
  }
}

// ═══════════════════════════════════════════════════
// 🤖  BOT
// ═══════════════════════════════════════════════════
const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });

// ═══════════════════════════════════════════════════
// 🎨  UI — Tombol Inline Modern & Mengambang
// ═══════════════════════════════════════════════════
const KB = {
  // ── Menu Utama ──────────────────────────────────
  mainMenu(user) {
    const isPrem = user.premium && new Date(user.premium_expire) > new Date();
    const saldo  = `💼 ${user.poin} Poin (${toRp(user.poin)})`;
    return {
      inline_keyboard: [
        // Baris 1 — Info saldo (tombol lebar penuh, tidak bisa diklik = info)
        [{ text: saldo, callback_data: "noop" }],
        // Baris 2
        [
          { text: "📅 Check-in", callback_data: "checkin" },
          { text: `🔥 Streak: ${user.streak}`, callback_data: "streak_info" },
        ],
        // Baris 3
        [
          { text: "🧠 Kuis Harian", callback_data: "kuis_mulai" },
          { text: "✅ Task Harian", callback_data: "task_list" },
        ],
        // Baris 4
        [
          { text: "📖 Baca Artikel", callback_data: "artikel_list" },
          { text: "👥 Referral", callback_data: "referral" },
        ],
        // Baris 5
        [
          { text: "💸 Saldo & WD", callback_data: "saldo" },
          { text: isPrem ? "👑 Premium ✓" : "⭐ Premium", callback_data: "premium" },
        ],
        // Baris 6
        [
          { text: "🏆 Leaderboard", callback_data: "leaderboard" },
          { text: "📊 Statistik", callback_data: "statistik" },
        ],
        // Baris 7
        [{ text: "ℹ️ Bantuan & FAQ", callback_data: "bantuan" }],
      ],
    };
  },

  // ── Navigasi ────────────────────────────────────
  back(dest = "menu") {
    return { inline_keyboard: [[{ text: "🔙 Kembali ke Menu", callback_data: dest }]] };
  },

  backRow(dest = "menu") {
    return [{ text: "🔙 Kembali", callback_data: dest }];
  },

  // ── Konfirmasi ──────────────────────────────────
  yesNo(yesData, noData = "menu") {
    return {
      inline_keyboard: [
        [
          { text: "✅ Ya, Lanjutkan", callback_data: yesData },
          { text: "❌ Batal", callback_data: noData },
        ],
      ],
    };
  },

  // ── Withdraw pilih metode ───────────────────────
  wdMetode() {
    return {
      inline_keyboard: [
        [
          { text: "🟢 DANA", callback_data: "wd_metode_DANA" },
          { text: "🔵 GoPay", callback_data: "wd_metode_GOPAY" },
          { text: "🟣 OVO", callback_data: "wd_metode_OVO" },
        ],
        [KB.backRow("saldo")],
      ],
    };
  },

  // ── Admin Panel ─────────────────────────────────
  adminPanel() {
    return {
      inline_keyboard: [
        [
          { text: "📝 Tambah Task", callback_data: "adm_task_form" },
          { text: "🧠 Tambah Kuis", callback_data: "adm_kuis_form" },
        ],
        [
          { text: "📖 Tambah Artikel", callback_data: "adm_art_form" },
          { text: "📢 Tambah Iklan", callback_data: "adm_iklan_form" },
        ],
        [
          { text: "💸 Withdraw Pending", callback_data: "adm_wd_list" },
          { text: "📊 Statistik Bot", callback_data: "adm_stats" },
        ],
        [
          { text: "👤 Cari User", callback_data: "adm_user_cari" },
          { text: "📢 Broadcast", callback_data: "adm_broadcast_form" },
        ],
        [{ text: "🔙 Kembali ke Menu", callback_data: "menu" }],
      ],
    };
  },

  // ── Konfirmasi approve/tolak withdraw ───────────
  wdApprove(wdId) {
    return {
      inline_keyboard: [
        [
          { text: "✅ Approve & Kirim", callback_data: `adm_wd_ok_${wdId}` },
          { text: "❌ Tolak & Refund", callback_data: `adm_wd_no_${wdId}` },
        ],
      ],
    };
  },
};

// ═══════════════════════════════════════════════════
// 🔧  UTILITAS
// ═══════════════════════════════════════════════════
function toRp(poin) {
  const rp = poin * CONFIG.POIN_TO_RP;
  return `Rp ${rp.toLocaleString("id-ID")}`;
}

function progressBar(cur, max, len = 10) {
  const f = Math.min(Math.round((cur / max) * len), len);
  return "█".repeat(f) + "░".repeat(len - f);
}

function isBanned(user) { return user.banned === true; }

function isPremium(user) {
  return user.premium && user.premium_expire && new Date(user.premium_expire) > new Date();
}

async function editMsg(chatId, msgId, text, opts = {}) {
  return bot.editMessageText(text, {
    chat_id   : chatId,
    message_id: msgId,
    parse_mode: "Markdown",
    ...opts,
  }).catch(() => {});
}

async function sendMsg(chatId, text, opts = {}) {
  return bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    ...opts,
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════
// 🛡️  ANTI-CHEAT ENGINE
// ═══════════════════════════════════════════════════
const AC = {
  cooldownTask(user) {
    if (!user.last_task_time) return true;
    return (Date.now() - user.last_task_time) / 60000 >= CONFIG.TASK_COOLDOWN_MENIT;
  },
  catatKlikTask(user, id) {
    user.ac.task_click[id] = Date.now();
    DB.saveUser(user);
  },
  verifikasiTask(user, id) {
    const t = user.ac.task_click[id];
    if (!t) return false;
    return (Date.now() - t) / 1000 >= CONFIG.TASK_MIN_KERJAKAN_S;
  },
  catatMulaiKuis(user, id) {
    user.ac.kuis_start[id] = Date.now();
    DB.saveUser(user);
  },
  verifikasiKuis(user, id) {
    const t = user.ac.kuis_start[id];
    if (!t) return "no_start";
    const s = (Date.now() - t) / 1000;
    if (s > CONFIG.KUIS_TIME_LIMIT_S) return "timeout";
    if (s < CONFIG.KUIS_MIN_S)        return "terlalu_cepat";
    return "ok";
  },
  catatBukaArtikel(user, id) {
    user.ac.art_buka[id] = Date.now();
    DB.saveUser(user);
  },
  verifikasiArtikel(user, id) {
    const t = user.ac.art_buka[id];
    if (!t) return false;
    return (Date.now() - t) / 1000 >= CONFIG.ARTIKEL_MIN_BACA_S;
  },
  async lapor(user, alasan, chatId) {
    user.ac.suspicious = (user.ac.suspicious || 0) + 1;
    DB.saveUser(user);

    // Notif admin
    await sendMsg(
      CONFIG.ADMIN_ID,
      `⚠️ *ALERT ANTI-CHEAT*\n\n` +
      `👤 ${user.nama} (ID: \`${user.id}\`)\n` +
      `🔴 Alasan: ${alasan}\n` +
      `🔢 Suspicious: ${user.ac.suspicious}/${CONFIG.MAX_SUSPICIOUS}\n` +
      `⏰ ${new Date().toLocaleString("id-ID")}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "🚫 Ban Sekarang", callback_data: `adm_ban_${user.id}` },
            { text: "👁️ Abaikan",      callback_data: `adm_abaikan_${user.id}` },
          ]],
        },
      }
    );

    // Auto-ban jika melebihi threshold
    if (user.ac.suspicious >= CONFIG.MAX_SUSPICIOUS) {
      user.banned = true;
      DB.saveUser(user);
      await sendMsg(chatId,
        `🚫 *Akun Diblokir Otomatis*\n\n` +
        `Terlalu banyak aktivitas mencurigakan terdeteksi.\n` +
        `Hubungi admin jika ini kesalahan.`
      );
      return true; // banned
    }
    return false;
  },
  resetHarian() {
    const db  = DB.load();
    const hari = new Date().toDateString();
    let   cnt  = 0;
    for (const u of Object.values(db.users)) {
      if (u.last_reset !== hari) {
        u.task_hari_ini  = 0;
        u.kuis_hari_ini  = 0;
        u.kuis_jawab     = {};
        u.last_reset     = hari;
        u.ac.task_click  = {};
        u.ac.kuis_start  = {};
        u.ac.art_buka    = {};
        cnt++;
      }
    }
    DB.save(db);
    console.log(`✅ Reset harian: ${cnt} user | ${new Date().toLocaleString("id-ID")}`);
  },
};

// ═══════════════════════════════════════════════════
// 🚀  /start
// ═══════════════════════════════════════════════════
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const ref    = match[1].trim();

  let user    = DB.getUser(userId);
  user.nama    = msg.from.first_name || "User";
  user.username = msg.from.username || "";

  if (isBanned(user)) {
    return sendMsg(chatId, "🚫 Akun Anda telah diblokir. Hubungi admin.");
  }

  // Proses referral (hanya sekali)
  if (ref && !user.referral_by) {
    const db = DB.load();
    const refUser = Object.values(db.users).find(u => u.referral_code === ref && u.id !== userId);
    if (refUser) {
      user.referral_by = refUser.id;
      user.poin       += CONFIG.REFERRAL_POIN;
      user.total_poin += CONFIG.REFERRAL_POIN;
      refUser.poin        += CONFIG.REFERRAL_POIN;
      refUser.total_poin  += CONFIG.REFERRAL_POIN;
      refUser.referral_count++;
      db.users[refUser.id] = refUser;
      DB.save(db);
      await sendMsg(refUser.id,
        `🎉 *Teman Baru Bergabung!*\n\n` +
        `👤 ${user.nama} join pakai kode referralmu!\n` +
        `💰 Bonus: *+${CONFIG.REFERRAL_POIN} Poin* masuk saldo!`
      );
    }
  }

  // Bonus daftar pertama (hanya jika belum pernah dapat)
  const isNew = user.total_poin === 0;
  if (isNew) {
    user.poin       += 250;
    user.total_poin += 250;
  }

  DB.saveUser(user);

  const txt =
    `🎯 *${CONFIG.BOT_NAME}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Halo, *${user.nama}*! 👋\n\n` +
    (isNew
      ? `🎁 *Hadiah Selamat Datang:*\n` +
        `✅ +250 Poin langsung masuk!\n` +
        `✅ Withdraw minimal Rp 15.000\n` +
        `✅ Poin bisa dicairkan ke Dana/GoPay/OVO\n\n`
      : "") +
    `💼 Saldo: *${user.poin} Poin* (${toRp(user.poin)})\n` +
    `🔥 Streak: *${user.streak} hari*\n\n` +
    `Pilih menu di bawah ini:`;

  return sendMsg(chatId, txt, { reply_markup: KB.mainMenu(user) });
});

// ═══════════════════════════════════════════════════
// /menu — Shortcut
// ═══════════════════════════════════════════════════
bot.onText(/\/menu/, async (msg) => {
  const user = DB.getUser(msg.from.id);
  if (isBanned(user)) return;
  return sendMsg(msg.chat.id,
    `🏠 *Menu Utama*\n\n💼 Saldo: *${user.poin} Poin* (${toRp(user.poin)})`,
    { reply_markup: KB.mainMenu(user) }
  );
});

// /admin shortcut
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  const db = DB.load();
  return sendMsg(msg.chat.id,
    `🔧 *Admin Panel*\n\n` +
    `👥 User: *${db.stats.total_user}*\n` +
    `✅ Task done: *${db.stats.total_task_done}*\n` +
    `💸 WD pending: *${db.withdraw_pending?.length || 0}*`,
    { reply_markup: KB.adminPanel() }
  );
});

// ═══════════════════════════════════════════════════
// 🔘  CALLBACK QUERY (Semua Tombol)
// ═══════════════════════════════════════════════════
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const msgId  = q.message.message_id;
  const userId = q.from.id;
  const data   = q.data;

  await bot.answerCallbackQuery(q.id).catch(() => {});

  // ── NOOP (tombol info) ───────────────────────────
  if (data === "noop") return;

  const user = DB.getUser(userId);
  if (isBanned(user) && !data.startsWith("adm_")) {
    return bot.answerCallbackQuery(q.id, { text: "🚫 Akun diblokir!", show_alert: true });
  }

  // ════════════════════════════════════════════════
  // MENU UTAMA
  // ════════════════════════════════════════════════
  if (data === "menu") {
    user.nama = q.from.first_name || user.nama;
    DB.saveUser(user);
    return editMsg(chatId, msgId,
      `🏠 *Menu Utama*\n\n💼 Saldo: *${user.poin} Poin* (${toRp(user.poin)})\n🔥 Streak: *${user.streak} hari*`,
      { reply_markup: KB.mainMenu(user) }
    );
  }

  // ════════════════════════════════════════════════
  // CHECK-IN
  // ════════════════════════════════════════════════
  if (data === "checkin") {
    const hari = new Date().toDateString();
    if (user.last_checkin === hari) {
      await bot.answerCallbackQuery(q.id, {
        text: "⏰ Sudah check-in hari ini! Balik besok ya 🌙",
        show_alert: true,
      });
      return;
    }

    // Hitung streak
    const kemarin = new Date();
    kemarin.setDate(kemarin.getDate() - 1);
    user.streak = (user.last_checkin === kemarin.toDateString())
      ? (user.streak || 0) + 1
      : 1;
    user.last_checkin = hari;

    let poin  = CONFIG.CHECKIN_POIN;
    let bonus = "";
    if (user.streak % 7 === 0) {
      poin  += CONFIG.CHECKIN_STREAK_BONUS;
      bonus  = `\n🎁 *BONUS STREAK 7 HARI!* +${CONFIG.CHECKIN_STREAK_BONUS} Poin`;
    }

    user.poin       += poin;
    user.total_poin += poin;

    // Passive poin ke referrer
    if (user.referral_by) {
      const db = DB.load();
      const ref = db.users[user.referral_by];
      if (ref) {
        ref.poin        += CONFIG.REFERRAL_PASSIVE;
        ref.total_poin  += CONFIG.REFERRAL_PASSIVE;
        db.users[ref.id] = ref;
        DB.save(db);
      }
    }

    DB.saveUser(user);

    const sisaStreak = 7 - (user.streak % 7 || 7);
    const bar = progressBar(user.streak % 7 || 7, 7);

    return editMsg(chatId, msgId,
      `✅ *Check-in Berhasil!*\n\n` +
      `💰 +${poin} Poin${bonus}\n\n` +
      `🔥 Streak: *${user.streak} hari*\n` +
      `${bar} ${user.streak % 7 || 7}/7\n` +
      `${sisaStreak > 0 ? `📅 ${sisaStreak} hari lagi bonus streak!` : "🎉 Streak sempurna hari ini!"}\n\n` +
      `💼 Total Saldo: *${user.poin} Poin* (${toRp(user.poin)})`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Task Harian", callback_data: "task_list" },
              { text: "🧠 Kuis Harian", callback_data: "kuis_mulai" },
            ],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  // ════════════════════════════════════════════════
  // STREAK INFO
  // ════════════════════════════════════════════════
  if (data === "streak_info") {
    const bar = progressBar(user.streak % 7 || 7, 7);
    const sisa = 7 - (user.streak % 7 || 7);
    return editMsg(chatId, msgId,
      `🔥 *Info Streak Kamu*\n\n` +
      `Streak saat ini: *${user.streak} hari*\n` +
      `${bar} ${user.streak % 7 || 7}/7\n\n` +
      `${sisa > 0
        ? `📅 ${sisa} hari lagi dapat bonus *+${CONFIG.CHECKIN_STREAK_BONUS} Poin*!`
        : `🎁 Hari ini bonus streak aktif!`}\n\n` +
      `💡 _Jangan putus streak atau reset ke 0!_`,
      { reply_markup: KB.back("menu") }
    );
  }

  // ════════════════════════════════════════════════
  // KUIS
  // ════════════════════════════════════════════════
  if (data === "kuis_mulai") {
    const db     = DB.load();
    const maxQ   = CONFIG.MAX_KUIS_HARIAN + (isPremium(user) ? CONFIG.PREMIUM_KUIS_EXTRA : 0);

    if (user.kuis_hari_ini >= maxQ) {
      return editMsg(chatId, msgId,
        `🧠 *Kuis Harian*\n\n` +
        `⚠️ Sudah ${user.kuis_hari_ini}/${maxQ} kuis hari ini.\n` +
        `Kembali besok untuk soal baru! 🌙`,
        { reply_markup: KB.back("menu") }
      );
    }

    const belum = db.kuis.filter(k => !user.kuis_jawab[k.id]);
    if (!belum.length) {
      return editMsg(chatId, msgId,
        `🧠 *Kuis Harian*\n\n📭 Semua soal sudah dijawab!\nAdmin sedang siapkan soal baru.`,
        { reply_markup: KB.back("menu") }
      );
    }

    const kuis = belum[Math.floor(Math.random() * belum.length)];
    AC.catatMulaiKuis(user, kuis.id);

    const opsiBtn = kuis.opsi.map((o, i) => [{
      text: `${["🅐","🅑","🅒","🅓"][i]} ${o}`,
      callback_data: `kuis_jwb_${kuis.id}_${i}`,
    }]);
    opsiBtn.push([KB.backRow("menu")]);

    return editMsg(chatId, msgId,
      `🧠 *Kuis Harian* (${user.kuis_hari_ini + 1}/${maxQ})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `❓ *${kuis.pertanyaan}*\n\n` +
      `⏱ Batas waktu: ${CONFIG.KUIS_TIME_LIMIT_S} detik\n` +
      `💰 Benar: *+${CONFIG.KUIS_POIN} Poin*`,
      { reply_markup: { inline_keyboard: opsiBtn } }
    );
  }

  if (data.startsWith("kuis_jwb_")) {
    const [,, kuisId, idxStr] = data.split("_");
    const jawIdx = parseInt(idxStr);
    const db     = DB.load();
    const kuis   = db.kuis.find(k => k.id === kuisId);
    if (!kuis) return;

    if (user.kuis_jawab[kuisId] !== undefined) {
      return bot.answerCallbackQuery(q.id, { text: "Soal ini sudah dijawab!", show_alert: true });
    }

    const cek = AC.verifikasiKuis(user, kuisId);
    if (cek === "terlalu_cepat") {
      const banned = await AC.lapor(user, `Jawab kuis terlalu cepat (< ${CONFIG.KUIS_MIN_S}s)`, chatId);
      if (banned) return;
      return editMsg(chatId, msgId,
        `⚠️ *Terdeteksi!*\n\nJawab terlalu cepat, harap baca soalnya dulu!`,
        { reply_markup: KB.back("menu") }
      );
    }
    if (cek === "timeout") {
      user.kuis_jawab[kuisId] = -1;
      user.kuis_hari_ini++;
      DB.saveUser(user);
      return editMsg(chatId, msgId,
        `⏰ *Waktu Habis!*\n\nJawaban benar: *${kuis.opsi[kuis.jawaban_benar]}*\n\n${kuis.penjelasan || ""}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➡️ Kuis Berikutnya", callback_data: "kuis_mulai" }],
              [KB.backRow("menu")],
            ],
          },
        }
      );
    }

    user.kuis_jawab[kuisId] = jawIdx;
    user.kuis_hari_ini++;

    let txt;
    if (jawIdx === kuis.jawaban_benar) {
      user.poin       += CONFIG.KUIS_POIN;
      user.total_poin += CONFIG.KUIS_POIN;
      txt = `✅ *BENAR!* +${CONFIG.KUIS_POIN} Poin\n\n📝 ${kuis.penjelasan || ""}`;
    } else {
      txt = `❌ *Salah!*\nJawaban: *${kuis.opsi[kuis.jawaban_benar]}*\n\n📝 ${kuis.penjelasan || ""}`;
    }

    DB.saveUser(user);

    return editMsg(chatId, msgId,
      txt + `\n\n💼 Saldo: *${user.poin} Poin* (${toRp(user.poin)})`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➡️ Kuis Berikutnya", callback_data: "kuis_mulai" }],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  // ════════════════════════════════════════════════
  // TASK
  // ════════════════════════════════════════════════
  if (data === "task_list") {
    const db     = DB.load();
    const maxT   = CONFIG.MAX_TASK_HARIAN + (isPremium(user) ? CONFIG.PREMIUM_TASK_EXTRA : 0);
    const aktif  = db.tasks.filter(t => t.aktif && !user.task_selesai.includes(t.id));

    if (user.task_hari_ini >= maxT) {
      return editMsg(chatId, msgId,
        `✅ *Task Harian*\n\n⚠️ Selesai ${user.task_hari_ini}/${maxT} task hari ini!\nKembali besok. 🌙`,
        { reply_markup: KB.back("menu") }
      );
    }
    if (!aktif.length) {
      return editMsg(chatId, msgId,
        `✅ *Task Harian*\n\n📭 Tidak ada task tersedia saat ini.\nAdmin sedang menambahkan task baru!`,
        { reply_markup: KB.back("menu") }
      );
    }

    const bar    = progressBar(user.task_hari_ini, maxT);
    const taskBtn = aktif.slice(0, 6).map(t => [{
      text: `${t.icon || "📌"} ${t.judul} (+${t.poin} Poin)`,
      callback_data: `task_buka_${t.id}`,
    }]);
    taskBtn.push([KB.backRow("menu")]);

    return editMsg(chatId, msgId,
      `✅ *Task Harian*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Progress: *${user.task_hari_ini}/${maxT}*\n${bar}\n\n` +
      `Pilih task:`,
      { reply_markup: { inline_keyboard: taskBtn } }
    );
  }

  if (data.startsWith("task_buka_")) {
    const taskId = data.replace("task_buka_", "");
    const db     = DB.load();
    const task   = db.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!AC.cooldownTask(user)) {
      const menit = CONFIG.TASK_COOLDOWN_MENIT;
      return bot.answerCallbackQuery(q.id, {
        text: `⏰ Tunggu ${menit} menit sebelum ambil task berikutnya!`,
        show_alert: true,
      });
    }

    AC.catatKlikTask(user, taskId);
    user.last_task_time = Date.now();
    DB.saveUser(user);

    return editMsg(chatId, msgId,
      `${task.icon || "📌"} *${task.judul}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Instruksi:*\n${task.instruksi}\n\n` +
      `🔗 *Link:* ${task.link ? task.link : "_(tidak ada link)_"}\n\n` +
      `💰 Hadiah: *+${task.poin} Poin*\n\n` +
      `⚠️ _Selesaikan task dulu, minimal ${CONFIG.TASK_MIN_KERJAKAN_S} detik, baru klik Selesai!_`,
      {
        reply_markup: {
          inline_keyboard: [
            task.link
              ? [{ text: "🔗 Buka Link Task", url: task.link }]
              : [],
            [{ text: "✅ Saya Sudah Selesaikan", callback_data: `task_done_${taskId}` }],
            [KB.backRow("task_list")],
          ].filter(r => r.length > 0),
        },
      }
    );
  }

  if (data.startsWith("task_done_")) {
    const taskId = data.replace("task_done_", "");
    const db     = DB.load();
    const task   = db.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (user.task_selesai.includes(taskId)) {
      return bot.answerCallbackQuery(q.id, { text: "Task ini sudah selesai!", show_alert: true });
    }

    if (!AC.verifikasiTask(user, taskId)) {
      const banned = await AC.lapor(user, `Klaim task terlalu cepat: ${task.judul}`, chatId);
      if (banned) return;
      return editMsg(chatId, msgId,
        `⚠️ *Terdeteksi!*\n\nKerjakan dulu tasknya minimal *${CONFIG.TASK_MIN_KERJAKAN_S} detik* sebelum klaim!`,
        { reply_markup: KB.back("task_list") }
      );
    }

    if (task.perlu_bukti) {
      user.ac.task_click[`pending_${taskId}`] = Date.now();
      DB.saveUser(user);
      return editMsg(chatId, msgId,
        `📸 *Kirim Screenshot Bukti*\n\n` +
        `Task: *${task.judul}*\n\n` +
        `Kirim screenshot ke chat ini sekarang.\n` +
        `Admin akan verifikasi dalam 1×24 jam.`,
        { reply_markup: KB.back("task_list") }
      );
    }

    // Berikan poin
    user.task_selesai.push(taskId);
    user.task_hari_ini++;
    user.poin       += task.poin;
    user.total_poin += task.poin;
    db.stats.total_task_done++;
    DB.saveUser(user);
    DB.save(db);

    return editMsg(chatId, msgId,
      `🎉 *Task Selesai!*\n\n` +
      `${task.icon || "📌"} ${task.judul}\n` +
      `💰 *+${task.poin} Poin* masuk!\n\n` +
      `💼 Total: *${user.poin} Poin* (${toRp(user.poin)})`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Ambil Task Lain", callback_data: "task_list" }],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  // ════════════════════════════════════════════════
  // ARTIKEL
  // ════════════════════════════════════════════════
  if (data === "artikel_list") {
    const db  = DB.load();
    const list = db.artikel.filter(a => a.aktif);
    if (!list.length) {
      return editMsg(chatId, msgId,
        `📖 *Baca Artikel*\n\n📭 Belum ada artikel tersedia.`,
        { reply_markup: KB.back("menu") }
      );
    }
    const btn = list.slice(0, 6).map(a => [{
      text: `📄 ${a.judul} (+${a.poin} Poin)`,
      callback_data: `art_buka_${a.id}`,
    }]);
    btn.push([KB.backRow("menu")]);
    return editMsg(chatId, msgId,
      `📖 *Baca Artikel & Dapat Poin*\n\nBaca artikel, jawab pertanyaan, dapat poin!\n\nPilih artikel:`,
      { reply_markup: { inline_keyboard: btn } }
    );
  }

  if (data.startsWith("art_buka_")) {
    const artId  = data.replace("art_buka_", "");
    const db     = DB.load();
    const artikel = db.artikel.find(a => a.id === artId);
    if (!artikel) return;
    AC.catatBukaArtikel(user, artId);
    return editMsg(chatId, msgId,
      `📖 *${artikel.judul}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${artikel.konten}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Baca artikel di atas lalu jawab pertanyaan!_`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `❓ Jawab Pertanyaan (+${artikel.poin} Poin)`, callback_data: `art_kuis_${artId}` }],
            [KB.backRow("artikel_list")],
          ],
        },
      }
    );
  }

  if (data.startsWith("art_kuis_")) {
    const artId  = data.replace("art_kuis_", "");
    const db     = DB.load();
    const artikel = db.artikel.find(a => a.id === artId);
    if (!artikel) return;

    if (!AC.verifikasiArtikel(user, artId)) {
      await AC.lapor(user, "Jawab kuis artikel tanpa membaca", chatId);
      return bot.answerCallbackQuery(q.id, {
        text: `⏰ Baca artikelnya dulu! Minimal ${CONFIG.ARTIKEL_MIN_BACA_S} detik.`,
        show_alert: true,
      });
    }

    const opsiBtn = artikel.pertanyaan.opsi.map((o, i) => [{
      text: `${["🅐","🅑","🅒","🅓"][i]} ${o}`,
      callback_data: `art_jwb_${artId}_${i}`,
    }]);
    opsiBtn.push([KB.backRow("artikel_list")]);

    return editMsg(chatId, msgId,
      `❓ *Pertanyaan:*\n\n${artikel.pertanyaan.teks}`,
      { reply_markup: { inline_keyboard: opsiBtn } }
    );
  }

  if (data.startsWith("art_jwb_")) {
    const parts  = data.split("_");
    const artId  = parts[2];
    const jwbIdx = parseInt(parts[3]);
    const db     = DB.load();
    const artikel = db.artikel.find(a => a.id === artId);
    if (!artikel) return;

    let txt;
    if (jwbIdx === artikel.pertanyaan.jawaban_benar) {
      user.poin       += artikel.poin;
      user.total_poin += artikel.poin;
      DB.saveUser(user);
      txt = `✅ *Benar!* +${artikel.poin} Poin\n\n💼 Total: *${user.poin} Poin*`;
    } else {
      txt = `❌ *Salah!*\nJawaban: *${artikel.pertanyaan.opsi[artikel.pertanyaan.jawaban_benar]}*`;
    }

    return editMsg(chatId, msgId, txt, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📖 Baca Artikel Lain", callback_data: "artikel_list" }],
          [KB.backRow("menu")],
        ],
      },
    });
  }

  // ════════════════════════════════════════════════
  // SALDO & WITHDRAW
  // ════════════════════════════════════════════════
  if (data === "saldo") {
    const rp      = user.poin * CONFIG.POIN_TO_RP;
    const bisaWD  = rp >= CONFIG.MIN_WITHDRAW;
    const kurang  = Math.ceil((CONFIG.MIN_WITHDRAW - rp) / CONFIG.POIN_TO_RP);

    return editMsg(chatId, msgId,
      `💰 *Saldo & Withdraw*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💼 Saldo: *${user.poin} Poin* (${toRp(user.poin)})\n` +
      `📊 Total Kumpul: *${user.total_poin} Poin*\n` +
      `💸 Total WD: *${toRp(Math.round(user.total_withdraw / CONFIG.POIN_TO_RP))}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 Min. Withdraw: Rp ${CONFIG.MIN_WITHDRAW.toLocaleString("id-ID")}\n` +
      `📌 Komisi: ${CONFIG.KOMISI_WD_PERSEN}%\n\n` +
      `${bisaWD
        ? "✅ Saldo cukup! Pilih metode withdraw:"
        : `⏳ Kumpulkan *${kurang} Poin* lagi untuk withdraw`}`,
      {
        reply_markup: {
          inline_keyboard: [
            bisaWD
              ? [{ text: "💸 Withdraw Sekarang", callback_data: "wd_pilih_metode" }]
              : [{ text: "🔒 Saldo Belum Cukup", callback_data: "noop" }],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  if (data === "wd_pilih_metode") {
    const rp = user.poin * CONFIG.POIN_TO_RP;
    if (rp < CONFIG.MIN_WITHDRAW) {
      return bot.answerCallbackQuery(q.id, { text: "Saldo tidak cukup!", show_alert: true });
    }
    return editMsg(chatId, msgId,
      `💸 *Pilih Metode Withdraw*\n\nSaldo: *${user.poin} Poin* (${toRp(user.poin)})`,
      { reply_markup: KB.wdMetode() }
    );
  }

  if (data.startsWith("wd_metode_")) {
    const metode = data.replace("wd_metode_", "");
    user.wd_state = { step: "input_hp", metode };
    DB.saveUser(user);
    return editMsg(chatId, msgId,
      `📱 *Withdraw via ${metode}*\n\n` +
      `Ketik nomor HP ${metode} kamu:\n` +
      `_(Contoh: 08123456789)_\n\n` +
      `_Kirim pesan ke chat ini_`,
      { reply_markup: KB.back("wd_pilih_metode") }
    );
  }

  // ════════════════════════════════════════════════
  // REFERRAL
  // ════════════════════════════════════════════════
  if (data === "referral") {
    const info = await bot.getMe().catch(() => ({ username: "bot" }));
    const link = `https://t.me/${info.username}?start=${user.referral_code}`;
    return editMsg(chatId, msgId,
      `👥 *Program Referral*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔗 Link Referralmu:\n\`${link}\`\n\n` +
      `💰 *Keuntungan Referral:*\n` +
      `✅ +${CONFIG.REFERRAL_POIN} Poin setiap teman daftar\n` +
      `✅ +${CONFIG.REFERRAL_PASSIVE} Poin tiap teman check-in\n\n` +
      `📊 *Statistikmu:*\n` +
      `👤 Teman dirujuk: *${user.referral_count} orang*\n` +
      `🏆 Estimasi dari referral: *~${user.referral_count * CONFIG.REFERRAL_POIN} Poin*`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📤 Share Link", switch_inline_query: link }],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  // ════════════════════════════════════════════════
  // LEADERBOARD
  // ════════════════════════════════════════════════
  if (data === "leaderboard") {
    const db    = DB.load();
    const sorted = Object.values(db.users)
      .filter(u => !u.banned)
      .sort((a, b) => b.total_poin - a.total_poin)
      .slice(0, 10);

    const medals = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    const list   = sorted.map((u, i) =>
      `${medals[i]} *${u.nama || "User"}* — ${u.total_poin} Poin`
    ).join("\n");

    const rank   = sorted.findIndex(u => u.id === userId);

    return editMsg(chatId, msgId,
      `🏆 *Leaderboard All-Time*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      (list || "_Belum ada data_") +
      `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 Rankmu: *#${rank >= 0 ? rank + 1 : "?"}*`,
      { reply_markup: KB.back("menu") }
    );
  }

  // ════════════════════════════════════════════════
  // STATISTIK
  // ════════════════════════════════════════════════
  if (data === "statistik") {
    const prem = isPremium(user);
    return editMsg(chatId, msgId,
      `📊 *Statistik Saya*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 Nama: *${user.nama}*\n` +
      `💼 Saldo: *${user.poin} Poin* (${toRp(user.poin)})\n` +
      `📊 Total Kumpul: *${user.total_poin} Poin*\n` +
      `🔥 Streak: *${user.streak} hari*\n` +
      `✅ Task selesai: *${user.task_selesai.length}*\n` +
      `🧠 Kuis dijawab: *${Object.keys(user.kuis_jawab).length}*\n` +
      `👥 Referral: *${user.referral_count} orang*\n` +
      `👑 Status: *${prem ? `Premium (exp: ${new Date(user.premium_expire).toLocaleDateString("id-ID")})` : "Reguler"}*\n` +
      `📅 Bergabung: *${new Date(user.joined).toLocaleDateString("id-ID")}*`,
      { reply_markup: KB.back("menu") }
    );
  }

  // ════════════════════════════════════════════════
  // PREMIUM
  // ════════════════════════════════════════════════
  if (data === "premium") {
    const prem = isPremium(user);
    if (prem) {
      return editMsg(chatId, msgId,
        `👑 *Premium Aktif*\n\n` +
        `Aktif hingga: *${new Date(user.premium_expire).toLocaleDateString("id-ID")}*\n\n` +
        `✅ Task ekstra +${CONFIG.PREMIUM_TASK_EXTRA}/hari\n` +
        `✅ Kuis ekstra +${CONFIG.PREMIUM_KUIS_EXTRA}/hari\n` +
        `✅ Prioritas withdraw`,
        { reply_markup: KB.back("menu") }
      );
    }
    return editMsg(chatId, msgId,
      `⭐ *Upgrade Premium*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Harga: *Rp ${CONFIG.PREMIUM_HARGA.toLocaleString("id-ID")}/bulan*\n\n` +
      `✅ Task harian +${CONFIG.PREMIUM_TASK_EXTRA}\n` +
      `✅ Kuis harian +${CONFIG.PREMIUM_KUIS_EXTRA}\n` +
      `✅ Prioritas withdraw\n` +
      `✅ Badge 👑 premium\n\n` +
      `Hubungi admin untuk aktivasi!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Hubungi Admin", url: `tg://user?id=${CONFIG.ADMIN_ID}` }],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  // ════════════════════════════════════════════════
  // BANTUAN
  // ════════════════════════════════════════════════
  if (data === "bantuan") {
    return editMsg(chatId, msgId,
      `ℹ️ *Bantuan & FAQ*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `❓ *Cara dapat poin?*\n→ Check-in harian, kuis, task, artikel, referral\n\n` +
      `❓ *Kapan bisa withdraw?*\n→ Minimal Rp 15.000 (1.500 poin)\n\n` +
      `❓ *Berapa lama proses WD?*\n→ Maks. 1×24 jam kerja\n\n` +
      `❓ *Kenapa kena peringatan?*\n→ Aktivitas mencurigakan terdeteksi sistem\n\n` +
      `❓ *Apa itu streak?*\n→ Hitung hari check-in berturut. 7 hari = bonus!\n\n` +
      `💬 Masalah lain? Hubungi admin`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Chat Admin", url: `tg://user?id=${CONFIG.ADMIN_ID}` }],
            [KB.backRow("menu")],
          ],
        },
      }
    );
  }

  // ════════════════════════════════════════════════
  // ADMIN PANEL
  // ════════════════════════════════════════════════
  if (data === "adm_stats" && userId === CONFIG.ADMIN_ID) {
    const db = DB.load();
    return editMsg(chatId, msgId,
      `📊 *Statistik Bot*\n\n` +
      `👥 Total user: *${db.stats.total_user}*\n` +
      `✅ Task selesai: *${db.stats.total_task_done}*\n` +
      `💸 WD pending: *${db.withdraw_pending?.length || 0}*\n` +
      `🗃️ Total task: *${db.tasks.length}*\n` +
      `🧠 Total kuis: *${db.kuis.length}*\n` +
      `📖 Total artikel: *${db.artikel.length}*`,
      { reply_markup: { inline_keyboard: [[KB.backRow("adm_panel")]] } }
    );
  }

  if (data === "adm_panel" && userId === CONFIG.ADMIN_ID) {
    const db = DB.load();
    return editMsg(chatId, msgId,
      `🔧 *Admin Panel*\n\n👥 User: *${db.stats.total_user}* | WD Pending: *${db.withdraw_pending?.length || 0}*`,
      { reply_markup: KB.adminPanel() }
    );
  }

  if (data === "adm_wd_list" && userId === CONFIG.ADMIN_ID) {
    const db = DB.load();
    const pending = db.withdraw_pending || [];
    if (!pending.length) {
      return editMsg(chatId, msgId, "💸 Tidak ada withdraw pending.",
        { reply_markup: { inline_keyboard: [[KB.backRow("adm_panel")]] } }
      );
    }
    const btn = pending.slice(0, 8).map(w => [{
      text: `👤 ${w.nama} — ${toRp(Math.round(w.net_rp / CONFIG.POIN_TO_RP))} via ${w.metode}`,
      callback_data: `adm_wd_det_${w.id}`,
    }]);
    btn.push([KB.backRow("adm_panel")]);
    return editMsg(chatId, msgId, `💸 *Withdraw Pending (${pending.length})*`,
      { reply_markup: { inline_keyboard: btn } }
    );
  }

  if (data.startsWith("adm_wd_det_") && userId === CONFIG.ADMIN_ID) {
    const wdId = data.replace("adm_wd_det_", "");
    const db   = DB.load();
    const wd   = (db.withdraw_pending || []).find(w => w.id === wdId);
    if (!wd) return;
    return editMsg(chatId, msgId,
      `💸 *Detail Withdraw*\n\n` +
      `👤 ${wd.nama} (ID: \`${wd.user_id}\`)\n` +
      `📱 ${wd.metode}: ${wd.no_hp}\n` +
      `💰 Poin: ${wd.jumlah_poin}\n` +
      `💵 Nilai: ${toRp(Math.round(wd.jumlah_rp / CONFIG.POIN_TO_RP))}\n` +
      `💸 Komisi: -${toRp(Math.round(wd.komisi / CONFIG.POIN_TO_RP))}\n` +
      `✅ Dikirim: *${toRp(Math.round(wd.net_rp / CONFIG.POIN_TO_RP))}*\n` +
      `⏰ ${new Date(wd.waktu).toLocaleString("id-ID")}\n` +
      `🆔 \`${wd.id}\``,
      { reply_markup: KB.wdApprove(wdId) }
    );
  }

  if (data.startsWith("adm_wd_ok_") && userId === CONFIG.ADMIN_ID) {
    const wdId = data.replace("adm_wd_ok_", "");
    const db   = DB.load();
    const idx  = (db.withdraw_pending || []).findIndex(w => w.id === wdId);
    if (idx === -1) return;
    const wd = db.withdraw_pending[idx];
    db.withdraw_pending.splice(idx, 1);
    db.stats.total_withdraw = (db.stats.total_withdraw || 0) + wd.net_rp;
    DB.save(db);
    await sendMsg(wd.user_id,
      `✅ *Withdraw Disetujui!*\n\n` +
      `Rp ${wd.net_rp.toLocaleString("id-ID")} sudah dikirim ke ${wd.metode} (${wd.no_hp}).\n` +
      `Terima kasih sudah aktif! 🎉`
    );
    return bot.answerCallbackQuery(q.id, { text: `✅ Approved! Dana dikirim ke ${wd.nama}`, show_alert: true });
  }

  if (data.startsWith("adm_wd_no_") && userId === CONFIG.ADMIN_ID) {
    const wdId = data.replace("adm_wd_no_", "");
    const db   = DB.load();
    const idx  = (db.withdraw_pending || []).findIndex(w => w.id === wdId);
    if (idx === -1) return;
    const wd = db.withdraw_pending[idx];
    // Refund poin
    const usr = db.users[wd.user_id];
    if (usr) {
      usr.poin        += wd.jumlah_poin;
      usr.total_withdraw = Math.max(0, (usr.total_withdraw || 0) - wd.net_rp);
      db.users[wd.user_id] = usr;
    }
    db.withdraw_pending.splice(idx, 1);
    DB.save(db);
    await sendMsg(wd.user_id,
      `❌ *Withdraw Ditolak*\n\n` +
      `Maaf, withdraw ID \`${wdId}\` ditolak.\n` +
      `Poin *${wd.jumlah_poin} Poin* sudah dikembalikan ke saldo.`
    );
    return bot.answerCallbackQuery(q.id, { text: `❌ Ditolak & refund ke ${wd.nama}`, show_alert: true });
  }

  if (data.startsWith("adm_ban_") && userId === CONFIG.ADMIN_ID) {
    const targetId = data.replace("adm_ban_", "");
    const db       = DB.load();
    if (db.users[targetId]) {
      db.users[targetId].banned = true;
      DB.save(db);
      await sendMsg(parseInt(targetId), "🚫 Akun Anda telah dibanned oleh admin.");
      return bot.answerCallbackQuery(q.id, { text: `✅ User ${targetId} dibanned!`, show_alert: true });
    }
  }

  if (data.startsWith("adm_abaikan_") && userId === CONFIG.ADMIN_ID) {
    const targetId = data.replace("adm_abaikan_", "");
    return bot.answerCallbackQuery(q.id, { text: `👁️ User ${targetId} dimonitor, tidak diapprove.`, show_alert: true });
  }

  // Form-form admin (instruksi via pesan teks)
  const formMap = {
    adm_task_form    : "📝 *Tambah Task*\n\nKirim format:\n`/addtask|Judul|Instruksi|https://link|Poin|y/n`\n\n`y` = perlu screenshot bukti\n`n` = tidak perlu",
    adm_kuis_form    : "🧠 *Tambah Kuis*\n\nKirim format:\n`/addkuis|Pertanyaan|OpsiA|OpsiB|OpsiC|OpsiD|indeks_benar(0-3)|Penjelasan`",
    adm_art_form     : "📖 *Tambah Artikel*\n\nKirim format:\n`/addartikel|Judul|Konten artikel|Pertanyaan|OpsiA|OpsiB|OpsiC|indeks_benar(0-2)|Poin`",
    adm_iklan_form   : "📢 *Tambah Iklan*\n\nKirim format:\n`/addiklan|Konten iklan|https://link`",
    adm_broadcast_form: "📢 *Broadcast*\n\nKirim format:\n`/broadcast|Pesan yang akan dikirim ke semua user`",
    adm_user_cari    : "👤 *Cari User*\n\nKirim format:\n`/cekuser|userId`",
  };

  if (formMap[data] && userId === CONFIG.ADMIN_ID) {
    return editMsg(chatId, msgId,
      formMap[data],
      { reply_markup: { inline_keyboard: [[KB.backRow("adm_panel")]] } }
    );
  }
});

// ═══════════════════════════════════════════════════
// 💬  PESAN TEKS
// ═══════════════════════════════════════════════════
bot.on("message", async (msg) => {
  if (msg.text?.startsWith("/start") || msg.text?.startsWith("/menu") || msg.text?.startsWith("/admin")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text   = msg.text || "";

  const user = DB.getUser(userId);
  if (isBanned(user)) return;

  // ── Wizard Withdraw (input nomor HP) ────────────
  if (user.wd_state?.step === "input_hp" && text && !text.startsWith("/")) {
    const noHP = text.trim();
    if (!/^08\d{8,11}$/.test(noHP)) {
      return sendMsg(chatId, "❌ Format nomor HP salah!\nContoh: `08123456789`");
    }
    user.wd_state = { ...user.wd_state, step: "input_jumlah", no_hp: noHP };
    DB.saveUser(user);

    const maxPoin = user.poin;
    return sendMsg(chatId,
      `📱 Nomor: *${noHP}*\n\n` +
      `💰 Sekarang ketik jumlah *Poin* yang ingin dicairkan:\n` +
      `_(Saldo kamu: ${user.poin} Poin = ${toRp(user.poin)})_\n` +
      `_(Min: ${CONFIG.MIN_WITHDRAW / CONFIG.POIN_TO_RP} Poin)_`
    );
  }

  if (user.wd_state?.step === "input_jumlah" && text && !text.startsWith("/")) {
    const jumlahPoin = parseInt(text.trim());
    const jumlahRp   = jumlahPoin * CONFIG.POIN_TO_RP;

    if (isNaN(jumlahPoin) || jumlahRp < CONFIG.MIN_WITHDRAW) {
      return sendMsg(chatId, `❌ Minimal ${CONFIG.MIN_WITHDRAW / CONFIG.POIN_TO_RP} Poin!`);
    }
    if (jumlahPoin > user.poin) {
      return sendMsg(chatId, `❌ Saldo tidak cukup! Kamu punya ${user.poin} Poin.`);
    }

    const komisi = Math.ceil(jumlahRp * (CONFIG.KOMISI_WD_PERSEN / 100));
    const netRp  = jumlahRp - komisi;

    user.wd_state = { ...user.wd_state, step: "konfirmasi", jumlah_poin: jumlahPoin, jumlah_rp: jumlahRp, komisi, net_rp: netRp };
    DB.saveUser(user);

    return sendMsg(chatId,
      `📋 *Konfirmasi Withdraw*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 Metode: *${user.wd_state.metode}*\n` +
      `📞 No HP: *${user.wd_state.no_hp}*\n` +
      `💰 Poin: *${jumlahPoin} Poin*\n` +
      `💵 Nilai: *${toRp(Math.round(jumlahRp / CONFIG.POIN_TO_RP))}*\n` +
      `📉 Komisi (${CONFIG.KOMISI_WD_PERSEN}%): *-${toRp(Math.round(komisi / CONFIG.POIN_TO_RP))}*\n` +
      `✅ Kamu terima: *${toRp(Math.round(netRp / CONFIG.POIN_TO_RP))}*`,
      { reply_markup: KB.yesNo("wd_konfirmasi_ok", "wd_batal") }
    );
  }

  // ── Admin commands ───────────────────────────────
  if (userId !== CONFIG.ADMIN_ID || !text.startsWith("/")) return;

  // /addtask|judul|instruksi|link|poin|y/n
  if (text.startsWith("/addtask|")) {
    const [, judul, instruksi, link, poin, pb] = text.split("|");
    const db = DB.load();
    db.tasks.push({ id: `TASK_${Date.now()}`, judul, instruksi, link, poin: +poin, perlu_bukti: pb === "y", icon: "📌", aktif: true });
    DB.save(db);
    return sendMsg(chatId, `✅ Task *"${judul}"* ditambahkan! (${poin} Poin)`);
  }

  // /addkuis|pertanyaan|A|B|C|D|jawaban|penjelasan
  if (text.startsWith("/addkuis|")) {
    const [, pertanyaan, a, b, c, d, jawaban, penjelasan] = text.split("|");
    const db = DB.load();
    db.kuis.push({ id: `KUIS_${Date.now()}`, pertanyaan, opsi: [a,b,c,d], jawaban_benar: +jawaban, penjelasan });
    DB.save(db);
    return sendMsg(chatId, `✅ Kuis ditambahkan!`);
  }

  // /addartikel|judul|konten|pertanyaan|A|B|C|jawaban|poin
  if (text.startsWith("/addartikel|")) {
    const [, judul, konten, pertanyaan, a, b, c, jawaban, poin] = text.split("|");
    const db = DB.load();
    db.artikel.push({ id: `ART_${Date.now()}`, judul, konten, pertanyaan: { teks: pertanyaan, opsi: [a,b,c], jawaban_benar: +jawaban }, poin: +poin, aktif: true });
    DB.save(db);
    return sendMsg(chatId, `✅ Artikel *"${judul}"* ditambahkan!`);
  }

  // /addiklan|konten|link
  if (text.startsWith("/addiklan|")) {
    const [, konten, link] = text.split("|");
    const db = DB.load();
    db.iklan.push({ id: `IKLAN_${Date.now()}`, konten, link, aktif: true });
    DB.save(db);
    return sendMsg(chatId, `✅ Iklan ditambahkan dan langsung aktif!`);
  }

  // /broadcast|pesan
  if (text.startsWith("/broadcast|")) {
    const pesan = text.replace("/broadcast|", "");
    const db    = DB.load();
    let ok = 0, fail = 0;
    for (const u of Object.values(db.users)) {
      try {
        await sendMsg(u.id, `📢 *Pengumuman Bot:*\n\n${pesan}`);
        ok++;
      } catch { fail++; }
      await new Promise(r => setTimeout(r, 50)); // Rate limit delay
    }
    return sendMsg(chatId, `✅ Broadcast selesai!\n✓ Terkirim: ${ok}\n✗ Gagal: ${fail}`);
  }

  // /premium|userId|hari
  if (text.startsWith("/premium|")) {
    const [, targetId, hari] = text.split("|");
    const target = DB.getUser(+targetId);
    const exp    = new Date();
    exp.setDate(exp.getDate() + +hari);
    target.premium        = true;
    target.premium_expire = exp.toISOString();
    DB.saveUser(target);
    await sendMsg(+targetId,
      `👑 *Premium Aktif!*\n\nPremium aktif hingga ${exp.toLocaleDateString("id-ID")}. Terima kasih!`
    );
    return sendMsg(chatId, `✅ Premium ${hari} hari aktif untuk user ${targetId}!`);
  }

  // /cekuser|userId
  if (text.startsWith("/cekuser|")) {
    const [, targetId] = text.split("|");
    const u = DB.getUser(+targetId);
    return sendMsg(chatId,
      `👤 *Info User*\n\n` +
      `Nama: *${u.nama}*\n` +
      `ID: \`${u.id}\`\n` +
      `Poin: *${u.poin}*\n` +
      `Total: *${u.total_poin}*\n` +
      `Streak: *${u.streak}*\n` +
      `Premium: *${isPremium(u) ? "Ya" : "Tidak"}*\n` +
      `Banned: *${u.banned ? "Ya" : "Tidak"}*\n` +
      `Suspicious: *${u.ac?.suspicious || 0}*\n` +
      `Task selesai: *${u.task_selesai?.length || 0}*`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "🚫 Ban", callback_data: `adm_ban_${targetId}` },
            { text: `${u.banned ? "✅ Unban" : "👁️ Monitor"}`, callback_data: `adm_abaikan_${targetId}` },
          ]],
        },
      }
    );
  }

  // /unban|userId
  if (text.startsWith("/unban|")) {
    const [, targetId] = text.split("|");
    const db = DB.load();
    if (db.users[targetId]) {
      db.users[targetId].banned = false;
      db.users[targetId].ac.suspicious = 0;
      DB.save(db);
      await sendMsg(+targetId, "✅ Akun kamu sudah aktif kembali! Silakan gunakan bot dengan baik.");
      return sendMsg(chatId, `✅ User ${targetId} berhasil di-unban!`);
    }
  }
});

// ═══════════════════════════════════════════════════
// Konfirmasi withdraw dari callback (ya/batal)
// ═══════════════════════════════════════════════════
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const userId = q.from.id;

  if (q.data === "wd_konfirmasi_ok") {
    await bot.answerCallbackQuery(q.id).catch(() => {});
    const user = DB.getUser(userId);
    if (!user.wd_state || user.wd_state.step !== "konfirmasi") return;

    const wd   = user.wd_state;
    const db   = DB.load();
    const wdId = `WD_${Date.now()}`;

    db.withdraw_pending = db.withdraw_pending || [];
    db.withdraw_pending.push({
      id          : wdId,
      user_id     : userId,
      nama        : user.nama,
      metode      : wd.metode,
      no_hp       : wd.no_hp,
      jumlah_poin : wd.jumlah_poin,
      jumlah_rp   : wd.jumlah_rp,
      komisi      : wd.komisi,
      net_rp      : wd.net_rp,
      waktu       : new Date().toISOString(),
      status      : "pending",
    });

    user.poin          -= wd.jumlah_poin;
    user.total_withdraw = (user.total_withdraw || 0) + wd.net_rp;
    user.wd_state       = null;
    DB.saveUser(user);
    DB.save(db);

    await sendMsg(chatId,
      `✅ *Withdraw Dikirim!*\n\n` +
      `🆔 ID: \`${wdId}\`\n` +
      `💸 ${toRp(Math.round(wd.net_rp / CONFIG.POIN_TO_RP))} → ${wd.metode} (${wd.no_hp})\n\n` +
      `⏰ Proses 1×24 jam kerja.`
    );

    // Notif admin
    await sendMsg(CONFIG.ADMIN_ID,
      `💸 *WITHDRAW BARU!*\n\n` +
      `👤 ${user.nama} (\`${userId}\`)\n` +
      `💰 ${toRp(Math.round(wd.net_rp / CONFIG.POIN_TO_RP))} via ${wd.metode}\n` +
      `📱 ${wd.no_hp}\n🆔 \`${wdId}\``,
      { reply_markup: KB.wdApprove(wdId) }
    );
  }

  if (q.data === "wd_batal") {
    await bot.answerCallbackQuery(q.id).catch(() => {});
    const user = DB.getUser(userId);
    user.wd_state = null;
    DB.saveUser(user);
    await sendMsg(chatId, "❌ Withdraw dibatalkan.");
  }
});

// ═══════════════════════════════════════════════════
// ⏰  CRON JOBS
// ═══════════════════════════════════════════════════

// Reset harian jam 00:00 WIB
cron.schedule("0 0 * * *", () => AC.resetHarian(), { timezone: "Asia/Jakarta" });

// Pengingat check-in jam 08:00 WIB
cron.schedule("0 8 * * *", async () => {
  const db   = DB.load();
  const hari = new Date().toDateString();
  for (const u of Object.values(db.users)) {
    if (u.last_checkin !== hari && !u.banned) {
      await sendMsg(u.id,
        `☀️ *Selamat Pagi, ${u.nama}!*\n\nJangan lupa check-in hari ini!\n🔥 Streak: *${u.streak} hari*`,
        { reply_markup: { inline_keyboard: [[{ text: "📅 Check-in Sekarang", callback_data: "checkin" }]] } }
      ).catch(() => {});
    }
  }
}, { timezone: "Asia/Jakarta" });

// Broadcast iklan jam 12:00 & 18:00
cron.schedule("0 12,18 * * *", async () => {
  const db      = DB.load();
  const iklanList = (db.iklan || []).filter(i => i.aktif);
  if (!iklanList.length) return;
  const iklan = iklanList[Math.floor(Math.random() * iklanList.length)];
  for (const u of Object.values(db.users)) {
    if (!u.banned) {
      await sendMsg(u.id,
        `📢 *Iklan Sponsor*\n\n${iklan.konten}`,
        iklan.link ? { reply_markup: { inline_keyboard: [[{ text: "🔗 Lihat Penawaran", url: iklan.link }]] } } : {}
      ).catch(() => {});
    }
  }
}, { timezone: "Asia/Jakarta" });

// ═══════════════════════════════════════════════════
// 🚀  START
// ═══════════════════════════════════════════════════
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`🎯 ${CONFIG.BOT_NAME} v${CONFIG.VERSION}`);
console.log(`🔑 Admin ID  : ${CONFIG.ADMIN_ID}`);
console.log(`💾 Database  : ${CONFIG.DB_PATH}`);
console.log("🚀 Bot berjalan! Ketik /start di Telegram");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
