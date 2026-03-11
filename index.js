
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    Browsers
} = require("@whiskeysockets/baileys");
const { Telegraf, Markup } = require('telegraf');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const os = require('os');

/**
 * 🤖 WHATSAPP GROUP CREATOR BOT v6.0.0
 * - Pengaturan grup sebelum buat (edit pesan/tambah anggota/setuju anggota/kirim pesan)
 * - Fitur KICK by nomor dari semua grup
 * - Ambil link seluruh grup dengan delay manusiawi
 * - Multi-user queue anti-lag
 * - Nama grup tanpa #
 */

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────
const TG_BOT_TOKEN = '8324023704:AAGSNzoOwlqHhhFgcuKxiOxEQ8-XSoqG2ZQ';
const ADMIN_ID = 8496726839;
const bot = new Telegraf(TG_BOT_TOKEN);

const sockets = new Map();

// ─────────────────────────────────────────────
// MIDDLEWARE: Semua tombol yang ditekan di grup
// → kirim notifikasi ke user, jangan proses
// ─────────────────────────────────────────────
bot.use(async (ctx, next) => {
    const chatType = ctx.chat?.type;

    // Jika bukan chat pribadi → DIAM TOTAL, tidak balas apapun
    // Kecuali callback query (tombol) → jawab kosong agar tidak loading spinner
    if (chatType && chatType !== 'private') {
        if (ctx.callbackQuery) {
            // Jawab kosong agar tombol tidak stuck loading, tapi tidak kirim pesan
            try { await ctx.answerCbQuery(); } catch(e) {}
        }
        return; // Diam total, tidak lanjut proses apapun
    }

    return next();
});
const notified = new Set();
const userQueues = new Map();
const START_TIME = Date.now();

// ─────────────────────────────────────────────
// DATABASE (debounced save)
// ─────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');
let db = { users: {} };
let dbSaveTimer = null;

function loadDb() {
    try {
        if (fs.existsSync(DB_PATH)) db = fs.readJsonSync(DB_PATH);
        else fs.writeJsonSync(DB_PATH, db);
    } catch(e) { console.error('DB load error:', e); db = { users: {} }; }
}

function saveDb() {
    if (dbSaveTimer) clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(() => {
        try { fs.writeJsonSync(DB_PATH, db); }
        catch(e) { console.error('DB save error:', e); }
    }, 300);
}

loadDb();

// ─────────────────────────────────────────────
// QUEUE ENGINE
// ─────────────────────────────────────────────
function enqueueTask(chatId, task) {
    if (!userQueues.has(chatId)) userQueues.set(chatId, Promise.resolve());
    const next = userQueues.get(chatId)
        .then(() => task())
        .catch(e => console.error(`Queue error [${chatId}]:`, e));
    userQueues.set(chatId, next);
    return next;
}

// ─────────────────────────────────────────────
// HUMAN DELAY (random antara min-max ms)
// ─────────────────────────────────────────────
function humanDelay(minMs = 2000, maxMs = 5000) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return delay(ms);
}

// ─────────────────────────────────────────────
// TRANSLATIONS
// ─────────────────────────────────────────────
const translations = {
    ID: {
        status: "📊 Status Login",
        lang: "🌐 Bahasa",
        owner: "👑 Pemilik Bot",
        btn_login: "🔐 Login",
        btn_logout: "🚪 Logout",
        btn_create: "👥 Buat Grup",
        btn_links: "🔗 Ambil Link",
        btn_join: "➕ Gabung Grup",
        btn_leave: "🚪 Keluar Grup",
        btn_kick: "🦵 Kick Member",
        btn_addmember: "➕ Add Member",
        btn_lang: "🌐 Bahasa",
        btn_owner: "💎 Panel Owner",
        choose_lang: "Pilih bahasa Anda:",
        back: "⬅️ Kembali",
        wait_qr: "⏳ Memproses QR, mohon tunggu...",
        input_phone: "🔢 Masukkan nomor WhatsApp (kode negara tanpa +):\nContoh: 62812xxxxxxxx",
        input_gname: "📝 Masukkan Nama Grup:\n\n_Contoh: Grup Saya_\n_(Nomor otomatis: Grup Saya 01, Grup Saya 02)_",
        input_count: "🔢 Mau buat berapa grup? (1-30):",
        input_join: "➕ Masukkan Link Invite Grup:",
        input_leave: "🚪 Masukkan *Link Grup* WhatsApp yang ingin ditinggalkan:\nContoh: https://chat.whatsapp.com/xxxxx",
        input_kick: "🦵 Masukkan nomor yang ingin di-kick (kode negara tanpa +):\nContoh: 62812xxxxxxxx\n\n_Bot akan kick nomor tersebut dari SEMUA grup._",
        connected: "✅ WhatsApp Terhubung! Bot siap.",
        logout_done: "✅ Logout berhasil dan sesi dihapus.",
        creating_group: "⏳ Membuat grup *{current}/{total}*: _{name}_",
        create_done: "🎉 Selesai! Berhasil membuat *{success}/{total}* grup.",
        no_session: "❌ WhatsApp belum terhubung. Silakan login terlebih dahulu.",
        group_settings_title: "⚙️ *PENGATURAN GRUP*\n\nAtur izin anggota grup sebelum dibuat.\nKetuk tombol untuk toggle ON/OFF:\n\n",
        settings_next: "✅ NEXT ➡️"
    },
    EN: {
        status: "📊 Login Status",
        lang: "🌐 Language",
        owner: "👑 Bot Owner",
        btn_login: "🔐 Login",
        btn_logout: "🚪 Logout",
        btn_create: "👥 Create Group",
        btn_links: "🔗 Get Links",
        btn_join: "➕ Join Group",
        btn_leave: "🚪 Leave Group",
        btn_kick: "🦵 Kick Member",
        btn_addmember: "➕ Add Member",
        btn_lang: "🌐 Language",
        btn_owner: "💎 Owner Panel",
        choose_lang: "Choose your language:",
        back: "⬅️ Back",
        wait_qr: "⏳ Processing QR, please wait...",
        input_phone: "🔢 Enter your WhatsApp number (country code, no +):\nExample: 62812xxxxxxxx",
        input_gname: "📝 Enter Group Name:\n\n_Example: My Group_\n_(Numbers auto-added: My Group 01, My Group 02)_",
        input_count: "🔢 How many groups? (1-30):",
        input_join: "➕ Enter Group Invite Link:",
        input_leave: "🚪 Enter *WhatsApp Group Link* to leave:\nExample: https://chat.whatsapp.com/xxxxx",
        input_kick: "🦵 Enter number to kick (country code, no +):\nExample: 62812xxxxxxxx\n\n_Bot will kick from ALL groups._",
        connected: "✅ WhatsApp Connected! Bot is ready.",
        logout_done: "✅ Logout successful and session cleared.",
        creating_group: "⏳ Creating group *{current}/{total}*: _{name}_",
        create_done: "🎉 Done! Successfully created *{success}/{total}* groups.",
        no_session: "❌ WhatsApp not connected. Please login first.",
        group_settings_title: "⚙️ *GROUP SETTINGS*\n\nConfigure member permissions before creating.\nTap buttons to toggle ON/OFF:\n\n",
        settings_next: "✅ NEXT ➡️"
    }
};

const t = (chatId) => translations[db.users[chatId]?.lang || 'ID'];

// ─────────────────────────────────────────────
// GROUP SETTINGS DEFAULTS
// ─────────────────────────────────────────────
// announcement: hanya admin bisa kirim pesan
// restrict: hanya admin bisa edit info grup
// memberAddMode: anggota bisa tambah anggota lain
// joinApprovalMode: setujui anggota baru

function defaultGroupSettings() {
    return {
        editInfo: false,       // Edit pengaturan grup (false = semua bisa, true = hanya admin)
        sendMessages: false,   // Kirim pesan (false = semua bisa, true = hanya admin)
        addMembers: false,     // Tambah anggota (false = semua bisa, true = hanya admin)
        approveJoin: false,    // Setujui anggota baru (false = otomatis, true = perlu persetujuan)
        warmup: true           // Warmup grup otomatis (default ON - untuk ketahanan grup)
    };
}

function buildSettingsText(settings, tr) {
    const on = '✅';
    const off = '❌';
    const onlyAdmin = '👑 Hanya Admin';
    const allMember = '👤 Semua Anggota';
    const autoJoin = '🔓 Otomatis';
    const approveJoin = '🔒 Perlu Persetujuan';
    const warmupOn = '🔥 Aktif (Direkomendasikan)';
    const warmupOff = '💤 Nonaktif (Lebih Cepat)';

    return tr.group_settings_title +
        `1️⃣ Edit Pengaturan Grup: ${settings.editInfo ? `${on} ${onlyAdmin}` : `${off} ${allMember}`}\n` +
        `2️⃣ Kirim Pesan Baru: ${settings.sendMessages ? `${on} ${onlyAdmin}` : `${off} ${allMember}`}\n` +
        `3️⃣ Tambah Anggota Lain: ${settings.addMembers ? `${on} ${onlyAdmin}` : `${off} ${allMember}`}\n` +
        `4️⃣ Setujui Anggota Baru: ${settings.approveJoin ? `${on} ${approveJoin}` : `${off} ${autoJoin}`}\n` +
        `5️⃣ Warmup Grup: ${settings.warmup !== false ? `${on} ${warmupOn}` : `${off} ${warmupOff}`}\n` +
        `\n_⚠️ Warmup: Bot kirim 8-11 pesan aktivasi dulu agar grup kuat diisi 50-100 anggota_`;
}

