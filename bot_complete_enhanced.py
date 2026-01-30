#!/usr/bin/env python3
# ============= PREMIUM VCF BOT - COMPLETE & ENHANCED =============
# Bot Telegram Multi-Fitur dengan Sistem VIP
# Siap dijalankan di PythonAnywhere atau server lain

import os
import re
import sqlite3
import logging
import asyncio
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaDocument, ChatMember
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    filters, ContextTypes, ConversationHandler
)
from telegram.error import TelegramError

# ============= KONFIGURASI =============
BOT_TOKEN = "8466591141:AAEaDpi5UwGZM0RXbVeXT39QPXXWlOHx7j4"

# ID ADMIN (ganti dengan ID Telegram Anda - cek di @userinfobot)
ADMIN_IDS = [8496726839, 987654321]

# FORCE JOIN - User harus join group & channel ini
FORCE_JOIN_GROUP = "@xuantionZANGvip"  # Group
FORCE_JOIN_CHANNEL = "@xuantaionzang"  # Channel

CEO_USERNAME = "@XIXI8778"
DB_FILE = "bot_database.db"
TEMP_FOLDER = "temp_files"

# Paket VIP & Koin
VIP_PACKAGES = {
    "1day": {"days": 1, "price": 2000},
    "7day": {"days": 7, "price": 5000},
    "30day": {"days": 30, "price": 20000},
}

COIN_PACKAGES = {
    "2day": {"days": 2, "coins": 5},
    "5day": {"days": 5, "coins": 10},
    "40day": {"days": 40, "coins": 50},
}

# Setup logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Buat folder temp
os.makedirs(TEMP_FOLDER, exist_ok=True)

# ============= MULTI-LANGUAGE SUPPORT =============
LANGUAGES = {
    'id': {
        'welcome': 'Hallo {name}, selamat datang di bot',
        'features': 'Fitur bot:',
        'to_vcf': 'konversi file ke .vcf',
        'to_txt': 'konversi file ke .txt',
        'admin': 'fitur admin/navy',
        'manual': 'input kontak manual',
        'add': 'tambah kontak ke .vcf',
        'delete': 'hapus kontak dari file',
        'renamectc': 'ganti nama kontak',
        'renamefile': 'ganti nama file',
        'merge': 'gabungkan file',
        'split': 'pecah file',
        'count': 'hitung jumlah kontak',
        'nodup': 'hapus kontak duplikat',
        'getname': 'extract nama file',
        'generate': 'generate nama file',
        'getconten': 'ekstrak isi file .txt',
        'setting': 'menu pengaturan',
        'status': 'cek status akun',
        'vip': 'daftar paket premium',
        'referral': 'undang teman, dapat koin',
        'lang': 'ganti bahasa bot',
        'bot_owner': 'Bot milik',
        'lang_select': '🌐 Pilih Bahasa / Select Language / 选择语言',
        'lang_changed': '✅ Bahasa berhasil diubah ke Indonesia',
        'vip_required_msg': '⚠️ Fitur Premium\n\nFree trial Anda sudah habis!\nUpgrade ke Premium untuk lanjut.\n\nGunakan /vip untuk lihat paket.',
        'send_file': '📄 Silakan kirim file',
        'total_contacts': '📊 Total kontak: {count}',
        'total_lines': '📊 Total baris: {count}',
        'must_join': '⚠️ Anda harus join Group dan Channel terlebih dahulu untuk menggunakan bot ini!',
        'join_group': '📢 Join Group',
        'join_channel': '📣 Join Channel',
        'check_join': '✅ Saya Sudah Join',
        'not_joined': '❌ Anda belum join Group dan Channel!\n\nSilakan join terlebih dahulu, lalu klik tombol "Saya Sudah Join".',
    },
    'en': {
        'welcome': 'Hello {name}, welcome to the bot',
        'features': 'Bot features:',
        'to_vcf': 'convert file to .vcf',
        'to_txt': 'convert file to .txt',
        'admin': 'admin/navy features',
        'manual': 'manual contact input',
        'add': 'add contact to .vcf',
        'delete': 'delete contact from file',
        'renamectc': 'rename contact',
        'renamefile': 'rename file',
        'merge': 'merge files',
        'split': 'split file',
        'count': 'count contacts',
        'nodup': 'remove duplicates',
        'getname': 'extract file names',
        'generate': 'generate file names',
        'getconten': 'extract .txt file content',
        'setting': 'settings menu',
        'status': 'check account status',
        'vip': 'premium package list',
        'referral': 'invite friends, earn coins',
        'lang': 'change bot language',
        'bot_owner': 'Bot owned by',
        'lang_select': '🌐 Select Language / Pilih Bahasa / 选择语言',
        'lang_changed': '✅ Language successfully changed to English',
        'vip_required_msg': '⚠️ Premium Feature\n\nYour free trial has expired!\nUpgrade to Premium to continue.\n\nUse /vip to see packages.',
        'send_file': '📄 Please send file',
        'total_contacts': '📊 Total contacts: {count}',
        'total_lines': '📊 Total lines: {count}',
        'must_join': '⚠️ You must join the Group and Channel first to use this bot!',
        'join_group': '📢 Join Group',
        'join_channel': '📣 Join Channel',
        'check_join': '✅ I Have Joined',
        'not_joined': '❌ You have not joined the Group and Channel yet!\n\nPlease join first, then click the "I Have Joined" button.',
    },
    'zh': {
        'welcome': '你好 {name}，欢迎使用机器人',
        'features': '机器人功能：',
        'to_vcf': '转换文件为 .vcf',
        'to_txt': '转换文件为 .txt',
        'admin': '管理员功能',
        'manual': '手动输入联系人',
        'add': '添加联系人到 .vcf',
        'delete': '从文件中删除联系人',
        'renamectc': '重命名联系人',
        'renamefile': '重命名文件',
        'merge': '合并文件',
        'split': '拆分文件',
        'count': '计算联系人数量',
        'nodup': '删除重复项',
        'getname': '提取文件名称',
        'generate': '生成文件名称',
        'getconten': '提取 .txt 文件内容',
        'setting': '设置菜单',
        'status': '查看账户状态',
        'vip': '高级套餐列表',
        'referral': '邀请好友，获得金币',
        'lang': '更改机器人语言',
        'bot_owner': '机器人所有者',
        'lang_select': '🌐 选择语言 / Select Language / Pilih Bahasa',
        'lang_changed': '✅ 语言已成功更改为中文',
        'vip_required_msg': '⚠️ 高级功能\n\n您的免费试用已过期！\n升级到高级版以继续使用。\n\n使用 /vip 查看套餐。',
        'send_file': '📄 请发送文件',
        'total_contacts': '📊 总联系人数：{count}',
        'total_lines': '📊 总行数：{count}',
        'must_join': '⚠️ 您必须先加入群组和频道才能使用此机器人！',
        'join_group': '📢 加入群组',
        'join_channel': '📣 加入频道',
        'check_join': '✅ 我已加入',
        'not_joined': '❌ 您尚未加入群组和频道！\n\n请先加入，然后点击"我已加入"按钮。',
    }
}

