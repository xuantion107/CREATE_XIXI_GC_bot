
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
 * v3.1.0 - Advanced Group Creation Settings
 */

const TG_BOT_TOKEN = '8324023704:AAFnD91Azl7qCMBDNEQmI932n3cXO4d7cMg';
const bot = new Telegraf(TG_BOT_TOKEN);
const sockets = new Map(); 
const DB_PATH = path.join(__dirname, 'db.json');

if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, { users: {} });
const db = fs.readJsonSync(DB_PATH);
const saveDb = () => fs.writeJsonSync(DB_PATH, db);

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
            ann: 'Batas Pesan (Admin Only)',
            lock: 'Kunci Info Grup',
            approve: 'Persetujuan Member'
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
            ann: 'Restrict Msg (Admin Only)',
            lock: 'Lock Group Info',
            approve: 'Member Approval'
        }
    }
};

const getT = (chatId) => strings[db.users[chatId]?.lang || 'ID'];

async function startWA(chatId, phoneNumber = null, isQRMode = false) {
    const sessionDir = path.join(__dirname, 'sessions', `session-${chatId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    if (sockets.has(chatId)) {
        try { sockets.get(chatId).end(); } catch(e) {}
    }

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
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
            if (shouldReconnect) startWA(chatId, null, false);
            else sockets.delete(chatId);
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
        return await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
    }
    return sock;
}

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

const settingsKbd = (chatId) => {
    const s = db.users[chatId].settings;
    const t = getT(chatId);
    return Markup.inlineKeyboard([
        [Markup.button.callback(`${s.ann ? '✅' : '❌'} ${t.menu.ann}`, 'toggle_ann')],
        [Markup.button.callback(`${s.lock ? '✅' : '❌'} ${t.menu.lock}`, 'toggle_lock')],
        [Markup.button.callback(`${s.approve ? '✅' : '❌'} ${t.menu.approve}`, 'toggle_approve')],
        [Markup.button.callback('🚀 MULAI BUAT GRUP', 'start_create_process')],
        [Markup.button.callback(t.btn.back, 'back_main')]
    ]);
};

bot.start((ctx) => {
    const chatId = ctx.chat.id;
    if (!db.users[chatId]) {
        db.users[chatId] = { 
            lang: null, isConnected: false, lastQrId: null,
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
    await ctx.answerCbQuery(strings[lang].lang_switched);
    ctx.editMessageText(strings[lang].welcome, mainKbd(ctx.chat.id));
});

bot.action('create_settings', (ctx) => {
    ctx.editMessageText('⚙️ Pengaturan Grup Baru:\n(Opsi ini akan otomatis diterapkan setelah grup dibuat)', settingsKbd(ctx.chat.id));
});

bot.action(/toggle_(ann|lock|approve)/, (ctx) => {
    const key = ctx.match[1];
    db.users[ctx.chat.id].settings[key] = !db.users[ctx.chat.id].settings[key];
    saveDb();
    ctx.editMessageText('⚙️ Pengaturan Grup Baru:', settingsKbd(ctx.chat.id));
});

bot.action('start_create_process', (ctx) => {
    db.users[ctx.chat.id].step = 'await_name';
    saveDb();
    ctx.reply('Ketik Nama Grup (Maks 21 karakter):');
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
    db.users[chatId].isConnected = false;
    db.users[chatId].lastQrId = null;
    saveDb();
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
                const inviteCode = await sock.groupInviteCode(id);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                const date = new Date(group.creation * 1000).toLocaleString('id-ID');
                const item = t.export_item(group.subject, inviteLink, date);
                if ((fullMessage + item).length > 4000) { await ctx.reply(fullMessage); fullMessage = item; } 
                else { fullMessage += item; }
                count++;
            } catch (err) { continue; }
        }
        if (count > 0) await ctx.reply(fullMessage);
        else await ctx.reply('Tidak ada grup di mana Anda menjadi Admin.');
    } catch (e) { ctx.reply('Gagal: ' + e.message); }
});

bot.action('join_menu', (ctx) => {
    db.users[ctx.chat.id].step = 'await_join_links';
    saveDb();
    ctx.reply(getT(ctx.chat.id).input_join);
});

bot.action('back_main', (ctx) => ctx.editMessageText(getT(ctx.chat.id).welcome, mainKbd(ctx.chat.id)));
bot.action('switch_lang', (ctx) => ctx.editMessageText('🌐 Pilih Bahasa / Select Language', langKbd()));

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = db.users[chatId];
    if(!user) return;
    const t = getT(chatId);

    if (user.step === 'await_num') {
        const code = await startWA(chatId, ctx.message.text.trim());
        ctx.reply(t.pairing_code(code), { parse_mode: 'Markdown' });
        user.step = null;
        saveDb();
    } else if (user.step === 'await_name') {
        const name = ctx.message.text.trim();
        if (name.length > 21) return ctx.reply('⚠️ Nama terlalu panjang (Maks 21)!');
        user.tmpName = name;
        user.step = 'await_count';
        saveDb();
        ctx.reply('Berapa jumlah grup yang ingin dibuat? (Maks 30):');
    } else if (user.step === 'await_count') {
        const count = parseInt(ctx.message.text);
        if (isNaN(count) || count <= 0 || count > 30) return ctx.reply('⚠️ Masukkan angka 1-30!');
        const sock = sockets.get(chatId);
        if (!sock || !user.isConnected) return ctx.reply('❌ WhatsApp terputus!');
        
        ctx.reply(t.loading);
        let successCount = 0;
        for (let i = 1; i <= count; i++) {
            const groupName = `${user.tmpName} #${i}`;
            try {
                const group = await sock.groupCreate(groupName, []);
                const s = user.settings;
                // Terapkan pengaturan seketika
                if (s.ann) await sock.groupSettingUpdate(group.id, 'announcement');
                if (s.lock) await sock.groupSettingUpdate(group.id, 'locked');
                if (s.approve) await sock.groupUpdateSettings(group.id, 'membership_approval', 'on');
                
                ctx.reply(t.creating_single(groupName));
                successCount++;
                await delay(7000); 
            } catch (e) { ctx.reply(`❌ Gagal [${groupName}]: ` + e.message); }
        }
        ctx.reply(t.create_summary(successCount, count));
        user.step = null;
        saveDb();
    } else if (user.step === 'await_join_links') {
        const links = ctx.message.text.match(/chat\.whatsapp\.com\/[\w-]+/g);
        if (!links) return ctx.reply('⚠️ Link tidak valid!');
        const sock = sockets.get(chatId);
        if (!sock) return;
        for (const link of links) {
            const code = link.split('/')[1];
            try {
                const info = await sock.groupGetInviteInfo(code);
                await sock.groupAcceptInvite(code);
                ctx.reply(t.join_success(info.subject || code));
            } catch (err) { ctx.reply(t.join_fail(link)); }
            await delay(10000);
        }
        ctx.reply(t.done);
        user.step = null;
        saveDb();
    }
});

bot.launch().then(() => console.log('Bot v3.1 Active - Advanced Group Features Ready'));
            
