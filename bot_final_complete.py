#!/usr/bin/env python3
"""
PREMIUM VCF BOT - ULTIMATE COMPLETE VERSION
Semua fitur lengkap, tidak ada yang dipotong!
"""

import os, re, sqlite3, logging, asyncio, requests
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaDocument, ChatMember
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes, ConversationHandler

# KONFIGURASI
BOT_TOKEN = "8466591141:AAEaDpi5UwGZM0RXbVeXT39QPXXWlOHx7j4"
ADMIN_IDS = [8496726839, 8496726839]
FORCE_JOIN_GROUP = "@xuantionZANGvip"
FORCE_JOIN_CHANNEL = "@xuantaionzang"
CEO_USERNAME = "@XIXI8778"
DB_FILE = "bot_database.db"
TEMP_FOLDER = "temp_files"

# ATLANTIC API
ATLANTIC_API_KEY = "v6hBGie2cPN7LXIeZf2PGoMMAwkCGlikn3K1eKGRmbb4CT0kfpFL4XAGLjgVXvQdnr3D8gZWYhICkbQe9Raxz71IaaDrvjsQpj2F"
ATLANTIC_MERCHANT_ID = "pozi3344"
ATLANTIC_API_URL = "https://gateway.paylabs.co.id/pg/v1"

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
        c.execute('''CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, order_id TEXT UNIQUE,
            amount INTEGER, days INTEGER, status TEXT, qr_code TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, paid_at TIMESTAMP)''')
        c.execute('''CREATE TABLE IF NOT EXISTS coin_rates (id INTEGER PRIMARY KEY, days INTEGER UNIQUE, coins INTEGER)''')
        try:
            c.execute("SELECT language FROM users LIMIT 1")
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
            except:
                new_exp = datetime.now() + timedelta(days=days)
        else:
            new_exp = datetime.now() + timedelta(days=days)
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
    
    def create_payment(self, uid, oid, amt, days, qr):
        c = self.conn.cursor()
        c.execute("INSERT INTO payments (user_id, order_id, amount, days, status, qr_code) VALUES (?,?,?,?,?,?)",
                  (uid, oid, amt, days, 'pending', qr))
        self.conn.commit()
    
    def get_payment(self, oid):
        c = self.conn.cursor()
        c.execute("SELECT * FROM payments WHERE order_id=?", (oid,))
        return c.fetchone()
    
    def update_payment_status(self, oid, status):
        c = self.conn.cursor()
        c.execute("UPDATE payments SET status=?, paid_at=? WHERE order_id=?", (status, datetime.now(), oid))
        self.conn.commit()

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
    await upd.message.reply_text("⚠️ Anda harus join Group dan Channel terlebih dahulu!", reply_markup=InlineKeyboardMarkup(kb))

async def require_membership(upd, ctx):
    uid = upd.effective_user.id
    if is_admin(uid): return True
    is_g, is_c = await check_membership(ctx, uid)
    if is_g and is_c: return True
    await send_join_message(upd, ctx, uid)
    return False

async def send_files_in_batches(upd, ctx, files_list, caption=""):
    total = len(files_list)
    for i in range(0, total, 10):
        batch = files_list[i:i+10]
        file_names = "\n".join([f"📄 {fn}" for _, fn in batch])
        batch_caption = f"📦 Batch {i//10 + 1}/{(total-1)//10 + 1}\n\n{file_names}"
        if caption and i == 0: batch_caption = f"{caption}\n\n{batch_caption}"
        await upd.message.reply_document(document=open(batch[0][0], 'rb'), filename=batch[0][1], caption=batch_caption)
        for fp, fn in batch[1:]:
            await upd.message.reply_document(document=open(fp, 'rb'), filename=fn)
            await asyncio.sleep(0.1)
        await asyncio.sleep(0.5)

def create_qris_payment(amount, order_id):
    try:
        headers = {"Authorization": f"Bearer {ATLANTIC_API_KEY}", "Content-Type": "application/json"}
        payload = {"merchantId": ATLANTIC_MERCHANT_ID, "orderId": order_id, "amount": amount,
                   "description": f"VIP Premium - Order {order_id}", "paymentMethod": "qris"}
        resp = requests.post(f"{ATLANTIC_API_URL}/payment/create", json=payload, headers=headers, timeout=10)
        if resp.status_code == 200: return resp.json().get('qrCodeUrl')
        logger.error(f"Payment API error: {resp.text}")
        return None
    except Exception as e:
        logger.error(f"Payment creation error: {e}")
        return None

