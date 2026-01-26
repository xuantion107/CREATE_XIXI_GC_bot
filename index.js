
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
 * 🤖 WHATSAPP GROUP CREATOR BOT v4.5.0 (ADMIN ENHANCED)
 * Focus: Owner Dashboard, Interactive Buttons, Server Monitoring
 */

// --- [ SETTINGS ] ---
const TG_BOT_TOKEN = '8324023704:AAFnD91Azl7qCMBDNEQmI932n3cXO4d7cMg';
const ADMIN_ID = 8006003898; // GANTI DENGAN ID TELEGRAM ANDA
const bot = new Telegraf(TG_BOT_TOKEN);

const sockets = new Map(); 
const notified = new Set(); 
const START_TIME = Date.now();

const DB_PATH = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, { users: {} });
const db = fs.readJsonSync(DB_PATH);
const saveDb = () => fs.writeJsonSync(DB_PATH, db);

// --- [ TRANSLATIONS ] ---
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
        btn_lang: "🌐 Bahasa",
        btn_owner: "💎 Panel Owner",
        choose_lang: "Pilih bahasa Anda:",
        lang_updated: "✅ Bahasa berhasil diubah ke Bahasa Indonesia!",
        back: "⬅️ Kembali",
        wait_qr: "⏳ Memproses QR, mohon tunggu...",
        input_phone: "🔢 Masukkan nomor WhatsApp Anda (Gunakan kode negara, tanpa +):\nContoh: 62812xxx atau 1226xxx",
        input_gname: "📝 Masukkan Nama Grup yang ingin dibuat:",
        input_count: "🔢 Mau buat berapa grup? (Maks 30):",
        input_join: "➕ Masukkan Link Invite Grup WhatsApp:",
        input_leave: "🚪 Masukkan ID Grup (JID) untuk keluar:",
        connected: "✅ WhatsApp Terhubung! Bot siap digunakan.",
        logout_done: "✅ Logout berhasil dan sesi dihapus."
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
        btn_lang: "🌐 Language",
        btn_owner: "💎 Owner Panel",
        choose_lang: "Choose your language:",
        lang_updated: "✅ Language successfully changed to English!",
        back: "⬅️ Back",
        wait_qr: "⏳ Processing QR, please wait...",
        input_phone: "🔢 Enter your WhatsApp number (Country code, no +):\nExample: 62812xxx or 1226xxx",
        input_gname: "📝 Enter the Group Name to be created:",
        input_count: "🔢 How many groups? (Max 30):",
        input_join: "➕ Enter WhatsApp Group Invite Link:",
        input_leave: "🚪 Enter Group ID (JID) to leave:",
        connected: "✅ WhatsApp Connected! Bot is ready.",
        logout_done: "✅ Logout successful and session cleared."
    }
};

// --- [ HELPERS ] ---

const checkAccess = (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === ADMIN_ID) return true;
    const user = db.users[chatId];
    if (!user || !user.expiry) {
        ctx.reply('⛔ Akses Ditolak. Hubungi Admin (@Fileabdul786) untuk mendaftarkan ID Anda.');
        return false;
    }
    if (Date.now() > user.expiry) {
        ctx.reply('⚠️ Masa aktif akses Anda telah habis. Silakan perpanjang ke Admin.');
        return false;
    }
    return true;
};

const getMenuUI = (chatId) => {
    const isConn = sockets.has(chatId) ? '✅ ONLINE' : '❌ OFFLINE';
    const langCode = db.users[chatId]?.lang || 'ID';
    const t = translations[langCode];
    
    const text = `🤖 *WhatsApp Group Creator Bot*\n\n${t.status}: ${isConn}\n${t.lang}: ${langCode}\n${t.owner}: @Fileabdul786`;

    const row1 = [Markup.button.callback(t.btn_login, 'login_menu'), Markup.button.callback(t.btn_logout, 'logout_wa')];
    const row2 = [Markup.button.callback(t.btn_create, 'create_prompt'), Markup.button.callback(t.btn_links, 'get_links')];
    const row3 = [Markup.button.callback(t.btn_join, 'join_prompt'), Markup.button.callback(t.btn_leave, 'leave_prompt')];
    const row4 = [Markup.button.callback(t.btn_lang, 'switch_lang')];
    
    if (chatId === ADMIN_ID) {
        row4.push(Markup.button.callback(t.btn_owner, 'admin_panel'));
    }

    return { text, keyboard: Markup.inlineKeyboard([row1, row2, row3, row4]) };
};

