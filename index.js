require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// Konfigurasi
const BOT_TOKEN = process.env.BOT_TOKEN || '8538468032:AAH_a-ZUrV7hH80h29i_rCXIeILAvzQdFYI';
const HERO_SMS_API_KEY = process.env.HERO_SMS_API_KEY || 'YOUR_HERO_SMS_API_KEY';
const ATLANTIC_API_KEY = process.env.ATLANTIC_API_KEY || 'YOUR_ATLANTIC_API_KEY';
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8496726839; // Ganti dengan ID Telegram admin
const USD_TO_IDR = 16000; // Rate konversi USD ke IDR
const COUNTRIES_PER_PAGE = 8; // Jumlah negara per halaman

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Database sederhana (gunakan database nyata untuk production)
const users = new Map(); // userId -> { name, balance, registeredAt }
const orders = new Map(); // orderId -> { userId, service, country, number, price, status, createdAt, expiresAt }
const payments = new Map(); // paymentId -> { userId, amount, status, qrisUrl, createdAt }
const transactions = {
  income: [],
  expense: []
};

// Layanan yang tersedia
const SERVICES = {
  'WHATSAPP': 'wa',
  'TIKTOK': 'tiktok',
  'TELEGRAM': 'telegram',
  'INSTAGRAM': 'instagram',
  'SHOPEE': 'shopee',
  'DANA': 'dana'
};

// Fungsi helper untuk format Rupiah
function formatRupiah(amount) {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

// Fungsi helper untuk cek user sudah terdaftar
function isUserRegistered(userId) {
  return users.has(userId);
}

// Fungsi helper untuk mendapatkan user
function getUser(userId) {
  return users.get(userId);
}

// Keyboard utama
function getMainKeyboard(isRegistered) {
  if (!isRegistered) {
    return {
      reply_markup: {
        keyboard: [
          [{ text: '➕ Login' }]
        ],
        resize_keyboard: true
      }
    };
  }
  
  return {
    reply_markup: {
      keyboard: [
        [{ text: '🛒 Order Numbers' }, { text: '💰 Deposit' }],
        [{ text: '🆔 Account' }]
      ],
      resize_keyboard: true
    }
  };
}

// Keyboard admin
function getAdminKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '🛒 Order Numbers' }, { text: '💰 Deposit' }],
        [{ text: '🆔 Account' }, { text: '👑 Admin Panel' }]
      ],
      resize_keyboard: true
    }
  };
}

// Keyboard layanan
function getServiceKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'WhatsApp', callback_data: 'service_WHATSAPP' }, { text: 'TikTok', callback_data: 'service_TIKTOK' }],
        [{ text: 'Telegram', callback_data: 'service_TELEGRAM' }, { text: 'Instagram', callback_data: 'service_INSTAGRAM' }],
        [{ text: 'Shopee', callback_data: 'service_SHOPEE' }, { text: 'Dana', callback_data: 'service_DANA' }],
        [{ text: '🔙 Kembali', callback_data: 'back_main' }]
      ]
    }
  };
}

// Keyboard admin panel
function getAdminPanelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📁 Daftar User', callback_data: 'admin_users' }],
        [{ text: '➕ Total Pemasukan', callback_data: 'admin_income' }],
        [{ text: '➖ Total Pengeluaran', callback_data: 'admin_expense' }],
        [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }],
        [{ text: '🔙 Kembali', callback_data: 'back_main' }]
      ]
    }
  };
}

// Hero-SMS API Functions
async function getHeroSMSCountries(service) {
  try {
    const response = await axios.get('https://hero-sms.com/stubs/handler_api.php', {
      params: {
        api_key: HERO_SMS_API_KEY,
        action: 'getPrices',
        service: SERVICES[service] || 'wa'
      }
    });
    
    if (response.data && typeof response.data === 'object') {
      // Filter negara dengan harga yang tersedia
      const countries = [];
      
      for (const [countryCode, priceData] of Object.entries(response.data)) {
        if (priceData && priceData[SERVICES[service]]) {
          const priceUSD = parseFloat(priceData[SERVICES[service]].cost);
          const count = priceData[SERVICES[service]].count || 0;
          
          // Skip jika tidak ada nomor tersedia
          if (count === 0) continue;
          
          let priceIDR;
          
          // Special pricing untuk WhatsApp Indonesia (kode negara 6)
          if (service === 'WHATSAPP' && countryCode === '6') {
            // Harga random antara 5000-7000
            priceIDR = Math.floor(Math.random() * (7000 - 5000 + 1)) + 5000;
          } else {
            // Harga normal dengan margin
            priceIDR = Math.ceil((priceUSD * USD_TO_IDR) + 2000);
          }
          
          countries.push({
            code: countryCode,
            name: getCountryName(countryCode),
            price: priceIDR,
            priceUSD: priceUSD,
            count: count
          });
        }
      }
      
      // Sort: Indonesia first for WhatsApp/Dana, then by availability
      countries.sort((a, b) => {
        if (service === 'WHATSAPP' || service === 'DANA') {
          if (a.code === '6') return -1;
          if (b.code === '6') return 1;
        }
        return b.count - a.count;
      });
      
      return countries;
    }
    return [];
  } catch (error) {
    console.error('Error getting Hero-SMS countries:', error.message);
    return [];
  }
}