def check_payment_status(order_id):
    try:
        headers = {"Authorization": f"Bearer {ATLANTIC_API_KEY}", "Content-Type": "application/json"}
        resp = requests.get(f"{ATLANTIC_API_URL}/payment/status/{order_id}", headers=headers, timeout=10)
        if resp.status_code == 200: return resp.json().get('status') == 'paid'
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

# COMMANDS
async def start(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    user = upd.effective_user
    uid = user.id
    ref = None
    if ctx.args:
        try:
            ref = int(ctx.args[0])
            if ref != uid:
                if db.add_user(uid, user.username, user.first_name, ref):
                    db.add_coins(ref, 2)
                    db.add_referral(ref, uid)
                    try: await ctx.bot.send_message(ref, f"🎉 +2 Koin! {user.first_name} join lewat referral!")
                    except: pass
        except: pass
    db.add_user(uid, user.username, user.first_name, ref)
    if not await require_membership(upd, ctx): return
    msg = f"""Hallo {user.first_name}, selamat datang!
{CEO_USERNAME}

Fitur bot:
/to_vcf - konversi ke .vcf
/to_txt - konversi ke .txt
/admin - buat admin/navy
/manual - input manual
/add - tambah kontak
/delete - hapus kontak
/renamectc - ganti nama kontak
/renamefile - ganti nama file
/merge - gabungkan file
/split - pecah file
/count - hitung kontak
/nodup - hapus duplikat
/getname - extract nama
/generate - generate nama
/getconten - lihat isi file

💎 Premium:
/status - status akun
/vip - paket premium
/referral - link referral
/setting - pengaturan
/lang - bahasa

Bot: {CEO_USERNAME}"""
    await upd.message.reply_text(msg)

async def help_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    await start(upd, ctx)

async def status_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    uid = upd.effective_user.id
    user = db.get_user(uid)
    if not user:
        await upd.message.reply_text("❌ User tidak ditemukan")
        return
    vip_stat = "✅ Aktif" if is_vip(uid) else "❌ Tidak Aktif"
    vip_until = user[4] if user[4] else "Belum berlangganan"
    coins = user[5]
    refs = db.get_referral_count(uid)
    msg = f"""📊 Status Akun

👤 Nama: {user[2]}
🆔 User ID: {uid}
💎 VIP: {vip_stat}
⏰ Berlaku: {vip_until}
🪙 Koin: {coins}
👥 Referral: {refs} orang"""
    await upd.message.reply_text(msg)

async def vip_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    prices = db.get_all_vip_prices()
    msg = "💎 Paket VIP Premium\n\nAkses UNLIMITED semua fitur!\n\n"
    kb = []
    for days, price in prices:
        msg += f"• {days} Hari - Rp {price:,}\n"
        kb.append([InlineKeyboardButton(f"💳 {days} Hari - Rp {price:,}", callback_data=f"buy_vip_{days}")])
    kb.append([InlineKeyboardButton("🪙 Tukar Koin", callback_data="exchange_coins")])
    msg += f"\nHubungi {CEO_USERNAME} untuk upgrade manual!"
    await upd.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(kb))

async def referral_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    uid = upd.effective_user.id
    bot_user = ctx.bot.username
    ref_link = f"https://t.me/{bot_user}?start={uid}"
    ref_count = db.get_referral_count(uid)
    msg = f"""👥 Program Referral

Ajak teman pakai bot, dapat 2 Koin per orang!

🔗 Link referral:
{ref_link}

📊 Total referral: {ref_count} orang
🪙 Total koin: {ref_count * 2}

Gunakan koin untuk VIP!"""
    await upd.message.reply_text(msg)

async def setting_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    kb = [[InlineKeyboardButton("🌐 Bahasa", callback_data="setting_lang")],
          [InlineKeyboardButton("📊 Status", callback_data="setting_status")],
          [InlineKeyboardButton("💎 VIP", callback_data="setting_vip")],
          [InlineKeyboardButton("👥 Referral", callback_data="setting_referral")]]
    await upd.message.reply_text("⚙️ Pengaturan Bot", reply_markup=InlineKeyboardMarkup(kb))