const getAdminMenuUI = () => {
    const text = "💎 *OWNER DASHBOARD v4.5*\n\nSelamat datang Admin. Gunakan tombol di bawah untuk mengelola bot secara real-time.";
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tambah User', 'admin_add'), Markup.button.callback('❌ Stop User', 'admin_stop_list')],
        [Markup.button.callback('📢 Broadcast Teks', 'admin_bc_text'), Markup.button.callback('🖼️ Broadcast Foto', 'admin_bc_photo')],
        [Markup.button.callback('📊 Statistik Server', 'admin_stats'), Markup.button.callback('📋 Daftar Aktif', 'admin_list_active')],
        [Markup.button.callback('⬅️ Kembali ke Menu Utama', 'back_home')]
    ]);
    
    return { text, keyboard };
};

// --- [ WHATSAPP ENGINE ] ---

async function startWhatsApp(chatId, phone = null, isQR = false) {
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    const langCode = db.users[chatId]?.lang || 'ID';
    const t = translations[langCode];

    if (sockets.has(chatId)) {
        try { sockets.get(chatId).end(); } catch(e) {}
    }

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sockets.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && isQR) {
            try {
                const buf = await QRCode.toBuffer(qr);
                await bot.telegram.sendPhoto(chatId, { source: buf }, { caption: '📸 Scan QR:' });
            } catch (e) {}
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(chatId);
            else { sockets.delete(chatId); notified.delete(chatId); }
        } else if (connection === 'open') {
            if (!notified.has(chatId)) {
                await bot.telegram.sendMessage(chatId, t.connected);
                notified.add(chatId);
            }
        }
    });

    if (phone && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanPhone);
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                await bot.telegram.sendMessage(chatId, `🔢 KODE PAIRING: *${formattedCode}*\n\nMasukkan di WhatsApp Anda.`, { parse_mode: 'Markdown' });
            } catch (err) {
                await bot.telegram.sendMessage(chatId, '❌ Gagal. Coba lagi.');
            }
        }, 3000);
    }
    return sock;
}

// --- [ BROADCAST ENGINE ] ---
async function runBroadcast(ctx, type) {
    const users = Object.keys(db.users);
    let success = 0;
    ctx.reply(`⏳ Memulai broadcast ke ${users.length} user...`);
    
    for (const tid of users) {
        try {
            if (type === 'photo') {
                await bot.telegram.sendPhoto(tid, ctx.message.photo.pop().file_id, { caption: ctx.message.caption });
            } else {
                await bot.telegram.sendMessage(tid, ctx.message.text);
            }
            success++;
        } catch(e) {}
    }
    ctx.reply(`✅ Broadcast Selesai. Sukses: ${success}/${users.length}`);
}

// --- [ HANDLERS ] ---

async function handleInputs(ctx) {
    const chatId = ctx.chat.id;
    const user = db.users[chatId];
    if (!user) return;

    // ADMIN STEPS
    if (chatId === ADMIN_ID) {
        if (user.step === 'admin_add_id') {
            user.tmpAddId = ctx.message.text;
            user.step = 'admin_add_days';
            saveDb();
            return ctx.reply('🔢 Masukkan Jumlah Hari (Angka):');
        }
        if (user.step === 'admin_add_days') {
            const days = parseInt(ctx.message.text);
            if (isNaN(days)) return ctx.reply('⚠️ Harap masukkan angka.');
            const targetId = user.tmpAddId;
            const expiry = Date.now() + (days * 24 * 60 * 60 * 1000);
            db.users[targetId] = { ...db.users[targetId], expiry };
            saveDb();
            user.step = null; saveDb();
            return ctx.reply(`✅ Berhasil mendaftarkan ${targetId} selama ${days} hari.`);
        }
        if (user.step === 'admin_bc_text') {
            user.step = null; saveDb();
            return runBroadcast(ctx, 'text');
        }
        if (user.step === 'admin_bc_photo') {
            if (!ctx.message.photo) return ctx.reply('⚠️ Harap kirim foto.');
            user.step = null; saveDb();
            return runBroadcast(ctx, 'photo');
        }
    }

    // USER STEPS
    const sock = sockets.get(chatId);
    if (user.step === 'input_phone') {
        await startWhatsApp(chatId, ctx.message.text);
        user.step = null; saveDb();
    } else if (user.step === 'input_gname') {
        user.tmpGName = ctx.message.text;
        user.step = 'input_count';
        saveDb();
        ctx.reply(translations[user.lang || 'ID'].input_count);
    } else if (user.step === 'input_count') {
        const count = parseInt(ctx.message.text);
        if (isNaN(count) || count < 1 || count > 30) return ctx.reply('⚠️ 1-30.');
        if (!sock) return ctx.reply('❌ Sesi mati.');
        ctx.reply('Processing...');
        for (let i = 1; i <= count; i++) {
            try {
                await sock.groupCreate(`${user.tmpGName} #${i}`, []);
                await delay(5000);
            } catch(e) {}
        }
        ctx.reply('🎉 Selesai.');
        user.step = null; saveDb();
    } else if (user.step === 'input_join') {
        try {
            const invite = ctx.message.text.split('chat.whatsapp.com/')[1] || ctx.message.text;
            await sock.groupAcceptInvite(invite);
            ctx.reply('✅ Berhasil!');
        } catch(e) { ctx.reply('❌ Error.'); }
        user.step = null; saveDb();
    } else if (user.step === 'input_leave') {
        try {
            await sock.groupLeave(ctx.message.text);
            ctx.reply('✅ Left.');
        } catch(e) { ctx.reply('❌ Error.'); }
        user.step = null; saveDb();
    }
}