function buildSettingsKeyboard(settings, tr) {
    const on = '✅';
    const off = '❌';
    const warmupLabel = settings.warmup !== false ? `${on} 🔥 Warmup Grup: ON` : `${off} 💤 Warmup Grup: OFF`;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`${settings.editInfo ? on : off} Edit Pengaturan Grup`, 'gs_editInfo')],
        [Markup.button.callback(`${settings.sendMessages ? on : off} Kirim Pesan Baru`, 'gs_sendMessages')],
        [Markup.button.callback(`${settings.addMembers ? on : off} Tambah Anggota Lain`, 'gs_addMembers')],
        [Markup.button.callback(`${settings.approveJoin ? on : off} Setujui Anggota Baru`, 'gs_approveJoin')],
        [Markup.button.callback(warmupLabel, 'gs_warmup')],
        [Markup.button.callback(tr.settings_next, 'gs_next'), Markup.button.callback(tr.back, 'back_home')]
    ]);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const checkAccess = (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === ADMIN_ID) return true;
    const user = db.users[chatId];
    if (!user || !user.expiry) {
        ctx.reply('⛔ Akses Ditolak. Hubungi Admin (@XIXI8778) untuk mendaftar.');
        return false;
    }
    if (Date.now() > user.expiry) {
        ctx.reply('⚠️ Masa aktif habis. Silakan perpanjang ke Admin.');
        return false;
    }
    return true;
};

const getMenuUI = (chatId) => {
    const isConn = sockets.has(chatId) ? '✅ ONLINE' : '❌ OFFLINE';
    const lang = db.users[chatId]?.lang || 'ID';
    const tr = translations[lang];

    // Hitung sisa hari akses
    let accessStatus = '';
    if (chatId === ADMIN_ID) {
        accessStatus = '\n👑 Akses: *OWNER (Unlimited)*';
    } else {
        const user = db.users[chatId];
        if (user && user.expiry) {
            const now = Date.now();
            const remaining = user.expiry - now;
            if (remaining <= 0) {
                accessStatus = '\n⛔ Akses: *HABIS* \- Hubungi Admin @XIXI8778';
            } else {
                const days = Math.floor(remaining / 86400000);
                const hours = Math.floor((remaining % 86400000) / 3600000);
                const mins = Math.floor((remaining % 3600000) / 60000);
                if (days > 0) {
                    accessStatus = `\n⏳ Akses: *${days} hari ${hours} jam* tersisa`;
                } else if (hours > 0) {
                    accessStatus = `\n⚠️ Akses: *${hours} jam ${mins} menit* tersisa \_(Segera perpanjang!\)_`;
                } else {
                    accessStatus = `\n🔴 Akses: *${mins} menit* tersisa\! \_(Segera perpanjang!\)_`;
                }
            }
        } else {
            accessStatus = '\n⛔ Akses: *Belum terdaftar*';
        }
    }

    const text = `🤖 *WhatsApp Group Creator Bot*\n\n${tr.status}: ${isConn}${accessStatus}\n${tr.lang}: ${lang}\n${tr.owner}: @XIXI8778`;
    const row1 = [Markup.button.callback(tr.btn_login, 'login_menu'), Markup.button.callback(tr.btn_logout, 'logout_wa')];
    const row2 = [Markup.button.callback(tr.btn_create, 'create_prompt'), Markup.button.callback(tr.btn_links, 'get_links')];
    const row3 = [Markup.button.callback(tr.btn_join, 'join_prompt'), Markup.button.callback(tr.btn_leave, 'leave_prompt')];
    const row4 = [Markup.button.callback(tr.btn_kick, 'kick_prompt'), Markup.button.callback(tr.btn_addmember, 'addmember_prompt')];
    const row5lang = [Markup.button.callback(tr.btn_lang, 'switch_lang')];
    if (chatId === ADMIN_ID) row5lang.push(Markup.button.callback(tr.btn_owner, 'admin_panel'));
    const rows = [row1, row2, row3, row4, row5lang];
    return { text, keyboard: Markup.inlineKeyboard(rows) };
};

const getAdminMenuUI = () => {
    const text = "💎 *OWNER DASHBOARD v6.0*\n\nGunakan tombol untuk mengelola bot.";
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tambah User', 'admin_add'), Markup.button.callback('❌ Stop User', 'admin_stop_list')],
        [Markup.button.callback('📢 Broadcast Teks', 'admin_bc_text'), Markup.button.callback('🖼️ Broadcast Foto', 'admin_bc_photo')],
        [Markup.button.callback('📊 Statistik Server', 'admin_stats'), Markup.button.callback('📋 Daftar Aktif', 'admin_list_active')],
        [Markup.button.callback('⬅️ Kembali ke Menu', 'back_home')]
    ]);
    return { text, keyboard };
};

function padNum(n) { return n < 10 ? `0${n}` : `${n}`; }

function buildGroupName(base, index, total) {
    if (total === 1) return base.trim();
    return `${base.trim()} ${padNum(index)}`;
}

// ─────────────────────────────────────────────
// WHATSAPP ENGINE
// ─────────────────────────────────────────────
async function startWhatsApp(chatId, phone = null, isQR = false) {
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    fs.ensureDirSync(sessionDir);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    const tr = t(chatId);

    if (sockets.has(chatId)) {
        try { sockets.get(chatId).ev.removeAllListeners(); sockets.get(chatId).end(); } catch(e) {}
        sockets.delete(chatId);
    }

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 15000,
        retryRequestDelayMs: 2000
    });

    sockets.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && isQR) {
            try {
                const buf = await QRCode.toBuffer(qr, { scale: 6 });
                await bot.telegram.sendPhoto(chatId, { source: buf }, { caption: '📸 Scan QR ini di WhatsApp Anda.' });
            } catch(e) {}
        }
        if (connection === 'close') {
            const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
            sockets.delete(chatId);
            notified.delete(chatId);
            if (code !== DisconnectReason.loggedOut) {
                console.log(`[${chatId}] Reconnecting in 5s...`);
                setTimeout(() => startWhatsApp(chatId), 5000);
            } else {
                try { await bot.telegram.sendMessage(chatId, '⚠️ Sesi WhatsApp logout. Silakan login ulang.'); } catch(e) {}
            }
        } else if (connection === 'open') {
            if (!notified.has(chatId)) {
                notified.add(chatId);
                try { await bot.telegram.sendMessage(chatId, tr.connected); } catch(e) {}
            }
        }
    });

    if (phone && !sock.authState.creds.registered) {
        await delay(3000);
        try {
            const clean = phone.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(clean);
            const fmt = code?.match(/.{1,4}/g)?.join('-') || code;
            await bot.telegram.sendMessage(chatId,
                `🔢 *KODE PAIRING:*\n\n*${fmt}*\n\nMasukkan di WhatsApp → Setelan → Perangkat Tertaut → Tautkan dengan nomor telepon.`,
                { parse_mode: 'Markdown' });
        } catch(err) {
            await bot.telegram.sendMessage(chatId, '❌ Gagal mendapat kode. Pastikan nomor benar lalu coba lagi.');
        }
    }
    return sock;
}

// ─────────────────────────────────────────────
// APPLY GROUP SETTINGS after creation
// ─────────────────────────────────────────────
async function applyGroupSettings(sock, groupId, settings) {
    try {
        // Delay kecil sebelum apply settings (biar natural)
        await humanDelay(1500, 3000);

        // Edit info grup (restrict = hanya admin)
        if (settings.editInfo) {
            await sock.groupSettingUpdate(groupId, 'locked');
        } else {
            await sock.groupSettingUpdate(groupId, 'unlocked');
        }
        await humanDelay(800, 1500);

        // Kirim pesan (announcement = hanya admin bisa kirim)
        if (settings.sendMessages) {
            await sock.groupSettingUpdate(groupId, 'announcement');
        } else {
            await sock.groupSettingUpdate(groupId, 'not_announcement');
        }
        await humanDelay(800, 1500);

        // Tambah anggota (memberAddMode)
        // true = hanya admin, false = semua bisa
        await sock.groupMemberAddMode(groupId, settings.addMembers ? 'admin_add' : 'all_member_add');
        await humanDelay(800, 1500);

        // Setujui anggota baru (joinApprovalMode)
        await sock.groupJoinApprovalMode(groupId, settings.approveJoin ? 'on' : 'off');

    } catch(e) {
        console.error(`Apply settings error [${groupId}]:`, e.message);
    }
}

// ─────────────────────────────────────────────
// WARMUP ENGINE - Kuatkan grup baru agar tahan anggota & pesan banyak
// ─────────────────────────────────────────────