async function orderNumber(service, country) {
  try {
    const response = await axios.get('https://hero-sms.com/stubs/handler_api.php', {
      params: {
        api_key: HERO_SMS_API_KEY,
        action: 'getNumber',
        service: SERVICES[service],
        country: country
      }
    });
    
    if (response.data && response.data.ACCESS_NUMBER) {
      return {
        success: true,
        orderId: response.data.ACCESS_ACTIVATION,
        number: response.data.ACCESS_NUMBER
      };
    }
    return { success: false, error: 'Nomor tidak tersedia' };
  } catch (error) {
    console.error('Error ordering number:', error.message);
    return { success: false, error: error.message };
  }
}

async function getOTP(orderId) {
  try {
    const response = await axios.get('https://hero-sms.com/stubs/handler_api.php', {
      params: {
        api_key: HERO_SMS_API_KEY,
        action: 'getStatus',
        id: orderId
      }
    });
    
    if (response.data && response.data.STATUS === 'OK') {
      return {
        success: true,
        otp: response.data.SMS_CODE || response.data.SMS_TEXT
      };
    }
    return { success: false };
  } catch (error) {
    console.error('Error getting OTP:', error.message);
    return { success: false };
  }
}

async function cancelOrder(orderId) {
  try {
    await axios.get('https://hero-sms.com/stubs/handler_api.php', {
      params: {
        api_key: HERO_SMS_API_KEY,
        action: 'setStatus',
        id: orderId,
        status: 8 // Cancel
      }
    });
    return true;
  } catch (error) {
    console.error('Error canceling order:', error.message);
    return false;
  }
}