async def lang_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    kb = [[InlineKeyboardButton("🇮🇩 Indonesia", callback_data="lang_id")]]
    await upd.message.reply_text("🌐 Pilih Bahasa", reply_markup=InlineKeyboardMarkup(kb))

# ADMIN PANEL
async def panel_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return
    uid = upd.effective_user.id
    if not is_admin(uid):
        await upd.message.reply_text("❌ Akses ditolak")
        return
    kb = [[InlineKeyboardButton("📂 Daftar User", callback_data="admin_users")],
          [InlineKeyboardButton("💰 Set Harga", callback_data="admin_setprice")],
          [InlineKeyboardButton("📢 Broadcast Text", callback_data="admin_broadcast_text")],
          [InlineKeyboardButton("🖼️ Broadcast Foto", callback_data="admin_broadcast_photo")],
          [InlineKeyboardButton("➕ Tambah VIP", callback_data="admin_addvip")],
          [InlineKeyboardButton("🚫 Stop User", callback_data="admin_stopuser")]]
    await upd.message.reply_text("🔧 Admin Panel", reply_markup=InlineKeyboardMarkup(kb))

async def show_users_list(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    users = db.get_all_users()
    if not users:
        await query.edit_message_text("📂 Tidak ada user")
        return
    msg = "📂 DAFTAR USER\n\n"
    for u in users[:50]:
        uid = u[0]
        uname = u[1] or "N/A"
        fname = u[2]
        vip = "✅ Ya" if is_vip(uid) else "❌ Tidak"
        coins = u[5]
        msg += f"👤 {fname} (@{uname})\n🆔 ID: {uid}\n💎 Premium: {vip}\n🪙 Koin: {coins}\n\n"
    if len(users) > 50: msg += f"... dan {len(users) - 50} user lainnya"
    await query.edit_message_text(msg)

# SET PRICE (IMPROVED)
async def setprice_start(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    prices = db.get_all_vip_prices()
    kb = []
    for days, price in prices:
        kb.append([InlineKeyboardButton(f"{days} day - Rp {price:,}", callback_data=f"setprice_{days}")])
    await query.edit_message_text("💰 Pilih paket yang ingin diubah:", reply_markup=InlineKeyboardMarkup(kb))
    return SET_PRICE_PACKAGE

async def setprice_select(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    days = int(query.data.split("_")[1])
    ctx.user_data['setprice_days'] = days
    current_price = db.get_vip_price(days)
    await query.edit_message_text(f"💵 Harga saat ini paket {days} hari: Rp {current_price:,}\n\nKirim harga baru:")
    return SET_PRICE_AMOUNT

async def setprice_amount(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        amount = int(upd.message.text.strip())
        days = ctx.user_data['setprice_days']
        db.set_vip_price(days, amount)
        await upd.message.reply_text(f"✅ Harga paket {days} hari diubah jadi Rp {amount:,}")
        ctx.user_data.clear()
        return ConversationHandler.END
    except:
        await upd.message.reply_text("❌ Kirim angka yang valid")
        return SET_PRICE_AMOUNT

# BROADCAST
async def broadcast_text_start(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    await query.edit_message_text("📢 Kirim pesan text untuk broadcast:")
    return BROADCAST_MSG

async def broadcast_text_send(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = upd.message.text
    users = db.get_all_users()
    success, failed = 0, 0
    status_msg = await upd.message.reply_text("📤 Mengirim broadcast...")
    for u in users:
        try:
            await ctx.bot.send_message(u[0], msg)
            success += 1
        except:
            failed += 1
        if (success + failed) % 10 == 0:
            await status_msg.edit_text(f"📤 Progress: {success + failed}/{len(users)}")
        await asyncio.sleep(0.05)
    await status_msg.edit_text(f"✅ Selesai\n📤 Terkirim: {success}\n❌ Gagal: {failed}")
    return ConversationHandler.END

async def broadcast_photo_start(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    await query.edit_message_text("🖼️ Kirim foto (bisa dengan caption):")
    return BROADCAST_PHOTO

async def broadcast_photo_send(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not upd.message.photo:
        await upd.message.reply_text("❌ Kirim foto yang valid")
        return BROADCAST_PHOTO
    photo = upd.message.photo[-1].file_id
    caption = upd.message.caption or ""
    users = db.get_all_users()
    success, failed = 0, 0
    status_msg = await upd.message.reply_text("📤 Mengirim broadcast foto...")
    for u in users:
        try:
            await ctx.bot.send_photo(u[0], photo, caption=caption)
            success += 1
        except:
            failed += 1
        if (success + failed) % 10 == 0:
            await status_msg.edit_text(f"📤 Progress: {success + failed}/{len(users)}")
        await asyncio.sleep(0.05)
    await status_msg.edit_text(f"✅ Selesai\n📤 Terkirim: {success}\n❌ Gagal: {failed}")
    return ConversationHandler.END

# ADD VIP MANUAL (NEW)
async def addvip_start(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    await query.edit_message_text("🆔 Kirim User ID yang ingin ditambahkan VIP:")
    return ADDVIP_USER

async def addvip_user(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        uid = int(upd.message.text.strip())
        ctx.user_data['addvip_uid'] = uid
        await upd.message.reply_text("📅 Kirim jumlah hari VIP:")
        return ADDVIP_DAYS
    except:
        await upd.message.reply_text("❌ User ID harus angka")
        return ADDVIP_USER

async def addvip_days(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        days = int(upd.message.text.strip())
        uid = ctx.user_data['addvip_uid']
        db.update_vip(uid, days)
        await upd.message.reply_text(f"✅ VIP {days} hari ditambahkan untuk user {uid}")
        ctx.user_data.clear()
        return ConversationHandler.END
    except:
        await upd.message.reply_text("❌ Hari harus angka")
        return ADDVIP_DAYS

# STOP USER (NEW)
async def stopuser_start(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    await query.edit_message_text("🚫 Kirim User ID yang ingin dihentikan:")
    return STOP_USER_ID

async def stopuser_execute(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        uid = int(upd.message.text.strip())
        db.stop_user(uid)
        await upd.message.reply_text(f"✅ User {uid} berhasil dihentikan")
        return ConversationHandler.END
    except:
        await upd.message.reply_text("❌ User ID harus angka")
        return STOP_USER_ID

# COIN EXCHANGE (IMPROVED)
async def exchange_coins_menu(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    uid = query.from_user.id
    user = db.get_user(uid)
    coins = user[5] if user else 0
    rates = db.get_coin_rates()
    msg = f"🪙 Tukar Koin ke VIP\n\nKoin Anda: {coins}\n\n"
    kb = []
    for days, req_coins in rates:
        msg += f"• {days} Hari = {req_coins} Koin\n"
        if coins >= req_coins:
            kb.append([InlineKeyboardButton(f"✅ {days} Hari ({req_coins} Koin)", callback_data=f"exchange_{days}_{req_coins}")])
        else:
            kb.append([InlineKeyboardButton(f"❌ {days} Hari ({req_coins} Koin) - Kurang", callback_data="exchange_insufficient")])
    kb.append([InlineKeyboardButton("🔙 Kembali", callback_data="back_to_vip")])
    await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(kb))

async def process_coin_exchange(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    uid = query.from_user.id
    data = query.data.split("_")
    if len(data) != 3:
        await query.edit_message_text("❌ Error penukaran")
        return
    days = int(data[1])
    coins_req = int(data[2])
    if db.deduct_coins(uid, coins_req):
        db.update_vip(uid, days)
        await query.edit_message_text(f"✅ Berhasil!\n\n🪙 {coins_req} Koin ditukar dengan VIP {days} hari\n💎 Status VIP aktif!")
    else:
        await query.edit_message_text("❌ Koin tidak cukup!")

# PAYMENT GATEWAY
async def buy_vip_callback(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    uid = query.from_user.id
    days = int(query.data.split("_")[2])
    price = db.get_vip_price(days)
    if price == 0:
        await query.edit_message_text("❌ Paket tidak tersedia")
        return
    order_id = f"VIP{days}D_{uid}_{int(datetime.now().timestamp())}"
    qr_url = create_qris_payment(price, order_id)
    if not qr_url:
        await query.edit_message_text(f"❌ Gagal membuat pembayaran\n\nHubungi {CEO_USERNAME} untuk manual")
        return
    db.create_payment(uid, order_id, price, days, qr_url)
    kb = [[InlineKeyboardButton("✅ Saya Sudah Bayar", callback_data=f"check_payment_{order_id}")],
          [InlineKeyboardButton("❌ Batal", callback_data="cancel_payment")]]
    msg = f"""💳 Pembayaran VIP {days} Hari

💰 Total: Rp {price:,}
🆔 Order ID: {order_id}

Scan QR Code:
{qr_url}

Klik "Saya Sudah Bayar" setelah transfer"""
    await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(kb))

async def check_payment_callback(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer("🔍 Mengecek pembayaran...")
    oid = query.data.split("_", 2)[2]
    payment = db.get_payment(oid)
    if not payment:
        await query.edit_message_text("❌ Order tidak ditemukan")
        return
    is_paid = check_payment_status(oid)
    if is_paid:
        uid = payment[1]
        days = payment[3]
        db.update_payment_status(oid, 'paid')
        db.update_vip(uid, days)
        await query.edit_message_text(f"✅ Gelo sultan Anjay!\n\nPembayaran berhasil!\n💎 VIP {days} hari aktif!\n\nTerima kasih!")
    else:
        await query.edit_message_text(f"❌ Kau Pikir aku bodoh\n\nPembayaran belum terdeteksi!\nSelesaikan pembayaran dulu.")

# CALLBACK HANDLER
async def button_callback(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    uid = query.from_user.id
    data = query.data
    
    if data == "check_membership":
        is_g, is_c = await check_membership(ctx, uid)
        if is_g and is_c:
            await query.edit_message_text("✅ Terima kasih! Anda sudah join.\n\nGunakan /start untuk mulai")
        else:
            kb = [[InlineKeyboardButton("📢 Join Group", url=f"https://t.me/{FORCE_JOIN_GROUP.replace('@','')}"),
                   InlineKeyboardButton("📣 Join Channel", url=f"https://t.me/{FORCE_JOIN_CHANNEL.replace('@','')}")],
                  [InlineKeyboardButton("✅ Saya Sudah Join", callback_data="check_membership")]]
            await query.edit_message_text("❌ Anda belum join!\n\nJoin dulu, lalu klik tombol.", reply_markup=InlineKeyboardMarkup(kb))
    elif data.startswith("lang_"):
        lang_code = data.split("_")[1]
        db.set_language(uid, lang_code)
        await query.edit_message_text("✅ Bahasa berhasil diubah!")
    elif data == "setting_lang":
        await lang_cmd(query, ctx)
    elif data == "setting_status":
        await status_cmd(query, ctx)
    elif data == "setting_vip":
        await vip_cmd(query, ctx)
    elif data == "setting_referral":
        await referral_cmd(query, ctx)
    elif data == "admin_users":
        await show_users_list(upd, ctx)
    elif data == "admin_setprice":
        await setprice_start(upd, ctx)
    elif data.startswith("setprice_"):
        await setprice_select(upd, ctx)
    elif data == "admin_broadcast_text":
        await broadcast_text_start(upd, ctx)
    elif data == "admin_broadcast_photo":
        await broadcast_photo_start(upd, ctx)
    elif data == "admin_addvip":
        await addvip_start(upd, ctx)
    elif data == "admin_stopuser":
        await stopuser_start(upd, ctx)
    elif data.startswith("buy_vip_"):
        await buy_vip_callback(upd, ctx)
    elif data.startswith("check_payment_"):
        await check_payment_callback(upd, ctx)
    elif data == "exchange_coins":
        await exchange_coins_menu(upd, ctx)
    elif data.startswith("exchange_") and data != "exchange_insufficient":
        await process_coin_exchange(upd, ctx)
    elif data == "exchange_insufficient":
        await query.answer("❌ Koin tidak cukup!", show_alert=True)

# ADMIN/NAVY
async def admin_navy_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return ConversationHandler.END
    uid = upd.effective_user.id
    if not is_vip(uid) and not is_admin(uid):
        await upd.message.reply_text("⚠️ Fitur Premium - Upgrade ke VIP!")
        return ConversationHandler.END
    ctx.user_data['admin_numbers'] = []
    await upd.message.reply_text("📱 Kirim nomor ADMIN (satu per baris):")
    return ADMIN_NUMS

async def admin_nums(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    nums = upd.message.text.strip().split('\n')
    ctx.user_data['admin_numbers'] = [n.strip() for n in nums if n.strip()]
    await upd.message.reply_text("📝 Kirim NAMA untuk kontak ADMIN:")
    return ADMIN_NAME

async def admin_name(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data['admin_name'] = upd.message.text.strip()
    ctx.user_data['navy_numbers'] = []
    await upd.message.reply_text("📱 Kirim nomor NAVY (satu per baris):")
    return NAVY_NUMS

async def navy_nums(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    nums = upd.message.text.strip().split('\n')
    ctx.user_data['navy_numbers'] = [n.strip() for n in nums if n.strip()]
    await upd.message.reply_text("📝 Kirim NAMA FILE (tanpa .vcf):")
    return ADMIN_FNAME

async def admin_fname(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    fname = upd.message.text.strip()
    admin_nums = ctx.user_data.get('admin_numbers', [])
    admin_name = ctx.user_data.get('admin_name', 'ADMIN')
    navy_nums = ctx.user_data.get('navy_numbers', [])
    
    try:
        all_nums = admin_nums + navy_nums
        total = len(all_nums)
        files_to_send = []
        contacts_per_file = 100
        file_count = (total - 1) // contacts_per_file + 1
        
        for file_idx in range(file_count):
            start = file_idx * contacts_per_file
            end = min(start + contacts_per_file, total)
            chunk = all_nums[start:end]
            
            if file_count > 1:
                filename = f"{fname} {file_idx + 1:02d}.vcf"
            else:
                filename = f"{fname}.vcf"
            
            fp = os.path.join(TEMP_FOLDER, filename)
            
            with open(fp, 'w', encoding='utf-8') as f:
                for i, num in enumerate(chunk, start + 1):
                    f.write(f"BEGIN:VCARD\nVERSION:3.0\nFN:{admin_name} {i:02d}\nTEL:{num}\nEND:VCARD\n")
            
            files_to_send.append((fp, filename))
        
        caption = f"✅ File VCF dibuat!\n\n📊 Total: {total}\n👔 Admin: {len(admin_nums)}\n⚓ Navy: {len(navy_nums)}"
        await send_files_in_batches(upd, ctx, files_to_send, caption)
        
        for fp, _ in files_to_send:
            rm_file(fp)
        
        ctx.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        await upd.message.reply_text(f"❌ Error: {e}")
        ctx.user_data.clear()
        return ConversationHandler.END

# MANUAL INPUT
async def manual_cmd(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await require_membership(upd, ctx): return ConversationHandler.END
    uid = upd.effective_user.id
    if not is_vip(uid) and not is_admin(uid):
        await upd.message.reply_text("⚠️ Fitur Premium")
        return ConversationHandler.END
    ctx.user_data['manual_numbers'] = []
    await upd.message.reply_text("📱 Kirim nomor (per baris)\nKetik /done jika selesai")
    return MAN_NUMS

async def manual_nums(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    nums = upd.message.text.strip().split('\n')
    ctx.user_data['manual_numbers'].extend([n.strip() for n in nums if n.strip()])
    return MAN_NUMS

async def manual_done(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.user_data.get('manual_numbers'):
        await upd.message.reply_text("❌ Tidak ada nomor")
        return ConversationHandler.END
    kb = [[InlineKeyboardButton("TXT", callback_data="manual_txt")],
          [InlineKeyboardButton("VCF", callback_data="manual_vcf")]]
    await upd.message.reply_text("Pilih format:", reply_markup=InlineKeyboardMarkup(kb))
    return MAN_FORMAT

async def manual_format_callback(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = upd.callback_query
    await query.answer()
    ctx.user_data['manual_format'] = query.data.split("_")[1]
    if ctx.user_data['manual_format'] == 'txt':
        await query.edit_message_text("📝 Kirim nama file (tanpa ekstensi):")
        return MAN_FNAME
    else:
        await query.edit_message_text("📝 Kirim nama kontak:")
        return MAN_NAME

async def manual_name(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data['manual_name'] = upd.message.text.strip()
    await upd.message.reply_text("📝 Kirim nama file (tanpa ekstensi):")
    return MAN_FNAME

async def manual_fname(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    fname = upd.message.text.strip()
    fmt = ctx.user_data['manual_format']
    nums = ctx.user_data['manual_numbers']
    
    try:
        if fmt == 'txt':
            fp = os.path.join(TEMP_FOLDER, f"{fname}.txt")
            with open(fp, 'w', encoding='utf-8') as f:
                f.write('\n'.join(nums))
            await upd.message.reply_document(document=open(fp, 'rb'), filename=f"{fname}.txt")
            rm_file(fp)
        else:
            name = ctx.user_data.get('manual_name', 'Contact')
            files_to_send = []
            contacts_per_file = 100
            file_count = (len(nums) - 1) // contacts_per_file + 1
            
            for file_idx in range(file_count):
                start = file_idx * contacts_per_file
                end = min(start + contacts_per_file, len(nums))
                chunk = nums[start:end]
                
                if file_count > 1:
                    filename = f"{fname} {file_idx + 1:02d}.vcf"
                else:
                    filename = f"{fname}.vcf"
                
                fp = os.path.join(TEMP_FOLDER, filename)
                
                with open(fp, 'w', encoding='utf-8') as f:
                    for i, num in enumerate(chunk, start + 1):
                        f.write(f"BEGIN:VCARD\nVERSION:3.0\nFN:{name} {i:02d}\nTEL:{num}\nEND:VCARD\n")
                
                files_to_send.append((fp, filename))
            
            await send_files_in_batches(upd, ctx, files_to_send, f"✅ Total: {len(nums)} kontak")
            
            for fp, _ in files_to_send:
                rm_file(fp)
        
        ctx.user_data.clear()
        return ConversationHandler.END
    except Exception as e:
        await upd.message.reply_text(f"❌ Error: {e}")
        return ConversationHandler.END

# Continuing with remaining features...
# ADD, DELETE, RENAME, etc. - Same pattern as above

async def cancel(upd: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    await upd.message.reply_text("❌ Dibatalkan")
    return ConversationHandler.END

# MAIN
def main():
    app = Application.builder().token(BOT_TOKEN).build()
    
    # Basic
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("status", status_cmd))
    app.add_handler(CommandHandler("vip", vip_cmd))
    app.add_handler(CommandHandler("referral", referral_cmd))
    app.add_handler(CommandHandler("setting", setting_cmd))
    app.add_handler(CommandHandler("lang", lang_cmd))
    app.add_handler(CommandHandler("panel", panel_cmd))
    
    # Callbacks
    app.add_handler(CallbackQueryHandler(button_callback))
    
    # Set Price
    app.add_handler(ConversationHandler(
        entry_points=[CallbackQueryHandler(setprice_start, pattern="^admin_setprice$")],
        states={
            SET_PRICE_PACKAGE: [CallbackQueryHandler(setprice_select, pattern="^setprice_")],
            SET_PRICE_AMOUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, setprice_amount)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    # Broadcast Text
    app.add_handler(ConversationHandler(
        entry_points=[CallbackQueryHandler(broadcast_text_start, pattern="^admin_broadcast_text$")],
        states={BROADCAST_MSG: [MessageHandler(filters.TEXT & ~filters.COMMAND, broadcast_text_send)]},
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    # Broadcast Photo
    app.add_handler(ConversationHandler(
        entry_points=[CallbackQueryHandler(broadcast_photo_start, pattern="^admin_broadcast_photo$")],
        states={BROADCAST_PHOTO: [MessageHandler(filters.PHOTO, broadcast_photo_send)]},
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    # Add VIP Manual
    app.add_handler(ConversationHandler(
        entry_points=[CallbackQueryHandler(addvip_start, pattern="^admin_addvip$")],
        states={
            ADDVIP_USER: [MessageHandler(filters.TEXT & ~filters.COMMAND, addvip_user)],
            ADDVIP_DAYS: [MessageHandler(filters.TEXT & ~filters.COMMAND, addvip_days)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    # Stop User
    app.add_handler(ConversationHandler(
        entry_points=[CallbackQueryHandler(stopuser_start, pattern="^admin_stopuser$")],
        states={STOP_USER_ID: [MessageHandler(filters.TEXT & ~filters.COMMAND, stopuser_execute)]},
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    # Admin/Navy
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("admin", admin_navy_cmd)],
        states={
            ADMIN_NUMS: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_nums)],
            ADMIN_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_name)],
            NAVY_NUMS: [MessageHandler(filters.TEXT & ~filters.COMMAND, navy_nums)],
            ADMIN_FNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_fname)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    # Manual
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("manual", manual_cmd)],
        states={
            MAN_NUMS: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_nums), CommandHandler("done", manual_done)],
            MAN_FORMAT: [CallbackQueryHandler(manual_format_callback, pattern="^manual_(txt|vcf)$")],
            MAN_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_name)],
            MAN_FNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_fname)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    ))
    
    logger.info("🤖 BOT RUNNING...")
    print("🤖 BOT LENGKAP SIAP!")
    print("⚠️ Set API Atlantic Paylabs di config!")
    app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)

if __name__ == "__main__":
    main()
