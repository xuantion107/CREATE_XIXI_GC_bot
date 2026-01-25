
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

/**
 * TRUE MULTI-SENDER WHATSAPP-TELEGRAM ORCHESTRATOR
 * Optimized for Railway.app (Low RAM usage)
 */

const TG_BOT_TOKEN = '8324023704:AAFnD91Azl7qCMBDNEQmI932n3cXO4d7cMg';
const bot = new Telegraf(TG_BOT_TOKEN);
const sockets = new Map(); // Store instances: chatId -> sock
const DB_PATH = path.join(__dirname, 'db.json');

// --- Database Helper ---
if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, { users: {} });
const db = fs.readJsonSync(DB_PATH);
const saveDb = () => fs.writeJsonSync(DB_PATH, db);

// --- i18n Localization ---
const strings = {
    ID: {
        welcome: 'Selamat datang! Bot GC OWNER @XIXI8778.',
        login_opt: 'Metode Login:',
        input_num: 'Ketik nomor WA (contoh: 62812xxx):',
        pairing_msg: (code) => `Kode Pairing Anda: *${code}*`,
        connected: '✅ WhatsApp Terhubung!',
        disconnected: '❌ Terputus. Silakan login kembali.',
        logout_done: '🚪 Sesi dihapus. Koneksi dihentikan.',
        loading: 'Loading bos...',
        creating_groups: (name, count) => `Sedang membuat ${count} grup "${name}"... (Delay 15s)`,
        create_done: (name, total) => `[${name}] Berhasil dibuat✅\nTotal: ${total}`,
        join_start: 'Memulai proses join massal...',
        join_fail: (name) => `❌ Gagal/Tidak bisa masuk ke: ${name}`,
        join_done: 'DONE✅ Semua link diproses.',
        export_header: 'Daftar Grup & Link Invite:\n\n',
        export_item: (name, link, date) => `Nama: ${name}\nLink: ${link}\nTgl: ${date}\n\n`,
        menu: {
            ann: 'Batas Pesan',
            lock: 'Kunci Info',
            add: 'Tambah Anggota',
            approve: 'Persetujuan'
        }
    },
    EN: {
        welcome: 'Welcome! Bot GC OWNER @XIXI8778.',
        login_opt: 'Login Method:',
        input_num: 'Enter WA Number (e.g., 62812xxx):',
        pairing_msg: (code) => `Your Pairing Code: *${code}*`,
        connected: '✅ WhatsApp Connected!',
        disconnected: '❌ Disconnected. Please login again.',
        logout_done: '🚪 Session deleted. Connection stopped.',
        loading: 'Loading sir...',
        creating_groups: (name, count) => `Creating ${count} groups named "${name}"... (15s delay)`,
        create_done: (name, total) => `[${name}] Created successfully✅\nTotal: ${total}`,
        join_start: 'Starting mass join process...',
        join_fail: (name) => `❌ Failed/Cannot join: ${name}`,
        join_done: 'DONE✅ All links processed.',
        export_header: 'Group List & Invite Links:\n\n',
        export_item: (name, link, date) => `Name: ${name}\nLink: ${link}\nDate: ${date}\n\n`,
        menu: {
            ann: 'Restrict Msg',
            lock: 'Lock Info',
            add: 'Add Member',
            approve: 'Approval'
        }
    }
};

const getT = (chatId) => {
    const lang = db.users[chatId]?.lang || 'ID';
    return strings[lang];
};

// --- WhatsApp Core Logic ---
async function startWA(chatId, phoneNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', `session-${chatId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'error' }), // RAM Efficient
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sockets.set(chatId, sock);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWA(chatId);
            else {
                sockets.delete(chatId);
                bot.telegram.sendMessage(chatId, getT(chatId).disconnected);
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

// --- Keyboard Helpers ---
const mainKeyboard = (chatId) => {
    const t = getT(chatId);
    return Markup.inlineKeyboard([
        [Markup.button.callback('🔐 Login', 'login_menu'), Markup.button.callback('🚪 Logout', 'logout')],
        [Markup.button.callback('👥 Create Group', 'create_setting'), Markup.button.callback('🔗 Ambil Link', 'export_links')],
        [Markup.button.callback('➕ Join Group', 'join_mode'), Markup.button.callback('🌐 Bahasa', 'toggle_lang')]
    ]);
};

const settingKeyboard = (chatId) => {
    const t = getT(chatId);
    const s = db.users[chatId].settings;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`${s.ann ? '✅' : '❌'} ${t.menu.ann}`, 'set_ann')],
        [Markup.button.callback(`${s.lock ? '✅' : '❌'} ${t.menu.lock}`, 'set_lock')],
        [Markup.button.callback(`${s.approve ? '✅' : '❌'} ${t.menu.approve}`, 'set_approve')],
        [Markup.button.callback('🚀 EXECUTE CREATE', 'run_create')],
        [Markup.button.callback('⬅️ Back', 'back_main')]
    ]);
};