// Atlantic-Pedia Payment API Functions
async function createQRISPayment(amount, userId) {
  try {
    const paymentId = `PAY_${userId}_${Date.now()}`;
    
    // Sesuaikan dengan API Atlantic-Pedia yang sebenarnya
    const response = await axios.post('https://m.atlantic-pedia.co.id/api/payment/qris', {
      api_key: ATLANTIC_API_KEY,
      amount: amount,
      order_id: paymentId,
      customer_name: `User_${userId}`
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.success) {
      return {
        success: true,
        paymentId: paymentId,
        qrisUrl: response.data.qris_url || response.data.qr_string,
        transactionId: response.data.transaction_id
      };
    }
    
    // Fallback jika API tidak tersedia (untuk testing)
    return {
      success: true,
      paymentId: paymentId,
      qrisUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=QRIS_${paymentId}_${amount}`,
      transactionId: paymentId
    };
  } catch (error) {
    console.error('Error creating QRIS payment:', error.message);
    // Fallback untuk testing
    const paymentId = `PAY_${userId}_${Date.now()}`;
    return {
      success: true,
      paymentId: paymentId,
      qrisUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=QRIS_${paymentId}_${amount}`,
      transactionId: paymentId
    };
  }
}

async function checkPaymentStatus(transactionId) {
  try {
    // Sesuaikan dengan API Atlantic-Pedia yang sebenarnya
    const response = await axios.get('https://m.atlantic-pedia.co.id/api/payment/status', {
      params: {
        api_key: ATLANTIC_API_KEY,
        transaction_id: transactionId
      }
    });
    
    if (response.data && response.data.status === 'paid') {
      return { success: true, paid: true };
    }
    return { success: true, paid: false };
  } catch (error) {
    console.error('Error checking payment status:', error.message);
    return { success: false, paid: false };
  }
}

// Helper function untuk nama negara (diperluas)
function getCountryName(code) {
  const countries = {
    '0': '🇷🇺 Russia',
    '1': '🇺🇦 Ukraine',
    '2': '🇰🇿 Kazakhstan',
    '3': '🇨🇳 China',
    '6': '🇮🇩 Indonesia',
    '7': '🇺🇸 USA',
    '10': '🇵🇱 Poland',
    '12': '🇬🇧 United Kingdom',
    '16': '🇪🇬 Egypt',
    '22': '🇳🇬 Nigeria',
    '30': '🇸🇪 Sweden',
    '32': '🇲🇽 Mexico',
    '33': '🇫🇷 France',
    '34': '🇪🇸 Spain',
    '36': '🇭🇺 Hungary',
    '37': '🇩🇪 Germany',
    '38': '🇮🇹 Italy',
    '39': '🇷🇴 Romania',
    '40': '🇳🇱 Netherlands',
    '43': '🇦🇹 Austria',
    '44': '🇬🇧 UK',
    '45': '🇩🇰 Denmark',
    '46': '🇸🇪 Sweden',
    '47': '🇳🇴 Norway',
    '48': '🇵🇱 Poland',
    '49': '🇩🇪 Germany',
    '51': '🇵🇪 Peru',
    '52': '🇲🇽 Mexico',
    '53': '🇨🇺 Cuba',
    '54': '🇦🇷 Argentina',
    '55': '🇧🇷 Brazil',
    '56': '🇨🇱 Chile',
    '57': '🇨🇴 Colombia',
    '58': '🇻🇪 Venezuela',
    '60': '🇲🇾 Malaysia',
    '61': '🇦🇺 Australia',
    '62': '🇮🇩 Indonesia',
    '63': '🇵🇭 Philippines',
    '64': '🇳🇿 New Zealand',
    '65': '🇸🇬 Singapore',
    '66': '🇹🇭 Thailand',
    '77': '🇰🇿 Kazakhstan',
    '81': '🇯🇵 Japan',
    '82': '🇰🇷 South Korea',
    '84': '🇻🇳 Vietnam',
    '86': '🇨🇳 China',
    '90': '🇹🇷 Turkey',
    '91': '🇮🇳 India',
    '92': '🇵🇰 Pakistan',
    '93': '🇦🇫 Afghanistan',
    '94': '🇱🇰 Sri Lanka',
    '95': '🇲🇲 Myanmar',
    '98': '🇮🇷 Iran',
    '212': '🇲🇦 Morocco',
    '213': '🇩🇿 Algeria',
    '216': '🇹🇳 Tunisia',
    '218': '🇱🇾 Libya',
    '220': '🇬🇲 Gambia',
    '221': '🇸🇳 Senegal',
    '234': '🇳🇬 Nigeria',
    '254': '🇰🇪 Kenya',
    '255': '🇹🇿 Tanzania',
    '256': '🇺🇬 Uganda',
    '351': '🇵🇹 Portugal',
    '352': '🇱🇺 Luxembourg',
    '353': '🇮🇪 Ireland',
    '354': '🇮🇸 Iceland',
    '355': '🇦🇱 Albania',
    '356': '🇲🇹 Malta',
    '357': '🇨🇾 Cyprus',
    '358': '🇫🇮 Finland',
    '359': '🇧🇬 Bulgaria',
    '370': '🇱🇹 Lithuania',
    '371': '🇱🇻 Latvia',
    '372': '🇪🇪 Estonia',
    '373': '🇲🇩 Moldova',
    '374': '🇦🇲 Armenia',
    '375': '🇧🇾 Belarus',
    '380': '🇺🇦 Ukraine',
    '381': '🇷🇸 Serbia',
    '382': '🇲🇪 Montenegro',
    '383': '🇽🇰 Kosovo',
    '385': '🇭🇷 Croatia',
    '386': '🇸🇮 Slovenia',
    '387': '🇧🇦 Bosnia',
    '389': '🇲🇰 North Macedonia',
    '420': '🇨🇿 Czech Republic',
    '421': '🇸🇰 Slovakia',
    '886': '🇹🇼 Taiwan',
    '972': '🇮🇱 Israel',
    '994': '🇦🇿 Azerbaijan',
    '995': '🇬🇪 Georgia'
  };
  return countries[code] || `🌍 Country ${code}`;
}

// Fungsi untuk membuat keyboard pagination negara
function getCountriesKeyboard(countries, service, page = 0) {
  // Untuk Dana, hanya tampilkan Indonesia
  if (service === 'DANA') {
    const indonesiaCountries = countries.filter(c => c.code === '6');
    if (indonesiaCountries.length === 0) {
      return {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Dana hanya tersedia untuk Indonesia', callback_data: 'noop' }],
            [{ text: '🔙 Kembali', callback_data: 'back_services' }]
          ]
        }
      };
    }
    
    const buttons = indonesiaCountries.map(country => [{
      text: `${country.name} - ${formatRupiah(country.price)}`,
      callback_data: `order_${service}_${country.code}_${country.price}`
    }]);
    
    buttons.push([{ text: '🔙 Kembali', callback_data: 'back_services' }]);
    
    return {
      reply_markup: {
        inline_keyboard: buttons
      }
    };
  }
  
  const totalPages = Math.ceil(countries.length / COUNTRIES_PER_PAGE);
  const startIndex = page * COUNTRIES_PER_PAGE;
  const endIndex = Math.min(startIndex + COUNTRIES_PER_PAGE, countries.length);
  const pageCountries = countries.slice(startIndex, endIndex);
  
  const buttons = pageCountries.map(country => [{
    text: `${country.name} - ${formatRupiah(country.price)}`,
    callback_data: `order_${service}_${country.code}_${country.price}`
  }]);
  
  // Tombol navigasi
  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: '🔙 Back', callback_data: `countries_${service}_${page - 1}` });
  }
  
  // Tampilkan info halaman
  navButtons.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  
  if (page < totalPages - 1) {
    navButtons.push({ text: 'Next 🔜', callback_data: `countries_${service}_${page + 1}` });
  }
  
  buttons.push(navButtons);
  buttons.push([{ text: '🔙 Kembali ke Menu', callback_data: 'back_services' }]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isRegistered = isUserRegistered(userId);
  const isAdmin = userId === ADMIN_ID;
  
  let welcomeText = `Selamat datang di Bot Penjualan Nomor Virtual! 🎉\n\n`;
  
  if (!isRegistered) {
    welcomeText += `Silakan klik tombol *➕ Login* untuk mendaftar dan mulai menggunakan layanan kami.`;
    bot.sendMessage(chatId, welcomeText, { ...getMainKeyboard(false), parse_mode: 'Markdown' });
  } else {
    const user = getUser(userId);
    welcomeText += `Selamat datang kembali, *${user.name}*! 👋\n\n`;
    welcomeText += `Saldo Anda: *${formatRupiah(user.balance)}*\n\n`;
    welcomeText += `Pilih menu di bawah untuk melanjutkan:`;
    
    const keyboard = isAdmin ? getAdminKeyboard() : getMainKeyboard(true);
    bot.sendMessage(chatId, welcomeText, { ...keyboard, parse_mode: 'Markdown' });
  }
});

