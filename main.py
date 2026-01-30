import asyncio
import aiohttp
import logging
import io
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes

# Konfigurasi Logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# --- KONFIGURASI ---
BOT_TOKEN = "8219268200:AAGNF8otuDit6Ojd01ofDD8lL2wRJx1UDl4"
API_KEY = "v6hBGie2cPN7LXIeZf2PGoMMAwkCGlikn3K1eKGRmbb4CT0kfpFL4XAGLjgVXvQdnr3D8gZWYhICkbQe9Raxz71IaaDrvjsQpj2F"
BASE_URL = "https://atlantic-pedia.co.id/api/v2"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

# --- FUNGSI HELPER API ---
async def call_api(endpoint, payload):
    """Fungsi request API dengan Debugging Log"""
    # trust_env=True agar otomatis membaca proxy PythonAnywhere
    async with aiohttp.ClientSession(headers=HEADERS, trust_env=True) as session:
        # Menambahkan API Key ke payload
        payload['key'] = API_KEY

        try:
            async with session.post(f"{BASE_URL}{endpoint}", data=payload, timeout=30) as response:
                status_code = response.status
                try:
                    result = await response.json()
                except:
                    result = await response.text()

                # CETAK KE KONSOL UNTUK DEBUGGING
                print(f"--- DEBUG API ---")
                print(f"Endpoint: {endpoint}")
                print(f"HTTP Status: {status_code}")
                print(f"Response: {result}")
                print(f"-----------------")

                return result if isinstance(result, dict) else {"status": False, "message": str(result)}
        except Exception as e:
            logger.error(f"Connection Error: {e}")
            return {"status": False, "message": f"Koneksi gagal: {str(e)}"}

# --- HANDLERS ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 **Halo! Bot Sudah Aktif.**\n\n"
        "**Perintah:**\n"
        "• `/deposit [nominal]` - Contoh: `/deposit 10000`\n"
        "• Kirim file `.txt` atau `.csv` untuk convert ke VCF."
    )

async def deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Format salah. Contoh: `/deposit 10000`")
        return

    amount = context.args[0]
    if not amount.isdigit():
        await update.message.reply_text("⚠️ Nominal harus berupa angka.")
        return

    wait_msg = await update.message.reply_text("⏳ Sedang memproses ke Atlantic-Pedia...")

    # Payload sesuai dokumentasi Atlantic V2
    payload = {
        'nominal': amount,
        'type': 'qris', # Kadang memerlukan field type atau method
        'reff_id': f"TRX{os.urandom(3).hex().upper()}"
    }

    result = await call_api('/pay/qris', payload)
    await wait_msg.delete()

    # Pengecekan status (Atlantic-Pedia mengembalikan boolean true/false)
    if result.get('status') is True:
        data = result.get('data', {})
        qr_content = data.get('qr_string') or data.get('qr_url')
        trx_id = data.get('reff_id') or payload['reff_id']

        caption = (
            f"✅ **QRIS Berhasil Dibuat**\n\n"
            f"ID Reff: `{trx_id}`\n"
            f"Nominal: Rp {int(amount):,}\n\n"
            f"Silakan scan dan bayar."
        )

        keyboard = [[InlineKeyboardButton("🔄 Cek Status", callback_data=f"check_{trx_id}")]]

        if qr_content and qr_content.startswith('http'):
            await update.message.reply_photo(photo=qr_content, caption=caption, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
        elif qr_content:
            await update.message.reply_text(f"{caption}\n\n**Payload QR:**\n`{qr_content}`", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
        else:
            await update.message.reply_text("❌ Data QR tidak ditemukan dalam respon API.")
    else:
        # Menampilkan pesan error spesifik dari API
        error_msg = result.get('message') or result.get('data') or "Terjadi kesalahan API internal."
        await update.message.reply_text(f"❌ **Gagal Membuat Deposit**\nPesan: {error_msg}", parse_mode="Markdown")

async def check_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    trx_id = query.data.split("_")[1]
    payload = {'reff_id': trx_id}

    result = await call_api('/pay/status', payload)

    if result.get('status') is True:
        status = result.get('data', {}).get('status', 'PENDING')
        await query.message.reply_text(f"📊 Status `{trx_id}`: **{status.upper()}**", parse_mode="Markdown")
    else:
        await query.message.reply_text("❌ Belum ada pembaruan status.")

# --- VCF HANDLER (SAMA SEPERTI SEBELUMNYA) ---
async def handle_vcf(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not (doc.file_name.endswith('.txt') or doc.file_name.endswith('.csv')):
        return

    file = await context.bot.get_file(doc.file_id)
    content = await file.download_as_bytearray()
    lines = content.decode('utf-8', errors='ignore').splitlines()

    output = io.StringIO()
    count = 0
    for line in lines:
        parts = line.replace(';', ',').split(',')
        if len(parts) >= 2:
            name, phone = parts[0].strip(), ''.join(filter(str.isdigit, parts[1]))
            output.write(f"BEGIN:VCARD\nVERSION:3.0\nFN:{name}\nTEL;TYPE=CELL:{phone}\nEND:VCARD\n")
            count += 1

    if count > 0:
        bio = io.BytesIO(output.getvalue().encode('utf-8'))
        bio.name = "contacts.vcf"
        await update.message.reply_document(document=bio, caption=f"✅ {count} kontak dikonversi.")

# --- MAIN ---
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("deposit", deposit))
    app.add_handler(CallbackQueryHandler(check_status_handler, pattern="^check_"))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_vcf))

    print("Bot sedang berjalan... Cek log di bawah jika ada error.")
    app.run_polling()

if __name__ == '__main__':
    main()
