
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeInMemoryStore, 
    jidDecode, 
    proto, 
    delay, 
    generateForwardMessageContent, 
    prepareWAMessageMedia, 
    generateWAMessageFromContent, 
    generateMessageID, 
    downloadContentFromMessage, 
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const { Telegraf, Markup } = require('telegraf');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const qrcode = require('qrcode');
const path = require('path');

// --- Localization ---
const strings = {
    ID: {
        welcome: 'Selamat datang di WA-TG Bot Orchestrator. Silakan login untuk memulai.',
        choose_method: 'Pilih Metode Login:',
        enter_number: 'Masukkan nomor WhatsApp Anda (format: 628xxx):',
        pairing_code_msg: 'Kode Pairing Anda adalah: ',
        qr_scan: 'Scan QR Code ini menggunakan WhatsApp Anda:',
        logged_in: '✅ WhatsApp Terhubung!',
        logged_out: '🚪 Sesi telah dihapus dan koneksi dihentikan.',
        loading: 'Loading bos...',
        group_created: '✅ Grup Berhasil Dibuat: ',
        group_fail: '❌ Gagal membuat grup: ',
        setting_menu: 'Pengaturan Grup Baru:',
        lang_changed: 'Bahasa diubah ke Bahasa Indonesia.',
        invalid_link: 'Link tidak valid atau bot gagal bergabung.',
        join_success: '✅ Berhasil bergabung ke grup!',
        export_format: (name, link, date) => `Nama Grup: ${name}\nLink Grup: ${link}\nTahun Pembuatan: ${date}`
    },
    EN: {
        welcome: 'Welcome to WA-TG Bot Orchestrator. Please login to start.',
        choose_method: 'Choose Login Method:',
        enter_number: 'Enter your WhatsApp number (format: 628xxx):',
        pairing_code_msg: 'Your Pairing Code is: ',
        qr_scan: 'Scan this QR Code using your WhatsApp:',
        logged_in: '✅ WhatsApp Connected!',
        logged_out: '🚪 Session deleted and connection stopped.',
        loading: 'Loading sir...',
        group_created: '✅ Group Created Successfully: ',
        group_fail: '❌ Failed to create group: ',
        setting_menu: 'New Group Settings:',
        lang_changed: 'Language changed to English.',
        invalid_link: 'Invalid link or bot failed to join.',
        join_success: '✅ Successfully joined the group!',
        export_format: (name, link, date) => `Group Name: ${name}\nGroup Link: ${link}\nCreation Date: ${date}`
    }
};

// --- Config & State ---
const TG_BOT_TOKEN = '8324023704:AAFnD91Azl7qCMBDNEQmI932n3cXO4d7cMg';
const bot = new Telegraf(TG_BOT_TOKEN);
const sockets = new Map(); // Store sockets by chatId
const userPrefs = new Map(); // { lang: 'ID', settings: {} }
const userState = new Map(); // Track steps in conversation

// Helper for translation
const t = (ctx, key, ...args) => {
    const lang = userPrefs.get(ctx.chat.id)?.lang || 'ID';
    const val = strings[lang][key];
    return typeof val === 'function' ? val(...args) : val;
};

// --- WhatsApp Logic ---
async function startWA(chatId, phoneNumber = null) {
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    sockets.set(chatId, sock);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !phoneNumber) {
            // Store QR for display if needed
            sock.currentQR = qr;
        }

        if (connection === 'close') {
            const code = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                startWA(chatId);
            } else {
                sockets.delete(chatId);
            }
        } else if (connection === 'open') {
            bot.telegram.sendMessage(chatId, strings[userPrefs.get(chatId)?.lang || 'ID'].logged_in);
        }
    });

    if (phoneNumber) {
        await delay(3000);
        const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
        return code;
    }

    return sock;
}

// --- Menu UI ---
const getMainMenu = (chatId) => {
    const lang = userPrefs.get(chatId)?.lang || 'ID';
    return Markup.inlineKeyboard([
        [Markup.button.callback('🔐 Login', 'login_menu'), Markup.button.callback('🚪 Logout', 'logout')],
        [Markup.button.callback('👥 Create Group', 'setup_group'), Markup.button.callback('🔗 Export Links', 'get_links')],
        [Markup.button.callback('➕ Join Group', 'join_mode'), Markup.button.callback('🌐 Language', 'lang_toggle')]
    ]);
};

const getSettingsMenu = (chatId) => {
    const prefs = userPrefs.get(chatId) || { settings: { ann: false, lock: false, approve: false } };
    const s = prefs.settings;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`Announce: ${s.ann ? 'ON' : 'OFF'}`, 'toggle_ann')],
        [Markup.button.callback(`Lock Info: ${s.lock ? 'ON' : 'OFF'}`, 'toggle_lock')],
        [Markup.button.callback(`Approval: ${s.approve ? 'ON' : 'OFF'}`, 'toggle_approve')],
        [Markup.button.callback('🚀 EXECUTE CREATE', 'do_create'), Markup.button.callback('❌ Cancel', 'back_main')]
    ]);
};

// --- Bot Handlers ---
bot.start((ctx) => {
    if (!userPrefs.has(ctx.chat.id)) userPrefs.set(ctx.chat.id, { lang: 'ID', settings: { ann: false, lock: false, approve: false } });
    ctx.reply(t(ctx, 'welcome'), getMainMenu(ctx.chat.id));
});

