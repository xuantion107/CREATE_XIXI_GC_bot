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
# Pastikan Token & API Key ini sudah benar
BOT_TOKEN = "8219268200:AAGNF8otuDit6Ojd01ofDD8lL2wRJx1UDl4"
API_KEY = "Y5uXwRY0vT1baCjIIrpBu17W65lLV0oul4cm1aU0sx7n5ajxRzBwsfCXVnmzE6KrW4hdl0jtbZBMo42t9SalleEy6cCUAJiJ8yEw"
BASE_URL = "https://atlantic-pedia.co.id/api/v2"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

# --- FUNGSI HELPER API ---
async def call_api(endpoint, payload):
    """Fungsi request API dengan Debugging Log untuk Railway"""
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        # Atlantic-Pedia v2 biasanya menggunakan field 'key'
        payload['key'] = API_KEY 
        
        try:
            async with session.post(f"{BASE_URL}{endpoint}", data=payload, timeout=30) as response:
                status_code = response.status
                try:
                    result = await response.json()
                except:
                    result_raw = await response.text()
                    result = {"status": False, "message": f"Non-JSON Response: {result_raw[:100]}"}
                
                # CETAK KE LOG RAILWAY
                print(f"--- DEBUG API ---")
                print(f"Status: {status_code} | Result: {result}")
                return result
        except Exception as e:
            logger.error(f"Connection Error: {e}")
            return {"status": False, "message": f"Koneksi gagal: {str(e)}"}

# --- HANDLERS ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🚀 **Bot QRIS & VCF Ready!**\n\n"
        "**Menu:**\n"
        "• `/deposit [nominal]` - Buat QRIS\n"
        "• Kirim file `.txt` / `.csv` untuk convert ke VCF."
    )

async def deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Gunakan format: `/deposit 10000`")
        return

    amount = context.args[0]
    if not amount.isdigit():
        await update.message.reply_text("⚠️ Nominal harus angka!")
        return

    wait_msg = await update.message.reply_text("⏳ Memproses request QRIS...")

    # Payload Atlantic-Pedia (Sesuaikan dengan dokumentasi Anda jika berbeda)
    payload = {
        'nominal': amount,
        'type': 'qris',
        'reff_id': f"TRX{os.urandom(3).hex().upper()}"
    }

    result = await call_api('/pay/qris', payload)

    # Hapus pesan "memproses" dengan aman
    try:
        await wait_msg.delete()
    except:
        pass

    if result.get('status') is True:
        data = result.get('data', {})
        # Ambil QR dari string atau URL
        qr_content = data.get('qr_string') or data.get('qr_url') or data.get('qr_data')
        trx_id = data.get('reff_id') or payload['reff_id']
        
        caption = (
            f"✅ **QRIS BERHASIL DIBUAT**\n\n"
            f"ID Reff: `{trx_id}`\n"
            f"Nominal: Rp {int(amount):,}\n\n"
            f"Silakan scan melalui e-wallet."
        )

        keyboard = [[InlineKeyboardButton("🔄 Cek Status", callback_data=f"check_{trx_id}")]]
        markup = InlineKeyboardMarkup(keyboard)

        if qr_content:
            try:
                if qr_content.startswith('http'):
                    await update.message.reply_photo(photo=qr_content, caption=caption, reply_markup=markup, parse_mode="Markdown")
                else:
                    await update.message.reply_text(f"{caption}\n\n**Payload QR:**\n`{qr_content}`", reply_markup=markup, parse_mode="Markdown")
            except Exception as e:
                # Jika link foto dari API rusak, kirim teksnya saja agar bot tidak stuck
                await update.message.reply_text(f"{caption}\n\n⚠️ Gagal memuat gambar. Payload:\n`{qr_content}`", reply_markup=markup, parse_mode="Markdown")
        else:
            await update.message.reply_text("❌ API tidak mengirimkan data QR.")
    else:
        error_msg = result.get('message') or "Terjadi kesalahan API internal."
        await update.message.reply_text(f"❌ **Gagal Membuat Deposit**\nPesan: {error_msg}")

async def check_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    trx_id = query.data.split("_")[1]
    result = await call_api('/pay/status', {'reff_id': trx_id})

    if result.get('status') is True:
        status = result.get('data', {}).get('status', 'PENDING')
        await query.message.reply_text(f"📊 Transaksi `{trx_id}`: **{status.upper()}**", parse_mode="Markdown")
    else:
        await query.message.reply_text("❌ Gagal mengecek status.")

async def handle_vcf(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc or not (doc.file_name.lower().endswith(('.txt', '.csv'))):
        return

    wait_vcf = await update.message.reply_text("⚙️ Mengonversi ke VCF...")
    
    file = await context.bot.get_file(doc.file_id)
    content = await file.download_as_bytearray()
    lines = content.decode('utf-8', errors='ignore').splitlines()

    output = io.StringIO()
    count = 0
    for line in lines:
        if not line.strip(): continue
        parts = line.replace(';', ',').split(',')
        if len(parts) >= 2:
            name, phone = parts[0].strip(), ''.join(filter(str.isdigit, parts[1]))
            output.write(f"BEGIN:VCARD\nVERSION:3.0\nFN:{name}\nTEL;TYPE=CELL:{phone}\nEND:VCARD\n")
            count += 1

    await wait_vcf.delete()

    if count > 0:
        bio = io.BytesIO(output.getvalue().encode('utf-8'))
        bio.name = f"VCF_{count}_Kontak.vcf"
        await update.message.reply_document(document=bio, caption=f"✅ Berhasil convert {count} kontak.")
    else:
        await update.message.reply_text("❌ Format file salah. Gunakan: Nama,Nomor")

# --- MAIN ---
def main():
    # Railway akan otomatis menjalankan ini
    app = Application.builder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("deposit", deposit))
    app.add_handler(CallbackQueryHandler(check_status_handler, pattern="^check_"))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_vcf))

    print("Bot Railway Aktif!")
    app.run_polling(drop_pending_updates=True)

if __name__ == '__main__':
    main()
    
