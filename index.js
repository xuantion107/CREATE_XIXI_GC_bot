
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
    makeCacheableSignalKeyStore, 
    getAggregateVotesInPoll 
} = require("@whiskeysockets/baileys");
const { Telegraf, Markup } = require('telegraf');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const qrcode = require('qrcode');

// --- Konfigurasi ---
const TG_BOT_TOKEN = '8374794267:AAEk7qwI7XZLoinCFBh6iu2jqUD3BRtfXIc';
const SESSION_PATH = './session';

// --- Inisialisasi Bot Telegram ---
const bot = new Telegraf(TG_BOT_TOKEN);
let sock = null;
let qrBuffer = null;
let pairingCode = null;

// Helper function untuk delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Kita kirim ke Telegram
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrBuffer = await qrcode.toBuffer(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus karena ', lastDisconnect.error, ', mencoba menghubungkan kembali: ', shouldReconnect);
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp Terhubung!');
        }
    });

    return sock;
}

// Menu Utama (Inline Keyboard)
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('🔐 Masuk', 'login_choice'), Markup.button.callback('🚪 Keluar', 'logout')],
    [Markup.button.callback('👥 Buat Grup', 'create_group'), Markup.button.callback('🔗 Ambil Link', 'get_link')],
    [Markup.button.callback('➕ Masuk Grup', 'join_group'), Markup.button.callback('↩️ Keluar Grup', 'leave_group')],
    [Markup.button.callback('🌐 Bahasa', 'change_lang')]
]);

bot.start((ctx) => {
    ctx.reply('Selamat datang di WA-TG Bot Management Panel.\n\nSilakan pilih menu di bawah ini:', mainMenu);
});

// Logic Login
bot.action('login_choice', (ctx) => {
    ctx.editMessageText('Pilih Metode Login:', Markup.inlineKeyboard([
        [Markup.button.callback('QR Code', 'login_qr'), Markup.button.callback('Pairing Code', 'login_pairing')],
        [Markup.button.callback('⬅️ Kembali', 'back_to_main')]
    ]));
});

bot.action('login_qr', async (ctx) => {
    if (!sock) await startWhatsApp();
    if (qrBuffer) {
        await ctx.replyWithPhoto({ source: qrBuffer }, { caption: 'Scan QR Code ini menggunakan WhatsApp Anda.' });
    } else {
        ctx.reply('Sedang menyiapkan QR... Tunggu sebentar dan klik lagi.');
    }
});

bot.action('login_pairing', async (ctx) => {
    ctx.reply('Fitur Pairing Code memerlukan input nomor telepon. Silakan hubungi pengembang untuk aktivasi CLI.');
});

// Logic Buat Grup
let creationState = {};

bot.action('create_group', (ctx) => {
    creationState[ctx.from.id] = { step: 'name' };
    ctx.reply('Ketik Nama Grup yang ingin dibuat:');
});

bot.on('text', async (ctx) => {
    const state = creationState[ctx.from.id];
    if (!state) return;

    if (state.step === 'name') {
        state.name = ctx.message.text;
        state.step = 'count';
        ctx.reply(`Berapa banyak grup "${state.name}" yang ingin dibuat?`);
    } else if (state.step === 'count') {
        const count = parseInt(ctx.message.text);
        if (isNaN(count)) return ctx.reply('Masukkan angka valid!');
        
        ctx.reply(`Memulai pembuatan ${count} grup. Harap tunggu...`);
        
        for (let i = 1; i <= count; i++) {
            try {
                const group = await sock.groupCreate(`${state.name} #${i}`, []);
                ctx.reply(`✅ Berhasil membuat: ${state.name} #${i}`);
                await sleep(5000); // Anti-ban delay
            } catch (err) {
                ctx.reply(`❌ Gagal membuat grup ke-${i}: ${err.message}`);
            }
        }
        delete creationState[ctx.from.id];
        ctx.reply('Proses selesai.', mainMenu);
    }
});

bot.action('get_link', async (ctx) => {
    if (!sock) return ctx.reply('WhatsApp belum terhubung!');
    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups);
        if (groupList.length === 0) return ctx.reply('Tidak ada grup ditemukan.');

        ctx.reply('Mengambil link invite grup terbaru...');
        for (const g of groupList.slice(-5)) { // Ambil 5 terakhir
            const code = await sock.groupInviteCode(g.id);
            ctx.reply(`📌 ${g.subject}: https://chat.whatsapp.com/${code}`);
            await sleep(1000);
        }
    } catch (err) {
        ctx.reply('Gagal mengambil link: ' + err.message);
    }
});

bot.action('back_to_main', (ctx) => ctx.editMessageText('Menu Utama:', mainMenu));

bot.launch().then(() => console.log('Bot Telegram Berjalan!'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
