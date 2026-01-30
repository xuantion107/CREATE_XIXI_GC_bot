/**
 * ═══════════════════════════════════════════════════════════════
 * ATLANTIC PAYLABS QRIS PAYMENT GATEWAY
 * Integrasi dengan Telegram Bot untuk auto payment processing
 * Ready untuk deploy di Railway
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || "8466591141:AAEaDpi5UwGZM0RXbVeXT39QPXXWlOHx7j4";
const ATLANTIC_API_KEY = process.env.ATLANTIC_API_KEY || "v6hBGie2cPN7LXIeZf2PGoMMAwkCGlikn3K1eKGRmbb4CT0kfpFL4XAGLjgVXvQdnr3D8gZWYhICkbQe9Raxz71IaaDrvjsQpj2F";
const ATLANTIC_MERCHANT_ID = process.env.ATLANTIC_MERCHANT_ID || "pozi3344";
const ATLANTIC_SECRET = process.env.ATLANTIC_SECRET || "v6hBGie2cPN7LXIeZf2PGoMMAwkCGlikn3K1eKGRmbb4CT0kfpFL4XAGLjgVXvQdnr3D8gZWYhICkbQe9Raxz71IaaDrvjsQpj2F";
const ATLANTIC_BASE_URL = "https://gateway.paylabs.co.id/pg/v1";

// Database setup
const db = new sqlite3.Database('./payments.db');

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        telegram_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        days INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        qr_code TEXT,
        qr_url TEXT,
        payment_url TEXT,
        expired_at DATETIME,
        paid_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS callbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        status TEXT,
        raw_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate signature untuk Atlantic API
 */
function generateSignature(data, secret) {
    const sortedData = Object.keys(data)
        .sort()
        .reduce((result, key) => {
            result[key] = data[key];
            return result;
        }, {});
    
    const stringToSign = Object.values(sortedData).join('');
    return crypto
        .createHmac('sha256', secret)
        .update(stringToSign)
        .digest('hex');
}

/**
 * Generate unique order ID
 */
function generateOrderId(userId, days) {
    const timestamp = Date.now();
    return `VIP${days}D_${userId}_${timestamp}`;
}

/**
 * Send message to Telegram user
 */
async function sendTelegramMessage(telegramId, message, replyMarkup = null) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const payload = {
            chat_id: telegramId,
            text: message,
            parse_mode: 'HTML'
        };
        
        if (replyMarkup) {
            payload.reply_markup = replyMarkup;
        }
        
        await axios.post(url, payload);
        return true;
    } catch (error) {
        console.error('Error sending telegram message:', error.message);
        return false;
    }
}

/**
 * Send photo to Telegram user
 */
async function sendTelegramPhoto(telegramId, photoUrl, caption = '') {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
        await axios.post(url, {
            chat_id: telegramId,
            photo: photoUrl,
            caption: caption,
            parse_mode: 'HTML'
        });
        return true;
    } catch (error) {
        console.error('Error sending telegram photo:', error.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Atlantic QRIS Payment Gateway',
        timestamp: new Date().toISOString()
    });
});

/**
 * Create QRIS Payment
 * POST /create-payment
 */