// Handler untuk tombol Login
bot.onText(/➕ Login/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (isUserRegistered(userId)) {
    bot.sendMessage(chatId, '✅ Anda sudah terdaftar!', getMainKeyboard(true));
    return;
  }
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Daftar Cepat', callback_data: 'register_quick' }],
        [{ text: '🔙 Kembali', callback_data: 'back_main' }]
      ]
    }
  };
  
  bot.sendMessage(chatId, '📝 *Pendaftaran Akun*\n\nKlik tombol di bawah untuk mendaftar:', { ...keyboard, parse_mode: 'Markdown' });
});

// Handler untuk Order Numbers
bot.onText(/🛒 Order Numbers/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isUserRegistered(userId)) {
    bot.sendMessage(chatId, '❌ Silakan login terlebih dahulu dengan menekan tombol *➕ Login*', { parse_mode: 'Markdown' });
    return;
  }
  
  bot.sendMessage(chatId, '🛒 *Pilih Layanan*\n\nSilakan pilih layanan yang Anda inginkan:', { ...getServiceKeyboard(), parse_mode: 'Markdown' });
});

// Handler untuk Deposit
bot.onText(/💰 Deposit/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isUserRegistered(userId)) {
    bot.sendMessage(chatId, '❌ Silakan login terlebih dahulu dengan menekan tombol *➕ Login*', { parse_mode: 'Markdown' });
    return;
  }
  
  const message = `🚧 *Fitur Dalam Pengembangan*\n\n` +
    `Mohon maaf, fitur deposit sedang dalam tahap pengembangan.\n\n` +
    `⏰ Silakan tunggu *1 hari* lagi, fitur ini akan segera siap!\n\n` +
    `Terima kasih atas kesabaran Anda. 🙏`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Handler untuk Account