// Kumpulan pesan warmup yang natural & bervariasi
const WARMUP_MESSAGES = [
    "Selamat datang di grup ini! 👋",
    "Grup ini dibuat untuk komunikasi bersama 💬",
    "Semoga grup ini bermanfaat untuk kita semua 🙏",
    "Silahkan bagikan info penting di sini ✅",
    "Mari kita jaga ketertiban grup ya 😊",
    "Halo semua, selamat bergabung! 🎉",
    "Grup aktif, silahkan berdiskusi 💡",
    "Informasi penting akan dibagikan di sini 📢",
    "Tetap aktif dan saling membantu ya 🤝",
    "Selamat datang dan selamat berdiskusi! 🌟",
    "Jaga sopan santun dalam berkomunikasi 🙌",
    "Grup ini terbuka untuk semua informasi positif ✨",
    "Yuk aktifkan notifikasi grup ini 🔔",
    "Salam kenal untuk semua anggota baru 👐",
    "Semoga harimu menyenangkan! ☀️",
    "Tetap semangat dan produktif ya! 💪",
    "Sharing is caring, jangan pelit info ya 😄",
    "Grup resmi, mohon jaga etika berkomunikasi 🎯",
    "Selamat pagi / siang / malam semua! 🌙",
    "Aktif terus ya gaes! 🔥",
    "Info terkini akan selalu update di sini 📰",
    "Diskusi sehat dan positif selalu ya! 🌈",
    "Terima kasih sudah bergabung 🙏",
    "Bersama kita bisa! 💫",
    "Keep in touch ya semuanya! 📲",
    "Jangan lupa cek info terbaru di sini 👀",
    "Grup ini untuk kebaikan bersama 💝",
    "Stay connected! 📡",
    "Semangat pagi! Ayo mulai hari dengan positif ⚡",
    "Good vibes only di grup ini! 🌺"
];

// Deskripsi grup yang natural
const GROUP_DESCRIPTIONS = [
    "Grup komunikasi resmi. Mohon jaga etika dan sopan santun dalam berkomunikasi.",
    "Selamat datang! Grup ini untuk berbagi informasi penting dan diskusi positif.",
    "Media komunikasi bersama. Tetap aktif dan saling mendukung.",
    "Grup informasi dan diskusi. Harap gunakan bahasa yang sopan.",
    "Silahkan berbagi informasi positif dan bermanfaat di grup ini."
];

// Nama grup icon yang bervariasi untuk warmup
function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function warmupGroup(sock, groupId, groupName, chatId, progressId) {
    // ── FASE 1: Tunggu grup stabil (2-4 detik) ──
    await humanDelay(2000, 4000);

    // ── FASE 2: Set deskripsi grup (terlihat lebih legit) ──
    try {
        const desc = getRandomItem(GROUP_DESCRIPTIONS);
        await sock.groupUpdateDescription(groupId, desc);
        await humanDelay(1500, 3000);
    } catch(e) {}

    // ── FASE 3: Kirim pesan warmup bertahap (5-8 pesan) ──
    // Ini kunci utama! Grup yang punya history pesan jauh lebih kuat
    const msgCount = Math.floor(Math.random() * 4) + 5; // 5-8 pesan
    const usedMsgs = new Set();

    for (let m = 0; m < msgCount; m++) {
        // Pilih pesan yang belum dipakai
        let msg;
        do {
            msg = getRandomItem(WARMUP_MESSAGES);
        } while (usedMsgs.has(msg) && usedMsgs.size < WARMUP_MESSAGES.length);
        usedMsgs.add(msg);

        try {
            await sock.sendMessage(groupId, { text: msg });
            // Delay antar pesan: 8-20 detik (seperti manusia mengetik)
            await humanDelay(8000, 20000);
        } catch(e) {
            console.error(`Warmup msg error [${groupId}]:`, e.message);
            await humanDelay(5000, 10000);
        }

        // Update progress di Telegram
        if (progressId) {
            try {
                await bot.telegram.editMessageText(chatId, progressId, null,
                    `🔥 *Warming up:* _${groupName}_\n⚡ Pesan warmup ${m + 1}/${msgCount}...`,
                    { parse_mode: 'Markdown' });
            } catch(e) {}
        }
    }

    // ── FASE 4: Jeda natural setelah pesan (grup terlihat aktif) ──
    await humanDelay(5000, 10000);

    // ── FASE 5: Update nama grup (trigger aktivitas di WA) ──
    try {
        // Update subject untuk trigger notifikasi internal WA
        await sock.groupUpdateSubject(groupId, groupName);
        await humanDelay(2000, 4000);
    } catch(e) {}

    // ── FASE 6: Kirim 2-3 pesan tambahan (penutup warmup) ──
    const closingMsgs = [
        "Grup sudah siap digunakan! ✅",
        "Silahkan mulai bergabung dan berdiskusi 🎊",
        "Anggota baru sangat disambut! 🤗"
    ];

    for (let i = 0; i < closingMsgs.length; i++) {
        try {
            await sock.sendMessage(groupId, { text: closingMsgs[i] });
            if (i < closingMsgs.length - 1) await humanDelay(10000, 18000);
        } catch(e) {}
    }

    await humanDelay(3000, 5000);
}

// ─────────────────────────────────────────────
// GROUP CREATION ENGINE
// ─────────────────────────────────────────────
async function createGroups(chatId, baseName, count, settings) {
    const sock = sockets.get(chatId);
    const tr = t(chatId);
    if (!sock) {
        await bot.telegram.sendMessage(chatId, tr.no_session);
        return;
    }

    const doWarmup = settings.warmup !== false; // default ON

    let progressId = null;
    try {
        const warmupNote = doWarmup ? '\n🔥 _Mode Warmup aktif - grup diperkuat otomatis_' : '';
        const m = await bot.telegram.sendMessage(chatId,
            `⏳ Memulai pembuatan *${count}* grup...${warmupNote}`,
            { parse_mode: 'Markdown' });
        progressId = m.message_id;
    } catch(e) {}

    let success = 0;
    const results = [];

    for (let i = 1; i <= count; i++) {
        const groupName = buildGroupName(baseName, i, count);

        // Update progress - fase buat
        if (progressId) {
            try {
                await bot.telegram.editMessageText(chatId, progressId, null,
                    `🏗️ Membuat grup *${i}/${count}*: _${groupName}_`,
                    { parse_mode: 'Markdown' });
            } catch(e) {}
        }

        try {
            const result = await sock.groupCreate(groupName, []);
            const groupId = result.id;
            success++;

            // Apply pengaturan grup
            if (progressId) {
                try {
                    await bot.telegram.editMessageText(chatId, progressId, null,
                        `⚙️ Mengatur izin grup *${i}/${count}*: _${groupName}_`,
                        { parse_mode: 'Markdown' });
                } catch(e) {}
            }
            await applyGroupSettings(sock, groupId, settings);

            // Warmup grup jika diaktifkan
            if (doWarmup) {
                if (progressId) {
                    try {
                        await bot.telegram.editMessageText(chatId, progressId, null,
                            `🔥 *Warming up grup ${i}/${count}*\n_${groupName}_\n\n⏳ Mengirim pesan aktivasi...`,
                            { parse_mode: 'Markdown' });
                    } catch(e) {}
                }
                await warmupGroup(sock, groupId, groupName, chatId, progressId);
            }

            // Ambil link grup yang baru dibuat dan kirim ke user
            try {
                const inviteCode = await sock.groupInviteCode(groupId);
                const groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                results.push(`✅ *${groupName}*\n🔗 ${groupLink}`);
                // Kirim link langsung ke user tanpa tunggu semua selesai
                await bot.telegram.sendMessage(chatId,
                    `🔗 *Link Grup Baru:*\n*${groupName}*\nhttps://chat.whatsapp.com/${inviteCode}`,
                    { parse_mode: 'Markdown' });
            } catch(e) {
                results.push(`✅ ${groupName} _(link tidak bisa diambil)_`);
            }
        } catch(e) {
            console.error(`Group create error [${chatId}] "${groupName}":`, e.message);
            results.push(`❌ ${groupName} (gagal)`);
        }

        // Delay antar pembuatan grup berikutnya (lebih panjang jika warmup)
        if (i < count) {
            const minDelay = doWarmup ? 8000 : 4000;
            const maxDelay = doWarmup ? 15000 : 7000;
            await humanDelay(minDelay, maxDelay);
        }
    }

    if (progressId) {
        try { await bot.telegram.deleteMessage(chatId, progressId); } catch(e) {}
    }

    const doneText = tr.create_done.replace('{success}', success).replace('{total}', count);
    const warmupNote = doWarmup ? '\n\n🔥 *Semua grup sudah di-warmup!*\n_Grup siap diisi 50-100 anggota dan aktif 30+ pesan_' : '';
    await bot.telegram.sendMessage(chatId,
        `${doneText}\n\n${results.join('\n')}${warmupNote}`,
        { parse_mode: 'Markdown' });
}

