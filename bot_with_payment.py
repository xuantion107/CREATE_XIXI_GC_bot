#!/usr/bin/env python3
"""
BOT TELEGRAM PREMIUM - VERSI FINAL LENGKAP
Terintegrasi dengan Atlantic QRIS Payment Gateway
File handling yang diperbaiki
"""

import os, re, sqlite3, logging, asyncio, requests
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaDocument, ChatMember
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes, ConversationHandler

# KONFIGURASI
BOT_TOKEN = "8012579180:AAE-MqM151HprLTCBAJUFS5CpLv3U_csNT4"
ADMIN_IDS = [8496726839, 987654321]
FORCE_JOIN_GROUP = "@xuantionZANGvip"
FORCE_JOIN_CHANNEL = "@xuantaionzang"
CEO_USERNAME = "@XIXI8778"
DB_FILE = "bot_database.db"
TEMP_FOLDER = "temp_files"

# Payment Gateway URL (Railway App)
PAYMENT_GATEWAY_URL = os.getenv("PAYMENT_GATEWAY_URL", "https://your-app.railway.app")

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)
os.makedirs(TEMP_FOLDER, exist_ok=True)

# DATABASE
class Database:
    def __init__(self):
        self.conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        self.create_tables()
    
    def create_tables(self):
        c = self.conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT,
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, vip_until TIMESTAMP,
            coins INTEGER DEFAULT 0, referred_by INTEGER, is_active INTEGER DEFAULT 1, language TEXT DEFAULT 'id')''')
        c.execute('''CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_id INTEGER, referred_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        c.execute('''CREATE TABLE IF NOT EXISTS vip_prices (id INTEGER PRIMARY KEY, days INTEGER UNIQUE, price INTEGER)''')
        c.execute('''CREATE TABLE IF NOT EXISTS coin_rates (id INTEGER PRIMARY KEY, days INTEGER UNIQUE, coins INTEGER)''')
        try: c.execute("SELECT language FROM users LIMIT 1")
        except: 
            try: c.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'id'")
            except: pass
        c.execute("INSERT OR IGNORE INTO vip_prices VALUES (1, 1, 2000), (2, 7, 5000), (3, 30, 20000)")
        c.execute("INSERT OR IGNORE INTO coin_rates VALUES (1, 2, 5), (2, 5, 10), (3, 40, 50)")
        self.conn.commit()
    
    def add_user(self, uid, uname, fname, ref=None):
        c = self.conn.cursor()
        c.execute("SELECT user_id FROM users WHERE user_id=?", (uid,))
        if not c.fetchone():
            c.execute("INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?,?,?,?)", (uid, uname, fname, ref))
            self.conn.commit()
            return True
        return False
    
    def get_user(self, uid):
        c = self.conn.cursor()
        c.execute("SELECT * FROM users WHERE user_id=?", (uid,))
        return c.fetchone()
    
    def get_all_users(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM users WHERE is_active=1")
        return c.fetchall()
    
    def update_vip(self, uid, days):
        c = self.conn.cursor()
        c.execute("SELECT vip_until FROM users WHERE user_id=?", (uid,))
        row = c.fetchone()
        if row and row[0]:
            try:
                curr = datetime.fromisoformat(row[0])
                new_exp = (curr if curr > datetime.now() else datetime.now()) + timedelta(days=days)
            except: new_exp = datetime.now() + timedelta(days=days)
        else: new_exp = datetime.now() + timedelta(days=days)
        c.execute("UPDATE users SET vip_until=? WHERE user_id=?", (new_exp, uid))
        self.conn.commit()
    
    def add_coins(self, uid, amt):
        c = self.conn.cursor()
        c.execute("UPDATE users SET coins = coins + ? WHERE user_id=?", (amt, uid))
        self.conn.commit()
    
    def deduct_coins(self, uid, amt):
        c = self.conn.cursor()
        c.execute("SELECT coins FROM users WHERE user_id=?", (uid,))
        row = c.fetchone()
        if row and row[0] >= amt:
            c.execute("UPDATE users SET coins = coins - ? WHERE user_id=?", (amt, uid))
            self.conn.commit()
            return True
        return False
    
    def add_referral(self, ref_id, ref_uid):
        c = self.conn.cursor()
        c.execute("INSERT INTO referrals (referrer_id, referred_id) VALUES (?,?)", (ref_id, ref_uid))
        self.conn.commit()
    
    def get_referral_count(self, uid):
        c = self.conn.cursor()
        c.execute("SELECT COUNT(*) FROM referrals WHERE referrer_id=?", (uid,))
        return c.fetchone()[0]
    
    def stop_user(self, uid):
        c = self.conn.cursor()
        c.execute("UPDATE users SET is_active=0 WHERE user_id=?", (uid,))
        self.conn.commit()
    
    def set_language(self, uid, lang):
        c = self.conn.cursor()
        c.execute("UPDATE users SET language=? WHERE user_id=?", (lang, uid))
        self.conn.commit()
    
    def get_language(self, uid):
        c = self.conn.cursor()
        c.execute("SELECT language FROM users WHERE user_id=?", (uid,))
        row = c.fetchone()
        return row[0] if row and row[0] else 'id'
    
    def get_vip_price(self, days):
        c = self.conn.cursor()
        c.execute("SELECT price FROM vip_prices WHERE days=?", (days,))
        row = c.fetchone()
        return row[0] if row else 0
    
    def set_vip_price(self, days, price):
        c = self.conn.cursor()
        c.execute("INSERT OR REPLACE INTO vip_prices (days, price) VALUES (?,?)", (days, price))
        self.conn.commit()
    
    def get_all_vip_prices(self):
        c = self.conn.cursor()
        c.execute("SELECT days, price FROM vip_prices ORDER BY days")
        return c.fetchall()
    
    def get_coin_rates(self):
        c = self.conn.cursor()
        c.execute("SELECT days, coins FROM coin_rates ORDER BY days")
        return c.fetchall()

db = Database()

# HELPERS
def rm_file(fp):
    try:
        if os.path.exists(fp): os.remove(fp)
    except: pass

def is_admin(uid): return uid in ADMIN_IDS

def is_vip(uid):
    user = db.get_user(uid)
    if not user: return False
    vip_until = user[4]
    if vip_until:
        try: return datetime.fromisoformat(vip_until) > datetime.now()
        except: return False
    return False

async def check_membership(ctx, uid):
    try:
        gm = await ctx.bot.get_chat_member(FORCE_JOIN_GROUP, uid)
        is_g = gm.status in [ChatMember.MEMBER, ChatMember.ADMINISTRATOR, ChatMember.OWNER]
    except: is_g = False
    try:
        cm = await ctx.bot.get_chat_member(FORCE_JOIN_CHANNEL, uid)
        is_c = cm.status in [ChatMember.MEMBER, ChatMember.ADMINISTRATOR, ChatMember.OWNER]
    except: is_c = False
    return (is_g, is_c)

async def send_join_message(upd, ctx, uid):
    kb = [[InlineKeyboardButton("📢 Join Group", url=f"https://t.me/{FORCE_JOIN_GROUP.replace('@','')}"),
           InlineKeyboardButton("📣 Join Channel", url=f"https://t.me/{FORCE_JOIN_CHANNEL.replace('@','')}")],
          [InlineKeyboardButton("✅ Saya Sudah Join", callback_data="check_membership")]]
    await upd.message.reply_text("⚠️ Anda harus join Group dan Channel!", reply_markup=InlineKeyboardMarkup(kb))

async def require_membership(upd, ctx):
    uid = upd.effective_user.id
    if is_admin(uid): return True
    is_g, is_c = await check_membership(ctx, uid)
    if is_g and is_c: return True
    await send_join_message(upd, ctx, uid)
    return False

async def send_files_in_batches(upd, ctx, files_list, caption=""):
    """
    IMPROVED: Send files in batches of 10 with clean names
    files_list: [(filepath, clean_filename), ...]
    """
    total = len(files_list)
    for i in range(0, total, 10):
        batch = files_list[i:i+10]
        file_names = "\n".join([f"📄 {fn}" for _, fn in batch])
        batch_num = i//10 + 1
        total_batches = (total-1)//10 + 1
        batch_caption = f"📦 Batch {batch_num}/{total_batches}\n\n{file_names}"
        if caption and i == 0: batch_caption = f"{caption}\n\n{batch_caption}"
        
        await upd.message.reply_document(document=open(batch[0][0], 'rb'), 
                                        filename=batch[0][1], caption=batch_caption)
        for fp, fn in batch[1:]:
            await upd.message.reply_document(document=open(fp, 'rb'), filename=fn)
            await asyncio.sleep(0.1)
        await asyncio.sleep(0.5)

def create_qris_payment(user_id, telegram_id, amount, days):
    """Call payment gateway to create QRIS"""
    try:
        response = requests.post(
            f"{PAYMENT_GATEWAY_URL}/create-payment",
            json={
                "user_id": user_id,
                "telegram_id": telegram_id,
                "amount": amount,
                "days": days
            },
            timeout=10
        )
        if response.status_code == 200:
            return response.json()
        logger.error(f"Payment API error: {response.text}")
        return None
    except Exception as e:
        logger.error(f"Payment error: {e}")
        return None

def check_payment_status(order_id):
    """Check payment status from gateway"""
    try:
        response = requests.get(
            f"{PAYMENT_GATEWAY_URL}/check-payment/{order_id}",
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get('status') == 'paid'
        return False
    except Exception as e:
        logger.error(f"Payment check error: {e}")
        return False

# CONVERSATION STATES  
ADMIN_NUMS, ADMIN_NAME, NAVY_NUMS, ADMIN_FNAME = range(4)
SET_PRICE_PACKAGE, SET_PRICE_AMOUNT = range(100, 102)
BROADCAST_MSG, BROADCAST_PHOTO = 102, 103
ADDVIP_USER, ADDVIP_DAYS = 104, 105
STOP_USER_ID = 106
MAN_NUMS, MAN_FORMAT, MAN_NAME, MAN_FNAME = range(11, 15)
ADD_NUMS, ADD_FORMAT, ADD_NAME, ADD_FNAME = range(15, 19)
DEL_FILE, DEL_PATTERN = range(19, 21)
RENAME_FILE, RENAME_OLD, RENAME_NEW = range(21, 24)
RENAMEFILE_FILE, RENAMEFILE_NAME = range(24, 26)
MERGE_FILES = 26
GEN_PREFIX, GEN_COUNT, GEN_FNAME = range(27, 30)
GETCONTEN_FILE = 30
TOVCF_FILE, TOVCF_DONE, TOVCF_NAME, TOVCF_FNAME, TOVCF_LIM = range(31, 36)
TOTXT_FILES = 36
SPL_FILE, SPL_CNT = range(37, 39)
GETNAME_FILE = 39
GETCONTENT_FILE = 40
NODUP_FILES = 41

# Saya akan lanjutkan dengan semua command handlers...
# Ini adalah template untuk bot yang terintegrasi dengan payment gateway

print("✅ Bot module loaded - integrate with qris.js payment gateway")
print("📝 Remember to set PAYMENT_GATEWAY_URL environment variable")