bot.onText(/🆔 Account/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isUserRegistered(userId)) {
    bot.sendMessage(chatId, '❌ Silakan login terlebih dahulu dengan menekan tombol *➕ Login*', { parse_mode: 'Markdown' });
    return;
  }
  
  const user = getUser(userId);
  const accountInfo = `🆔 *Informasi Akun*\n\n` +
    `👤 *Nama:* ${user.name}\n` +
    `💰 *Saldo:* ${formatRupiah(user.balance)}\n` +
    `📅 *Terdaftar:* ${new Date(user.registeredAt).toLocaleDateString('id-ID')}`;
  
  bot.sendMessage(chatId, accountInfo, { parse_mode: 'Markdown' });
});

// Handler untuk Admin Panel
bot.onText(/👑 Admin Panel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== ADMIN_ID) {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses ke Admin Panel');
    return;
  }
  
  bot.sendMessage(chatId, '👑 *Admin Panel*\n\nPilih menu admin:', { ...getAdminPanelKeyboard(), parse_mode: 'Markdown' });
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  // Ignore noop
  if (data === 'noop') {
    bot.answerCallbackQuery(callbackQuery.id);
    return;
  }
  
  // Register quick
  if (data === 'register_quick') {
    const username = callbackQuery.from.username || callbackQuery.from.first_name || 'User';
    const name = callbackQuery.from.first_name || username;
    
    users.set(userId, {
      name: name,
      balance: 0,
      registeredAt: Date.now()
    });
    
    bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Registrasi berhasil!' });
    
    const isAdmin = userId === ADMIN_ID;
    const keyboard = isAdmin ? getAdminKeyboard() : getMainKeyboard(true);
    
    bot.editMessageText(
      `✅ *Registrasi Berhasil!*\n\nSelamat datang, *${name}*!\n\nAnda sekarang dapat menggunakan semua fitur bot.`,
      {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    return;
  }
  
  // Back to main
  if (data === 'back_main') {
    bot.answerCallbackQuery(callbackQuery.id);
    const isRegistered = isUserRegistered(userId);
    const isAdmin = userId === ADMIN_ID;
    
    let keyboard = getMainKeyboard(isRegistered);
    if (isAdmin && isRegistered) {
      keyboard = getAdminKeyboard();
    }
    
    bot.editMessageText('🏠 Menu Utama', {
      chat_id: chatId,
      message_id: msg.message_id,
      ...keyboard
    });
    return;
  }
  
  // Service selection
  if (data.startsWith('service_')) {
    const service = data.replace('service_', '');
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Memuat negara...' });
    
    bot.editMessageText('⏳ Sedang memuat daftar negara, mohon tunggu...', {
      chat_id: chatId,
      message_id: msg.message_id
    });
    
    const countries = await getHeroSMSCountries(service);
    
    if (countries.length === 0) {
      bot.editMessageText('❌ Tidak ada negara yang tersedia untuk layanan ini saat ini. Silakan coba lagi nanti.', {
        chat_id: chatId,
        message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_services' }]]
        }
      });
      return;
    }
    
    const keyboard = getCountriesKeyboard(countries, service, 0);
    
    let serviceInfo = '';
    if (service === 'DANA') {
      serviceInfo = '\n\n⚠️ *Dana hanya tersedia untuk Indonesia*';
    } else if (service === 'WHATSAPP') {
      serviceInfo = '\n\n💎 *Harga spesial untuk Indonesia: Rp 5.000 - 7.000*';
    }
    
    bot.editMessageText(`🌍 *Pilih Negara untuk ${service}*${serviceInfo}\n\nPilih negara yang Anda inginkan:`, {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'Markdown',
      ...keyboard
    });
    return;
  }
  
  // Countries pagination
  if (data.startsWith('countries_')) {
    const parts = data.split('_');
    const service = parts[1];
    const page = parseInt(parts[2]);
    
    bot.answerCallbackQuery(callbackQuery.id);
    
    const countries = await getHeroSMSCountries(service);
    const keyboard = getCountriesKeyboard(countries, service, page);
    
    let serviceInfo = '';
    if (service === 'WHATSAPP') {
      serviceInfo = '\n\n💎 *Harga spesial untuk Indonesia: Rp 5.000 - 7.000*';
    }
    
    bot.editMessageText(`🌍 *Pilih Negara untuk ${service}*${serviceInfo}\n\nPilih negara yang Anda inginkan:`, {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'Markdown',
      ...keyboard
    });
    return;
  }
  
  // Back to services
  if (data === 'back_services') {
    bot.answerCallbackQuery(callbackQuery.id);
    bot.editMessageText('🛒 *Pilih Layanan*\n\nSilakan pilih layanan yang Anda inginkan:', {
      chat_id: chatId,
      message_id: msg.message_id,
      ...getServiceKeyboard(),
      parse_mode: 'Markdown'
    });
    return;
  }
  
  // Order number
  if (data.startsWith('order_')) {
    const parts = data.split('_');
    const service = parts[1];
    const country = parts[2];
    const price = parseInt(parts[3]);
    
    const user = getUser(userId);
    
    if (user.balance < price) {
      bot.answerCallbackQuery(callbackQuery.id, { 
        text: '❌ Saldo tidak cukup! Silakan deposit terlebih dahulu.', 
        show_alert: true 
      });
      return;
    }
    
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Memproses pesanan...' });
    bot.editMessageText('⏳ Sedang memproses pesanan Anda, mohon tunggu...', {
      chat_id: chatId,
      message_id: msg.message_id
    });
    
    const orderResult = await orderNumber(service, country);
    
    if (!orderResult.success) {
      bot.editMessageText(`❌ *Pesanan Gagal*\n\n${orderResult.error}\n\nSilakan coba lagi.`, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_services' }]]
        }
      });
      return;
    }
    
    // Kurangi saldo
    user.balance -= price;
    transactions.expense.push({
      userId: userId,
      amount: price,
      type: 'order',
      timestamp: Date.now()
    });
    
    // Simpan order
    const orderId = orderResult.orderId;
    orders.set(orderId, {
      userId: userId,
      service: service,
      country: country,
      number: orderResult.number,
      price: price,
      status: 'waiting',
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 menit
    });
    
    const orderMessage = `✅ *Pesanan Berhasil!*\n\n` +
      `📱 *Layanan:* ${service}\n` +
      `🌍 *Negara:* ${getCountryName(country)}\n` +
      `📞 *Nomor:* \`${orderResult.number}\`\n` +
      `💰 *Harga:* ${formatRupiah(price)}\n` +
      `💵 *Saldo Tersisa:* ${formatRupiah(user.balance)}\n\n` +
      `⏳ Menunggu kode OTP...\n` +
      `Kode OTP akan dikirim dalam beberapa saat.`;
    
    bot.editMessageText(orderMessage, {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Cek OTP secara berkala
    let otpCheckCount = 0;
    const otpCheckInterval = setInterval(async () => {
      otpCheckCount++;
      
      if (otpCheckCount > 60) { // 5 menit (60 x 5 detik)
        clearInterval(otpCheckInterval);
        
        const order = orders.get(orderId);
        if (order && order.status === 'waiting') {
          // Cancel order dan kembalikan saldo
          await cancelOrder(orderId);
          user.balance += price;
          order.status = 'cancelled';
          
          bot.sendMessage(chatId, `⏱️ *Pesanan Dibatalkan*\n\nKode OTP tidak diterima dalam 5 menit.\nSaldo Anda telah dikembalikan: ${formatRupiah(price)}\n\n💵 *Saldo Sekarang:* ${formatRupiah(user.balance)}`, {
            parse_mode: 'Markdown'
          });
        }
        return;
      }
      
      const otpResult = await getOTP(orderId);
      
      if (otpResult.success && otpResult.otp) {
        clearInterval(otpCheckInterval);
        
        const order = orders.get(orderId);
        order.status = 'completed';
        
        const otpMessage = `🎉 *Kode OTP Diterima!*\n\n` +
          `📱 *Layanan:* ${service}\n` +
          `📞 *Nomor:* \`${orderResult.number}\`\n` +
          `🔐 *Kode OTP:* \`${otpResult.otp}\`\n\n` +
          `✅ TERIMA KASIH TELAH MENGGUNAKAN JASA KAMI`;
        
        bot.sendMessage(chatId, otpMessage, { parse_mode: 'Markdown' });
      }
    }, 5000); // Cek setiap 5 detik
    
    return;
  }
  
  // Deposit
  if (data.startsWith('deposit_')) {
    let amount = 0;
    
    if (data === 'deposit_custom') {
      bot.answerCallbackQuery(callbackQuery.id);
      bot.sendMessage(chatId, '💵 *Deposit Custom*\n\nSilakan kirim jumlah deposit yang Anda inginkan (minimal Rp 10.000):\n\nContoh: 25000', {
        parse_mode: 'Markdown',
        reply_markup: { force_reply: true }
      });
      
      // Set state untuk menunggu input custom amount
      bot.once('message', async (amountMsg) => {
        if (amountMsg.chat.id === chatId) {
          amount = parseInt(amountMsg.text);
          
          if (isNaN(amount) || amount < 10000) {
            bot.sendMessage(chatId, '❌ Jumlah deposit tidak valid. Minimal Rp 10.000');
            return;
          }
          
          await processDeposit(chatId, userId, amount);
        }
      });
      return;
    } else {
      amount = parseInt(data.replace('deposit_', ''));
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Membuat QRIS...' });
    }
    
    await processDeposit(chatId, userId, amount, msg.message_id);
    return;
  }
  
  // Check payment
  if (data.startsWith('check_payment_')) {
    const paymentId = data.replace('check_payment_', '');
    const payment = payments.get(paymentId);
    
    if (!payment) {
      bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Pembayaran tidak ditemukan', show_alert: true });
      return;
    }
    
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Mengecek status pembayaran...' });
    
    const statusResult = await checkPaymentStatus(payment.transactionId);
    
    if (statusResult.paid) {
      payment.status = 'paid';
      
      const user = getUser(userId);
      user.balance += payment.amount;
      
      transactions.income.push({
        userId: userId,
        amount: payment.amount,
        type: 'deposit',
        timestamp: Date.now()
      });
      
      bot.editMessageText(`✅ *Pembayaran Berhasil!*\n\nSaldo Anda telah ditambahkan: ${formatRupiah(payment.amount)}\n\n💵 *Saldo Sekarang:* ${formatRupiah(user.balance)}`, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown'
      });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Pembayaran belum diterima', show_alert: true });
    }
    return;
  }
  
  // Admin features
  if (data.startsWith('admin_')) {
    if (userId !== ADMIN_ID) {
      bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Akses ditolak', show_alert: true });
      return;
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === 'admin_users') {
      let userList = '📁 *Daftar User*\n\n';
      let count = 0;
      
      for (const [uid, user] of users.entries()) {
        count++;
        userList += `${count}. *${user.name}*\n`;
        userList += `   ID: \`${uid}\`\n`;
        userList += `   Saldo: ${formatRupiah(user.balance)}\n\n`;
      }
      
      if (count === 0) {
        userList += 'Belum ada user terdaftar.';
      }
      
      bot.editMessageText(userList, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_admin' }]]
        }
      });
    } else if (data === 'admin_income') {
      const totalIncome = transactions.income.reduce((sum, t) => sum + t.amount, 0);
      
      let incomeText = `➕ *Total Pemasukan*\n\n`;
      incomeText += `💰 Total: ${formatRupiah(totalIncome)}\n`;
      incomeText += `📊 Jumlah Transaksi: ${transactions.income.length}\n\n`;
      
      if (transactions.income.length > 0) {
        incomeText += `*10 Transaksi Terakhir:*\n\n`;
        const recent = transactions.income.slice(-10).reverse();
        recent.forEach((t, i) => {
          const user = getUser(t.userId);
          incomeText += `${i + 1}. ${formatRupiah(t.amount)} - ${user ? user.name : 'Unknown'}\n`;
        });
      }
      
      bot.editMessageText(incomeText, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_admin' }]]
        }
      });
    } else if (data === 'admin_expense') {
      const totalExpense = transactions.expense.reduce((sum, t) => sum + t.amount, 0);
      
      let expenseText = `➖ *Total Pengeluaran*\n\n`;
      expenseText += `💸 Total: ${formatRupiah(totalExpense)}\n`;
      expenseText += `📊 Jumlah Transaksi: ${transactions.expense.length}\n\n`;
      
      if (transactions.expense.length > 0) {
        expenseText += `*10 Transaksi Terakhir:*\n\n`;
        const recent = transactions.expense.slice(-10).reverse();
        recent.forEach((t, i) => {
          const user = getUser(t.userId);
          expenseText += `${i + 1}. ${formatRupiah(t.amount)} - ${user ? user.name : 'Unknown'}\n`;
        });
      }
      
      bot.editMessageText(expenseText, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_admin' }]]
        }
      });
    } else if (data === 'admin_broadcast') {
      bot.editMessageText('📢 *Broadcast Message*\n\nSilakan kirim pesan yang ingin Anda broadcast ke semua user:', {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_admin' }]]
        }
      });
      
      bot.once('message', async (broadcastMsg) => {
        if (broadcastMsg.chat.id === chatId && broadcastMsg.from.id === ADMIN_ID) {
          const messageText = broadcastMsg.text;
          let successCount = 0;
          let failCount = 0;
          
          for (const [uid] of users.entries()) {
            try {
              await bot.sendMessage(uid, `📢 *Pengumuman*\n\n${messageText}`, { parse_mode: 'Markdown' });
              successCount++;
            } catch (error) {
              failCount++;
            }
          }
          
          bot.sendMessage(chatId, `✅ Broadcast selesai!\n\n✅ Berhasil: ${successCount}\n❌ Gagal: ${failCount}`);
        }
      });
    }
    return;
  }
  
  if (data === 'back_admin') {
    bot.answerCallbackQuery(callbackQuery.id);
    bot.editMessageText('👑 *Admin Panel*\n\nPilih menu admin:', {
      chat_id: chatId,
      message_id: msg.message_id,
      ...getAdminPanelKeyboard(),
      parse_mode: 'Markdown'
    });
    return;
  }
});