// ─────────────────────────────────────────────
// KICK ENGINE - Kick dari semua grup
// ─────────────────────────────────────────────
async function kickFromAllGroups(chatId, targetPhone) {
    const sock = sockets.get(chatId);
    const tr = t(chatId);
    if (!sock) {
        await bot.telegram.sendMessage(chatId, tr.no_session);
        return;
    }

    // Normalisasi nomor - hapus semua non-digit, pastikan tidak ada leading 0
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '').replace(/^0+/, '');
    
    // WhatsApp JID format: nomor@s.whatsapp.net
    const targetJid = `${cleanPhone}@s.whatsapp.net`;

    let progressId = null;
    try {
        const m = await bot.telegram.sendMessage(chatId,
            `🔍 Mencari *${cleanPhone}* di semua grup...`, { parse_mode: 'Markdown' });
        progressId = m.message_id;
    } catch(e) {}

    await humanDelay(1000, 2000);

    let kicked = 0;
    let notFound = 0;
    let failed = 0;
    const kickResults = [];

    try {
        const groups = await sock.groupFetchAllParticipating();
        const entries = Object.entries(groups);

        if (progressId) {
            try {
                await bot.telegram.editMessageText(chatId, progressId, null,
                    `🔍 Memeriksa *${entries.length}* grup untuk nomor *${cleanPhone}*...`,
                    { parse_mode: 'Markdown' });
            } catch(e) {}
        }

        for (const [groupId, group] of entries) {
            const participants = group.participants || [];

            // Cari participant dengan pencocokan fleksibel
            // Format participant ID bisa: 62812xxx@s.whatsapp.net atau dengan :device suffix
            const matchedParticipant = participants.find(p => {
                if (!p || !p.id) return false;
                // Ambil bagian nomor saja (sebelum @ atau sebelum :)
                const pNum = p.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                return pNum === cleanPhone;
            });

            if (!matchedParticipant) {
                notFound++;
                continue;
            }

            // Gunakan JID asli dari data participant (lebih akurat)
            const actualJid = matchedParticipant.id.includes(':')
                ? matchedParticipant.id.split(':')[0] + '@s.whatsapp.net'
                : matchedParticipant.id;

            // Update progress
            if (progressId) {
                try {
                    await bot.telegram.editMessageText(chatId, progressId, null,
                        `🦵 Kick dari: *${group.subject}*...`,
                        { parse_mode: 'Markdown' });
                } catch(e) {}
            }

            try {
                await sock.groupParticipantsUpdate(groupId, [actualJid], 'remove');
                kicked++;
                kickResults.push(`✅ ${group.subject}`);
                await humanDelay(2000, 4000);
            } catch(e) {
                console.error(`Kick error di grup ${group.subject}:`, e.message);
                failed++;
                kickResults.push(`❌ ${group.subject} (${e.message || 'gagal'})`);
                await humanDelay(1000, 2000);
            }
        }
    } catch(e) {
        console.error(`Kick error [${chatId}]:`, e.message);
    }

    if (progressId) {
        try { await bot.telegram.deleteMessage(chatId, progressId); } catch(e) {}
    }

    const summary = `🦵 *HASIL KICK*\n\nNomor: *${cleanPhone}*\n✅ Berhasil di-kick: ${kicked} grup\n❌ Gagal: ${failed} grup\n⚪ Tidak ada di grup: ${notFound} grup`;
    const detail = kickResults.length > 0 ? `\n\n*Detail:*\n${kickResults.join('\n')}` : '';

    await bot.telegram.sendMessage(chatId, summary + detail, { parse_mode: 'Markdown' });
}

// ─────────────────────────────────────────────
// GET ALL LINKS ENGINE (diperbaiki + delay)
// ─────────────────────────────────────────────
async function getAllGroupLinks(chatId) {
    const sock = sockets.get(chatId);
    const tr = t(chatId);
    if (!sock) {
        await bot.telegram.sendMessage(chatId, tr.no_session);
        return;
    }

    let progressId = null;
    try {
        const m = await bot.telegram.sendMessage(chatId, '🔍 Mengambil daftar semua grup...');
        progressId = m.message_id;
    } catch(e) {}

    await humanDelay(500, 1000);

    try {
        const groups = await sock.groupFetchAllParticipating();
        const entries = Object.entries(groups);

        if (entries.length === 0) {
            if (progressId) { try { await bot.telegram.deleteMessage(chatId, progressId); } catch(e) {} }
            await bot.telegram.sendMessage(chatId, 'ℹ️ Tidak ada grup yang ditemukan.');
            return;
        }

        if (progressId) {
            try {
                await bot.telegram.editMessageText(chatId, progressId, null,
                    `📋 Ditemukan *${entries.length}* grup. Mengambil link...\n_(Proses bertahap untuk keamanan akun)_`,
                    { parse_mode: 'Markdown' });
            } catch(e) {}
        }

        const lines = [];
        let processed = 0;

        for (const [id, group] of entries) {
            processed++;

            // Update progress setiap 5 grup
            if (progressId && processed % 5 === 0) {
                try {
                    await bot.telegram.editMessageText(chatId, progressId, null,
                        `⏳ Mengambil link *${processed}/${entries.length}*...`,
                        { parse_mode: 'Markdown' });
                } catch(e) {}
            }

            try {
                const code = await sock.groupInviteCode(id);
                lines.push(`• *${group.subject}*\n🔗 https://chat.whatsapp.com/${code}\n🆔 \`${id}\``);
            } catch(e) {
                // Jika tidak bisa ambil link (bukan admin)
                lines.push(`• *${group.subject}*\n⚠️ Tidak bisa ambil link (bukan admin)\n🆔 \`${id}\``);
            }

            // Delay manusiawi antar request
            if (processed < entries.length) await humanDelay(300, 800);
        }

        if (progressId) { try { await bot.telegram.deleteMessage(chatId, progressId); } catch(e) {} }

        // Kirim hasil - pecah jika terlalu panjang
        const header = `🔗 *SEMUA LINK GRUP (${lines.length})*\n\n`;
        let chunk = header;

        for (let i = 0; i < lines.length; i++) {
            const addition = lines[i] + '\n\n';
            if ((chunk + addition).length > 4000) {
                await bot.telegram.sendMessage(chatId, chunk.trim(), { parse_mode: 'Markdown' });
                await humanDelay(500, 1000);
                chunk = addition;
            } else {
                chunk += addition;
            }
        }
        if (chunk.trim()) {
            await bot.telegram.sendMessage(chatId, chunk.trim(), { parse_mode: 'Markdown' });
        }

    } catch(e) {
        console.error(`Get links error [${chatId}]:`, e.message);
        if (progressId) { try { await bot.telegram.deleteMessage(chatId, progressId); } catch(err) {} }
        await bot.telegram.sendMessage(chatId, '❌ Gagal mengambil daftar grup. Coba lagi.');
    }
}

// ─────────────────────────────────────────────
// BROADCAST ENGINE
// ─────────────────────────────────────────────
async function runBroadcast(ctx, type) {
    const users = Object.keys(db.users);
    let success = 0;
    await ctx.reply(`⏳ Broadcast ke ${users.length} user...`);
    for (const tid of users) {
        try {
            if (type === 'photo') {
                await bot.telegram.sendPhoto(tid, ctx.message.photo.pop().file_id, { caption: ctx.message.caption || '' });
            } else {
                await bot.telegram.sendMessage(tid, ctx.message.text);
            }
            success++;
            await delay(100);
        } catch(e) {}
    }
    await ctx.reply(`✅ Broadcast selesai. Sukses: ${success}/${users.length}`);
}