app.post('/create-payment', async (req, res) => {
    try {
        const { user_id, telegram_id, amount, days } = req.body;
        
        // Validasi input
        if (!user_id || !telegram_id || !amount || !days) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        // Generate order ID
        const orderId = generateOrderId(user_id, days);
        const expiryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        
        // Prepare Atlantic API request
        const paymentData = {
            merchantId: ATLANTIC_MERCHANT_ID,
            orderId: orderId,
            amount: amount,
            currency: 'IDR',
            description: `VIP ${days} Hari - Premium Bot Telegram`,
            paymentMethod: 'qris',
            expiryTime: expiryTime.toISOString(),
            callbackUrl: `${process.env.CALLBACK_URL || 'https://your-app.railway.app'}/callback`,
            returnUrl: `${process.env.CALLBACK_URL || 'https://your-app.railway.app'}/return`
        };
        
        // Generate signature
        const signature = generateSignature(paymentData, ATLANTIC_SECRET);
        
        // Call Atlantic API
        const response = await axios.post(
            `${ATLANTIC_BASE_URL}/payment/create`,
            paymentData,
            {
                headers: {
                    'Authorization': `Bearer ${ATLANTIC_API_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Signature': signature
                }
            }
        );
        
        const result = response.data;
        
        // Save to database
        db.run(
            `INSERT INTO payments (order_id, user_id, telegram_id, amount, days, qr_code, qr_url, payment_url, expired_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderId,
                user_id,
                telegram_id,
                amount,
                days,
                result.qrCode || '',
                result.qrCodeUrl || '',
                result.paymentUrl || '',
                expiryTime
            ]
        );
        
        // Send QR code to user via Telegram
        if (result.qrCodeUrl) {
            const message = `💳 <b>Pembayaran VIP ${days} Hari</b>\n\n` +
                          `💰 Total: Rp ${amount.toLocaleString('id-ID')}\n` +
                          `🆔 Order ID: <code>${orderId}</code>\n\n` +
                          `📱 Scan QR Code di bawah untuk membayar:\n` +
                          `⏰ Berlaku hingga: ${expiryTime.toLocaleString('id-ID')}`;
            
            await sendTelegramPhoto(telegram_id, result.qrCodeUrl, message);
            
            // Send confirmation button
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ Saya Sudah Bayar', callback_data: `check_${orderId}` }],
                    [{ text: '❌ Batal', callback_data: `cancel_${orderId}` }]
                ]
            };
            
            await sendTelegramMessage(
                telegram_id,
                '🔔 Setelah transfer, klik tombol "Saya Sudah Bayar" untuk verifikasi.',
                keyboard
            );
        }
        
        // Return response
        res.json({
            success: true,
            data: {
                orderId: orderId,
                amount: amount,
                qrCodeUrl: result.qrCodeUrl,
                paymentUrl: result.paymentUrl,
                expiryTime: expiryTime
            }
        });
        
    } catch (error) {
        console.error('Error creating payment:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check Payment Status
 * GET /check-payment/:orderId
 */
app.get('/check-payment/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Check database first
        db.get('SELECT * FROM payments WHERE order_id = ?', [orderId], async (err, payment) => {
            if (err || !payment) {
                return res.status(404).json({
                    success: false,
                    error: 'Payment not found'
                });
            }
            
            // If already paid, return immediately
            if (payment.status === 'paid') {
                return res.json({
                    success: true,
                    status: 'paid',
                    data: payment
                });
            }
            
            // Check with Atlantic API
            try {
                const response = await axios.get(
                    `${ATLANTIC_BASE_URL}/payment/status/${orderId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${ATLANTIC_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                const status = response.data.status;
                
                // Update database if status changed
                if (status === 'paid' && payment.status !== 'paid') {
                    db.run(
                        'UPDATE payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE order_id = ?',
                        ['paid', orderId]
                    );
                    
                    // Notify user via Telegram
                    const message = `✅ <b>Gelo sultan Anjay!</b> 🎉\n\n` +
                                  `Pembayaran berhasil dikonfirmasi!\n` +
                                  `💎 VIP ${payment.days} hari telah diaktifkan!\n\n` +
                                  `Terima kasih telah berlangganan! 🙏`;
                    
                    await sendTelegramMessage(payment.telegram_id, message);
                    
                    // Call bot API to update VIP status
                    // You can implement this based on your bot's API
                }
                
                res.json({
                    success: true,
                    status: status,
                    data: response.data
                });
                
            } catch (apiError) {
                console.error('Error checking Atlantic API:', apiError.message);
                res.json({
                    success: true,
                    status: payment.status,
                    data: payment
                });
            }
        });
        
    } catch (error) {
        console.error('Error checking payment:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Payment Callback from Atlantic
 * POST /callback
 */
app.post('/callback', async (req, res) => {
    try {
        const callbackData = req.body;
        const { orderId, status, amount, paymentMethod, transactionId } = callbackData;
        
        console.log('Received callback:', callbackData);
        
        // Save callback to database
        db.run(
            'INSERT INTO callbacks (order_id, status, raw_data) VALUES (?, ?, ?)',
            [orderId, status, JSON.stringify(callbackData)]
        );
        
        // Verify signature if provided
        const receivedSignature = req.headers['x-signature'];
        if (receivedSignature) {
            const expectedSignature = generateSignature(callbackData, ATLANTIC_SECRET);
            if (receivedSignature !== expectedSignature) {
                console.error('Invalid signature');
                return res.status(401).json({ success: false, error: 'Invalid signature' });
            }
        }
        
        // Get payment from database
        db.get('SELECT * FROM payments WHERE order_id = ?', [orderId], async (err, payment) => {
            if (err || !payment) {
                console.error('Payment not found:', orderId);
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            
            // Update payment status
            if (status === 'paid' || status === 'success') {
                db.run(
                    'UPDATE payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE order_id = ?',
                    ['paid', orderId]
                );
                
                // Send success notification to user
                const message = `✅ <b>Gelo sultan Anjay!</b> 🎉🎉🎉\n\n` +
                              `Pembayaran Anda telah berhasil dikonfirmasi!\n` +
                              `💎 VIP ${payment.days} hari telah diaktifkan untuk akun Anda!\n\n` +
                              `🆔 Order ID: <code>${orderId}</code>\n` +
                              `💰 Jumlah: Rp ${amount.toLocaleString('id-ID')}\n` +
                              `📅 Berlaku hingga: ${new Date(Date.now() + payment.days * 24 * 60 * 60 * 1000).toLocaleDateString('id-ID')}\n\n` +
                              `Terima kasih telah berlangganan! 🙏\n` +
                              `Sekarang Anda bisa menggunakan semua fitur Premium! 🚀`;
                
                await sendTelegramMessage(payment.telegram_id, message);
                
            } else if (status === 'failed' || status === 'expired') {
                db.run(
                    'UPDATE payments SET status = ? WHERE order_id = ?',
                    [status, orderId]
                );
                
                // Send failed notification
                const message = `❌ Pembayaran ${status === 'expired' ? 'kadaluarsa' : 'gagal'}\n\n` +
                              `🆔 Order ID: <code>${orderId}</code>\n\n` +
                              `Silakan buat pesanan baru dengan /vip`;
                
                await sendTelegramMessage(payment.telegram_id, message);
            }
        });
        
        // Respond to Atlantic
        res.json({ success: true, message: 'Callback processed' });
        
    } catch (error) {
        console.error('Error processing callback:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Return URL handler
 * GET /return
 */
app.get('/return', (req, res) => {
    const { orderId, status } = req.query;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Status</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 400px;
                }
                .icon {
                    font-size: 60px;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #333;
                    margin-bottom: 10px;
                }
                p {
                    color: #666;
                    line-height: 1.6;
                }
                .order-id {
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 5px;
                    margin: 20px 0;
                    font-family: monospace;
                }
                .button {
                    display: inline-block;
                    padding: 12px 30px;
                    background: #667eea;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">${status === 'success' ? '✅' : '⏳'}</div>
                <h1>${status === 'success' ? 'Pembayaran Berhasil!' : 'Menunggu Pembayaran'}</h1>
                <p>${status === 'success' ? 'Terima kasih! Pembayaran Anda telah berhasil diproses.' : 'Silakan selesaikan pembayaran Anda.'}</p>
                <div class="order-id">Order ID: ${orderId}</div>
                <p>Cek bot Telegram Anda untuk konfirmasi.</p>
                <a href="https://t.me/your_bot" class="button">Kembali ke Bot</a>
            </div>
        </body>
        </html>
    `);
});

/**
 * Get payment history
 * GET /payments/:telegramId
 */
app.get('/payments/:telegramId', (req, res) => {
    const { telegramId } = req.params;
    
    db.all(
        'SELECT * FROM payments WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 20',
        [telegramId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, data: rows });
        }
    );
});

/**
 * Cancel payment
 * POST /cancel-payment/:orderId
 */
app.post('/cancel-payment/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        db.get('SELECT * FROM payments WHERE order_id = ?', [orderId], async (err, payment) => {
            if (err || !payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            
            if (payment.status === 'paid') {
                return res.status(400).json({ success: false, error: 'Cannot cancel paid payment' });
            }
            
            db.run(
                'UPDATE payments SET status = ? WHERE order_id = ?',
                ['cancelled', orderId]
            );
            
            await sendTelegramMessage(
                payment.telegram_id,
                `❌ Pembayaran dibatalkan\n\n🆔 Order ID: <code>${orderId}</code>`
            );
            
            res.json({ success: true, message: 'Payment cancelled' });
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║  🚀 Atlantic QRIS Payment Gateway                            ║`);
    console.log(`║  🌐 Server running on port ${PORT}                              ║`);
    console.log(`║  📡 Ready to process payments                                ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    db.close();
    process.exit(0);
});
