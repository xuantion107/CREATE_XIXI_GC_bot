#!/usr/bin/env node
/**
 * ============= PREMIUM VCF BOT - NODE.JS VERSION =============
 * Bot Telegram Multi-Fitur dengan Sistem VIP - FULL FEATURED
 * Siap dijalankan di Produktyl atau hosting Node.js lainnya
 * 
 * Features:
 * - Multi-language support (ID, EN, ZH)
 * - VIP system with trial
 * - Referral & coin system
 * - File conversion (VCF ⇄ TXT)
 * - Contact management (add, delete, rename)
 * - File operations (merge, split, dedup)
 * - Force join group & channel
 * - Admin broadcast
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const express = require('express');

// ============= CONFIGURATION =============
const BOT_TOKEN = process.env.BOT_TOKEN || "8505495138:AAHtBozhdrzWfh7Ad-DiDF7p0anJAhhxElk";
const PORT = process.env.PORT || 3000;
const ADMIN_IDS = [8496726839, 987654321];
const FORCE_JOIN_GROUP = "@xuantionZANGvip";
const FORCE_JOIN_CHANNEL = "@xuantaionzang";
const CEO_USERNAME = "@XIXI8778";
const DB_FILE = "bot_database.db";
const TEMP_FOLDER = "temp_files";

const VIP_PACKAGES = {
    "1day": { days: 1, price: 2000 },
    "7day": { days: 7, price: 5000 },
    "30day": { days: 30, price: 20000 }
};

const COIN_PACKAGES = {
    "2day": { days: 2, coins: 5 },
    "5day": { days: 5, coins: 10 },
    "40day": { days: 40, coins: 50 }
};

if (!fs.existsSync(TEMP_FOLDER)) {
    fs.mkdirSync(TEMP_FOLDER, { recursive: true });
}

// ============= MULTI-LANGUAGE SUPPORT =============
const LANGUAGES = {
    'id': {
        welcome: 'Hallo {name}, selamat datang di bot',
        must_join: '⚠️ Anda harus join Group dan Channel terlebih dahulu untuk menggunakan bot ini!',
        join_group: '📢 Join Group',
        join_channel: '📣 Join Channel',
        check_join: '✅ Saya Sudah Join',
        not_joined: '❌ Anda belum join Group dan Channel!\n\nSilakan join terlebih dahulu, lalu klik tombol "Saya Sudah Join".',
        vip_required_msg: '⚠️ Fitur Premium\n\nFree trial Anda sudah habis!\nUpgrade ke Premium untuk lanjut.\n\nGunakan /vip untuk lihat paket.',
        lang_changed: '✅ Bahasa berhasil diubah ke Indonesia',
        total_contacts: '📊 Total kontak: {count}',
        total_lines: '📊 Total baris: {count}'
    },
    'en': {
        welcome: 'Hello {name}, welcome to the bot',
        must_join: '⚠️ You must join the Group and Channel first to use this bot!',
        join_group: '📢 Join Group',
        join_channel: '📣 Join Channel',
        check_join: '✅ I Have Joined',
        not_joined: '❌ You have not joined the Group and Channel yet!\n\nPlease join first, then click the "I Have Joined" button.',
        vip_required_msg: '⚠️ Premium Feature\n\nYour free trial has expired!\nUpgrade to Premium to continue.\n\nUse /vip to see packages.',
        lang_changed: '✅ Language successfully changed to English',
        total_contacts: '📊 Total contacts: {count}',
        total_lines: '📊 Total lines: {count}'
    },
    'zh': {
        welcome: '你好 {name}，欢迎使用机器人',
        must_join: '⚠️ 您必须先加入群组和频道才能使用此机器人！',
        join_group: '📢 加入群组',
        join_channel: '📣 加入频道',
        check_join: '✅ 我已加入',
        not_joined: '❌ 您尚未加入群组和频道！\n\n请先加入，然后点击"我已加入"按钮。',
        vip_required_msg: '⚠️ 高级功能\n\n您的免费试用已过期！\n升级到高级版以继续使用。\n\n使用 /vip 查看套餐。',
        lang_changed: '✅ 语言已成功更改为中文',
        total_contacts: '📊 总联系人数：{count}',
        total_lines: '📊 总行数：{count}'
    }
};

// ============= DATABASE SETUP =============
const db = new sqlite3.Database(DB_FILE);
const userSessions = new Map();

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        vip_until TIMESTAMP,
        coins INTEGER DEFAULT 0,
        referred_by INTEGER,
        is_active INTEGER DEFAULT 1,
        language TEXT DEFAULT 'id'
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER,
        referred_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Database helpers
const dbHelpers = {
    addUser: (userId, username, firstName, referredBy = null) => {
        return new Promise((resolve, reject) => {
            const trialEnd = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
            db.get('SELECT user_id FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) return reject(err);
                if (row) return resolve(false);
                db.run('INSERT INTO users (user_id, username, first_name, vip_until, referred_by, language) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, username, firstName, trialEnd, referredBy, 'id'], (err) => {
                        if (err) return reject(err);
                        if (referredBy) {
                            db.run('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)', [referredBy, userId]);
                            db.run('UPDATE users SET coins = coins + 1 WHERE user_id = ?', [referredBy]);
                        }
                        resolve(true);
                    });
            });
        });
    },
    getUserLanguage: (userId) => {
        return new Promise((resolve) => {
            db.get('SELECT language FROM users WHERE user_id = ?', [userId], (err, row) => {
                resolve(row && row.language ? row.language : 'id');
            });
        });
    },
    setUserLanguage: (userId, language) => {
        return new Promise((resolve) => {
            db.run('UPDATE users SET language = ? WHERE user_id = ?', [language, userId], () => resolve());
        });
    },
    isVip: (userId) => {
        return new Promise((resolve) => {
            db.get('SELECT vip_until FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err || !row || !row.vip_until) return resolve(false);
                resolve(new Date() < new Date(row.vip_until));
            });
        });
    },
    getUser: (userId) => {
        return new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => resolve(row || null));
        });
    },
    addVipDays: (userId, days) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT vip_until FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) return reject(err);
                let newVip;
                if (row && row.vip_until) {
                    const currentVip = new Date(row.vip_until);
                    newVip = currentVip > new Date() 
                        ? new Date(currentVip.getTime() + days * 24 * 60 * 60 * 1000)
                        : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                } else {
                    newVip = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                }
                db.run('UPDATE users SET vip_until = ? WHERE user_id = ?', [newVip.toISOString(), userId], (err) => {
                    if (err) return reject(err);
                    resolve(newVip);
                });
            });
        });
    },
    useCoins: (userId, amount) => {
        return new Promise((resolve) => {
            db.get('SELECT coins FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err || !row || row.coins < amount) return resolve(false);
                db.run('UPDATE users SET coins = coins - ? WHERE user_id = ?', [amount, userId], () => resolve(true));
            });
        });
    },
    getReferralCount: (userId) => {
        return new Promise((resolve) => {
            db.get('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?', [userId], (err, row) => {
                resolve(row ? row.count : 0);
            });
        });
    },
    getActiveUsers: () => {
        return new Promise((resolve) => {
            db.all('SELECT user_id FROM users WHERE is_active = 1', [], (err, rows) => {
                resolve(rows ? rows.map(r => r.user_id) : []);
            });
        });
    }
};

// ============= BOT INITIALIZATION =============
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 BOT RUNNING...');

// ============= EXPRESS SERVER =============
const app = express();
app.get('/', (req, res) => res.send('🤖 Telegram VCF Bot is Running!'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// ============= HELPER FUNCTIONS =============
function isAdmin(userId) { return ADMIN_IDS.includes(userId); }

async function checkUserMembership(userId) {
    try {
        const groupMember = await bot.getChatMember(FORCE_JOIN_GROUP, userId);
        const channelMember = await bot.getChatMember(FORCE_JOIN_CHANNEL, userId);
        const groupJoined = ['member', 'administrator', 'creator'].includes(groupMember.status);
        const channelJoined = ['member', 'administrator', 'creator'].includes(channelMember.status);
        return groupJoined && channelJoined;
    } catch (error) {
        console.error('Error checking membership:', error);
        return false;
    }
}

async function getText(userId, key, params = {}) {
    const lang = await dbHelpers.getUserLanguage(userId);
    let text = LANGUAGES[lang][key] || key;
    Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, params[param]);
    });
    return text;
}

function cleanPhone(number) { return number.replace(/\D/g, ''); }

function createVcard(name, phone, index = null) {
    const cleanNum = cleanPhone(phone);
    if (!cleanNum) return "";
    const displayName = index ? `${name} ${String(index).padStart(3, '0')}` : name;
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;TYPE=CELL:+${cleanNum}\nEND:VCARD\n`;
}

function extractVcards(content) {
    const regex = /BEGIN:VCARD.*?END:VCARD/gs;
    return content.match(regex) || [];
}

function extractPhonesFromVcf(content) {
    const phones = [];
    const patterns = [/TEL[^:]*:[\+]?([0-9]+)/gi, /item\d+\.TEL[^:]*:[\+]?([0-9]+)/gi];
    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) phones.push(match[1]);
    });
    return [...new Set(phones)];
}

function extractNamesFromVcf(content) {
    const names = [];
    const vcards = extractVcards(content);
    vcards.forEach(vcard => {
        const match = vcard.match(/FN:(.+)/i);
        if (match) names.push(match[1].trim());
    });
    return names;
}

function removeDuplicatePhones(vcards) {
    const seen = new Set();
    const unique = [];
    vcards.forEach(vcard => {
        const phones = extractPhonesFromVcf(vcard);
        if (phones.length > 0 && !seen.has(phones[0])) {
            seen.add(phones[0]);
            unique.push(vcard);
        }
    });
    return unique;
}

function deleteFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
        console.error('Error deleting file:', error);
    }
}

const getMenuText = (firstName, lang = 'id') => {
    const t = LANGUAGES[lang];
    return `${t.welcome.replace('{name}', firstName)}

🔄 *Konversi:*
/to_vcf - konversi file ke .vcf
/to_txt - konversi file ke .txt

✏️ *Input & Edit:*
/manual - input kontak manual
/add - tambah kontak ke .vcf
/delete - hapus kontak dari file
/renamectc - ganti nama kontak
/renamefile - ganti nama file

📂 *Kelola File:*
/merge - gabungkan file
/split - pecah file
/nodup - hapus kontak duplikat

📊 *Info & Extract:*
/count - hitung jumlah kontak
/getname - extract nama file
/generate - generate nama file
/getconten - ekstrak isi file .txt

⚙️ *Pengaturan:*
/setting - menu pengaturan
/status - cek status akun
/vip - daftar paket premium
/referral - undang teman, dapat koin
/lang - ganti bahasa bot

👨‍💼 Bot milik ${CEO_USERNAME}`;
};

// ============= BASIC COMMANDS =============
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const username = msg.from.username;
    
    let referredBy = null;
    const args = match[1].trim();
    if (args && args.startsWith(' ref')) {
        try { referredBy = parseInt(args.substring(4)); } catch (e) {}
    }
    
    await dbHelpers.addUser(userId, username, firstName, referredBy);
    
    if (!isAdmin(userId)) {
        const isMember = await checkUserMembership(userId);
        if (!isMember) {
            const lang = await dbHelpers.getUserLanguage(userId);
            const t = LANGUAGES[lang];
            const keyboard = {
                inline_keyboard: [
                    [{ text: t.join_group, url: `https://t.me/${FORCE_JOIN_GROUP.substring(1)}` }],
                    [{ text: t.join_channel, url: `https://t.me/${FORCE_JOIN_CHANNEL.substring(1)}` }],
                    [{ text: t.check_join, callback_data: 'check_membership' }]
                ]
            };
            return bot.sendMessage(chatId, t.must_join, { reply_markup: keyboard });
        }
    }
    
    const lang = await dbHelpers.getUserLanguage(userId);
    bot.sendMessage(chatId, getMenuText(firstName, lang), { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const lang = await dbHelpers.getUserLanguage(userId);
    bot.sendMessage(chatId, getMenuText(msg.from.first_name, lang), { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await dbHelpers.getUser(userId);
    if (!user) return bot.sendMessage(chatId, '❌ Ketik /start dulu');
    
    const vipUntil = new Date(user.vip_until);
    const isVip = vipUntil > new Date();
    let vipStatus;
    if (isVip) {
        const delta = vipUntil - new Date();
        const days = Math.floor(delta / (1000 * 60 * 60 * 24));
        vipStatus = days > 0 ? `✅ Premium\nSisa: ${days} hari` : `✅ Premium\nSisa: ${Math.floor(delta / (1000 * 60 * 60))} jam`;
    } else {
        vipStatus = '❌ Expired';
    }
    
    const refs = await dbHelpers.getReferralCount(userId);
    const statusMsg = `👤 *STATUS AKUN*\n\nNama: ${user.first_name}\nID: \`${userId}\`\nStatus: ${vipStatus}\n\n💰 Koin: ${user.coins}\n👥 Referral: ${refs}`;
    const keyboard = {
        inline_keyboard: [
            [{ text: '⬆️ Upgrade', callback_data: 'show_vip' }],
            [{ text: '💰 Tukar Koin', callback_data: 'exchange_coins' }]
        ]
    };
    bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.onText(/\/vip/, async (msg) => {
    const chatId = msg.chat.id;
    const vipMsg = `💎 *PAKET PREMIUM*\n\n🎁 Free Trial: 12 jam\n\n💳 Paket:\n• 1 Hari - Rp 2.000\n• 7 Hari - Rp 5.000\n• 30 Hari - Rp 20.000\n\n💰 Tukar Koin:\n• 5 Koin → 2 Hari\n• 10 Koin → 5 Hari\n• 50 Koin → 40 Hari\n\n📞 ${CEO_USERNAME}`;
    const keyboard = {
        inline_keyboard: [
            [{ text: '💬 CEO', url: `https://t.me/${CEO_USERNAME.substring(1)}` }],
            [{ text: '💰 Tukar', callback_data: 'exchange_coins' }]
        ]
    };
    bot.sendMessage(chatId, vipMsg, { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const botInfo = await bot.getMe();
    const link = `https://t.me/${botInfo.username}?start=ref${userId}`;
    const refs = await dbHelpers.getReferralCount(userId);
    const user = await dbHelpers.getUser(userId);
    const refMsg = `👥 *REFERRAL*\n\n🎁 1 referral = 1 koin\n\nReferral: ${refs}\nKoin: ${user ? user.coins : 0}\n\n🔗 Link:\n\`${link}\``;
    bot.sendMessage(chatId, refMsg, { parse_mode: 'Markdown' });
});

bot.onText(/\/setting/, async (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        inline_keyboard: [
            [{ text: '👤 Status Akun', callback_data: 'setting_status' }],
            [{ text: '💎 Upgrade Premium', callback_data: 'show_vip' }],
            [{ text: '💰 Tukar Koin', callback_data: 'exchange_coins' }],
            [{ text: '👥 Referral', callback_data: 'setting_referral' }],
            [{ text: '💬 Hubungi CEO', url: `https://t.me/${CEO_USERNAME.substring(1)}` }]
        ]
    };
    bot.sendMessage(chatId, '⚙️ *MENU PENGATURAN*\n\nPilih menu yang ingin Anda akses:', { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.onText(/\/lang/, async (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        inline_keyboard: [
            [{ text: '🇮🇩 Indonesia', callback_data: 'lang_id' }],
            [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
            [{ text: '🇨🇳 中文', callback_data: 'lang_zh' }]
        ]
    };
    bot.sendMessage(chatId, '🌐 Pilih Bahasa / Select Language / 选择语言', { reply_markup: keyboard });
});

// ============= FEATURE COMMANDS =============
const vipRequired = async (chatId, userId) => {
    const isVip = await dbHelpers.isVip(userId);
    if (!isVip) {
        const vipMsg = await getText(userId, 'vip_required_msg');
        bot.sendMessage(chatId, vipMsg);
        return false;
    }
    return true;
};

bot.onText(/\/count/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    bot.sendMessage(chatId, '📄 Silakan kirim file .vcf atau .txt untuk dihitung');
    userSessions.set(userId, { state: 'waiting_count_file' });
});

bot.onText(/\/manual/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'manual_nums', numbers: [] });
    bot.sendMessage(chatId, '📱 *Kirim nomor telepon*\n\nAnda bisa kirim:\n• 1 nomor: 081234567890\n• Banyak nomor (pisah dengan enter)\n\nKetik /done jika sudah selesai', { parse_mode: 'Markdown' });
});

bot.onText(/\/add/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'add_nums', numbers: [] });
    bot.sendMessage(chatId, '📱 *Kirim nomor telepon*\n\nKetik /done jika sudah selesai', { parse_mode: 'Markdown' });
});

bot.onText(/\/to_vcf/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'tovcf_file' });
    bot.sendMessage(chatId, '📁 Kirim file .txt');
});

bot.onText(/\/to_txt/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'totxt_files', vcf_files: [] });
    bot.sendMessage(chatId, '📄 Kirim file .vcf (boleh banyak), lalu ketik /done');
});

bot.onText(/\/split/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'split_file' });
    bot.sendMessage(chatId, '📄 Kirim file .txt');
});

bot.onText(/\/merge/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'merge_files', merge_files: [] });
    bot.sendMessage(chatId, '📄 Kirim file .vcf (boleh banyak), lalu ketik /done');
});

bot.onText(/\/nodup/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'nodup_files', nodup_files: [] });
    bot.sendMessage(chatId, '📄 Kirim file .vcf (boleh banyak), lalu ketik /done');
});

bot.onText(/\/getname/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'getname_file' });
    bot.sendMessage(chatId, '📄 Kirim file .vcf');
});

bot.onText(/\/getconten/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'getconten_file' });
    bot.sendMessage(chatId, '📄 Kirim file .txt');
});

bot.onText(/\/generate/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'gen_prefix' });
    bot.sendMessage(chatId, '✏️ Kirim prefix/awalan nama (contoh: User, Member, dll):');
});

bot.onText(/\/delete/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'delete_file' });
    bot.sendMessage(chatId, '📄 Kirim file .vcf:');
});

bot.onText(/\/renamectc/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'renamectc_file' });
    bot.sendMessage(chatId, '📄 Kirim file .vcf:');
});

bot.onText(/\/renamefile/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!await vipRequired(chatId, userId)) return;
    userSessions.set(userId, { state: 'renamefile_file' });
    bot.sendMessage(chatId, '📄 Kirim file yang akan diganti namanya:');
});

// ============= ADMIN COMMANDS =============
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    db.get('SELECT COUNT(*) as total FROM users', [], (err, total) => {
        db.get('SELECT COUNT(*) as vip FROM users WHERE vip_until > datetime("now")', [], (err2, vip) => {
            db.get('SELECT COUNT(*) as refs FROM referrals', [], (err3, refs) => {
                const totalUsers = total ? total.total : 0;
                const vipUsers = vip ? vip.vip : 0;
                bot.sendMessage(chatId, `🔐 *ADMIN*\n\nTotal: ${totalUsers}\nVIP: ${vipUsers}\nFree: ${totalUsers - vipUsers}\nReferrals: ${refs ? refs.refs : 0}`, { parse_mode: 'Markdown' });
            });
        });
    });
});

bot.onText(/\/data/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    db.all('SELECT user_id, username, first_name, vip_until, coins FROM users ORDER BY registered_at DESC LIMIT 20', [], (err, rows) => {
        if (!rows || rows.length === 0) return bot.sendMessage(chatId, 'Belum ada user');
        let text = '👥 *USER*\n\n';
        rows.forEach(u => {
            const isVip = u.vip_until && new Date(u.vip_until) > new Date();
            text += `${isVip ? '✅' : '❌'} ${u.first_name} - \`${u.user_id}\`\n`;
        });
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });
});

bot.onText(/\/adduser (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    try {
        const targetUserId = parseInt(match[1]);
        const days = parseInt(match[2]);
        const newVip = await dbHelpers.addVipDays(targetUserId, days);
        bot.sendMessage(chatId, `✅ User ${targetUserId} VIP hingga ${newVip.toLocaleDateString('id-ID')}`);
    } catch (error) {
        bot.sendMessage(chatId, '❌ Error: Format: /adduser <id> <days>');
    }
});

bot.onText(/\/stop (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    try {
        const targetUserId = parseInt(match[1]);
        db.run('UPDATE users SET is_active = 0 WHERE user_id = ?', [targetUserId], (err) => {
            bot.sendMessage(chatId, err ? '❌ Error' : `✅ User ${targetUserId} stopped`);
        });
    } catch (error) {
        bot.sendMessage(chatId, '❌ Error: Format: /stop <id>');
    }
});

bot.onText(/\/chatalluser/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    userSessions.set(userId, { state: 'broadcast_msg' });
    bot.sendMessage(chatId, '📢 Kirim pesan broadcast:');
});

bot.onText(/\/done/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const session = userSessions.get(userId);
    if (!session) return bot.sendMessage(chatId, '❌ Tidak ada proses yang aktif');
    
    if (session.state === 'manual_nums' || session.state === 'add_nums') {
        if (!session.numbers || session.numbers.length === 0) {
            return bot.sendMessage(chatId, '❌ Belum ada nomor. Kirim nomor dulu!');
        }
        const keyboard = {
            inline_keyboard: [
                [{ text: '📄 TXT', callback_data: session.state.includes('manual') ? 'manual_txt' : 'add_txt' }],
                [{ text: '📇 VCF', callback_data: session.state.includes('manual') ? 'manual_vcf' : 'add_vcf' }]
            ]
        };
        session.state = session.state.replace('nums', 'format');
        userSessions.set(userId, session);
        return bot.sendMessage(chatId, `📊 Total: ${session.numbers.length} nomor\n\nPilih format output:`, { reply_markup: keyboard });
    }
    
    if (session.state === 'tovcf_wait_done') {
        session.state = 'tovcf_name';
        userSessions.set(userId, session);
        return bot.sendMessage(chatId, '📝 Nama kontak:');
    }
    
    if (session.state === 'totxt_files') {
        if (!session.vcf_files || session.vcf_files.length === 0) return bot.sendMessage(chatId, '❌ Tidak ada file');
        try {
            let phones = [];
            for (const fp of session.vcf_files) {
                const content = fs.readFileSync(fp, 'utf8');
                phones = phones.concat(extractPhonesFromVcf(content));
            }
            phones = [...new Set(phones)];
            const outPath = path.join(TEMP_FOLDER, `result_${userId}.txt`);
            fs.writeFileSync(outPath, phones.join('\n'));
            await bot.sendDocument(chatId, outPath, { caption: '✅ Selesai' });
            session.vcf_files.forEach(f => deleteFile(f));
            deleteFile(outPath);
            userSessions.delete(userId);
        } catch (error) {
            console.error('Error in to_txt:', error);
            session.vcf_files.forEach(f => deleteFile(f));
            userSessions.delete(userId);
            bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }
    
    if (session.state === 'merge_files') {
        if (!session.merge_files || session.merge_files.length < 2) {
            bot.sendMessage(chatId, '❌ Minimal 2 file untuk digabung');
            session.merge_files.forEach(f => deleteFile(f));
            userSessions.delete(userId);
            return;
        }
        try {
            let mergedContent = '';
            let totalContacts = 0;
            for (const fp of session.merge_files) {
                const content = fs.readFileSync(fp, 'utf8');
                const vcards = extractVcards(content);
                mergedContent += vcards.join('\n') + '\n';
                totalContacts += vcards.length;
            }
            const outPath = path.join(TEMP_FOLDER, `merged_${userId}.vcf`);
            fs.writeFileSync(outPath, mergedContent);
            await bot.sendDocument(chatId, outPath, { caption: `✅ ${session.merge_files.length} file berhasil digabung!\n\nTotal kontak: ${totalContacts}` });
            session.merge_files.forEach(f => deleteFile(f));
            deleteFile(outPath);
            userSessions.delete(userId);
        } catch (error) {
            console.error('Error in merge:', error);
            session.merge_files.forEach(f => deleteFile(f));
            userSessions.delete(userId);
            bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }
    
    if (session.state === 'nodup_files') {
        if (!session.nodup_files || session.nodup_files.length === 0) return bot.sendMessage(chatId, '❌ Tidak ada file');
        bot.sendMessage(chatId, '⏳ Menghapus duplikat...');
        try {
            let allVcards = [];
            for (const fp of session.nodup_files) {
                const content = fs.readFileSync(fp, 'utf8');
                allVcards = allVcards.concat(extractVcards(content));
            }
            const originalCount = allVcards.length;
            const uniqueVcards = removeDuplicatePhones(allVcards);
            const removed = originalCount - uniqueVcards.length;
            const outPath = path.join(TEMP_FOLDER, `nodup_${userId}.vcf`);
            fs.writeFileSync(outPath, uniqueVcards.join('\n'));
            await bot.sendDocument(chatId, outPath, { caption: `✅ Selesai!\n\nAsli: ${originalCount}\nUnik: ${uniqueVcards.length}\nDihapus: ${removed}` });
            session.nodup_files.forEach(f => deleteFile(f));
            deleteFile(outPath);
            userSessions.delete(userId);
        } catch (error) {
            console.error('Error in nodup:', error);
            session.nodup_files.forEach(f => deleteFile(f));
            userSessions.delete(userId);
            bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }
});

bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const session = userSessions.get(userId);
    if (session) {
        if (session.vcf_files) session.vcf_files.forEach(f => deleteFile(f));
        if (session.merge_files) session.merge_files.forEach(f => deleteFile(f));
        if (session.nodup_files) session.nodup_files.forEach(f => deleteFile(f));
        if (session.file_path) deleteFile(session.file_path);
        if (session.temp_file) deleteFile(session.temp_file);
        userSessions.delete(userId);
    }
    bot.sendMessage(chatId, '❌ Dibatalkan');
});

// ============= CALLBACK QUERY HANDLER =============
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    bot.answerCallbackQuery(query.id);
    
    if (data === 'check_membership') {
        const isMember = await checkUserMembership(userId);
        const lang = await dbHelpers.getUserLanguage(userId);
        const t = LANGUAGES[lang];
        if (isMember) {
            bot.editMessageText(getMenuText(query.from.first_name, lang), {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            });
        } else {
            bot.editMessageText(t.not_joined, { chat_id: chatId, message_id: query.message.message_id });
        }
        return;
    }
    
    if (data.startsWith('lang_')) {
        const langCode = data.substring(5);
        await dbHelpers.setUserLanguage(userId, langCode);
        bot.editMessageText(LANGUAGES[langCode].lang_changed, { chat_id: chatId, message_id: query.message.message_id });
        return;
    }
    
    if (data === 'manual_txt' || data === 'manual_vcf' || data === 'add_txt' || data === 'add_vcf') {
        const session = userSessions.get(userId);
        if (!session) return;
        const formatType = data.split('_')[1];
        session.format = formatType;
        if (formatType === 'txt') {
            session.state = data.includes('manual') ? 'manual_fname' : 'add_fname';
            userSessions.set(userId, session);
            bot.editMessageText('📄 Kirim nama file (tanpa ekstensi):', { chat_id: chatId, message_id: query.message.message_id });
        } else {
            session.state = data.includes('manual') ? 'manual_name' : 'add_name';
            userSessions.set(userId, session);
            bot.editMessageText('📝 Kirim nama kontak:', { chat_id: chatId, message_id: query.message.message_id });
        }
        return;
    }
    
    if (data === 'show_vip') {
        const keyboard = { inline_keyboard: [[{ text: '💬 CEO', url: `https://t.me/${CEO_USERNAME.substring(1)}` }]] };
        bot.editMessageText('💎 *PAKET PREMIUM*\n\n1 Hari - Rp 2.000\n7 Hari - Rp 5.000\n30 Hari - Rp 20.000', {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: keyboard
        });
        return;
    }
    
    if (data === 'exchange_coins') {
        const user = await dbHelpers.getUser(userId);
        const keyboard = {
            inline_keyboard: [
                [{ text: '5 Koin → 2 Hari', callback_data: 'exc_2day' }],
                [{ text: '10 Koin → 5 Hari', callback_data: 'exc_5day' }],
                [{ text: '50 Koin → 40 Hari', callback_data: 'exc_40day' }]
            ]
        };
        bot.editMessageText(`💰 Koin: ${user ? user.coins : 0}\n\nPilih:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: keyboard });
        return;
    }
    
    if (data.startsWith('exc_')) {
        const pkgKey = data.substring(4);
        const pkg = COIN_PACKAGES[pkgKey];
        if (!pkg) return bot.editMessageText('❌ Invalid', { chat_id: chatId, message_id: query.message.message_id });
        const user = await dbHelpers.getUser(userId);
        if (user.coins < pkg.coins) {
            return bot.editMessageText(`❌ Koin tidak cukup\n\nAnda: ${user.coins}\nPerlu: ${pkg.coins}`, { chat_id: chatId, message_id: query.message.message_id });
        }
        const success = await dbHelpers.useCoins(userId, pkg.coins);
        if (success) {
            const newVip = await dbHelpers.addVipDays(userId, pkg.days);
            bot.editMessageText(`✅ Berhasil!\n\nVIP hingga ${newVip.toLocaleDateString('id-ID')}`, { chat_id: chatId, message_id: query.message.message_id });
        }
        return;
    }
    
    if (data === 'setting_status') {
        const user = await dbHelpers.getUser(userId);
        const vipUntil = new Date(user.vip_until);
        const isVip = vipUntil > new Date();
        let vipStatus;
        if (isVip) {
            const delta = vipUntil - new Date();
            const days = Math.floor(delta / (1000 * 60 * 60 * 24));
            vipStatus = days > 0 ? `✅ Premium\nSisa: ${days} hari` : `✅ Premium\nSisa: ${Math.floor(delta / (1000 * 60 * 60))} jam`;
        } else {
            vipStatus = '❌ Expired';
        }
        const refs = await dbHelpers.getReferralCount(userId);
        bot.editMessageText(`👤 *STATUS AKUN*\n\nNama: ${user.first_name}\nID: \`${userId}\`\nStatus: ${vipStatus}\n\n💰 Koin: ${user.coins}\n👥 Referral: ${refs}`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
        });
        return;
    }
    
    if (data === 'setting_referral') {
        const botInfo = await bot.getMe();
        const link = `https://t.me/${botInfo.username}?start=ref${userId}`;
        const refs = await dbHelpers.getReferralCount(userId);
        const user = await dbHelpers.getUser(userId);
        bot.editMessageText(`👥 *REFERRAL*\n\n🎁 1 referral = 1 koin\n\nReferral: ${refs}\nKoin: ${user ? user.coins : 0}\n\n🔗 Link:\n\`${link}\``, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
        });
        return;
    }
});

// ============= TEXT MESSAGE HANDLER =============
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    if (text.startsWith('/')) return;
    const session = userSessions.get(userId);
    if (!session) return;
    
    try {
        if (session.state === 'manual_nums' || session.state === 'add_nums') {
            const nums = text.includes('\n') ? text.split('\n').filter(n => n.trim()) : [text.trim()];
            session.numbers = session.numbers.concat(nums);
            userSessions.set(userId, session);
            bot.sendMessage(chatId, `✅ ${nums.length} nomor diterima\nTotal: ${session.numbers.length} nomor\n\nKirim nomor lagi atau ketik /done untuk lanjut`);
        }
        else if (session.state === 'manual_name' || session.state === 'add_name') {
            session.contact_name = text.trim();
            session.state = session.state.replace('name', 'fname');
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '📄 Kirim nama file (tanpa ekstensi):');
        }
        else if (session.state === 'manual_fname' || session.state === 'add_fname') {
            let fname = text.trim();
            const format = session.format;
            bot.sendMessage(chatId, '⏳ Memproses...');
            if (format === 'txt') {
                if (fname.endsWith('.txt')) fname = fname.slice(0, -4);
                const outPath = path.join(TEMP_FOLDER, `${fname}_${userId}.txt`);
                fs.writeFileSync(outPath, session.numbers.join('\n'));
                await bot.sendDocument(chatId, outPath, { caption: `✅ File TXT berhasil dibuat!\n\nTotal: ${session.numbers.length} nomor` });
                deleteFile(outPath);
            } else {
                if (fname.endsWith('.vcf')) fname = fname.slice(0, -4);
                const outPath = path.join(TEMP_FOLDER, `${fname}_${userId}.vcf`);
                let vcfContent = '';
                session.numbers.forEach((num, idx) => {
                    vcfContent += createVcard(session.contact_name, num, idx + 1);
                });
                fs.writeFileSync(outPath, vcfContent);
                await bot.sendDocument(chatId, outPath, { caption: `✅ File VCF berhasil dibuat!\n\nTotal: ${session.numbers.length} kontak` });
                deleteFile(outPath);
            }
            userSessions.delete(userId);
        }
        else if (session.state === 'tovcf_name') {
            session.contact_name = text.trim();
            session.state = 'tovcf_fname';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '📄 Nama file:');
        }
        else if (session.state === 'tovcf_fname') {
            let fname = text.trim();
            if (fname.endsWith('.vcf')) fname = fname.slice(0, -4);
            session.file_name = fname;
            session.state = 'tovcf_limit';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '🔢 Jumlah per file (atau \'all\'):');
        }
        else if (session.state === 'tovcf_limit') {
            const input = text.trim().toLowerCase();
            const nums = session.numbers;
            const cname = session.contact_name;
            const fname = session.file_name;
            const limit = input === 'all' ? nums.length : parseInt(input) || 100;
            bot.sendMessage(chatId, '⏳ Proses...');
            const totalFiles = Math.ceil(nums.length / limit);
            if (totalFiles === 1 || input === 'all') {
                const outPath = path.join(TEMP_FOLDER, `${fname}_${userId}.vcf`);
                let vcfContent = '';
                nums.forEach((num, idx) => {
                    vcfContent += createVcard(cname, num, idx + 1);
                });
                fs.writeFileSync(outPath, vcfContent);
                await bot.sendDocument(chatId, outPath, { caption: '✅ Selesai!' });
                deleteFile(outPath);
            } else {
                for (let i = 0; i < totalFiles; i++) {
                    const start = i * limit;
                    const end = Math.min(start + limit, nums.length);
                    const chunk = nums.slice(start, end);
                    const outPath = path.join(TEMP_FOLDER, `${fname}${i + 1}_${userId}.vcf`);
                    let vcfContent = '';
                    chunk.forEach((num, idx) => {
                        vcfContent += createVcard(cname, num, start + idx + 1);
                    });
                    fs.writeFileSync(outPath, vcfContent);
                    await bot.sendDocument(chatId, outPath);
                    deleteFile(outPath);
                    if (i < totalFiles - 1) await new Promise(resolve => setTimeout(resolve, 500));
                }
                bot.sendMessage(chatId, `✅ Semua file berhasil dikirim! (${totalFiles} file)`);
            }
            deleteFile(session.temp_file);
            userSessions.delete(userId);
        }
        else if (session.state === 'split_count') {
            const parts = parseInt(text);
            if (isNaN(parts) || parts <= 0) return bot.sendMessage(chatId, '❌ Harus berupa angka lebih dari 0');
            bot.sendMessage(chatId, '⏳ Memproses split...');
            const content = fs.readFileSync(session.split_file, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            const size = Math.ceil(lines.length / parts);
            const originalName = session.original_name || 'split';
            for (let i = 0; i < parts; i++) {
                const chunk = lines.slice(i * size, (i + 1) * size);
                if (chunk.length === 0) continue;
                const outPath = path.join(TEMP_FOLDER, `${originalName}${i + 1}_${userId}.txt`);
                fs.writeFileSync(outPath, chunk.join('\n'));
                await bot.sendDocument(chatId, outPath);
                deleteFile(outPath);
                if (i < parts - 1) await new Promise(resolve => setTimeout(resolve, 500));
            }
            deleteFile(session.split_file);
            userSessions.delete(userId);
            bot.sendMessage(chatId, '✅ Semua file berhasil dikirim!');
        }
        else if (session.state === 'gen_prefix') {
            session.prefix = text.trim();
            session.state = 'gen_count';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '🔢 Berapa jumlah nama yang akan digenerate?');
        }
        else if (session.state === 'gen_count') {
            const count = parseInt(text);
            if (isNaN(count) || count <= 0 || count > 10000) return bot.sendMessage(chatId, '❌ Jumlah harus antara 1-10000');
            session.count = count;
            session.state = 'gen_fname';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '📄 Nama file output:');
        }
        else if (session.state === 'gen_fname') {
            let fname = text.trim();
            if (fname.endsWith('.txt')) fname = fname.slice(0, -4);
            const names = [];
            for (let i = 1; i <= session.count; i++) {
                names.push(`${session.prefix} ${String(i).padStart(3, '0')}`);
            }
            const outPath = path.join(TEMP_FOLDER, `${fname}_${userId}.txt`);
            fs.writeFileSync(outPath, names.join('\n'));
            await bot.sendDocument(chatId, outPath, { caption: `✅ ${session.count} nama berhasil digenerate!` });
            deleteFile(outPath);
            userSessions.delete(userId);
        }
        else if (session.state === 'delete_pattern') {
            const pattern = text.trim();
            const content = fs.readFileSync(session.vcf_file, 'utf8');
            const vcards = extractVcards(content);
            const filtered = [];
            let deleted = 0;
            vcards.forEach(vcard => {
                if (!vcard.toLowerCase().includes(pattern.toLowerCase())) {
                    filtered.push(vcard);
                } else {
                    deleted++;
                }
            });
            if (deleted === 0) {
                deleteFile(session.vcf_file);
                userSessions.delete(userId);
                return bot.sendMessage(chatId, '❌ Tidak ada kontak yang cocok ditemukan');
            }
            fs.writeFileSync(session.vcf_file, filtered.join('\n'));
            await bot.sendDocument(chatId, session.vcf_file, { caption: `✅ ${deleted} kontak berhasil dihapus!` });
            deleteFile(session.vcf_file);
            userSessions.delete(userId);
        }
        else if (session.state === 'renamectc_old') {
            session.old_name = text.trim();
            session.state = 'renamectc_new';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '✏️ Kirim nama baru:');
        }
        else if (session.state === 'renamectc_new') {
            const newName = text.trim();
            const oldName = session.old_name;
            let content = fs.readFileSync(session.vcf_file, 'utf8');
            const count = (content.match(new RegExp(`FN:${oldName}`, 'g')) || []).length;
            content = content.replace(new RegExp(`FN:${oldName}`, 'g'), `FN:${newName}`);
            fs.writeFileSync(session.vcf_file, content);
            await bot.sendDocument(chatId, session.vcf_file, { caption: `✅ ${count} nama berhasil diganti!` });
            deleteFile(session.vcf_file);
            userSessions.delete(userId);
        }
        else if (session.state === 'renamefile_name') {
            let newName = text.trim();
            const ext = session.extension;
            if (ext && !newName.endsWith(ext)) newName = `${newName}${ext}`;
            await bot.sendDocument(chatId, session.file_path, { caption: '✅ File berhasil direname!', filename: newName });
            deleteFile(session.file_path);
            userSessions.delete(userId);
        }
        else if (session.state === 'broadcast_msg') {
            const message = text;
            const users = await dbHelpers.getActiveUsers();
            bot.sendMessage(chatId, `⏳ Kirim ke ${users.length} user...`);
            let success = 0;
            for (const uid of users) {
                try {
                    await bot.sendMessage(uid, message);
                    success++;
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {}
            }
            bot.sendMessage(chatId, `✅ Terkirim: ${success}/${users.length}`);
            userSessions.delete(userId);
        }
    } catch (error) {
        console.error('Error in text handler:', error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        userSessions.delete(userId);
    }
});

// ============= DOCUMENT HANDLER =============
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const doc = msg.document;
    const session = userSessions.get(userId);
    
    if (!session) {
        const isVip = await dbHelpers.isVip(userId);
        if (!isVip) return;
        try {
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `count_${userId}_${Date.now()}.tmp`);
            await bot.downloadFile(doc.file_id, filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            let count, msg;
            if (doc.file_name.endsWith('.vcf')) {
                const vcards = extractVcards(content);
                count = vcards.length;
                msg = await getText(userId, 'total_contacts', { count });
            } else {
                const lines = content.split('\n').filter(l => l.trim());
                count = lines.length;
                msg = await getText(userId, 'total_lines', { count });
            }
            deleteFile(filePath);
            bot.sendMessage(chatId, msg);
        } catch (error) {
            console.error('Error processing count:', error);
            bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
        return;
    }
    
    try {
        if (session.state === 'tovcf_file') {
            if (!doc.file_name.endsWith('.txt')) return bot.sendMessage(chatId, '❌ Harus .txt!');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `tovcf_${userId}.txt`);
            await bot.downloadFile(doc.file_id, filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const nums = content.split('\n').filter(l => l.trim());
            if (nums.length === 0) {
                deleteFile(filePath);
                return bot.sendMessage(chatId, '❌ Kosong!');
            }
            session.numbers = nums;
            session.temp_file = filePath;
            session.state = 'tovcf_wait_done';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, `✅ ${nums.length} nomor. Ketik /done`);
        }
        else if (session.state === 'totxt_files') {
            if (!doc.file_name.endsWith('.vcf')) return bot.sendMessage(chatId, '❌ Harus file .vcf');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `totxt_${userId}_${doc.file_name}`);
            await bot.downloadFile(doc.file_id, filePath);
            session.vcf_files.push(filePath);
            userSessions.set(userId, session);
            bot.sendMessage(chatId, `✅ ${doc.file_name} diterima`);
        }
        else if (session.state === 'split_file') {
            if (!doc.file_name.endsWith('.txt')) return bot.sendMessage(chatId, '❌ Harus .txt');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `split_${userId}.txt`);
            await bot.downloadFile(doc.file_id, filePath);
            const originalName = doc.file_name.replace('.txt', '');
            session.split_file = filePath;
            session.original_name = originalName;
            session.state = 'split_count';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '🔢 Mau dibagi jadi berapa bagian?');
        }
        else if (session.state === 'merge_files') {
            if (!doc.file_name.endsWith('.vcf')) return bot.sendMessage(chatId, '❌ Harus file .vcf');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `merge_${userId}_${doc.file_name}`);
            await bot.downloadFile(doc.file_id, filePath);
            session.merge_files.push(filePath);
            userSessions.set(userId, session);
            bot.sendMessage(chatId, `✅ ${doc.file_name} diterima. Total: ${session.merge_files.length} file`);
        }
        else if (session.state === 'nodup_files') {
            if (!doc.file_name.endsWith('.vcf')) return bot.sendMessage(chatId, '❌ Harus file .vcf');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `nodup_${userId}_${doc.file_name}`);
            await bot.downloadFile(doc.file_id, filePath);
            session.nodup_files.push(filePath);
            userSessions.set(userId, session);
            bot.sendMessage(chatId, `✅ ${doc.file_name} diterima`);
        }
        else if (session.state === 'getname_file') {
            if (!doc.file_name.endsWith('.vcf')) return bot.sendMessage(chatId, '❌ Harus file .vcf');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `getname_${userId}.vcf`);
            await bot.downloadFile(doc.file_id, filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const names = extractNamesFromVcf(content);
            if (names.length === 0) {
                deleteFile(filePath);
                userSessions.delete(userId);
                return bot.sendMessage(chatId, '❌ Tidak ada nama ditemukan');
            }
            const outPath = path.join(TEMP_FOLDER, `names_${userId}.txt`);
            fs.writeFileSync(outPath, names.join('\n'));
            await bot.sendDocument(chatId, outPath, { caption: `✅ ${names.length} nama` });
            deleteFile(filePath);
            deleteFile(outPath);
            userSessions.delete(userId);
        }
        else if (session.state === 'getconten_file') {
            if (!doc.file_name.endsWith('.txt')) return bot.sendMessage(chatId, '❌ Harus file .txt');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `getconten_${userId}.txt`);
            await bot.downloadFile(doc.file_id, filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            const preview = content.length < 4000 ? content : content.substring(0, 4000) + '...';
            const msg = `📄 *ISI FILE*\n\n\`\`\`\n${preview}\n\`\`\`\n\n📊 Total baris: ${lines.length}`;
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            deleteFile(filePath);
            userSessions.delete(userId);
        }
        else if (session.state === 'delete_file') {
            if (!doc.file_name.endsWith('.vcf')) return bot.sendMessage(chatId, '❌ Harus file .vcf');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `del_${userId}.vcf`);
            await bot.downloadFile(doc.file_id, filePath);
            session.vcf_file = filePath;
            session.original_name = doc.file_name;
            session.state = 'delete_pattern';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '🔍 Kirim nama atau nomor yang akan dihapus:');
        }
        else if (session.state === 'renamectc_file') {
            if (!doc.file_name.endsWith('.vcf')) return bot.sendMessage(chatId, '❌ Harus file .vcf');
            const file = await bot.getFile(doc.file_id);
            const filePath = path.join(TEMP_FOLDER, `rename_${userId}.vcf`);
            await bot.downloadFile(doc.file_id, filePath);
            session.vcf_file = filePath;
            session.original_name = doc.file_name;
            session.state = 'renamectc_old';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '🔍 Kirim nama lama yang akan diganti:');
        }
        else if (session.state === 'renamefile_file') {
            const file = await bot.getFile(doc.file_id);
            const ext = path.extname(doc.file_name);
            const filePath = path.join(TEMP_FOLDER, `renamefile_${userId}${ext}`);
            await bot.downloadFile(doc.file_id, filePath);
            session.file_path = filePath;
            session.extension = ext;
            session.state = 'renamefile_name';
            userSessions.set(userId, session);
            bot.sendMessage(chatId, '✏️ Kirim nama file baru (tanpa ekstensi):');
        }
    } catch (error) {
        console.error('Error in document handler:', error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        userSessions.delete(userId);
    }
});

// ============= ERROR HANDLING =============
bot.on('polling_error', (error) => console.error('Polling error:', error));
process.on('uncaughtException', (error) => console.error('Uncaught Exception:', error));
process.on('unhandledRejection', (reason, promise) => console.error('Unhandled Rejection at:', promise, 'reason:', reason));

// ============= GRACEFUL SHUTDOWN =============
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    bot.stopPolling();
    db.close();
    process.exit(0);
});

console.log('✅ Bot initialized successfully!');