// ─────────────────────────────────────────────
// INPUT HANDLER
// ─────────────────────────────────────────────
async function handleInputs(ctx) {
    // Hanya proses pesan dari chat PRIBADI - diam total di grup
    if (ctx.chat.type !== 'private') return;

    const chatId = ctx.chat.id;
    if (!db.users[chatId]) db.users[chatId] = { lang: 'ID' };
    const user = db.users[chatId];
    const tr = t(chatId);

    // ── ADMIN STEPS ──
    if (chatId === ADMIN_ID) {
        if (user.step === 'admin_add_id') {
            const inputId = ctx.message.text?.trim();
            if (!inputId || !/^\d+$/.test(inputId)) return ctx.reply('⚠️ ID tidak valid. Masukkan angka ID Telegram.');
            user.tmpAddId = inputId;
            user.step = 'admin_add_days';
            saveDb();
            return ctx.reply('🔢 Masukkan jumlah hari akses:');
        }
        if (user.step === 'admin_add_days') {
            const days = parseInt(ctx.message.text);
            if (isNaN(days) || days < 1) return ctx.reply('⚠️ Masukkan angka hari yang valid (min 1).');
            const targetId = user.tmpAddId;
            const expiry = Date.now() + (days * 86400000);
            if (!db.users[targetId]) db.users[targetId] = { lang: 'ID' };
            db.users[targetId].expiry = expiry;
            user.step = null; user.tmpAddId = null;
            saveDb();
            return ctx.reply(`✅ User *${targetId}* didaftarkan *${days} hari*\nAktif hingga: ${new Date(expiry).toLocaleDateString('id-ID')}`, { parse_mode: 'Markdown' });
        }
        if (user.step === 'admin_bc_text') {
            user.step = null; saveDb();
            return runBroadcast(ctx, 'text');
        }
        if (user.step === 'admin_bc_photo') {
            if (!ctx.message.photo) return ctx.reply('⚠️ Harap kirim foto, bukan file.');
            user.step = null; saveDb();
            return runBroadcast(ctx, 'photo');
        }
    }

    // ── USER STEPS ──
    // Jika tidak ada step aktif & bukan dokumen → diam, jangan balas
    if (!user.step && !ctx.message?.document) return;

    if (user.step === 'input_phone') {
        const phone = ctx.message.text?.trim().replace(/[^0-9]/g, '');
        if (!phone || phone.length < 8 || phone.length > 15) {
            return ctx.reply('⚠️ Nomor tidak valid. Contoh: 62812xxxxxxxx');
        }
        user.step = null; saveDb();
        await ctx.reply('⏳ Menghubungkan ke WhatsApp...');
        enqueueTask(chatId, () => startWhatsApp(chatId, phone));

    } else if (user.step === 'input_gname') {
        const rawName = ctx.message.text?.trim();
        if (!rawName) return ctx.reply('⚠️ Nama grup tidak boleh kosong.');
        const cleanName = rawName.replace(/#/g, '').trim();
        if (!cleanName) return ctx.reply('⚠️ Nama grup tidak valid.');
        user.tmpGName = cleanName;
        user.step = 'input_count';
        saveDb();
        await ctx.reply(`✅ Nama Grup: *${cleanName}*\n\n${tr.input_count}`, { parse_mode: 'Markdown' });

    } else if (user.step === 'input_count') {
        const count = parseInt(ctx.message.text);
        if (isNaN(count) || count < 1 || count > 30) {
            return ctx.reply('⚠️ Masukkan angka antara 1 sampai 30.');
        }
        if (!sockets.has(chatId)) return ctx.reply(tr.no_session);

        const baseName = user.tmpGName;
        const settings = user.tmpGroupSettings || defaultGroupSettings();
        user.step = null; user.tmpGName = null; user.tmpGroupSettings = null;
        saveDb();

        const preview = count === 1
            ? buildGroupName(baseName, 1, 1)
            : count <= 3
                ? Array.from({length: count}, (_, i) => buildGroupName(baseName, i+1, count)).join('\n')
                : `${buildGroupName(baseName, 1, count)}\n${buildGroupName(baseName, 2, count)}\n...\n${buildGroupName(baseName, count, count)}`;

        // Tampilkan ringkasan pengaturan
        const settingsSummary = `⚙️ *Pengaturan Grup:*\n` +
            `• Edit Info: ${settings.editInfo ? '👑 Hanya Admin' : '👤 Semua Anggota'}\n` +
            `• Kirim Pesan: ${settings.sendMessages ? '👑 Hanya Admin' : '👤 Semua Anggota'}\n` +
            `• Tambah Anggota: ${settings.addMembers ? '👑 Hanya Admin' : '👤 Semua Anggota'}\n` +
            `• Setujui Anggota Baru: ${settings.approveJoin ? '🔒 Perlu Persetujuan' : '🔓 Otomatis'}\n\n`;

        await ctx.reply(
            `📋 *Preview nama grup:*\n${preview}\n\n${settingsSummary}⏳ Sedang diproses...`,
            { parse_mode: 'Markdown' }
        );

        enqueueTask(chatId, () => createGroups(chatId, baseName, count, settings));

    } else if (user.step === 'input_join') {
        const sock = sockets.get(chatId);
        if (!sock) return ctx.reply(tr.no_session);
        try {
            const link = ctx.message.text?.trim();
            const code = link.includes('chat.whatsapp.com/')
                ? link.split('chat.whatsapp.com/')[1].split(/[?\s]/)[0]
                : link;
            await sock.groupAcceptInvite(code);
            ctx.reply('✅ Berhasil bergabung ke grup!');
        } catch(e) {
            ctx.reply('❌ Gagal bergabung. Pastikan link valid dan masih aktif.');
        }
        user.step = null; saveDb();

    } else if (user.step === 'input_leave') {
        const sock = sockets.get(chatId);
        if (!sock) return ctx.reply(tr.no_session);
        const raw = ctx.message.text?.trim();

        // Validasi wajib link WhatsApp
        if (!raw || !raw.includes('chat.whatsapp.com/')) {
            return ctx.reply(
                '⚠️ *Bukan link grup WhatsApp!*\n\n' +
                'Kirim link yang benar:\n`https://chat.whatsapp.com/AbcXyz123`',
                { parse_mode: 'Markdown' }
            );
        }

        const inviteCode = raw.split('chat.whatsapp.com/')[1].split(/[?\s/#]/)[0].trim();
        try {
            const groupInfo = await sock.groupGetInviteInfo(inviteCode);
            const groupJid = groupInfo.id;
            await sock.groupLeave(groupJid);
            ctx.reply(`✅ Berhasil keluar dari grup *${groupInfo.subject || groupJid}*!`, { parse_mode: 'Markdown' });
        } catch(e) {
            ctx.reply(
                '❌ *Gagal keluar dari grup.*\n\n' +
                'Kemungkinan:\n• Link kadaluarsa\n• Bot tidak ada di grup\n• Link tidak valid',
                { parse_mode: 'Markdown' }
            );
        }
        user.step = null; saveDb();

    } else if (user.step === 'input_kick') {
        // Normalisasi: hapus non-digit dan leading 0
        const phone = ctx.message.text?.trim().replace(/[^0-9]/g, '').replace(/^0+/, '');
        if (!phone || phone.length < 8 || phone.length > 15) {
            return ctx.reply('⚠️ Nomor tidak valid.\n\nPastikan format benar, contoh:\n• 62812xxxxxxxx (Indonesia)\n• 1212xxxxxxx (US)');
        }
        user.step = null; saveDb();

        await ctx.reply(
            `🦵 Memulai kick nomor *${phone}* dari semua grup...\n_(Proses bertahap untuk keamanan akun)_`,
            { parse_mode: 'Markdown' }
        );
        enqueueTask(chatId, () => kickFromAllGroups(chatId, phone));

    } else if (user.step === 'am_upload_admin') {
        // ── File 1: ADMIN.vcf ──
        const doc = ctx.message.document;
        if (!doc) return ctx.reply('⚠️ Harap kirim file ADMIN.vcf');

        try {
            const fileContent = await downloadTelegramFile(doc.file_id);
            const contacts = parseVcf(fileContent);

            if (contacts.length === 0) {
                return ctx.reply('❌ Tidak ada kontak valid di file. Pastikan format VCF benar.');
            }

            // Pisahkan Admin dan Navy berdasarkan nama
            const admins = contacts.filter(c => c.name.toLowerCase().includes('admin'));
            const navys = contacts.filter(c => c.name.toLowerCase().includes('navy'));
            const others = contacts.filter(c =>
                !c.name.toLowerCase().includes('admin') &&
                !c.name.toLowerCase().includes('navy')
            );

            user.tmpAdminContacts = contacts;
            user.step = 'am_upload_ctc';
            saveDb();

            // Tampilkan isi file
            const adminNames = admins.map(c => `• ${c.name}`).join('\n') || '(tidak ada)';
            const navyNames = navys.map(c => `• ${c.name}`).join('\n') || '(tidak ada)';

            const previewMsg =
                `✅ *File ADMIN.vcf diterima!*\n\n` +
                `👑 *Nama Admin:*\n${adminNames}\n\n` +
                `⚓ *Nama Navy:*\n${navyNames}\n\n` +
                `📊 *Jumlah Admin:* ${admins.length}\n` +
                `📊 *Jumlah Navy:* ${navys.length}\n` +
                `📊 *Total kontak:* ${contacts.length}\n\n` +
                `📄 Sekarang kirim *File ke-2* berisi kontak CTC (file VCF bebas nama):`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ NEXT → Kirim File CTC', 'am_confirm_admin')],
                [Markup.button.callback('❌ Batal', 'back_home')]
            ]);

            await ctx.reply(previewMsg, { parse_mode: 'Markdown', ...keyboard });

        } catch(e) {
            console.error('Admin VCF error:', e.message);
            ctx.reply('❌ Gagal membaca file. Pastikan format VCF valid.');
        }

    } else if (user.step === 'am_upload_ctc') {
        // ── File 2: CTC.vcf ──
        const doc = ctx.message.document;
        if (!doc) return ctx.reply('⚠️ Harap kirim file VCF kontak CTC.');

        try {
            const fileContent = await downloadTelegramFile(doc.file_id);
            const contacts = parseVcf(fileContent);

            if (contacts.length === 0) {
                return ctx.reply('❌ Tidak ada kontak valid di file VCF.');
            }

            // Tampilkan nama file dan info kontak
            const fileName = doc.file_name || 'kontak.vcf';
            user.tmpCTCContacts = contacts;
            user.step = 'am_input_total';
            saveDb();

            const preview = contacts.slice(0, 5).map(c => `• ${c.name}`).join('\n');
            const moreCount = contacts.length > 5 ? `\n_...dan ${contacts.length - 5} kontak lainnya_` : '';

            await ctx.reply(
                `✅ *File CTC diterima!*\n\n` +
                `📄 *Nama file:* ${fileName}\n` +
                `👤 *Nama CTC (preview):*\n${preview}${moreCount}\n\n` +
                `📊 *Jumlah kontak:* *${contacts.length}*\n\n` +
                `🔢 *Berapa kontak yang ingin dimasukkan ke grup?*\n` +
                `_(Maks ${contacts.length}, ketik angka)_`,
                { parse_mode: 'Markdown' }
            );

        } catch(e) {
            console.error('CTC VCF error:', e.message);
            ctx.reply('❌ Gagal membaca file VCF. Coba lagi.');
        }

    } else if (user.step === 'am_input_total') {
        // ── Input jumlah total kontak yang dimasukkan ──
        const total = parseInt(ctx.message.text);
        const maxContacts = user.tmpCTCContacts?.length || 0;

        if (isNaN(total) || total < 1) {
            return ctx.reply('⚠️ Masukkan angka yang valid.');
        }
        if (total > maxContacts) {
            return ctx.reply(`⚠️ Maksimal ${maxContacts} kontak (sesuai isi file).`);
        }

        // Potong kontak sesuai jumlah yang diminta
        user.tmpCTCContacts = user.tmpCTCContacts.slice(0, total);
        user.step = 'am_input_batch';
        saveDb();

        await ctx.reply(
            `✅ *${total}* kontak akan dimasukkan.\n\n` +
            `📦 *Berapa kontak per proses?*\n\n` +
            `Pilih atau ketik angka custom:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                [Markup.button.callback('1', 'am_batch_1'), Markup.button.callback('2', 'am_batch_2'), Markup.button.callback('3', 'am_batch_3')],
                [Markup.button.callback('5', 'am_batch_5'), Markup.button.callback('10', 'am_batch_10')],
                [Markup.button.callback('✏️ Custom (ketik angka)', 'am_batch_custom')]
            ])}
        );

    } else if (user.step === 'am_input_batch_custom') {
        // ── Input batch size custom ──
        const batchSize = parseInt(ctx.message.text);
        if (isNaN(batchSize) || batchSize < 1 || batchSize > 20) {
            return ctx.reply('⚠️ Angka batch 1-20.');
        }
        user.tmpBatchSize = batchSize;
        user.step = null;
        saveDb();
        await showGroupSelection(ctx, chatId);

    } else if (user.step === 'am_input_link') {
        // ── Input link grup WhatsApp ──
        const raw = ctx.message.text?.trim();

        // Wajib link WhatsApp - tolak jika bukan
        if (!raw || !raw.includes('chat.whatsapp.com/')) {
            return ctx.reply(
                '⚠️ *Bukan link grup WhatsApp!*\n\n' +
                'Kirim link yang benar, contoh:\n' +
                '`https://chat.whatsapp.com/AbcXyz123456`\n\n' +
                '📌 Cek link di: Info Grup → Link Undangan Grup',
                { parse_mode: 'Markdown' }
            );
        }

        const sock = sockets.get(chatId);
        if (!sock) {
            user.step = null; saveDb();
            return ctx.reply(t(chatId).no_session);
        }

        // Ekstrak kode undangan
        const inviteCode = raw.split('chat.whatsapp.com/')[1].split(/[?\s/#]/)[0].trim();
        if (!inviteCode || inviteCode.length < 5) {
            return ctx.reply('⚠️ Kode link tidak valid. Pastikan link lengkap.');
        }

        await ctx.reply('⏳ Memeriksa link grup...');

        let groupInfo;
        try {
            groupInfo = await sock.groupGetInviteInfo(inviteCode);
        } catch(e) {
            return ctx.reply(
                '❌ *Gagal membaca link grup.*\n\n' +
                'Kemungkinan:\n' +
                '• Link sudah kadaluarsa / di-reset\n' +
                '• Bot belum ada di dalam grup\n' +
                '• Link tidak valid\n\n' +
                'Coba kirim link lagi.',
                { parse_mode: 'Markdown' }
            );
        }

        const targetGroup = { id: groupInfo.id, name: groupInfo.subject || groupInfo.id };
        const ctcContacts = user.tmpCTCContacts;
        const adminContacts = user.tmpAdminContacts || [];
        const batchSize = user.tmpBatchSize || 5;
        const mode = user.tmpAddMode;

        if (!ctcContacts || ctcContacts.length === 0) {
            user.step = null; saveDb();
            return ctx.reply('⚠️ Data kontak tidak ditemukan. Mulai ulang dari awal.');
        }

        // Bersihkan semua temp data
        user.step = null; user.tmpCTCContacts = null; user.tmpAdminContacts = null;
        user.tmpGroups = null; user.tmpBatchSize = null; user.tmpAddMode = null;
        saveDb();

        const totalAll = ctcContacts.length + adminContacts.length;
        const estTime = Math.ceil(totalAll * 0.7 / 60); // estimasi menit

        await ctx.reply(
            `✅ *Grup ditemukan!*\n\n` +
            `📁 *${targetGroup.name}*\n\n` +
            (adminContacts.length > 0 ? `👑 Admin+Navy: *${adminContacts.length}* kontak\n` : '') +
            `👤 CTC: *${ctcContacts.length}* kontak\n` +
            `📦 Batch: *${batchSize}* per proses\n` +
            `⏱️ Estimasi selesai: *~${estTime} menit*\n\n` +
            `🚀 Proses dimulai di background...`,
            { parse_mode: 'Markdown' }
        );

        enqueueTask(chatId, async () => {
            if (mode === 'full' && adminContacts.length > 0) {
                await autoAddMembersToGroups(chatId, adminContacts, [targetGroup], batchSize);
            }
            await autoAddMembersToGroups(chatId, ctcContacts, [targetGroup], batchSize);
        });
    }
}

// ─────────────────────────────────────────────
// BOT COMMANDS
// ─────────────────────────────────────────────
bot.start((ctx) => {
    // Hanya respon /start dari chat pribadi - diam total di grup
    if (ctx.chat.type !== 'private') return;
    const chatId = ctx.chat.id;
    const isNewUser = !db.users[chatId];

    if (isNewUser) {
        // User baru - beri akses 4 hari gratis
        const expiry = Date.now() + (4 * 86400000);
        db.users[chatId] = { lang: 'ID', expiry };
        saveDb();

        // Kirim pesan selamat datang
        const welcomeMsg = 
            '🎉 *Selamat Datang!*\n\n' +
            'Anda mendapatkan akses *GRATIS 4 HARI* untuk mencoba bot ini.\n\n' +
            '📅 Aktif hingga: *' + new Date(expiry).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) + '*\n\n' +
            'Untuk perpanjang akses, hubungi Admin @XIXI8778\n\n' +
            '_Gunakan menu di bawah untuk memulai:_';
        ctx.replyWithMarkdown(welcomeMsg);
    } else if (!db.users[chatId]) {
        db.users[chatId] = { lang: 'ID' };
        saveDb();
    }

    const { text, keyboard } = getMenuUI(chatId);
    ctx.replyWithMarkdown(text, keyboard);
});

bot.command('menu', (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!db.users[ctx.chat.id]) db.users[ctx.chat.id] = { lang: 'ID' };
    saveDb();
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.replyWithMarkdown(text, keyboard);
});