// --- [ BOT EVENTS ] ---

bot.start((ctx) => {
    if (!db.users[ctx.chat.id]) db.users[ctx.chat.id] = { lang: 'ID' };
    saveDb();
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.replyWithMarkdown(text, keyboard);
});

bot.command('owner', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Akses Ditolak! Anda bukan Owner.');
    const { text, keyboard } = getAdminMenuUI();
    ctx.replyWithMarkdown(text, keyboard);
});

// --- [ ADMIN ACTIONS ] ---

bot.action('admin_panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Akses Ditolak!', { show_alert: true });
    const { text, keyboard } = getAdminMenuUI();
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('admin_add', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    db.users[ADMIN_ID].step = 'admin_add_id';
    saveDb();
    ctx.reply('🆔 Masukkan ID Telegram user baru:');
});

bot.action('admin_stop_list', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const activeUsers = Object.keys(db.users).filter(id => db.users[id].expiry > Date.now());
    if (activeUsers.length === 0) return ctx.reply('⚠️ Tidak ada user aktif.');
    
    const buttons = activeUsers.map(id => [Markup.button.callback(`❌ Hapus ${id}`, `del_user_${id}`)]);
    buttons.push([Markup.button.callback('⬅️ Kembali', 'admin_panel')]);
    
    ctx.editMessageText("📋 *Hapus Akses User*\nKlik ID di bawah untuk menghapus sesi dan akses permanen:", { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/del_user_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    if (db.users[targetId]) {
        delete db.users[targetId].expiry;
        saveDb();
    }
    // Cleanup Session
    const sDir = path.join(__dirname, 'sessions', `session-${targetId}`);
    if (fs.existsSync(sDir)) fs.rmSync(sDir, { recursive: true, force: true });
    
    ctx.answerCbQuery(`User ${targetId} telah dihapus!`, { show_alert: true });
    ctx.editMessageText(`✅ Berhasil menghapus akses dan sesi user ${targetId}.`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_stop_list')]]));
});

bot.action('admin_bc_text', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    db.users[ADMIN_ID].step = 'admin_bc_text';
    saveDb();
    ctx.reply('📢 Ketik pesan broadcast Anda:');
});

bot.action('admin_bc_photo', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    db.users[ADMIN_ID].step = 'admin_bc_photo';
    saveDb();
    ctx.reply('🖼️ Kirim foto beserta caption untuk broadcast:');
});

bot.action('admin_stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const sessions = fs.existsSync('./sessions') ? fs.readdirSync('./sessions').filter(f => f.startsWith('session-')).length : 0;
    const ram = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const uptime = Math.floor((Date.now() - START_TIME) / 1000);
    const uptimeStr = `${Math.floor(uptime/3600)}j ${Math.floor((uptime%3600)/60)}m ${uptime%60}s`;

    const text = `📊 *SERVER STATISTICS*\n\n🔌 Sesi Aktif: ${sessions}\n🧠 RAM Usage: ${ram} MB\n⏱️ Uptime: ${uptimeStr}\n🌐 OS: ${os.platform()} ${os.release()}`;
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_panel')]]) });
});

bot.action('admin_list_active', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const active = Object.keys(db.users).filter(id => db.users[id].expiry > Date.now());
    let msg = "📋 *DAFTAR USER AKTIF*\n\n";
    active.forEach((id, i) => {
        const exp = new Date(db.users[id].expiry).toLocaleDateString('id-ID');
        msg += `${i+1}. ${id} (Sampai: ${exp})\n`;
    });
    ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'admin_panel')]]) });
});

