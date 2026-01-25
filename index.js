
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

/**
 * ADVANCED MULTI-SENDER WHATSAPP-TELEGRAM ORCHESTRATOR
 * v3.0.0 - Multi-User Fix & Robust Admin Link Extraction
 */

const TG_BOT_TOKEN = '8324023704:AAFnD91Azl7qCMBDNEQmI932n3cXO4d7cMg';
const bot = new Telegraf(TG_BOT_TOKEN);
const sockets = new Map(); // Map untuk menyimpan koneksi unik per chatId
const DB_PATH = path.join(__dirname, 'db.json');

// --- Persistent Database ---
if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, { users: {} });
const db = fs.readJsonSync(DB_PATH);
const saveDb = () => fs.writeJsonSync(DB_PATH, db);

// --- Localization Support ---
const strings = {
    ID: {
        welcome: 'Selamat datang! Kelola WhatsApp Anda via Telegram.\n\nSilakan pilih menu di bawah ini:',
        login_menu: 'Silakan pilih metode masuk:',
        input_num: 'Ketik nomor WA Anda (Contoh: 62812xxx):',
        pairing_code: (code) => `Kode Pairing Anda: *${code}*`,
        qr_msg: 'Scan QR Code ini untuk login:',
        loading: 'Sedang memproses, harap tunggu...',
        connected: '✅ WhatsApp Terhubung!',
        disconnected: '❌ Koneksi terputus.',
        logout_msg: 'Sesi telah dihapus dan logout berhasil.',
        creating_single: (name) => `[${name}] Berhasil di Buat✅`,
        create_summary: (total, requested) => `Total: ${total}/${requested} grup telah selesai dibuat.`,
        lang_switched: 'Bahasa berhasil diubah ke Bahasa Indonesia 🇮🇩',
        export_header: 'DAFTAR LINK GRUP (HANYA ADMIN)\n\n',
        export_item: (name, link, date) => `Nama Group: ${name}\nLink grup: ${link}\nTanggal pembuatan: ${date}\n\n`,
        input_join: 'Kirim link grup WhatsApp (Satu per baris):',
        joining: (link) => `⏳ Mencoba gabung: ${link}`,
        join_fail: (nameOrLink) => `❌ Cannot join [${nameOrLink}]`,
        join_success: (name) => `✅ Berhasil masuk: ${name}`,
        done: 'DONE✅',
        btn: {
            login: '🔐 Masuk',
            logout: '🚪 Keluar',
            create: '👥 Buat Grup',
            links: '🔗 Ambil Link',
            join: '📥 Gabung Grup',
            lang: '🌐 Bahasa',
            back: '⬅️ Kembali'
        },
        menu: {
            ann: 'Batas Pesan',
            lock: 'Kunci Info',
            approve: 'Persetujuan'
        }
    },
    EN: {
        welcome: 'Welcome! Manage your WhatsApp via Telegram.\n\nPlease select a menu below:',
        login_menu: 'Please choose login method:',
        input_num: 'Enter your WA Number (Example: 62812xxx):',
        pairing_code: (code) => `Your Pairing Code: *${code}*`,
        qr_msg: 'Scan this QR Code to login:',
        loading: 'Processing, please wait...',
        connected: '✅ WhatsApp Connected!',
        disconnected: '❌ Connection closed.',
        logout_msg: 'Session deleted and logout successful.',
        creating_single: (name) => `[${name}] Created Successfully✅`,
        create_summary: (total, requested) => `Total: ${total}/${requested} groups have been created.`,
        lang_switched: 'Language successfully switched to English 🇬🇧',
        export_header: 'GROUP LINK LIST (ADMIN ONLY)\n\n',
        export_item: (name, link, date) => `Group Name: ${name}\nGroup link: ${link}\nCreation date: ${date}\n\n`,
        input_join: 'Send WhatsApp group links (One per line):',
        joining: (link) => `⏳ Attempting to join: ${link}`,
        join_fail: (nameOrLink) => `❌ Cannot join [${nameOrLink}]`,
        join_success: (name) => `✅ Successfully joined: ${name}`,
        done: 'DONE✅',
        btn: {
            login: '🔐 Login',
            logout: '🚪 Logout',
            create: '👥 Create Group',
            links: '🔗 Get Links',
            join: '📥 Join Group',
            lang: '🌐 Language',
            back: '⬅️ Back'
        },
        menu: {
            ann: 'Restrict Msg',
            lock: 'Lock Info',
            approve: 'Approval'
        }
    }
};