bot.command('owner', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses Ditolak!');
    const { text, keyboard } = getAdminMenuUI();
    ctx.replyWithMarkdown(text, keyboard);
});

// ─────────────────────────────────────────────
// GROUP SETTINGS ACTIONS
// ─────────────────────────────────────────────
function toggleSetting(ctx, key) {
    const chatId = ctx.chat.id;
    ctx.answerCbQuery();
    if (!db.users[chatId].tmpGroupSettings) {
        db.users[chatId].tmpGroupSettings = defaultGroupSettings();
    }
    // warmup default true, toggle perlu handle undefined juga
    const current = db.users[chatId].tmpGroupSettings[key];
    db.users[chatId].tmpGroupSettings[key] = (current === undefined) ? false : !current;
    saveDb();
    const settings = db.users[chatId].tmpGroupSettings;
    const tr = t(chatId);
    const text = buildSettingsText(settings, tr);
    const keyboard = buildSettingsKeyboard(settings, tr);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
}

bot.action('gs_editInfo', (ctx) => toggleSetting(ctx, 'editInfo'));
bot.action('gs_sendMessages', (ctx) => toggleSetting(ctx, 'sendMessages'));
bot.action('gs_addMembers', (ctx) => toggleSetting(ctx, 'addMembers'));
bot.action('gs_approveJoin', (ctx) => toggleSetting(ctx, 'approveJoin'));

bot.action('gs_warmup', (ctx) => toggleSetting(ctx, 'warmup'));

bot.action('gs_next', (ctx) => {
    const chatId = ctx.chat.id;
    ctx.answerCbQuery();
    if (!db.users[chatId].tmpGroupSettings) {
        db.users[chatId].tmpGroupSettings = defaultGroupSettings();
    }
    db.users[chatId].step = 'input_gname';
    saveDb();
    ctx.reply(t(chatId).input_gname, { parse_mode: 'Markdown' });
});

// ─────────────────────────────────────────────
// ADMIN ACTIONS
// ─────────────────────────────────────────────
bot.action('admin_panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    const { text, keyboard } = getAdminMenuUI();
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('admin_add', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    db.users[ADMIN_ID].step = 'admin_add_id'; saveDb();
    ctx.reply('🆔 Masukkan ID Telegram user baru:');
});

bot.action('admin_stop_list', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    const active = Object.keys(db.users).filter(id => db.users[id]?.expiry > Date.now());
    if (active.length === 0) {
        return ctx.editMessageText('⚠️ Tidak ada user aktif.', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_panel')]]));
    }
    const buttons = active.map(id => {
        const exp = new Date(db.users[id].expiry).toLocaleDateString('id-ID');
        return [Markup.button.callback(`❌ ${id} (${exp})`, `del_user_${id}`)];
    });
    buttons.push([Markup.button.callback('⬅️ Kembali', 'admin_panel')]);
    ctx.editMessageText('📋 *Hapus Akses User:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/del_user_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    const targetId = ctx.match[1];
    if (db.users[targetId]) { delete db.users[targetId].expiry; saveDb(); }
    if (sockets.has(Number(targetId))) {
        try { sockets.get(Number(targetId)).end(); } catch(e) {}
        sockets.delete(Number(targetId));
        notified.delete(Number(targetId));
    }
    const sDir = path.join(__dirname, 'sessions', `session-${targetId}`);
    if (fs.existsSync(sDir)) fs.rmSync(sDir, { recursive: true, force: true });
    try { await bot.telegram.sendMessage(targetId, '⚠️ Akses Anda telah dicabut oleh Admin.'); } catch(e) {}
    ctx.answerCbQuery(`User ${targetId} dihapus!`, { show_alert: true });
    ctx.editMessageText(`✅ Akses user ${targetId} dihapus.`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_stop_list')]]));
});

bot.action('admin_bc_text', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    db.users[ADMIN_ID].step = 'admin_bc_text'; saveDb();
    ctx.reply('📢 Ketik pesan broadcast:');
});

bot.action('admin_bc_photo', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    db.users[ADMIN_ID].step = 'admin_bc_photo'; saveDb();
    ctx.reply('🖼️ Kirim foto dengan caption untuk broadcast:');
});