// --- [ COMMON ACTIONS ] ---

bot.action('switch_lang', (ctx) => {
    const t = translations[db.users[ctx.chat.id]?.lang || 'ID'];
    ctx.editMessageText(t.choose_lang, Markup.inlineKeyboard([
        [Markup.button.callback('🇮🇩 Indonesian', 'set_lang_id'), Markup.button.callback('🇬🇧 English', 'set_lang_en')],
        [Markup.button.callback(t.back, 'back_home')]
    ]));
});

bot.action('set_lang_id', (ctx) => {
    db.users[ctx.chat.id].lang = 'ID'; saveDb();
    ctx.answerCbQuery(translations.ID.lang_updated);
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('set_lang_en', (ctx) => {
    db.users[ctx.chat.id].lang = 'EN'; saveDb();
    ctx.answerCbQuery(translations.EN.lang_updated);
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('back_home', (ctx) => {
    const { text, keyboard } = getMenuUI(ctx.chat.id);
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

// Login, Create, Join, Leave, Links (Reuse existings with language t[key])
bot.action('login_menu', (ctx) => {
    if (!checkAccess(ctx)) return;
    const t = translations[db.users[ctx.chat.id]?.lang || 'ID'];
    ctx.editMessageText('Metode Login:', Markup.inlineKeyboard([
        [Markup.button.callback('📸 QR Code', 'login_qr'), Markup.button.callback('🔢 Pairing Code', 'login_pairing')],
        [Markup.button.callback(t.back, 'back_home')]
    ]));
});

bot.action('login_qr', (ctx) => {
    const t = translations[db.users[ctx.chat.id]?.lang || 'ID'];
    startWhatsApp(ctx.chat.id, null, true);
    ctx.reply(t.wait_qr);
});

bot.action('login_pairing', (ctx) => {
    const t = translations[db.users[ctx.chat.id]?.lang || 'ID'];
    db.users[ctx.chat.id].step = 'input_phone';
    saveDb();
    ctx.reply(t.input_phone);
});

bot.action('create_prompt', (ctx) => {
    if (!checkAccess(ctx)) return;
    db.users[ctx.chat.id].step = 'input_gname';
    saveDb();
    ctx.reply(translations[db.users[ctx.chat.id]?.lang || 'ID'].input_gname);
});

bot.action('join_prompt', (ctx) => {
    if (!checkAccess(ctx)) return;
    db.users[ctx.chat.id].step = 'input_join';
    saveDb();
    ctx.reply(translations[db.users[ctx.chat.id]?.lang || 'ID'].input_join);
});

bot.action('leave_prompt', (ctx) => {
    if (!checkAccess(ctx)) return;
    db.users[ctx.chat.id].step = 'input_leave';
    saveDb();
    ctx.reply(translations[db.users[ctx.chat.id]?.lang || 'ID'].input_leave);
});

bot.action('logout_wa', async (ctx) => {
    const lang = db.users[ctx.chat.id]?.lang || 'ID';
    const sock = sockets.get(ctx.chat.id);
    if (sock) {
        await sock.logout();
        sockets.delete(ctx.chat.id);
        notified.delete(ctx.chat.id);
    }
    const sDir = path.join(__dirname, 'sessions', `session-${ctx.chat.id}`);
    if (fs.existsSync(sDir)) fs.rmSync(sDir, { recursive: true, force: true });
    ctx.reply(translations[lang].logout_done);
});

bot.action('get_links', async (ctx) => {
    if (!checkAccess(ctx)) return;
    const sock = sockets.get(ctx.chat.id);
    if (!sock) return ctx.reply('❌ No session!');
    ctx.reply('Loading...');
    try {
        const groups = await sock.groupFetchAllParticipating();
        let list = '🔗 *LINKS*\n\n';
        for (const [id, group] of Object.entries(groups)) {
            try {
                const code = await sock.groupInviteCode(id);
                list += `• *${group.subject}*\n🔗 https://chat.whatsapp.com/${code}\n🆔 ` + id + `\n\n`;
            } catch(e) {}
        }
        ctx.replyWithMarkdown(list);
    } catch(e) { ctx.reply('Error.'); }
});

bot.on(['text', 'photo'], handleInputs);

bot.launch().then(() => console.log('Bot v4.5.0 Admin Panel Stable Ready'));
        