const getT = (chatId) => strings[db.users[chatId]?.lang || 'ID'];

// --- WhatsApp Core Logic (Multi-Sender Enabled) ---
async function startWA(chatId, phoneNumber = null, isQRMode = false) {
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    // Hapus koneksi lama jika ada sebelum membuat baru (Pencegahan Memory Leak)
    if (sockets.has(chatId)) {
        try { sockets.get(chatId).end(); } catch(e) {}
    }

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Silent agar terminal bersih
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome")
    });

    sockets.set(chatId, sock);

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && isQRMode) {
            try {
                if (db.users[chatId]?.lastQrId) {
                    try { await bot.telegram.deleteMessage(chatId, db.users[chatId].lastQrId); } catch (e) {}
                }
                const buf = await QRCode.toBuffer(qr);
                const msg = await bot.telegram.sendPhoto(chatId, { source: buf }, { caption: getT(chatId).qr_msg });
                if (db.users[chatId]) {
                  db.users[chatId].lastQrId = msg.message_id;
                  saveDb();
                }
            } catch (e) {}
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startWA(chatId, null, false);
            } else {
                sockets.delete(chatId);
                if(db.users[chatId]) {
                    db.users[chatId].isConnected = false;
                    db.users[chatId].lastQrId = null;
                    saveDb();
                }
            }
        } else if (connection === 'open') {
            if (db.users[chatId]) {
                db.users[chatId].isConnected = true;
                saveDb();
                bot.telegram.sendMessage(chatId, getT(chatId).connected);
            }
        }
    });

    if (phoneNumber) {
        await delay(5000);
        const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
        return code;
    }
    return sock;
}

// --- Keyboards ---
const langKbd = () => Markup.inlineKeyboard([
    [Markup.button.callback('🇮🇩 Indonesia', 'set_lang_id')],
    [Markup.button.callback('🇬🇧 English', 'set_lang_en')]
]);

const mainKbd = (chatId) => {
    const t = getT(chatId);
    return Markup.inlineKeyboard([
        [Markup.button.callback(t.btn.login, 'login_menu'), Markup.button.callback(t.btn.logout, 'logout')],
        [Markup.button.callback(t.btn.create, 'create_settings'), Markup.button.callback(t.btn.links, 'get_links')],
        [Markup.button.callback(t.btn.join, 'join_menu'), Markup.button.callback(t.btn.lang, 'switch_lang')]
    ]);
};

// --- Action Handlers ---
bot.start((ctx) => {
    const chatId = ctx.chat.id;
    if (!db.users[chatId]) {
        db.users[chatId] = { 
            lang: null, 
            isConnected: false, 
            lastQrId: null,
            settings: { ann: false, lock: false, approve: false } 
        };
        saveDb();
    }
    if (!db.users[chatId].lang) return ctx.reply('🌐 Pilih Bahasa / Select Language', langKbd());
    ctx.reply(getT(chatId).welcome, mainKbd(chatId));
});

bot.action(/set_lang_(id|en)/, async (ctx) => {
    const lang = ctx.match[1].toUpperCase();
    db.users[ctx.chat.id].lang = lang;
    saveDb();
    const t = strings[lang];
    await ctx.answerCbQuery(t.lang_switched);
    ctx.editMessageText(t.welcome, mainKbd(ctx.chat.id));
});

bot.action('login_menu', (ctx) => {
    const t = getT(ctx.chat.id);
    ctx.editMessageText(t.login_menu, Markup.inlineKeyboard([
        [Markup.button.callback('📸 Scan QR', 'login_qr'), Markup.button.callback('🔢 Pairing Code', 'login_pairing')],
        [Markup.button.callback(t.btn.back, 'back_main')]
    ]));
});