bot.action('admin_stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    const sessions = fs.existsSync('./sessions') ? fs.readdirSync('./sessions').filter(f => f.startsWith('session-')).length : 0;
    const ram = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const uptime = Math.floor((Date.now() - START_TIME) / 1000);
    const uptimeStr = `${Math.floor(uptime/3600)}j ${Math.floor((uptime%3600)/60)}m ${uptime%60}s`;
    const totalUsers = Object.keys(db.users).length;
    const activeUsers = Object.keys(db.users).filter(id => db.users[id]?.expiry > Date.now()).length;
    const text = `📊 *SERVER STATISTICS v6.0*\n\n` +
        `🔌 Sesi WA Aktif: ${sockets.size}\n👥 Total User: ${totalUsers} (Aktif: ${activeUsers})\n` +
        `📁 Sesi Tersimpan: ${sessions}\n🧠 RAM: ${ram} MB\n⏱️ Uptime: ${uptimeStr}\n` +
        `🌐 OS: ${os.platform()} ${os.arch()} | Node: ${process.version}`;
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_panel')]]) });
});

bot.action('admin_list_active', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    ctx.answerCbQuery();
    const active = Object.keys(db.users).filter(id => db.users[id]?.expiry > Date.now());
    if (active.length === 0) return ctx.editMessageText('📋 Tidak ada user aktif.', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_panel')]]));
    let msg = "📋 *DAFTAR USER AKTIF*\n\n";
    active.forEach((id, i) => {
        const exp = new Date(db.users[id].expiry).toLocaleDateString('id-ID');
        const wa = sockets.has(parseInt(id)) ? '🟢' : '🔴';
        msg += `${i+1}. ${wa} \`${id}\` (s/d ${exp})\n`;
    });
    ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_panel')]]) });
});

// ─────────────────────────────────────────────
// COMMON ACTIONS
// ─────────────────────────────────────────────
bot.action('switch_lang', (ctx) => {
    ctx.answerCbQuery();
    const tr = t(ctx.chat.id);
    ctx.editMessageText(tr.choose_lang, Markup.inlineKeyboard([
        [Markup.button.callback('🇮🇩 Bahasa Indonesia', 'set_lang_id'), Markup.button.callback('🇬🇧 English', 'set_lang_en')],
        [Markup.button.callback(tr.back, 'back_home')]
    ]));
});

bot.action('set_lang_id', (ctx) => {
    ctx.answerCbQuery();
    if (!db.users[ctx.chat.id]) db.users[ctx.chat.id] = {};
    db.users[ctx.chat.id].lang = 'ID'; saveDb();
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('set_lang_en', (ctx) => {
    ctx.answerCbQuery();
    if (!db.users[ctx.chat.id]) db.users[ctx.chat.id] = {};
    db.users[ctx.chat.id].lang = 'EN'; saveDb();
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('back_home', (ctx) => {
    ctx.answerCbQuery();
    if (!db.users[ctx.chat.id]) db.users[ctx.chat.id] = { lang: 'ID' };
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('login_menu', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const tr = t(ctx.chat.id);
    ctx.editMessageText('Pilih metode Login WhatsApp:', Markup.inlineKeyboard([
        [Markup.button.callback('📸 QR Code', 'login_qr'), Markup.button.callback('🔢 Pairing Code', 'login_pairing')],
        [Markup.button.callback(tr.back, 'back_home')]
    ]));
});

bot.action('login_qr', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    ctx.reply(t(ctx.chat.id).wait_qr);
    enqueueTask(ctx.chat.id, () => startWhatsApp(ctx.chat.id, null, true));
});

bot.action('login_pairing', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    db.users[ctx.chat.id].step = 'input_phone'; saveDb();
    ctx.reply(t(ctx.chat.id).input_phone);
});

// BUAT GRUP - tampilkan pengaturan grup dulu
bot.action('create_prompt', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    if (!sockets.has(chatId)) {
        return ctx.editMessageText(
            '❌ *WhatsApp belum terhubung!*\n\nSilakan Login terlebih dahulu.',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Login Sekarang', 'login_menu'), Markup.button.callback('⬅️ Kembali', 'back_home')]]) }
        );
    }
    // Reset pengaturan grup ke default
    db.users[chatId].tmpGroupSettings = defaultGroupSettings();
    saveDb();
    const settings = db.users[chatId].tmpGroupSettings;
    const tr = t(chatId);
    const text = buildSettingsText(settings, tr);
    const keyboard = buildSettingsKeyboard(settings, tr);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('join_prompt', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    if (!sockets.has(ctx.chat.id)) {
        return ctx.editMessageText('❌ *WhatsApp belum terhubung!*\n\nSilakan Login terlebih dahulu.',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Login Sekarang', 'login_menu'), Markup.button.callback('⬅️ Kembali', 'back_home')]]) });
    }
    db.users[ctx.chat.id].step = 'input_join'; saveDb();
    ctx.reply(t(ctx.chat.id).input_join);
});

bot.action('leave_prompt', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    if (!sockets.has(ctx.chat.id)) {
        return ctx.editMessageText('❌ *WhatsApp belum terhubung!*\n\nSilakan Login terlebih dahulu.',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Login Sekarang', 'login_menu'), Markup.button.callback('⬅️ Kembali', 'back_home')]]) });
    }
    db.users[ctx.chat.id].step = 'input_leave'; saveDb();
    ctx.editMessageText(
        '🚪 *KELUAR GRUP*\n\n' +
        '🔗 Kirim *link grup* WhatsApp yang ingin ditinggalkan.\n\n' +
        '_Contoh:_\n`https://chat.whatsapp.com/AbcXyz123456`\n\n' +
        '📌 Cara ambil link: buka grup → Info Grup → Link Undangan',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'back_home')]]) }
    );
});