bot.action('login_menu', (ctx) => {
    ctx.editMessageText(t(ctx, 'choose_method'), Markup.inlineKeyboard([
        [Markup.button.callback('QR Code', 'login_qr'), Markup.button.callback('Pairing Code', 'login_pairing')],
        [Markup.button.callback('⬅️ Back', 'back_main')]
    ]));
});

bot.action('login_qr', async (ctx) => {
    const sock = await startWA(ctx.chat.id);
    ctx.reply(t(ctx, 'loading'));
    let attempts = 0;
    const checkQR = setInterval(async () => {
        attempts++;
        if (sock.currentQR) {
            const buf = await qrcode.toBuffer(sock.currentQR);
            ctx.replyWithPhoto({ source: buf }, { caption: t(ctx, 'qr_scan') });
            clearInterval(checkQR);
        }
        if (attempts > 10) clearInterval(checkQR);
    }, 2000);
});

bot.action('login_pairing', (ctx) => {
    userState.set(ctx.chat.id, 'awaiting_number');
    ctx.reply(t(ctx, 'enter_number'));
});

bot.action('logout', async (ctx) => {
    const sock = sockets.get(ctx.chat.id);
    if (sock) {
        try { await sock.logout(); } catch (e) {}
        sockets.delete(ctx.chat.id);
    }
    const sessionDir = path.join(__dirname, 'sessions', `session-${ctx.chat.id}`);
    if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
    ctx.reply(t(ctx, 'logged_out'), getMainMenu(ctx.chat.id));
});

bot.action('setup_group', (ctx) => {
    ctx.editMessageText(t(ctx, 'setting_menu'), getSettingsMenu(ctx.chat.id));
});

bot.action(/toggle_(.+)/, (ctx) => {
    const type = ctx.match[1];
    const prefs = userPrefs.get(ctx.chat.id);
    if (type === 'ann') prefs.settings.ann = !prefs.settings.ann;
    if (type === 'lock') prefs.settings.lock = !prefs.settings.lock;
    if (type === 'approve') prefs.settings.approve = !prefs.settings.approve;
    ctx.editMessageText(t(ctx, 'setting_menu'), getSettingsMenu(ctx.chat.id));
});

bot.action('do_create', (ctx) => {
    userState.set(ctx.chat.id, 'awaiting_group_name');
    ctx.reply('Enter Group Name:');
});

bot.action('get_links', async (ctx) => {
    const sock = sockets.get(ctx.chat.id);
    if (!sock) return ctx.reply('Login first!');
    ctx.reply(t(ctx, 'loading'));
    try {
        const groups = await sock.groupFetchAllParticipating();
        for (const jid in groups) {
            const g = groups[jid];
            const code = await sock.groupInviteCode(jid);
            const date = new Date(g.creation * 1000).toLocaleDateString('id-ID');
            ctx.reply(t(ctx, 'export_format', g.subject, `https://chat.whatsapp.com/${code}`, date));
            await delay(1000);
        }
    } catch (e) { ctx.reply('Error: ' + e.message); }
});

bot.action('lang_toggle', (ctx) => {
    const prefs = userPrefs.get(ctx.chat.id);
    prefs.lang = prefs.lang === 'ID' ? 'EN' : 'ID';
    ctx.reply(t(ctx, 'lang_changed'), getMainMenu(ctx.chat.id));
});

bot.on('text', async (ctx) => {
    const state = userState.get(ctx.chat.id);
    const sock = sockets.get(ctx.chat.id);

    if (state === 'awaiting_number') {
        const num = ctx.message.text.trim();
        ctx.reply(t(ctx, 'loading'));
        const code = await startWA(ctx.chat.id, num);
        ctx.reply(`${t(ctx, 'pairing_code_msg')} ` + `*${code}*`, { parse_mode: 'Markdown' });
        userState.delete(ctx.chat.id);
    } 
    else if (state === 'awaiting_group_name') {
        if (!sock) return ctx.reply('Not connected!');
        try {
            const name = ctx.message.text;
            const group = await sock.groupCreate(name, []);
            const settings = userPrefs.get(ctx.chat.id).settings;
            
            if (settings.ann) await sock.groupSettingUpdate(group.id, 'announcement');
            if (settings.lock) await sock.groupSettingUpdate(group.id, 'locked');
            if (settings.approve) await sock.groupUpdateSettings(group.id, 'membership_approval', 'on');
            
            ctx.reply(t(ctx, 'group_created') + name);
        } catch (e) { ctx.reply(t(ctx, 'group_fail') + e.message); }
        userState.delete(ctx.chat.id);
    }
    // Auto Join Listener
    else if (ctx.message.text.includes('chat.whatsapp.com/')) {
        if (!sock) return;
        const code = ctx.message.text.split('chat.whatsapp.com/')[1].split(' ')[0];
        try {
            await sock.groupAcceptInvite(code);
            ctx.reply(t(ctx, 'join_success'));
        } catch (e) { ctx.reply(t(ctx, 'invalid_link')); }
    }
});

bot.action('back_main', (ctx) => ctx.editMessageText(t(ctx, 'welcome'), getMainMenu(ctx.chat.id)));

bot.launch().then(() => console.log('Telegram Bot Active'));