// --- Bot Actions ---
bot.start((ctx) => {
    const chatId = ctx.chat.id;
    if (!db.users[chatId]) {
        db.users[chatId] = { lang: 'ID', isConnected: false, settings: { ann: false, lock: false, approve: false } };
        saveDb();
    }
    ctx.reply(getT(chatId).welcome, mainKeyboard(chatId));
});

bot.action('login_menu', (ctx) => {
    ctx.editMessageText(getT(ctx.chat.id).login_opt, Markup.inlineKeyboard([
        [Markup.button.callback('Pairing Code', 'pairing_flow')],
        [Markup.button.callback('⬅️ Back', 'back_main')]
    ]));
});

bot.action('pairing_flow', (ctx) => {
    db.users[ctx.chat.id].step = 'awaiting_num';
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
    const sessionPath = path.join(__dirname, 'sessions', `session-${chatId}`);
    fs.rmSync(sessionPath, { recursive: true, force: true });
    db.users[chatId].isConnected = false;
    saveDb();
    ctx.reply(getT(chatId).logout_out);
});

bot.action('create_setting', (ctx) => {
    ctx.editMessageText('Group Configuration:', settingKeyboard(ctx.chat.id));
});

bot.action(/set_(.+)/, (ctx) => {
    const key = ctx.match[1];
    db.users[ctx.chat.id].settings[key] = !db.users[ctx.chat.id].settings[key];
    saveDb();
    ctx.editMessageText('Group Configuration:', settingKeyboard(ctx.chat.id));
});

bot.action('run_create', (ctx) => {
    db.users[ctx.chat.id].step = 'awaiting_name';
    saveDb();
    ctx.reply('Masukkan Nama Grup:');
});

bot.action('export_links', async (ctx) => {
    const chatId = ctx.chat.id;
    const sock = sockets.get(chatId);
    if (!sock) return ctx.reply('Login first!');
    
    ctx.reply(getT(chatId).loading);
    try {
        const groups = await sock.groupFetchAllParticipating();
        let msg = getT(chatId).export_header;
        for (const jid in groups) {
            const g = groups[jid];
            const code = await sock.groupInviteCode(jid);
            const date = new Date(g.creation * 1000).toLocaleDateString('id-ID');
            msg += getT(chatId).export_item(g.subject, `https://chat.whatsapp.com/${code}`, date);
            if (msg.length > 3000) {
                await ctx.reply(msg);
                msg = '';
            }
        }
        if (msg) ctx.reply(msg);
    } catch (e) { ctx.reply('Error: ' + e.message); }
});

bot.action('toggle_lang', (ctx) => {
    db.users[ctx.chat.id].lang = db.users[ctx.chat.id].lang === 'ID' ? 'EN' : 'ID';
    saveDb();
    ctx.reply('Language switched!', mainKeyboard(ctx.chat.id));
});

bot.action('back_main', (ctx) => ctx.editMessageText(getT(ctx.chat.id).welcome, mainKeyboard(ctx.chat.id)));

// --- Message Handlers ---
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = db.users[chatId];
    const t = getT(chatId);

    if (user.step === 'awaiting_num') {
        const num = ctx.message.text.trim();
        const code = await startWA(chatId, num);
        ctx.reply(t.pairing_msg(code), { parse_mode: 'Markdown' });
        user.step = null;
        saveDb();
    } else if (user.step === 'awaiting_name') {
        user.tmpName = ctx.message.text;
        user.step = 'awaiting_count';
        saveDb();
        ctx.reply('Berapa jumlah grup? (Maks 30):');
    } else if (user.step === 'awaiting_count') {
        const count = Math.min(parseInt(ctx.message.text), 30);
        const sock = sockets.get(chatId);
        ctx.reply(t.creating_groups(user.tmpName, count));
        
        for (let i = 1; i <= count; i++) {
            try {
                const group = await sock.groupCreate(`${user.tmpName} #${i}`, []);
                const s = user.settings;
                if (s.ann) await sock.groupSettingUpdate(group.id, 'announcement');
                if (s.lock) await sock.groupSettingUpdate(group.id, 'locked');
                if (s.approve) await sock.groupUpdateSettings(group.id, 'membership_approval', 'on');
                await delay(15000); // Anti-ban delay
            } catch (e) { console.error(e); }
        }
        ctx.reply(t.create_done(user.tmpName, count));
        user.step = null;
        saveDb();
    } 
    // Join Mass Listener
    else if (ctx.message.text.includes('chat.whatsapp.com/')) {
        const sock = sockets.get(chatId);
        if (!sock) return;
        const links = ctx.message.text.match(/chat\.whatsapp\.com\/[a-zA-Z0-9]+/g);
        ctx.reply(t.join_start);
        for (const link of links) {
            const code = link.split('/')[1];
            try {
                await sock.groupAcceptInvite(code);
                await delay(10000);
            } catch (e) { ctx.reply(t.join_fail(link)); }
        }
        ctx.reply(t.join_done);
    }
});

bot.launch().then(() => console.log('Bot Active on Railway'));
        