// KICK
bot.action('kick_prompt', (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    if (!sockets.has(chatId)) {
        return ctx.editMessageText('❌ *WhatsApp belum terhubung!*\n\nSilakan Login terlebih dahulu.',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Login Sekarang', 'login_menu'), Markup.button.callback('⬅️ Kembali', 'back_home')]]) });
    }
    db.users[chatId].step = 'input_kick'; saveDb();
    ctx.reply(t(chatId).input_kick, { parse_mode: 'Markdown' });
});

bot.action('logout_wa', async (ctx) => {
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    const tr = t(chatId);
    const sock = sockets.get(chatId);
    if (sock) {
        try { await sock.logout(); } catch(e) {}
        try { sock.end(); } catch(e) {}
        sockets.delete(chatId);
        notified.delete(chatId);
    }
    const sDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    if (fs.existsSync(sDir)) fs.rmSync(sDir, { recursive: true, force: true });
    ctx.reply(tr.logout_done);
});

bot.action('get_links', async (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    if (!sockets.has(chatId)) {
        return ctx.editMessageText('❌ *WhatsApp belum terhubung!*\n\nSilakan Login terlebih dahulu.',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Login Sekarang', 'login_menu'), Markup.button.callback('⬅️ Kembali', 'back_home')]]) });
    }
    enqueueTask(chatId, () => getAllGroupLinks(chatId));
});


// ─────────────────────────────────────────────
// AUTO ADD MEMBER ENGINE v2 - VCF Support
// ─────────────────────────────────────────────

// Parse file VCF → array { name, phone }
function parseVcf(text) {
    const contacts = [];
    const cards = text.split(/BEGIN:VCARD/i).filter(c => c.trim());
    for (const card of cards) {
        let name = '';
        let phone = '';
        const lines = card.split(/\r?\n/);
        for (const line of lines) {
            if (line.match(/^FN[;:]/i)) {
                name = line.split(':').slice(1).join(':').trim();
            } else if (line.match(/^N[;:]/i) && !name) {
                const parts = line.split(':').slice(1).join(':').split(';');
                name = [parts[1], parts[0]].filter(Boolean).join(' ').trim();
            } else if (line.match(/^TEL[;:]/i)) {
                phone = line.split(':').slice(1).join(':').replace(/[^0-9]/g, '').replace(/^0+/, '');
            }
        }
        if (phone.length >= 8 && phone.length <= 15) {
            contacts.push({ name: name || phone, phone });
        }
    }
    return contacts;
}

// Pesan sambutan batch
const BATCH_WELCOME_MSGS = [
    "Selamat datang anggota baru! Semoga betah ya 👋",
    "Ada anggota baru nih, halo semuanya! 😊",
    "Yuk kenalan sama anggota baru kita 🎉",
    "Semakin ramai semakin seru! Selamat bergabung 🙌",
    "Halo anggota baru, silahkan aktif ya! 🔥",
    "Selamat datang di grup ini! Jangan sungkan 😄",
    "Grup makin lengkap! Selamat datang semua 💪",
    "Welcome to the group! 🌟"
];

// Download file dari Telegram
async function downloadTelegramFile(fileId) {
    const https = require('https');
    const http = require('http');
    const fileLink = await bot.telegram.getFileLink(fileId);
    return new Promise((resolve, reject) => {
        const protocol = fileLink.href.startsWith('https') ? https : http;
        protocol.get(fileLink.href, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });
    });
}

// Engine add member utama - support VCF dengan nama kontak
async function autoAddMembersToGroups(chatId, contacts, targetGroups, batchSize) {
    const sock = sockets.get(chatId);
    if (!sock) {
        await bot.telegram.sendMessage(chatId, t(chatId).no_session);
        return;
    }

    const totalContacts = contacts.length;
    const totalGroups = targetGroups.length;
    const BATCH_DELAY_MIN = 4000;   // 4 detik antar batch
    const BATCH_DELAY_MAX = 7000;   // 7 detik max

    let progressId = null;
    try {
        const m = await bot.telegram.sendMessage(chatId,
            `👥 *AUTO ADD MEMBER DIMULAI*\n\n` +
            `📋 Total kontak: *${totalContacts}*\n` +
            `📁 Target grup: *${totalGroups}*\n` +
            `📦 Per batch: *${batchSize} orang*\n\n` +
            `⏳ Memulai proses...`,
            { parse_mode: 'Markdown' });
        progressId = m.message_id;
    } catch(e) {}

    await humanDelay(500, 1000);

    let totalSuccess = 0;
    let totalInvalid = 0;
    const groupReports = [];

    for (let gi = 0; gi < targetGroups.length; gi++) {
        const { id: groupId, name: groupName } = targetGroups[gi];
        let groupSuccess = 0;
        const contactLog = [];

        for (let i = 0; i < contacts.length; i += batchSize) {
            const batch = contacts.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(contacts.length / batchSize);

            if (progressId) {
                try {
                    await bot.telegram.editMessageText(chatId, progressId, null,
                        `👥 *AUTO ADD*\n📁 Grup *${gi+1}/${totalGroups}*: _${groupName}_\n` +
                        `📦 Batch *${batchNum}/${totalBatches}*\n✅ Masuk: ${groupSuccess} | ❌ Invalid: ${totalInvalid}`,
                        { parse_mode: 'Markdown' });
                } catch(e) {}
            }

            // Add satu per satu
            for (const contact of batch) {
                const jid = `${contact.phone}@s.whatsapp.net`;
                const displayName = contact.name || contact.phone;
                try {
                    const result = await sock.groupParticipantsUpdate(groupId, [jid], 'add');
                    const status = result?.[0]?.status;

                    // Status 200 = sukses, lainnya = gagal tapi TETAP LANJUT
                    if (status === '200' || status === 200 || !status) {
                        groupSuccess++;
                        totalSuccess++;
                        contactLog.push(`✅ ${displayName}`);
                    } else if (status === '403') {
                        // Privacy - tidak bisa di-add, LANJUT
                        totalInvalid++;
                        contactLog.push(`⚠️ ${displayName} (privasi)`);
                    } else if (status === '404') {
                        // Bukan WA - LANJUT
                        totalInvalid++;
                        contactLog.push(`❌ ${displayName} (bukan WA)`);
                    } else if (status === '408') {
                        // Timeout - LANJUT
                        totalInvalid++;
                        contactLog.push(`⚠️ ${displayName} (timeout)`);
                    } else {
                        // Status lain apapun - TETAP LANJUT, jangan kirim undangan
                        totalInvalid++;
                        contactLog.push(`⚠️ ${displayName} (invalid)`);
                    }
                } catch(e) {
                    // Error apapun → LANJUT ke kontak berikutnya
                    totalInvalid++;
                    contactLog.push(`❌ ${displayName} (error)`);
                    console.error(`Add skip [${displayName}]:`, e.message);
                }
                // Delay antar kontak (cepat tapi aman)
                await humanDelay(500, 900);
            }

            // Kirim pesan sambutan setelah tiap batch
            try {
                await sock.sendMessage(groupId, {
                    text: BATCH_WELCOME_MSGS[Math.floor(Math.random() * BATCH_WELCOME_MSGS.length)]
                });
            } catch(e) {}

            // Delay antar batch
            if (i + batchSize < contacts.length) {
                await humanDelay(BATCH_DELAY_MIN, BATCH_DELAY_MAX);
            }
        }

        groupReports.push({ name: groupName, success: groupSuccess, log: contactLog });

        // Jeda antar grup
        if (gi < targetGroups.length - 1) {
            await humanDelay(8000, 12000); // Jeda antar grup
        }
    }

    if (progressId) {
        try { await bot.telegram.deleteMessage(chatId, progressId); } catch(e) {}
    }

    // Kirim laporan per grup
    for (const gr of groupReports) {
        const logText = gr.log.join('\n');
        const summary =
            `✅ *ADD MEMBER SELESAI*\n` +
            `📁 Grup: *${gr.name}*\n\n` +
            `📊 *INFORMASI*\n` +
            `✅ Kontak berhasil dimasukkan: *${gr.success}*\n` +
            `❌ Kontak yang invalid: *${totalInvalid}*\n\n` +
            `📋 *Detail:*\n${logText}`;

        // Kirim per bagian jika panjang
        for (let i = 0; i < summary.length; i += 3800) {
            await bot.telegram.sendMessage(chatId, summary.substring(i, i + 3800), { parse_mode: 'Markdown' });
            if (i + 3800 < summary.length) await humanDelay(300, 500);
        }
    }
}

// ─────────────────────────────────────────────
// ADD MEMBER - Actions & Handlers
// ─────────────────────────────────────────────

bot.action('addmember_prompt', async (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    if (!sockets.has(chatId)) {
        return ctx.editMessageText('❌ *WhatsApp belum terhubung!*\n\nSilakan Login terlebih dahulu.',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Login Sekarang', 'login_menu'), Markup.button.callback('⬅️ Kembali', 'back_home')]]) });
    }

    // Tampilkan 2 pilihan mode add
    ctx.editMessageText(
        `➕ *AUTO ADD MEMBER*\n\nPilih mode penambahan anggota:`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
            [Markup.button.callback('👥 ADD ADMIN + NAVY + CTC', 'am_mode_full')],
            [Markup.button.callback('📋 ADD CTC', 'am_mode_ctc')],
            [Markup.button.callback('⬅️ Kembali', 'back_home')]
        ])}
    );
});

// ── Mode: ADD CTC saja ──
bot.action('am_mode_ctc', async (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    db.users[chatId].tmpAddMode = 'ctc';
    db.users[chatId].step = 'am_upload_ctc';
    saveDb();
    ctx.editMessageText(
        `📋 *MODE: ADD CTC*\n\n` +
        `📄 Kirim file *.vcf* berisi daftar kontak CTC.\n\n` +
        `📌 Bot akan baca nama & nomor dari file VCF\n` +
        `📌 Format nama file bebas (contoh: kontak.vcf)`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'back_home')]]) }
    );
});

// ── Mode: ADD ADMIN + NAVY + CTC ──
bot.action('am_mode_full', async (ctx) => {
    if (!checkAccess(ctx)) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    db.users[chatId].tmpAddMode = 'full';
    db.users[chatId].tmpAdminContacts = null;
    db.users[chatId].step = 'am_upload_admin';
    saveDb();
    ctx.editMessageText(
        `👥 *MODE: ADD ADMIN + NAVY + CTC*\n\n` +
        `📄 *File ke-1:* Kirim file *ADMIN.vcf*\n\n` +
        `File ini berisi kontak Admin & Navy yang akan dijadikan admin grup.`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'back_home')]]) }
    );
});

// ── Handle pilih grup setelah semua file siap ──
async function showGroupSelection(ctx, chatId) {
    const ctcCount = db.users[chatId].tmpCTCContacts?.length || 0;
    const adminCount = db.users[chatId].tmpAdminContacts?.length || 0;

    // Set step untuk menerima link grup
    db.users[chatId].step = 'am_input_link';
    saveDb();

    await ctx.reply(
        `🔗 *MASUKKAN LINK GRUP WhatsApp*\n\n` +
        (adminCount > 0 ? `👑 Admin+Navy: *${adminCount}* kontak\n` : '') +
        `👤 CTC: *${ctcCount}* kontak\n\n` +
        `📌 Kirim link grup tujuan:\n` +
        `_Contoh: https://chat.whatsapp.com/xxxxx_\n\n` +
        `⚠️ Pastikan bot sudah ada di dalam grup tersebut.`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'back_home')]]) }
    );
}

// am_all_groups & am_group removed - now using link input


// ── Batch size actions ──
bot.action('am_confirm_admin', (ctx) => {
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    db.users[chatId].step = 'am_upload_ctc';
    saveDb();
    ctx.reply(
        '📄 Kirim *File ke-2*: file VCF berisi kontak CTC.\n\n' +
        '📌 Nama file bebas (contoh: ctc.vcf, kontak.vcf)',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'back_home')]]) }
    );
});

['1','2','3','5','10'].forEach(n => {
    bot.action(`am_batch_${n}`, async (ctx) => {
        ctx.answerCbQuery();
        const chatId = ctx.chat.id;
        db.users[chatId].tmpBatchSize = parseInt(n);
        db.users[chatId].step = null;
        saveDb();
        await ctx.editMessageText(`✅ Batch size: *${n} kontak/proses*`, { parse_mode: 'Markdown' });
        await showGroupSelection(ctx, chatId);
    });
});

bot.action('am_batch_custom', (ctx) => {
    ctx.answerCbQuery();
    const chatId = ctx.chat.id;
    db.users[chatId].step = 'am_input_batch_custom';
    saveDb();
    ctx.editMessageText('✏️ Ketik jumlah kontak per batch (angka 1-20):', { parse_mode: 'Markdown' });
});

bot.on(['text', 'photo', 'document'], handleInputs);

// Graceful shutdown
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.once('SIGINT', () => bot.stop('SIGINT'));

bot.launch().then(() => {
    console.log('✅ WhatsApp Group Creator Bot v8.0.0 Ready!');
    console.log('🆕 Fitur: Auto Add Member | Warmup | Pengaturan Grup | Kick | Get Links');
    console.log('🔧 Fix: No # di nama grup | Multi-user queue | Human delay | Stable reconnect');
});
