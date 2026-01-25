
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    delay
} = require("@whiskeysockets/baileys");
const { Telegraf, Markup } = require('telegraf');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');

/**
 * ADVANCED MULTI-SENDER WHATSAPP-TELEGRAM ORCHESTRATOR
 * Optimized for Dual Login (QR/Pairing) & Mass Group Creation
 */

const TG_BOT_TOKEN = '8324023704:AAFnD91Azl7qCMBDNEQmI932n3cXO4d7cMg';
const bot = new Telegraf(TG_BOT_TOKEN);
const sockets = new Map(); // chatId -> sock
const DB_PATH = path.join(__dirname, 'db.json');

// --- Persistent Database ---
if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, { users: {} });
const db = fs.readJsonSync(DB_PATH);
const saveDb = () => fs.writeJsonSync(DB_PATH, db);

// --- Localization Support ---
const strings = {
    ID: {
        welcome: 'Selamat datang! Kelola WhatsApp Anda via Telegram.',
        login_menu: 'Silakan pilih metode masuk:',
        input_num: 'Ketik nomor WA Anda (Contoh: 62812xxx):',
        pairing_code: (code) => `Kode Pairing Anda: *${code}*`,
        qr_msg: 'Scan QR Code ini untuk login:',
        loading: 'Loading bos...',
        connected: '✅ WhatsApp Terhubung!',
        disconnected: '❌ Koneksi terputus.',
        logout_msg: 'Sesi telah dihapus dan logout berhasil.',
        creating_single: (name) => `[${name}] Berhasil di Buat✅`,
        create_summary: (total) => `Total: ${total} grup telah selesai dibuat`,
        lang_switched: 'Bahasa diubah ke Bahasa Indonesia.',
        export_header: '📦 *DAFTAR LINK GRUP* (Urut Tgl Create)\n\n',
        export_item: (name, link, date) => `📌 *Nama:* ${name}\n🔗 *Link:* ${link}\n📅 *Dibuat:* ${date}\n\n`,
        menu: {
            ann: 'Batas Pesan',
            lock: 'Kunci Info',
            approve: 'Persetujuan'
        }
    },
    EN: {
        welcome: 'Welcome! Manage your WhatsApp via Telegram.',
        login_menu: 'Please choose login method:',
        input_num: 'Enter your WA Number (Example: 62812xxx):',
        pairing_code: (code) => `Your Pairing Code: *${code}*`,
        qr_msg: 'Scan this QR Code to login:',
        loading: 'Loading sir...',
        connected: '✅ WhatsApp Connected!',
        disconnected: '❌ Connection closed.',
        logout_msg: 'Session deleted and logout successful.',
        creating_single: (name) => `[${name}] Created Successfully✅`,
        create_summary: (total) => `Total: ${total} groups have been created`,
        lang_switched: 'Language switched to English.',
        export_header: '📦 *GROUP LINK LIST* (Sorted by Creation)\n\n',
        export_item: (name, link, date) => `📌 *Name:* ${name}\n🔗 *Link:* ${link}\n📅 *Created:* ${date}\n\n`,
        menu: {
            ann: 'Restrict Msg',
            lock: 'Lock Info',
            approve: 'Approval'
        }
    }
};

const getT = (chatId) => strings[db.users[chatId]?.lang || 'ID'];