bot.action('login_qr', async (ctx) => {
    await startWA(ctx.chat.id, null, true);
    ctx.reply(getT(ctx.chat.id).loading);
});

bot.action('login_pairing', (ctx) => {
    db.users[ctx.chat.id].step = 'await_num';
    saveDb();
    ctx.reply(getT(ctx.chat.id).input_num);
});

bot.action('logout', async (ctx) => {
    const chatId = ctx.chat.id;
    const sock = sockets.get(chatId);
    if (sock) {
        try { await sock.logout(); } catch (e) {}
        sockets.delete(chatId);
    }
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    if(db.users[chatId]) {
        db.users[chatId].isConnected = false;
        db.users[chatId].lastQrId = null;
        saveDb();
    }
    ctx.reply(getT(chatId).logout_msg);
});

bot.action('get_links', async (ctx) => {
    const chatId = ctx.chat.id;
    const sock = sockets.get(chatId);
    const t = getT(chatId);

    if (!sock || !db.users[chatId].isConnected) return ctx.reply('❌ WhatsApp belum terhubung!');
    ctx.reply(t.loading);

    try {
        const groups = await sock.groupFetchAllParticipating();
        let fullMessage = t.export_header;
        let count = 0;
        
        for (const [id, group] of Object.entries(groups)) {
            try {
                // Mencoba mengambil link hanya jika bot/user adalah admin
                const inviteCode = await sock.groupInviteCode(id);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                const date = new Date(group.creation * 1000).toLocaleString('id-ID');
                const item = t.export_item(group.subject, inviteLink, date);
                
                if ((fullMessage + item).length > 4000) {
                    await ctx.reply(fullMessage);
                    fullMessage = item;
                } else {
                    fullMessage += item;
                }
                count++;
            } catch (err) {
                // Lewati grup jika tidak memiliki hak akses (bukan admin)
                continue;
            }
        }

        if (count > 0) {
            await ctx.reply(fullMessage);
        } else {
            await ctx.reply('Tidak ada grup di mana Anda menjadi Admin atau memiliki akses link.');
        }
    } catch (e) {
        ctx.reply('Gagal mengambil data grup: ' + e.message);
    }
});

bot.action('join_menu', (ctx) => {
    db.users[ctx.chat.id].step = 'await_join_links';
    saveDb();
    ctx.reply(getT(ctx.chat.id).input_join);
});

bot.action('back_main', (ctx) => ctx.editMessageText(getT(ctx.chat.id).welcome, mainKbd(ctx.chat.id)));
bot.action('switch_lang', (ctx) => ctx.editMessageText('🌐 Pilih Bahasa / Select Language', langKbd()));

// --- Text Logic ---
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = db.users[chatId];
    if(!user) return;
    const t = getT(chatId);

    if (user.step === 'await_num') {
        const num = ctx.message.text.trim();
        const code = await startWA(chatId, num);
        ctx.reply(t.pairing_code(code), { parse_mode: 'Markdown' });
        user.step = null;
        saveDb();
    } else if (user.step === 'await_join_links') {
        // Regex yang lebih kuat untuk menangkap link
        const links = ctx.message.text.match(/chat\.whatsapp\.com\/[\w-]+/g);
        if (!links) return ctx.reply('⚠️ Tidak ada link WhatsApp yang valid!');

        const sock = sockets.get(chatId);
        if (!sock || !user.isConnected) return ctx.reply('❌ WhatsApp belum login!');

        ctx.reply(t.loading);

        for (const link of links) {
            const code = link.split('/')[1];
            try {
                const info = await sock.groupGetInviteInfo(code);
                await sock.groupAcceptInvite(code);
                ctx.reply(t.join_success(info.subject || code));
            } catch (err) {
                ctx.reply(t.join_fail(link));
            }
            await delay(10000); // Anti-Ban Delay
        }
        ctx.reply(t.done);
        user.step = null;
        saveDb();
    }
});

bot.launch().then(() => console.log('Bot v3.0 Active - Multi-Sender Ready'));
        