# ============= DATABASE =============
class Database:
    def __init__(self):
        self.conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        self.create_tables()
    
    def create_tables(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                vip_until TIMESTAMP,
                coins INTEGER DEFAULT 0,
                referred_by INTEGER,
                is_active INTEGER DEFAULT 1,
                language TEXT DEFAULT 'id'
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER,
                referred_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Migration: Add language column if it doesn't exist
        try:
            cursor.execute("SELECT language FROM users LIMIT 1")
        except sqlite3.OperationalError:
            # Column doesn't exist, add it
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'id'")
                logger.info("Added language column to users table")
            except:
                pass
        
        self.conn.commit()
    
    def add_user(self, user_id, username, first_name, referred_by=None):
        cursor = self.conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
        if cursor.fetchone():
            return False
        
        trial_end = datetime.now() + timedelta(hours=12)
        cursor.execute('''
            INSERT INTO users (user_id, username, first_name, vip_until, referred_by, language)
            VALUES (?, ?, ?, ?, ?, 'id')
        ''', (user_id, username, first_name, trial_end, referred_by))
        
        if referred_by:
            cursor.execute('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)', (referred_by, user_id))
            cursor.execute('UPDATE users SET coins = coins + 1 WHERE user_id = ?', (referred_by,))
        
        self.conn.commit()
        return True
    
    def get_user_language(self, user_id):
        cursor = self.conn.cursor()
        try:
            cursor.execute('SELECT language FROM users WHERE user_id = ?', (user_id,))
            result = cursor.fetchone()
            if result and result[0]:
                return result[0]
        except sqlite3.OperationalError:
            # Column doesn't exist yet, return default
            pass
        return 'id'  # Default to Indonesian
    
    def set_user_language(self, user_id, language):
        cursor = self.conn.cursor()
        try:
            cursor.execute('UPDATE users SET language = ? WHERE user_id = ?', (language, user_id))
            self.conn.commit()
        except sqlite3.OperationalError:
            # Column doesn't exist, skip
            pass
    
    def is_vip(self, user_id):
        cursor = self.conn.cursor()
        cursor.execute('SELECT vip_until FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        if not result or not result[0]:
            return False
        vip_until = datetime.fromisoformat(result[0])
        return datetime.now() < vip_until
    
    def get_user(self, user_id):
        cursor = self.conn.cursor()
        cursor.execute('SELECT user_id, username, first_name, registered_at, vip_until, coins, is_active FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        if result:
            return {'user_id': result[0], 'username': result[1], 'first_name': result[2], 
                    'registered_at': result[3], 'vip_until': result[4], 'coins': result[5], 'is_active': result[6]}
        return None
    
    def add_vip_days(self, user_id, days):
        cursor = self.conn.cursor()
        cursor.execute("SELECT vip_until FROM users WHERE user_id = ?", (user_id,))
        result = cursor.fetchone()
        
        if result and result[0]:
            current_vip = datetime.fromisoformat(result[0])
            new_vip = current_vip + timedelta(days=days) if current_vip > datetime.now() else datetime.now() + timedelta(days=days)
        else:
            new_vip = datetime.now() + timedelta(days=days)
        
        cursor.execute('UPDATE users SET vip_until = ? WHERE user_id = ?', (new_vip, user_id))
        self.conn.commit()
        return new_vip
    
    def use_coins(self, user_id, amount):
        cursor = self.conn.cursor()
        cursor.execute("SELECT coins FROM users WHERE user_id = ?", (user_id,))
        result = cursor.fetchone()
        if not result or result[0] < amount:
            return False
        cursor.execute('UPDATE users SET coins = coins - ? WHERE user_id = ?', (amount, user_id))
        self.conn.commit()
        return True
    
    def get_all_users(self):
        cursor = self.conn.cursor()
        cursor.execute('SELECT user_id, username, first_name, vip_until, coins, is_active FROM users ORDER BY registered_at DESC')
        return cursor.fetchall()
    
    def get_active_users(self):
        cursor = self.conn.cursor()
        cursor.execute('SELECT user_id FROM users WHERE is_active = 1')
        return [row[0] for row in cursor.fetchall()]
    
    def deactivate_user(self, user_id):
        cursor = self.conn.cursor()
        cursor.execute('UPDATE users SET is_active = 0 WHERE user_id = ?', (user_id,))
        self.conn.commit()
    
    def get_referral_count(self, user_id):
        cursor = self.conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM referrals WHERE referrer_id = ?', (user_id,))
        return cursor.fetchone()[0]
    
    def get_stats(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        total = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM users WHERE vip_until > datetime('now')")
        vip = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM referrals")
        refs = cursor.fetchone()[0]
        return {'total_users': total, 'vip_users': vip, 'free_users': total - vip, 'total_referrals': refs}

db = Database()

# ============= CONVERSATION STATES =============
MAN_NUMS, MAN_FORMAT, MAN_NAME, MAN_FNAME = range(4)
TOVCF_FILE, TOVCF_DONE, TOVCF_NAME, TOVCF_FNAME, TOVCF_LIM = range(4, 9)
TOTXT_FILES, TOTXT_DONE = range(9, 11)
SPL_FILE, SPL_CNT = range(11, 13)
ADM_MSG = 13
GETNAME_FILE = 14
GETCONTENT_FILE = 15
NODUP_FILES = 16
ADD_NUMS, ADD_FORMAT, ADD_NAME, ADD_FNAME = range(17, 21)
DEL_FILE, DEL_PATTERN = range(21, 23)
RENAME_FILE, RENAME_OLD, RENAME_NEW = range(23, 26)
RENAMEFILE_FILE, RENAMEFILE_NAME = range(26, 28)
MERGE_FILES = 28
GEN_PREFIX, GEN_COUNT, GEN_FNAME = range(29, 32)
GETCONTEN_FILE = 32

# ============= HELPER FUNCTIONS =============
def is_admin(user_id):
    return user_id in ADMIN_IDS

def check_vip(user_id):
    return db.is_vip(user_id)

async def check_user_membership(context: ContextTypes.DEFAULT_TYPE, user_id: int):
    """Check if user is member of both group and channel"""
    try:
        # Check group membership
        group_member = await context.bot.get_chat_member(FORCE_JOIN_GROUP, user_id)
        group_joined = group_member.status in [ChatMember.MEMBER, ChatMember.ADMINISTRATOR, ChatMember.OWNER]
        
        # Check channel membership
        channel_member = await context.bot.get_chat_member(FORCE_JOIN_CHANNEL, user_id)
        channel_joined = channel_member.status in [ChatMember.MEMBER, ChatMember.ADMINISTRATOR, ChatMember.OWNER]
        
        return group_joined and channel_joined
    except TelegramError as e:
        logger.error(f"Error checking membership: {e}")
        return False

async def force_join_required(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show force join message with buttons"""
    user_id = update.effective_user.id
    
    # Check if user is already a member
    is_member = await check_user_membership(context, user_id)
    
    if is_member:
        return True
    
    # Show force join message
    lang = db.get_user_language(user_id)
    t = LANGUAGES[lang]
    
    keyboard = [
        [InlineKeyboardButton(t['join_group'], url=f"https://t.me/{FORCE_JOIN_GROUP[1:]}")],
        [InlineKeyboardButton(t['join_channel'], url=f"https://t.me/{FORCE_JOIN_CHANNEL[1:]}")],
        [InlineKeyboardButton(t['check_join'], callback_data="check_membership")]
    ]
    
    await update.message.reply_text(
        t['must_join'],
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    
    return False

def membership_required(func):
    """Decorator to check membership before executing command"""
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = update.effective_user.id
        
        # Admin bypass
        if is_admin(user_id):
            return await func(update, context, *args, **kwargs)
        
        # Check membership
        is_member = await check_user_membership(context, user_id)
        if not is_member:
            await force_join_required(update, context)
            return ConversationHandler.END if 'ConversationHandler' in str(type(func)) else None
        
        return await func(update, context, *args, **kwargs)
    
    return wrapper

def get_text(user_id, key, **kwargs):
    """Get translated text based on user's language preference"""
    try:
        lang = db.get_user_language(user_id)
        if lang not in LANGUAGES:
            lang = 'id'
        text = LANGUAGES[lang].get(key, key)
        if kwargs:
            try:
                text = text.format(**kwargs)
            except:
                pass
        return text
    except Exception as e:
        logger.error(f"Error in get_text: {e}")
        # Fallback to Indonesian
        return LANGUAGES['id'].get(key, key)

async def vip_required(update: Update):
    user_id = update.effective_user.id
    msg = get_text(user_id, 'vip_required_msg')
    await update.message.reply_text(msg)

def clean_phone(number):
    return ''.join(filter(str.isdigit, number))

def rm_file(path):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except:
        pass

def create_vcard(name, phone, index=None):
    clean_num = clean_phone(phone)
    if not clean_num:
        return ""
    display_name = f"{name} {index:03d}" if index else name
    return f"BEGIN:VCARD\nVERSION:3.0\nFN:{display_name}\nTEL;TYPE=CELL:+{clean_num}\nEND:VCARD\n"

def extract_vcards(content):
    return re.findall(r'BEGIN:VCARD.*?END:VCARD', content, re.DOTALL | re.IGNORECASE)

def extract_phones_from_vcf(content):
    phones = []
    for pat in [r'TEL[^:]*:[\+]?([0-9]+)', r'item\d+\.TEL[^:]*:[\+]?([0-9]+)']:
        phones.extend(re.findall(pat, content, re.IGNORECASE))
    return list(dict.fromkeys(phones))

def extract_names_from_vcf(content):
    names = []
    for vcard in extract_vcards(content):
        match = re.search(r'FN:(.+)', vcard, re.IGNORECASE)
        if match:
            names.append(match.group(1).strip())
    return names

def remove_duplicate_phones(vcards):
    seen = set()
    unique = []
    for vcard in vcards:
        phones = extract_phones_from_vcf(vcard)
        if phones and phones[0] not in seen:
            seen.add(phones[0])
            unique.append(vcard)
    return unique

async def send_files_media(update, files):
    """Send multiple files efficiently with media group (10 files per batch)"""
    total = len(files)
    if total == 0:
        return
    
    # Single file - send directly
    if total == 1:
        try:
            with open(files[0], 'rb') as f:
                await update.message.reply_document(
                    document=f, 
                    filename=os.path.basename(files[0]),
                    caption="✅ Selesai!",
                    read_timeout=120,
                    write_timeout=120
                )
        except Exception as e:
            logger.error(f"Error sending single file: {e}")
            await update.message.reply_text(f"❌ Error mengirim file: {e}")
        return
    
    # Multiple files - use media group (max 10 per group)
    MAX_BATCH = 10
    total_sent = 0
    total_batches = (total + MAX_BATCH - 1) // MAX_BATCH
    
    await update.message.reply_text(f"📤 Mengirim {total} file dalam {total_batches} batch...")
    
    for batch_idx in range(0, total, MAX_BATCH):
        batch = files[batch_idx:batch_idx+MAX_BATCH]
        batch_num = (batch_idx // MAX_BATCH) + 1
        
        # Prepare media group
        media_group = []
        file_objects = []
        
        try:
            # Open all files in batch
            for idx, filepath in enumerate(batch):
                try:
                    f = open(filepath, 'rb')
                    file_objects.append(f)
                    
                    # Add caption only to first file of first batch
                    caption = None
                    if batch_idx == 0 and idx == 0:
                        caption = f"✅ Total {total} file"
                    
                    media_group.append(
                        InputMediaDocument(
                            media=f, 
                            filename=os.path.basename(filepath),
                            caption=caption
                        )
                    )
                except Exception as e:
                    logger.error(f"Error opening file {filepath}: {e}")
            
            # Send media group (10 files at once)
            if media_group:
                try:
                    await update.message.reply_media_group(
                        media=media_group, 
                        read_timeout=120, 
                        write_timeout=120,
                        connect_timeout=60
                    )
                    total_sent += len(media_group)
                    
                    # Show progress for multiple batches
                    if total_batches > 1:
                        await update.message.reply_text(
                            f"📦 Batch {batch_num}/{total_batches} terkirim ({total_sent}/{total} file)"
                        )
                    
                    # Small delay between batches
                    if batch_idx + MAX_BATCH < total:
                        await asyncio.sleep(1)
                
                except Exception as e:
                    logger.error(f"Error sending media group batch {batch_num}: {e}")
                    
                    # Fallback: send individually for this batch
                    await update.message.reply_text(f"⚠️ Mengirim batch {batch_num} satu per satu...")
                    
                    for filepath in batch:
                        try:
                            with open(filepath, 'rb') as f:
                                await update.message.reply_document(
                                    document=f, 
                                    filename=os.path.basename(filepath),
                                    read_timeout=120,
                                    write_timeout=120
                                )
                                total_sent += 1
                                await asyncio.sleep(0.5)
                        except Exception as e2:
                            logger.error(f"Error sending individual file {filepath}: {e2}")
        
        finally:
            # Close all file objects
            for f in file_objects:
                try:
                    f.close()
                except:
                    pass
    
    # Final confirmation
    if total_sent == total:
        await update.message.reply_text(f"✅ Semua file berhasil dikirim! ({total_sent}/{total})")
    else:
        await update.message.reply_text(f"⚠️ {total_sent}/{total} file berhasil dikirim")

# ============= BASIC COMMANDS =============
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        user = update.effective_user
        user_id = user.id
        
        # Register user first
        referred_by = None
        if context.args and len(context.args) > 0:
            if context.args[0].startswith('ref'):
                try:
                    referred_by = int(context.args[0][3:])
                except:
                    pass
        
        db.add_user(user_id, user.username, user.first_name, referred_by)
        
        # Check force join membership
        if not is_admin(user_id):
            try:
                is_member = await check_user_membership(context, user_id)
                if not is_member:
                    await force_join_required(update, context)
                    return
            except Exception as e:
                logger.error(f"Error checking membership: {e}")
                # Continue anyway - don't block user
        
        # Get user's language
        try:
            lang = db.get_user_language(user_id)
            if lang not in LANGUAGES:
                lang = 'id'
            t = LANGUAGES[lang]
        except Exception as e:
            logger.error(f"Error getting language: {e}")
            lang = 'id'
            t = LANGUAGES['id']
        
        msg = (
            f"{t['welcome'].format(name=user.first_name)}\n"
            f"{t['features']}\n\n"
            f"🔄 *Konversi:*\n"
            f"/to_vcf      - {t['to_vcf']}\n"
            f"/to_txt      - {t['to_txt']}\n\n"
            f"✏️ *Input & Edit:*\n"
            f"/manual      - {t['manual']}\n"
            f"/add         - {t['add']}\n"
            f"/delete      - {t['delete']}\n"
            f"/renamectc   - {t['renamectc']}\n"
        f"/renamefile  - {t['renamefile']}\n\n"
        f"📂 *Kelola File:*\n"
        f"/merge       - {t['merge']}\n"
        f"/split       - {t['split']}\n"
        f"/nodup       - {t['nodup']}\n\n"
        f"📊 *Info & Extract:*\n"
        f"/count       - {t['count']}\n"
        f"/getname     - {t['getname']}\n"
        f"/generate    - {t['generate']}\n"
        f"/getconten   - {t['getconten']}\n\n"
        f"⚙️ *Pengaturan:*\n"
        f"/setting     - {t['setting']}\n"
        f"/status      - {t['status']}\n"
        f"/vip         - {t['vip']}\n"
        f"/referral    - {t['referral']}\n"
        f"/lang        - {t['lang']}\n\n"
        f"👨‍💼 {t['bot_owner']} {CEO_USERNAME}"
    )
    
        await update.message.reply_text(msg, parse_mode='Markdown')
    except Exception as e:
        logger.error(f"Error in start command: {e}")
        # Fallback - send basic message
        try:
            await update.message.reply_text(
                f"Hallo {update.effective_user.first_name}, selamat datang di bot\n\n"
                f"Ketik /help untuk melihat semua fitur"
            )
        except:
            pass

async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_id = user.id
    
    # Check force join membership
    if not is_admin(user_id):
        is_member = await check_user_membership(context, user_id)
        if not is_member:
            await force_join_required(update, context)
            return
    
    # Get user's language
    lang = db.get_user_language(user_id)
    t = LANGUAGES[lang]
    
    text = (
        f"{t['welcome'].format(name=user.first_name)}\n"
        f"{t['features']}\n\n"
        f"🔄 *Konversi:*\n"
        f"/to_vcf      - {t['to_vcf']}\n"
        f"/to_txt      - {t['to_txt']}\n\n"
        f"✏️ *Input & Edit:*\n"
        f"/manual      - {t['manual']}\n"
        f"/add         - {t['add']}\n"
        f"/delete      - {t['delete']}\n"
        f"/renamectc   - {t['renamectc']}\n"
        f"/renamefile  - {t['renamefile']}\n\n"
        f"📂 *Kelola File:*\n"
        f"/merge       - {t['merge']}\n"
        f"/split       - {t['split']}\n"
        f"/nodup       - {t['nodup']}\n\n"
        f"📊 *Info & Extract:*\n"
        f"/count       - {t['count']}\n"
        f"/getname     - {t['getname']}\n"
        f"/generate    - {t['generate']}\n"
        f"/getconten   - {t['getconten']}\n\n"
        f"⚙️ *Pengaturan:*\n"
        f"/setting     - {t['setting']}\n"
        f"/status      - {t['status']}\n"
        f"/vip         - {t['vip']}\n"
        f"/referral    - {t['referral']}\n"
        f"/lang        - {t['lang']}\n\n"
        f"👨‍💼 {t['bot_owner']} {CEO_USERNAME}"
    )
    
    await update.message.reply_text(text, parse_mode='Markdown')

async def status_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    user_data = db.get_user(user_id)
    
    if not user_data:
        await update.message.reply_text("❌ Ketik /start dulu")
        return
    
    vip_until = datetime.fromisoformat(user_data['vip_until'])
    is_vip = vip_until > datetime.now()
    
    if is_vip:
        delta = vip_until - datetime.now()
        if delta.days > 0:
            vip_status = f"✅ Premium\nSisa: {delta.days} hari"
        else:
            hours = int(delta.seconds / 3600)
            vip_status = f"✅ Premium\nSisa: {hours} jam"
    else:
        vip_status = "❌ Expired"
    
    refs = db.get_referral_count(user_id)
    
    text = (
        f"👤 *STATUS AKUN*\n\n"
        f"Nama: {user_data['first_name']}\n"
        f"ID: `{user_id}`\n"
        f"Status: {vip_status}\n\n"
        f"💰 Koin: {user_data['coins']}\n"
        f"👥 Referral: {refs}"
    )
    
    keyboard = [
        [InlineKeyboardButton("⬆️ Upgrade", callback_data="show_vip")],
        [InlineKeyboardButton("💰 Tukar Koin", callback_data="exchange_coins")]
    ]
    
    await update.message.reply_text(text, parse_mode='Markdown', reply_markup=InlineKeyboardMarkup(keyboard))

async def vip_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (
        "💎 *PAKET PREMIUM*\n\n"
        "🎁 Free Trial: 12 jam\n\n"
        "💳 Paket:\n"
        "• 1 Hari - Rp 2.000\n"
        "• 7 Hari - Rp 5.000\n"
        "• 30 Hari - Rp 20.000\n\n"
        "💰 Tukar Koin:\n"
        "• 5 Koin → 2 Hari\n"
        "• 10 Koin → 5 Hari\n"
        "• 50 Koin → 40 Hari\n\n"
        f"📞 {CEO_USERNAME}"
    )
    
    keyboard = [
        [InlineKeyboardButton(f"💬 CEO", url=f"https://t.me/{CEO_USERNAME[1:]}")],
        [InlineKeyboardButton("💰 Tukar", callback_data="exchange_coins")]
    ]
    
    await update.message.reply_text(text, parse_mode='Markdown', reply_markup=InlineKeyboardMarkup(keyboard))

async def referral_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    bot_username = context.bot.username
    link = f"https://t.me/{bot_username}?start=ref{user_id}"
    
    refs = db.get_referral_count(user_id)
    user_data = db.get_user(user_id)
    coins = user_data['coins'] if user_data else 0
    
    text = (
        f"👥 *REFERRAL*\n\n"
        f"🎁 1 referral = 1 koin\n\n"
        f"Referral: {refs}\n"
        f"Koin: {coins}\n\n"
        f"🔗 Link:\n`{link}`"
    )
    
    await update.message.reply_text(text, parse_mode='Markdown')

async def setting_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("👤 Status Akun", callback_data="setting_status")],
        [InlineKeyboardButton("💎 Upgrade Premium", callback_data="show_vip")],
        [InlineKeyboardButton("💰 Tukar Koin", callback_data="exchange_coins")],
        [InlineKeyboardButton("👥 Referral", callback_data="setting_referral")],
        [InlineKeyboardButton(f"💬 Hubungi CEO", url=f"https://t.me/{CEO_USERNAME[1:]}")]
    ]
    
    text = (
        "⚙️ *MENU PENGATURAN*\n\n"
        "Pilih menu yang ingin Anda akses:"
    )
    
    await update.message.reply_text(text, parse_mode='Markdown', reply_markup=InlineKeyboardMarkup(keyboard))

async def lang_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Command to change language"""
    user_id = update.effective_user.id
    lang = db.get_user_language(user_id)
    
    keyboard = [
        [InlineKeyboardButton("🇮🇩 Indonesia", callback_data="lang_id")],
        [InlineKeyboardButton("🇬🇧 English", callback_data="lang_en")],
        [InlineKeyboardButton("🇨🇳 中文", callback_data="lang_zh")]
    ]
    
    text = LANGUAGES[lang]['lang_select']
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

# ============= CALLBACKS =============
async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id
    
    # Check membership callback
    if query.data == "check_membership":
        is_member = await check_user_membership(context, user_id)
        lang = db.get_user_language(user_id)
        t = LANGUAGES[lang]
        
        if is_member:
            # User has joined, show welcome message
            msg = (
                f"{t['welcome'].format(name=query.from_user.first_name)}\n"
                f"{t['features']}\n\n"
                f"🔄 *Konversi:*\n"
                f"/to_vcf      - {t['to_vcf']}\n"
                f"/to_txt      - {t['to_txt']}\n\n"
                f"✏️ *Input & Edit:*\n"
                f"/manual      - {t['manual']}\n"
                f"/add         - {t['add']}\n"
                f"/delete      - {t['delete']}\n"
                f"/renamectc   - {t['renamectc']}\n"
                f"/renamefile  - {t['renamefile']}\n\n"
                f"📂 *Kelola File:*\n"
                f"/merge       - {t['merge']}\n"
                f"/split       - {t['split']}\n"
                f"/nodup       - {t['nodup']}\n\n"
                f"📊 *Info & Extract:*\n"
                f"/count       - {t['count']}\n"
                f"/getname     - {t['getname']}\n"
                f"/generate    - {t['generate']}\n"
                f"/getconten   - {t['getconten']}\n\n"
                f"⚙️ *Pengaturan:*\n"
                f"/setting     - {t['setting']}\n"
                f"/status      - {t['status']}\n"
                f"/vip         - {t['vip']}\n"
                f"/referral    - {t['referral']}\n"
                f"/lang        - {t['lang']}\n\n"
                f"👨‍💼 {t['bot_owner']} {CEO_USERNAME}"
            )
            await query.edit_message_text(msg, parse_mode='Markdown')
        else:
            await query.edit_message_text(t['not_joined'])
        return
    
    # Language selection
    if query.data.startswith("lang_"):
        lang_code = query.data[5:]  # Extract language code
        if lang_code in LANGUAGES:
            db.set_user_language(user_id, lang_code)
            success_msg = LANGUAGES[lang_code]['lang_changed']
            await query.edit_message_text(success_msg)
        return
    
    # Manual format callbacks
    if query.data in ["manual_txt", "manual_vcf"]:
        await manual_format_callback(update, context)
        return
    
    # Add format callbacks
    if query.data in ["add_txt", "add_vcf"]:
        await add_format_callback(update, context)
        return
    
    if query.data == "show_vip":
        keyboard = [[InlineKeyboardButton(f"💬 CEO", url=f"https://t.me/{CEO_USERNAME[1:]}")]]
        await query.edit_message_text(
            "💎 *PAKET PREMIUM*\n\n1 Hari - Rp 2.000\n7 Hari - Rp 5.000\n30 Hari - Rp 20.000",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    
    elif query.data == "exchange_coins":
        user_data = db.get_user(user_id)
        coins = user_data['coins'] if user_data else 0
        keyboard = [
            [InlineKeyboardButton("5 Koin → 2 Hari", callback_data="exc_2day")],
            [InlineKeyboardButton("10 Koin → 5 Hari", callback_data="exc_5day")],
            [InlineKeyboardButton("50 Koin → 40 Hari", callback_data="exc_40day")]
        ]
        await query.edit_message_text(f"💰 Koin: {coins}\n\nPilih:", reply_markup=InlineKeyboardMarkup(keyboard))
    
    elif query.data.startswith("exc_"):
        pkg_key = query.data[4:]
        pkg = COIN_PACKAGES.get(pkg_key)
        if not pkg:
            await query.edit_message_text("❌ Invalid")
            return
        
        user_data = db.get_user(user_id)
        if user_data['coins'] < pkg['coins']:
            await query.edit_message_text(f"❌ Koin tidak cukup\n\nAnda: {user_data['coins']}\nPerlu: {pkg['coins']}")
            return
        
        db.use_coins(user_id, pkg['coins'])
        new_vip = db.add_vip_days(user_id, pkg['days'])
        await query.edit_message_text(f"✅ Berhasil!\n\nVIP hingga {new_vip.strftime('%d/%m/%Y')}")
    
    elif query.data == "setting_status":
        user_data = db.get_user(user_id)
        vip_until = datetime.fromisoformat(user_data['vip_until'])
        is_vip = vip_until > datetime.now()
        
        if is_vip:
            delta = vip_until - datetime.now()
            if delta.days > 0:
                vip_status = f"✅ Premium\nSisa: {delta.days} hari"
            else:
                hours = int(delta.seconds / 3600)
                vip_status = f"✅ Premium\nSisa: {hours} jam"
        else:
            vip_status = "❌ Expired"
        
        refs = db.get_referral_count(user_id)
        
        text = (
            f"👤 *STATUS AKUN*\n\n"
            f"Nama: {user_data['first_name']}\n"
            f"ID: `{user_id}`\n"
            f"Status: {vip_status}\n\n"
            f"💰 Koin: {user_data['coins']}\n"
            f"👥 Referral: {refs}"
        )
        await query.edit_message_text(text, parse_mode='Markdown')
    
    elif query.data == "setting_referral":
        bot_username = context.bot.username
        link = f"https://t.me/{bot_username}?start=ref{user_id}"
        refs = db.get_referral_count(user_id)
        user_data = db.get_user(user_id)
        coins = user_data['coins'] if user_data else 0
        
        text = (
            f"👥 *REFERRAL*\n\n"
            f"🎁 1 referral = 1 koin\n\n"
            f"Referral: {refs}\n"
            f"Koin: {coins}\n\n"
            f"🔗 Link:\n`{link}`"
        )
        await query.edit_message_text(text, parse_mode='Markdown')

# ============= ADMIN =============
async def admin_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    
    stats = db.get_stats()
    text = f"🔐 *ADMIN*\n\nTotal: {stats['total_users']}\nVIP: {stats['vip_users']}\nFree: {stats['free_users']}"
    await update.message.reply_text(text, parse_mode='Markdown')

async def data_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    users = db.get_all_users()
    if not users:
        await update.message.reply_text("Belum ada user")
        return
    
    text = "👥 *USER*\n\n"
    for u in users[:20]:
        uid, uname, name, vip, coins, active = u
        v = "✅" if vip and datetime.fromisoformat(vip) > datetime.now() else "❌"
        text += f"{v} {name} - `{uid}`\n"
    
    await update.message.reply_text(text, parse_mode='Markdown')

async def adduser_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    if len(context.args) < 2:
        await update.message.reply_text("Format: /adduser <id> <days>")
        return
    try:
        uid = int(context.args[0])
        days = int(context.args[1])
        new_vip = db.add_vip_days(uid, days)
        await update.message.reply_text(f"✅ User {uid} VIP hingga {new_vip.strftime('%d/%m/%Y')}")
    except:
        await update.message.reply_text("❌ Error")

async def stop_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    if not context.args:
        await update.message.reply_text("Format: /stop <id>")
        return
    try:
        uid = int(context.args[0])
        db.deactivate_user(uid)
        await update.message.reply_text(f"✅ User {uid} stopped")
    except:
        await update.message.reply_text("❌ Error")

async def chatalluser_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    await update.message.reply_text("📢 Kirim pesan broadcast:")
    return ADM_MSG

async def admin_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return ConversationHandler.END
    
    msg = update.message.text
    users = db.get_active_users()
    await update.message.reply_text(f"⏳ Kirim ke {len(users)} user...")
    
    success = 0
    for uid in users:
        try:
            await context.bot.send_message(uid, msg)
            success += 1
        except:
            pass
    
    await update.message.reply_text(f"✅ Terkirim: {success}/{len(users)}")
    return ConversationHandler.END

# ============= MANUAL INPUT =============
async def manual_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    
    # Check membership
    if not is_admin(user_id):
        is_member = await check_user_membership(context, user_id)
        if not is_member:
            await force_join_required(update, context)
            return ConversationHandler.END
    
    if not check_vip(user_id):
        await vip_required(update)
        return ConversationHandler.END
    
    context.user_data.clear()
    await update.message.reply_text(
        "📱 *Kirim nomor telepon*\n\n"
        "Anda bisa kirim:\n"
        "• 1 nomor: 081234567890\n"
        "• Banyak nomor (pisah dengan enter):\n"
        "  081234567890\n"
        "  082345678901\n"
        "  083456789012\n\n"
        "Ketik /done jika sudah selesai",
        parse_mode='Markdown'
    )
    context.user_data['numbers'] = []
    return MAN_NUMS

async def manual_nums(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Collect numbers from user"""
    text = update.message.text.strip()
    
    # Parse numbers (separated by newline or comma)
    if '\n' in text:
        nums = [n.strip() for n in text.split('\n') if n.strip()]
    elif ',' in text:
        nums = [n.strip() for n in text.split(',') if n.strip()]
    else:
        nums = [text]
    
    context.user_data['numbers'].extend(nums)
    count = len(context.user_data['numbers'])
    
    await update.message.reply_text(
        f"✅ {len(nums)} nomor diterima\n"
        f"Total: {count} nomor\n\n"
        f"Kirim nomor lagi atau ketik /done untuk lanjut"
    )
    return MAN_NUMS

async def manual_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ask for output format"""
    nums = context.user_data.get('numbers', [])
    
    if not nums:
        await update.message.reply_text("❌ Belum ada nomor. Kirim nomor dulu!")
        return MAN_NUMS
    
    keyboard = [
        [InlineKeyboardButton("📄 TXT", callback_data="manual_txt")],
        [InlineKeyboardButton("📇 VCF", callback_data="manual_vcf")]
    ]
    
    await update.message.reply_text(
        f"📊 Total: {len(nums)} nomor\n\n"
        f"Pilih format output:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return MAN_FORMAT

async def manual_format_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle format selection"""
    query = update.callback_query
    await query.answer()
    
    format_type = query.data.split('_')[1]  # 'txt' or 'vcf'
    context.user_data['format'] = format_type
    
    if format_type == 'txt':
        await query.edit_message_text("📄 Kirim nama file (tanpa ekstensi):")
        return MAN_FNAME
    else:  # vcf
        await query.edit_message_text("📝 Kirim nama kontak:")
        return MAN_NAME

async def manual_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Get contact name for VCF"""
    context.user_data['contact_name'] = update.message.text.strip()
    await update.message.reply_text("📄 Kirim nama file (tanpa ekstensi):")
    return MAN_FNAME

async def manual_fname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Create and send the file"""
    user_id = update.effective_user.id
    fname = update.message.text.strip()
    nums = context.user_data['numbers']
    format_type = context.user_data['format']
    
    try:
        await update.message.reply_text("⏳ Memproses...")
        
        if format_type == 'txt':
            # Create TXT file
            if fname.endswith('.txt'):
                fname = fname[:-4]
            
            path = f"{TEMP_FOLDER}/{fname}_{user_id}.txt"
            with open(path, 'w', encoding='utf-8') as f:
                f.write("\n".join(nums))
            
            with open(path, 'rb') as f:
                await update.message.reply_document(
                    f, 
                    filename=f"{fname}.txt", 
                    caption=f"✅ File TXT berhasil dibuat!\n\nTotal: {len(nums)} nomor"
                )
        
        else:  # vcf
            # Create VCF file
            if fname.endswith('.vcf'):
                fname = fname[:-4]
            
            contact_name = context.user_data['contact_name']
            path = f"{TEMP_FOLDER}/{fname}_{user_id}.vcf"
            
            vcf_content = ""
            for idx, num in enumerate(nums, 1):
                vcf_content += create_vcard(contact_name, num, idx)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(vcf_content)
            
            with open(path, 'rb') as f:
                await update.message.reply_document(
                    f, 
                    filename=f"{fname}.vcf", 
                    caption=f"✅ File VCF berhasil dibuat!\n\nTotal: {len(nums)} kontak"
                )
        
        rm_file(path)
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")
    
    context.user_data.clear()
    return ConversationHandler.END

# ============= ADD CONTACT =============
async def add_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    
    # Check membership
    if not is_admin(user_id):
        is_member = await check_user_membership(context, user_id)
        if not is_member:
            await force_join_required(update, context)
            return ConversationHandler.END
    
    if not check_vip(user_id):
        await vip_required(update)
        return ConversationHandler.END
    
    context.user_data.clear()
    await update.message.reply_text(
        "📱 *Kirim nomor telepon*\n\n"
        "Anda bisa kirim:\n"
        "• 1 nomor: 081234567890\n"
        "• Banyak nomor (pisah dengan enter):\n"
        "  081234567890\n"
        "  082345678901\n"
        "  083456789012\n\n"
        "Ketik /done jika sudah selesai",
        parse_mode='Markdown'
    )
    context.user_data['numbers'] = []
    return ADD_NUMS

async def add_nums(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Collect numbers from user"""
    text = update.message.text.strip()
    
    # Parse numbers (separated by newline or comma)
    if '\n' in text:
        nums = [n.strip() for n in text.split('\n') if n.strip()]
    elif ',' in text:
        nums = [n.strip() for n in text.split(',') if n.strip()]
    else:
        nums = [text]
    
    context.user_data['numbers'].extend(nums)
    count = len(context.user_data['numbers'])
    
    await update.message.reply_text(
        f"✅ {len(nums)} nomor diterima\n"
        f"Total: {count} nomor\n\n"
        f"Kirim nomor lagi atau ketik /done untuk lanjut"
    )
    return ADD_NUMS

async def add_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ask for output format"""
    nums = context.user_data.get('numbers', [])
    
    if not nums:
        await update.message.reply_text("❌ Belum ada nomor. Kirim nomor dulu!")
        return ADD_NUMS
    
    keyboard = [
        [InlineKeyboardButton("📄 TXT", callback_data="add_txt")],
        [InlineKeyboardButton("📇 VCF", callback_data="add_vcf")]
    ]
    
    await update.message.reply_text(
        f"📊 Total: {len(nums)} nomor\n\n"
        f"Pilih format output:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return ADD_FORMAT

async def add_format_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle format selection"""
    query = update.callback_query
    await query.answer()
    
    format_type = query.data.split('_')[1]  # 'txt' or 'vcf'
    context.user_data['format'] = format_type
    
    if format_type == 'txt':
        await query.edit_message_text("📄 Kirim nama file (tanpa ekstensi):")
        return ADD_FNAME
    else:  # vcf
        await query.edit_message_text("📝 Kirim nama kontak:")
        return ADD_NAME

async def add_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Get contact name for VCF"""
    context.user_data['contact_name'] = update.message.text.strip()
    await update.message.reply_text("📄 Kirim nama file (tanpa ekstensi):")
    return ADD_FNAME

async def add_fname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Create and send the file"""
    user_id = update.effective_user.id
    fname = update.message.text.strip()
    nums = context.user_data['numbers']
    format_type = context.user_data['format']
    
    try:
        await update.message.reply_text("⏳ Memproses...")
        
        if format_type == 'txt':
            # Create TXT file
            if fname.endswith('.txt'):
                fname = fname[:-4]
            
            path = f"{TEMP_FOLDER}/{fname}_{user_id}.txt"
            with open(path, 'w', encoding='utf-8') as f:
                f.write("\n".join(nums))
            
            with open(path, 'rb') as f:
                await update.message.reply_document(
                    f, 
                    filename=f"{fname}.txt", 
                    caption=f"✅ File TXT berhasil dibuat!\n\nTotal: {len(nums)} nomor"
                )
        
        else:  # vcf
            # Create VCF file
            if fname.endswith('.vcf'):
                fname = fname[:-4]
            
            contact_name = context.user_data['contact_name']
            path = f"{TEMP_FOLDER}/{fname}_{user_id}.vcf"
            
            vcf_content = ""
            for idx, num in enumerate(nums, 1):
                vcf_content += create_vcard(contact_name, num, idx)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(vcf_content)
            
            with open(path, 'rb') as f:
                await update.message.reply_document(
                    f, 
                    filename=f"{fname}.vcf", 
                    caption=f"✅ File VCF berhasil dibuat!\n\nTotal: {len(nums)} kontak"
                )
        
        rm_file(path)
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")
    
    context.user_data.clear()
    return ConversationHandler.END

# ============= DELETE CONTACT =============
async def delete_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file .vcf:")
    return DEL_FILE

async def delete_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return DEL_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/del_{uid}.vcf"
    await file.download_to_drive(path)
    
    context.user_data['vcf_file'] = path
    context.user_data['original_name'] = doc.file_name
    await update.message.reply_text("🔍 Kirim nama atau nomor yang akan dihapus:")
    return DEL_PATTERN

async def delete_pattern(update: Update, context: ContextTypes.DEFAULT_TYPE):
    pattern = update.message.text.strip()
    path = context.user_data['vcf_file']
    original_name = context.user_data['original_name']
    
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        vcards = extract_vcards(content)
        filtered = []
        deleted = 0
        
        for vcard in vcards:
            if pattern.lower() not in vcard.lower():
                filtered.append(vcard)
            else:
                deleted += 1
        
        if deleted == 0:
            await update.message.reply_text("❌ Tidak ada kontak yang cocok ditemukan")
            rm_file(path)
            return ConversationHandler.END
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write("\n".join(filtered))
        
        with open(path, 'rb') as f:
            await update.message.reply_document(f, filename=original_name, caption=f"✅ {deleted} kontak berhasil dihapus!")
        
        rm_file(path)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= RENAME CONTACT =============
async def renamectc_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file .vcf:")
    return RENAME_FILE

async def rename_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return RENAME_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/rename_{uid}.vcf"
    await file.download_to_drive(path)
    
    context.user_data['vcf_file'] = path
    context.user_data['original_name'] = doc.file_name
    await update.message.reply_text("🔍 Kirim nama lama yang akan diganti:")
    return RENAME_OLD

async def rename_old(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['old_name'] = update.message.text.strip()
    await update.message.reply_text("✏️ Kirim nama baru:")
    return RENAME_NEW

async def rename_new(update: Update, context: ContextTypes.DEFAULT_TYPE):
    new_name = update.message.text.strip()
    old_name = context.user_data['old_name']
    path = context.user_data['vcf_file']
    original_name = context.user_data['original_name']
    
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        count = content.count(f"FN:{old_name}")
        content = content.replace(f"FN:{old_name}", f"FN:{new_name}")
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        with open(path, 'rb') as f:
            await update.message.reply_document(f, filename=original_name, caption=f"✅ {count} nama berhasil diganti!")
        
        rm_file(path)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= RENAME FILE =============
async def renamefile_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file yang akan diganti namanya:")
    return RENAMEFILE_FILE

async def renamefile_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc:
        await update.message.reply_text("❌ Kirim file terlebih dahulu")
        return RENAMEFILE_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    ext = os.path.splitext(doc.file_name)[1]
    path = f"{TEMP_FOLDER}/renamefile_{uid}{ext}"
    await file.download_to_drive(path)
    
    context.user_data['file_path'] = path
    context.user_data['extension'] = ext
    await update.message.reply_text("✏️ Kirim nama file baru (tanpa ekstensi):")
    return RENAMEFILE_NAME

async def renamefile_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    new_name = update.message.text.strip()
    path = context.user_data['file_path']
    ext = context.user_data['extension']
    
    if ext and not new_name.endswith(ext):
        new_name = f"{new_name}{ext}"
    
    try:
        with open(path, 'rb') as f:
            await update.message.reply_document(f, filename=new_name, caption="✅ File berhasil direname!")
        
        rm_file(path)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= MERGE FILES =============
async def merge_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    context.user_data['merge_files'] = []
    await update.message.reply_text("📄 Kirim file .vcf (boleh banyak), lalu ketik /done")
    return MERGE_FILES

async def merge_files(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return MERGE_FILES
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/merge_{uid}_{doc.file_name}"
    await file.download_to_drive(path)
    
    context.user_data['merge_files'].append(path)
    await update.message.reply_text(f"✅ {doc.file_name} diterima. Total: {len(context.user_data['merge_files'])} file")
    return MERGE_FILES

async def merge_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    files = context.user_data.get('merge_files', [])
    if not files:
        await update.message.reply_text("❌ Tidak ada file")
        return ConversationHandler.END
    
    if len(files) < 2:
        await update.message.reply_text("❌ Minimal 2 file untuk digabung")
        for fp in files:
            rm_file(fp)
        return ConversationHandler.END
    
    try:
        merged_content = ""
        total_contacts = 0
        
        for fp in files:
            with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                vcards = extract_vcards(content)
                merged_content += "\n".join(vcards) + "\n"
                total_contacts += len(vcards)
        
        out = f"{TEMP_FOLDER}/merged_result.vcf"
        with open(out, 'w', encoding='utf-8') as f:
            f.write(merged_content)
        
        with open(out, 'rb') as f:
            await update.message.reply_document(
                f, 
                filename="merged_result.vcf", 
                caption=f"✅ {len(files)} file berhasil digabung!\n\nTotal kontak: {total_contacts}"
            )
        
        for fp in files:
            rm_file(fp)
        rm_file(out)
        
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        for fp in files:
            rm_file(fp)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= GENERATE NAMES =============
async def generate_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("✏️ Kirim prefix/awalan nama (contoh: User, Member, dll):")
    return GEN_PREFIX

async def gen_prefix(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['prefix'] = update.message.text.strip()
    await update.message.reply_text("🔢 Berapa jumlah nama yang akan digenerate?")
    return GEN_COUNT

async def gen_count(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        count = int(update.message.text.strip())
        if count <= 0 or count > 10000:
            await update.message.reply_text("❌ Jumlah harus antara 1-10000")
            return GEN_COUNT
        
        context.user_data['count'] = count
        await update.message.reply_text("📄 Nama file output:")
        return GEN_FNAME
    except:
        await update.message.reply_text("❌ Harus berupa angka")
        return GEN_COUNT

async def gen_fname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    fname = update.message.text.strip()
    if fname.endswith('.txt'):
        fname = fname[:-4]
    
    prefix = context.user_data['prefix']
    count = context.user_data['count']
    
    try:
        names = [f"{prefix} {i:03d}" for i in range(1, count + 1)]
        
        out = f"{TEMP_FOLDER}/{fname}.txt"
        with open(out, 'w', encoding='utf-8') as f:
            f.write("\n".join(names))
        
        with open(out, 'rb') as f:
            await update.message.reply_document(
                f, 
                filename=f"{fname}.txt", 
                caption=f"✅ {count} nama berhasil digenerate!"
            )
        
        rm_file(out)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= GET CONTENT (TXT) =============
async def getconten_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file .txt:")
    return GETCONTEN_FILE

async def getconten_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.txt'):
        await update.message.reply_text("❌ Harus file .txt")
        return GETCONTEN_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/getconten_{uid}.txt"
    await file.download_to_drive(path)
    
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        lines = [l for l in content.split('\n') if l.strip()]
        preview = content[:4000] if len(content) < 4000 else content[:4000] + "..."
        
        msg = f"📄 *ISI FILE*\n\n```\n{preview}\n```\n\n📊 Total baris: {len(lines)}"
        
        await update.message.reply_text(msg, parse_mode='Markdown')
        rm_file(path)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= TO_VCF =============
async def to_vcf_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📁 Kirim file .txt")
    return TOVCF_FILE

async def tovcf_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.txt'):
        await update.message.reply_text("❌ Harus .txt!")
        return TOVCF_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/tovcf_{uid}.txt"
    await file.download_to_drive(path)
    
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            nums = [l.strip() for l in f if l.strip()]
        if not nums:
            rm_file(path)
            await update.message.reply_text("❌ Kosong!")
            return TOVCF_FILE
        
        context.user_data['numbers'] = nums
        context.user_data['temp_file'] = path
        await update.message.reply_text(f"✅ {len(nums)} nomor. Ketik /done")
        return TOVCF_DONE
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ {e}")
        return TOVCF_FILE

async def tovcf_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if 'numbers' not in context.user_data:
        await update.message.reply_text("❌ Kirim file dulu!")
        return ConversationHandler.END
    await update.message.reply_text("📝 Nama kontak:")
    return TOVCF_NAME

async def tovcf_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['contact_name'] = update.message.text.strip()
    await update.message.reply_text("📄 Nama file:")
    return TOVCF_FNAME

async def tovcf_fname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    fname = update.message.text.strip()
    if fname.endswith('.vcf'):
        fname = fname[:-4]
    context.user_data['file_name'] = fname
    await update.message.reply_text(f"🔢 Jumlah per file (atau 'all'):")
    return TOVCF_LIM

async def tovcf_limit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    inp = update.message.text.strip().lower()
    nums = context.user_data['numbers']
    cname = context.user_data['contact_name']
    fname = context.user_data['file_name']
    
    limit = len(nums) if inp == 'all' else int(inp) if inp.isdigit() else 100
    
    await update.message.reply_text("⏳ Proses...")
    
    total_files = (len(nums) + limit - 1) // limit
    
    # If only one file or user chose 'all', send as single file
    if total_files == 1 or inp == 'all':
        vfn = f"{TEMP_FOLDER}/{fname}_{user_id}.vcf"
        vcf_content = ""
        for idx, num in enumerate(nums, 1):
            vcf_content += create_vcard(cname, num, idx)
        
        with open(vfn, 'w', encoding='utf-8') as f:
            f.write(vcf_content)
        
        with open(vfn, 'rb') as f:
            await update.message.reply_document(f, filename=f"{fname}.vcf", caption="✅ Selesai!")
        
        rm_file(vfn)
    else:
        # Multiple files - CREATE ALL FILES FIRST, THEN SEND WITH MEDIA GROUP
        files_to_send = []
        
        for fi in range(total_files):
            start = fi * limit
            end = min(start + limit, len(nums))
            chunk = nums[start:end]
            
            # Create filename: filename1.vcf, filename2.vcf, etc
            file_num = fi + 1
            vfn = f"{TEMP_FOLDER}/{fname}{file_num}_{user_id}.vcf"
            
            vcf_content = ""
            for idx, num in enumerate(chunk, start + 1):
                vcf_content += create_vcard(cname, num, idx)
            
            with open(vfn, 'w', encoding='utf-8') as f:
                f.write(vcf_content)
            
            files_to_send.append(vfn)
        
        # SEND ALL FILES USING MEDIA GROUP (10 at a time)
        await send_files_media(update, files_to_send)
        
        # Cleanup all files
        for vfn in files_to_send:
            rm_file(vfn)
    
    rm_file(context.user_data.get('temp_file'))
    
    context.user_data.clear()
    return ConversationHandler.END

# ============= TO_TXT =============
async def to_txt_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    context.user_data['vcf_files'] = []
    await update.message.reply_text("📄 Kirim file .vcf (boleh banyak), lalu ketik /done")
    return TOTXT_FILES

async def totxt_files(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return TOTXT_FILES

    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/totxt_{uid}_{doc.file_name}"
    await file.download_to_drive(path)

    context.user_data['vcf_files'].append(path)
    await update.message.reply_text(f"✅ {doc.file_name} diterima")
    return TOTXT_FILES

async def totxt_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    files = context.user_data.get('vcf_files', [])
    if not files:
        await update.message.reply_text("❌ Tidak ada file")
        return ConversationHandler.END

    phones = []
    for fp in files:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            phones.extend(extract_phones_from_vcf(f.read()))

    phones = list(dict.fromkeys(phones))
    out = f"{TEMP_FOLDER}/result.txt"

    with open(out, 'w', encoding='utf-8') as f:
        f.write("\n".join(phones))

    with open(out, 'rb') as f:
        await update.message.reply_document(f, filename="result.txt", caption="✅ Selesai")

    for fp in files:
        rm_file(fp)
    rm_file(out)

    context.user_data.clear()
    return ConversationHandler.END

# ============= SPLIT TXT =============
async def split_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file .txt")
    return SPL_FILE

async def split_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.txt'):
        await update.message.reply_text("❌ Harus .txt")
        return SPL_FILE

    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/split_{uid}.txt"
    await file.download_to_drive(path)

    # Save original filename without extension
    original_name = doc.file_name.replace('.txt', '')
    context.user_data['split_file'] = path
    context.user_data['original_name'] = original_name
    await update.message.reply_text("🔢 Mau dibagi jadi berapa bagian?")
    return SPL_CNT

async def split_count(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    
    try:
        parts = int(update.message.text)
        if parts <= 0:
            await update.message.reply_text("❌ Angka harus lebih dari 0")
            return SPL_CNT
    except:
        await update.message.reply_text("❌ Angka saja")
        return SPL_CNT

    path = context.user_data['split_file']
    original_name = context.user_data.get('original_name', 'split')
    
    await update.message.reply_text("⏳ Memproses split...")
    
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = [l.strip() for l in f if l.strip()]

    size = (len(lines) + parts - 1) // parts

    # CREATE ALL FILES FIRST
    files_to_send = []
    
    for i in range(parts):
        chunk = lines[i*size:(i+1)*size]
        if not chunk:
            continue
        
        file_num = i + 1
        out = f"{TEMP_FOLDER}/{original_name}{file_num}_{user_id}.txt"
        
        with open(out, 'w', encoding='utf-8') as f:
            f.write("\n".join(chunk))
        
        files_to_send.append(out)
    
    # SEND ALL FILES USING MEDIA GROUP (10 at a time)
    await send_files_media(update, files_to_send)
    
    # Cleanup
    for out in files_to_send:
        rm_file(out)
    
    rm_file(path)
    context.user_data.clear()
    return ConversationHandler.END

# ============= COUNT COMMAND =============
async def count_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return
    
    # Jika ada document yang dikirim bersamaan dengan command
    doc = update.message.document
    if doc:
        await count_process(update, doc)
    else:
        # Minta user untuk kirim file
        user_id = update.effective_user.id
        msg = get_text(user_id, 'send_file') + " .vcf atau .txt untuk dihitung"
        await update.message.reply_text(msg)

async def count_process(update: Update, doc):
    """Process file untuk menghitung kontak"""
    user_id = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/count_{user_id}.tmp"
    await file.download_to_drive(path)

    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        if doc.file_name.endswith('.vcf'):
            vcards = extract_vcards(content)
            count = len(vcards)
            msg = get_text(user_id, 'total_contacts', count=count)
        else:
            lines = [l for l in content.split('\n') if l.strip()]
            count = len(lines)
            msg = get_text(user_id, 'total_lines', count=count)
        
        rm_file(path)
        await update.message.reply_text(msg)
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")

async def count_document_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler khusus untuk document yang dikirim dengan caption /count"""
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return
    
    doc = update.message.document
    if doc:
        await count_process(update, doc)

# ============= GETNAME COMMAND =============
async def getname_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file .vcf")
    return GETNAME_FILE

async def getname_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return GETNAME_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/getname_{uid}.vcf"
    await file.download_to_drive(path)
    
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        names = extract_names_from_vcf(content)
        
        if not names:
            await update.message.reply_text("❌ Tidak ada nama ditemukan")
            rm_file(path)
            return ConversationHandler.END
        
        out = f"{TEMP_FOLDER}/names_{uid}.txt"
        with open(out, 'w', encoding='utf-8') as f:
            f.write("\n".join(names))
        
        with open(out, 'rb') as f:
            await update.message.reply_document(f, filename="names.txt", caption=f"✅ {len(names)} nama")
        
        rm_file(path)
        rm_file(out)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= GETCONTENT COMMAND =============
async def getcontent_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    await update.message.reply_text("📄 Kirim file .vcf")
    return GETCONTENT_FILE

async def getcontent_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return GETCONTENT_FILE
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/content_{uid}.vcf"
    await file.download_to_drive(path)
    
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        vcards = extract_vcards(content)
        preview = content[:4000] if len(content) < 4000 else content[:4000] + "..."
        
        msg = f"📄 *ISI FILE*\n\n```\n{preview}\n```\n\n📊 Total kontak: {len(vcards)}"
        
        await update.message.reply_text(msg, parse_mode='Markdown')
        rm_file(path)
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        rm_file(path)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= NODUP COMMAND =============
async def nodup_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_vip(update.effective_user.id):
        await vip_required(update)
        return ConversationHandler.END
    context.user_data.clear()
    context.user_data['nodup_files'] = []
    await update.message.reply_text("📄 Kirim file .vcf (boleh banyak), lalu ketik /done")
    return NODUP_FILES

async def nodup_files(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not doc.file_name.endswith('.vcf'):
        await update.message.reply_text("❌ Harus file .vcf")
        return NODUP_FILES
    
    uid = update.effective_user.id
    file = await doc.get_file()
    path = f"{TEMP_FOLDER}/nodup_{uid}_{doc.file_name}"
    await file.download_to_drive(path)
    
    context.user_data['nodup_files'].append(path)
    await update.message.reply_text(f"✅ {doc.file_name} diterima")
    return NODUP_FILES

async def nodup_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    files = context.user_data.get('nodup_files', [])
    if not files:
        await update.message.reply_text("❌ Tidak ada file")
        return ConversationHandler.END
    
    await update.message.reply_text("⏳ Menghapus duplikat...")
    
    try:
        all_vcards = []
        for fp in files:
            with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                all_vcards.extend(extract_vcards(f.read()))
        
        original_count = len(all_vcards)
        unique_vcards = remove_duplicate_phones(all_vcards)
        removed = original_count - len(unique_vcards)
        
        out = f"{TEMP_FOLDER}/nodup_result.vcf"
        with open(out, 'w', encoding='utf-8') as f:
            f.write("\n".join(unique_vcards))
        
        with open(out, 'rb') as f:
            await update.message.reply_document(
                f, 
                filename="nodup_result.vcf", 
                caption=f"✅ Selesai!\n\nAsli: {original_count}\nUnik: {len(unique_vcards)}\nDihapus: {removed}"
            )
        
        for fp in files:
            rm_file(fp)
        rm_file(out)
        
        context.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        for fp in files:
            rm_file(fp)
        await update.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# ============= CANCEL HANDLER =============
async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.message.reply_text("❌ Dibatalkan")
    return ConversationHandler.END

# ============= MAIN =============
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    # Basic commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("status", status_cmd))
    app.add_handler(CommandHandler("vip", vip_cmd))
    app.add_handler(CommandHandler("referral", referral_cmd))
    app.add_handler(CommandHandler("setting", setting_cmd))
    app.add_handler(CommandHandler("lang", lang_cmd))
    
    # Admin commands
    app.add_handler(CommandHandler("admin", admin_cmd))
    app.add_handler(CommandHandler("data", data_cmd))
    app.add_handler(CommandHandler("adduser", adduser_cmd))
    app.add_handler(CommandHandler("stop", stop_cmd))
    
    # Callbacks
    app.add_handler(CallbackQueryHandler(button_callback))

    # Broadcast conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("chatalluser", chatalluser_cmd)],
        states={
            ADM_MSG: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_broadcast)]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Manual input conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("manual", manual_cmd)],
        states={
            MAN_NUMS: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, manual_nums),
                CommandHandler("done", manual_done)
            ],
            MAN_FORMAT: [CallbackQueryHandler(manual_format_callback, pattern="^manual_(txt|vcf)$")],
            MAN_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_name)],
            MAN_FNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_fname)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Add contact conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("add", add_cmd)],
        states={
            ADD_NUMS: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, add_nums),
                CommandHandler("done", add_done)
            ],
            ADD_FORMAT: [CallbackQueryHandler(add_format_callback, pattern="^add_(txt|vcf)$")],
            ADD_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_name)],
            ADD_FNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_fname)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Delete contact conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("delete", delete_cmd)],
        states={
            DEL_FILE: [MessageHandler(filters.Document.ALL, delete_file)],
            DEL_PATTERN: [MessageHandler(filters.TEXT & ~filters.COMMAND, delete_pattern)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Rename contact conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("renamectc", renamectc_cmd)],
        states={
            RENAME_FILE: [MessageHandler(filters.Document.ALL, rename_file)],
            RENAME_OLD: [MessageHandler(filters.TEXT & ~filters.COMMAND, rename_old)],
            RENAME_NEW: [MessageHandler(filters.TEXT & ~filters.COMMAND, rename_new)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Rename file conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("renamefile", renamefile_cmd)],
        states={
            RENAMEFILE_FILE: [MessageHandler(filters.Document.ALL, renamefile_file)],
            RENAMEFILE_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, renamefile_name)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Merge files conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("merge", merge_cmd)],
        states={
            MERGE_FILES: [
                MessageHandler(filters.Document.ALL, merge_files),
                CommandHandler("done", merge_done)
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Generate names conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("generate", generate_cmd)],
        states={
            GEN_PREFIX: [MessageHandler(filters.TEXT & ~filters.COMMAND, gen_prefix)],
            GEN_COUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, gen_count)],
            GEN_FNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, gen_fname)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Get content (txt) conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("getconten", getconten_cmd)],
        states={
            GETCONTEN_FILE: [MessageHandler(filters.Document.ALL, getconten_file)]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # To VCF conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("to_vcf", to_vcf_cmd)],
        states={
            TOVCF_FILE: [MessageHandler(filters.Document.TXT, tovcf_file)],
            TOVCF_DONE: [CommandHandler("done", tovcf_done)],
            TOVCF_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, tovcf_name)],
            TOVCF_FNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, tovcf_fname)],
            TOVCF_LIM: [MessageHandler(filters.TEXT & ~filters.COMMAND, tovcf_limit)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # To TXT conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("to_txt", to_txt_cmd)],
        states={
            TOTXT_FILES: [
                MessageHandler(filters.Document.ALL, totxt_files),
                CommandHandler("done", totxt_done)
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Split conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("split", split_cmd)],
        states={
            SPL_FILE: [MessageHandler(filters.Document.TXT, split_file)],
            SPL_CNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, split_count)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Getname conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("getname", getname_cmd)],
        states={
            GETNAME_FILE: [MessageHandler(filters.Document.ALL, getname_file)]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Getcontent conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("getcontent", getcontent_cmd)],
        states={
            GETCONTENT_FILE: [MessageHandler(filters.Document.ALL, getcontent_file)]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Nodup conversation
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("nodup", nodup_cmd)],
        states={
            NODUP_FILES: [
                MessageHandler(filters.Document.ALL, nodup_files),
                CommandHandler("done", nodup_done)
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))

    # Count command - support both command only and document with caption
    app.add_handler(CommandHandler("count", count_cmd))
    app.add_handler(MessageHandler(filters.Document.ALL & filters.CAPTION, count_document_handler))

    logger.info("🤖 BOT RUNNING...")
    print("🤖 BOT RUNNING...")
    app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)

if __name__ == "__main__":
    main()