// Helper function untuk proses deposit
async function processDeposit(chatId, userId, amount, messageId = null) {
  const paymentResult = await createQRISPayment(amount, userId);
  
  if (!paymentResult.success) {
    const errorText = '❌ Gagal membuat pembayaran. Silakan coba lagi.';
    if (messageId) {
      bot.editMessageText(errorText, { chat_id: chatId, message_id: messageId });
    } else {
      bot.sendMessage(chatId, errorText);
    }
    return;
  }
  
  payments.set(paymentResult.paymentId, {
    userId: userId,
    amount: amount,
    status: 'pending',
    qrisUrl: paymentResult.qrisUrl,
    transactionId: paymentResult.transactionId,
    createdAt: Date.now()
  });
  
  const depositMessage = `💰 *Deposit ${formatRupiah(amount)}*\n\n` +
    `Scan QRIS di bawah untuk melakukan pembayaran:\n\n` +
    `🆔 ID Transaksi: \`${paymentResult.transactionId}\`\n\n` +
    `Setelah transfer, klik tombol "Cek Pembayaran" untuk verifikasi.`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Cek Pembayaran', callback_data: `check_payment_${paymentResult.paymentId}` }],
        [{ text: '🔙 Kembali', callback_data: 'back_main' }]
      ]
    }
  };
  
  if (messageId) {
    await bot.editMessageText(depositMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });
  } else {
    await bot.sendMessage(chatId, depositMessage, { parse_mode: 'Markdown' });
  }
  
  // Kirim gambar QRIS
  await bot.sendPhoto(chatId, paymentResult.qrisUrl, {
    caption: `Scan QRIS ini untuk pembayaran ${formatRupiah(amount)}`,
    ...keyboard
  });
}

// Cron job untuk cleanup expired orders (setiap 1 menit)
cron.schedule('*/1 * * * *', () => {
  const now = Date.now();
  
  for (const [orderId, order] of orders.entries()) {
    if (order.status === 'waiting' && order.expiresAt < now) {
      // Kembalikan saldo
      const user = getUser(order.userId);
      if (user) {
        user.balance += order.price;
      }
      
      // Update status
      order.status = 'expired';
      
      // Kirim notifikasi
      bot.sendMessage(order.userId, `⏱️ *Pesanan Expired*\n\nPesanan nomor ${order.number} telah expired.\nSaldo dikembalikan: ${formatRupiah(order.price)}`, {
        parse_mode: 'Markdown'
      });
      
      // Cancel di Hero-SMS
      cancelOrder(orderId);
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('✅ Bot started successfully!');
console.log('📝 Bot Token:', BOT_TOKEN.substring(0, 10) + '...');
console.log('👑 Admin ID:', ADMIN_ID);