// --- WhatsApp Core Logic ---
async function startWA(chatId, phoneNumber = null, isQRMode = false) {
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'error' }),
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sockets.set(chatId, sock);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && isQRMode) {
            try {
                const buf = await QRCode.toBuffer(qr);
                await bot.telegram.sendPhoto(chatId, { source: buf }, { caption: getT(chatId).qr_msg });
            } catch (e) { console.error('QR Send Error:', e); }
        }

        if (connection === 'close') {
            const code = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                startWA(chatId);
            } else {
                sockets.delete(chatId);
                if(db.users[chatId]) {
                    db.users[chatId].isConnected = false;
                    saveDb();
                }
            }
        } else if (connection === 'open') {
            if (!db.users[chatId].isConnected) {
                bot.telegram.sendMessage(chatId, getT(chatId).connected);
                db.users[chatId].isConnected = true;
                saveDb();
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
const mainKbd = (chatId) => Markup.inlineKeyboard([
    [Markup.button.callback('🔐 Masuk', 'login_menu'), Markup.button.callback('🚪 Keluar', 'logout')],
    [Markup.button.callback('👥 Buat Grup', 'create_settings'), Markup.button.callback('🔗 Ambil Link', 'get_links')],
    [Markup.button.callback('🌐 Bahasa', 'switch_lang')]
]);

const settingsKbd = (chatId) => {
    const s = db.users[chatId].settings;
    const t = getT(chatId);
    return Markup.inlineKeyboard([
        [Markup.button.callback(`${s.ann ? '✅' : '❌'} ${t.menu.ann}`, 'toggle_ann')],
        [Markup.button.callback(`${s.lock ? '✅' : '❌'} ${t.menu.lock}`, 'toggle_lock')],
        [Markup.button.callback(`${s.approve ? '✅' : '❌'} ${t.menu.approve}`, 'toggle_approve')],
        [Markup.button.callback('🚀 EXECUTE CREATE', 'start_create_process')],
        [Markup.button.callback('⬅️ Kembali', 'back_main')]
    ]);
};

// --- Action Handlers ---
bot.start((ctx) => {
    const chatId = ctx.chat.id;
    if (!db.users[chatId]) {
        db.users[chatId] = { lang: 'ID', isConnected: false, settings: { ann: false, lock: false, approve: false } };
        saveDb();
    }
    ctx.reply(getT(chatId).welcome, mainKbd(chatId));
});

bot.action('login_menu', (ctx) => {
    ctx.editMessageText(getT(ctx.chat.id).login_menu, Markup.inlineKeyboard([
        [Markup.button.callback('📸 Scan QR', 'login_qr'), Markup.button.callback('🔢 Pairing Code', 'login_pairing')],
        [Markup.button.callback('⬅️ Kembali', 'back_main')]
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
        saveDb();
    }
    ctx.reply(getT(chatId).logout_msg);
});

bot.action('create_settings', (ctx) => {
    ctx.editMessageText('Pengaturan Grup:', settingsKbd(ctx.chat.id));
});

bot.action(/toggle_(.+)/, (ctx) => {
    const key = ctx.match[1];
    db.users[ctx.chat.id].settings[key] = !db.users[ctx.chat.id].settings[key];
    saveDb();
    ctx.editMessageText('Pengaturan Grup:', settingsKbd(ctx.chat.id));
});

bot.action('start_create_process', (ctx) => {
    db.users[ctx.chat.id].step = 'await_name';
    saveDb();
    ctx.reply('Ketik Nama Grup:');
});

bot.action('get_links', async (ctx) => {
    const chatId = ctx.chat.id;
    const sock = sockets.get(chatId);
    const t = getT(chatId);

    if (!sock || !db.users[chatId].isConnected) {
        return ctx.reply('WhatsApp belum login atau terhubung!');
    }

    ctx.reply(t.loading);

    try {
        const groups = await sock.groupFetchAllParticipating();
        // Convert to array and sort by creation date (oldest first)
        const groupList = Object.values(groups).sort((a, b) => a.creation - b.creation);

        let fullMessage = t.export_header;
        
        for (const group of groupList) {
            try {
                const inviteCode = await sock.groupInviteCode(group.id);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                const creationDate = new Date(group.creation * 1000).toLocaleString('id-ID', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                const item = t.export_item(group.subject, inviteLink, creationDate);
                
                // Check Telegram message limit (4096)
                if ((fullMessage + item).length > 4000) {
                    await ctx.reply(fullMessage, { parse_mode: 'Markdown' });
                    fullMessage = item;
                } else {
                    fullMessage += item;
                }
            } catch (err) {
                console.error('Failed to get code for:', group.id, err.message);
            }
        }

        if (fullMessage) {
            await ctx.reply(fullMessage, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        ctx.reply('Gagal mengambil data grup: ' + e.message);
    }
});

bot.action('switch_lang', (ctx) => {
    const current = db.users[ctx.chat.id].lang;
    db.users[ctx.chat.id].lang = current === 'ID' ? 'EN' : 'ID';
    saveDb();
    ctx.reply(getT(ctx.chat.id).lang_switched, mainKbd(ctx.chat.id));
});

bot.action('back_main', (ctx) => ctx.editMessageText(getT(ctx.chat.id).welcome, mainKbd(ctx.chat.id)));

// --- Logic ---
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
    } else if (user.step === 'await_name') {
        user.tmpName = ctx.message.text;
        user.step = 'await_count';
        saveDb();
        ctx.reply('Berapa jumlah grup? (Maks 30):');
    } else if (user.step === 'await_count') {
        const count = parseInt(ctx.message.text);
        if (isNaN(count)) return ctx.reply('Masukkan angka yang valid!');
        
        const sock = sockets.get(chatId);
        if (!sock) return ctx.reply('WhatsApp belum login!');

        ctx.reply(t.loading);
        
        for (let i = 1; i <= count; i++) {
            try {
                const groupName = `${user.tmpName} #${i}`;
                const group = await sock.groupCreate(groupName, []);
                const s = user.settings;
                
                // Terapkan pengaturan
                if (s.ann) await sock.groupSettingUpdate(group.id, 'announcement');
                if (s.lock) await sock.groupSettingUpdate(group.id, 'locked');
                if (s.approve) await sock.groupUpdateSettings(group.id, 'membership_approval', 'on');

                ctx.reply(t.creating_single(groupName));
                
                // Jeda 5 detik antar pembuatan
                if (i < count) await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (e) {
                ctx.reply(`Gagal membuat grup ${i}: ` + e.message);
            }
        }
        
        ctx.reply(t.create_summary(count));
        user.step = null;
        saveDb();
    }
});

bot.launch().then(() => console.log('Bot Active'));
