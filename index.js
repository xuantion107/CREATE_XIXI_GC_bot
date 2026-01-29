const TelegramBot = require('node-telegram-bot-api');

// ========== KONFIGURASI ==========
// Ganti dengan token bot Anda dari @BotFather
const BOT_TOKEN = '8540529857:AAH_KeHmFSqw8W1yc2n7DIvnjZdfFg3OO-c';

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ========== FUNGSI HELPER ==========

// Cek apakah user adalah admin
async function isAdmin(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Mute user selama durasi tertentu (dalam detik)
async function muteUser(chatId, userId, duration) {
  try {
    const untilDate = Math.floor(Date.now() / 1000) + duration;
    await bot.restrictChatMember(chatId, userId, {
      permissions: {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      },
      until_date: untilDate
    });
    return true;
  } catch (error) {
    console.error('Error muting user:', error);
    return false;
  }
}

// Dapatkan semua member grup untuk mention all
async function getAllMembers(chatId) {
  const members = [];
  try {
    // Catatan: API Telegram tidak menyediakan cara langsung untuk mendapatkan semua member
    // Ini adalah workaround dengan menyimpan user yang pernah mengirim pesan
    // Untuk implementasi penuh, Anda perlu menyimpan member di database
    return members;
  } catch (error) {
    console.error('Error getting members:', error);
    return [];
  }
}

// ========== STORAGE SEDERHANA ==========
// Menyimpan member yang aktif di grup (dalam memory, akan hilang jika bot restart)
const groupMembers = {};

// Fungsi untuk menyimpan member
function saveMember(chatId, userId, username, firstName) {
  if (!groupMembers[chatId]) {
    groupMembers[chatId] = new Map();
  }
  groupMembers[chatId].set(userId, {
    username: username || '',
    firstName: firstName || 'User',
    lastSeen: Date.now()
  });
}

// ========== EVENT HANDLERS ==========

// Handler untuk semua pesan
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const text = msg.text || '';
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || 'User';

  // Simpan member yang aktif
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    saveMember(chatId, userId, username, firstName);
  }

  // Cek apakah user adalah admin
  const userIsAdmin = await isAdmin(chatId, userId);

  // ========== FITUR 1: AUTO MUTE UNTUK LINK/FILE/VIDEO ==========
  const hasLink = /https?:\/\/|www\./i.test(text) || msg.entities?.some(e => e.type === 'url' || e.type === 'text_link');
  const hasFile = msg.document || msg.video || msg.audio || msg.voice || msg.photo;

  if (!userIsAdmin && (hasLink || hasFile)) {
    // Mute user selama 6 jam (21600 detik)
    const muteDuration = 6 * 60 * 60; // 6 jam
    const muteSuccess = await muteUser(chatId, userId, muteDuration);

    if (muteSuccess) {
      // Hapus pesan yang melanggar
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (error) {
        console.error('Error deleting message:', error);
      }

      // Kirim peringatan
      const warningMessage = `⏳ (6 jam)\n⚠️ ${firstName} ASU sudah ku Bilangin jangan Jangan melanggar Aturan.`;
      await bot.sendMessage(chatId, warningMessage);
    }
    return;
  }

  // ========== FITUR 2: AUTO HAPUS COMMAND (/) ==========
  if (!userIsAdmin && text.startsWith('/')) {
    // Mute user
    const muteDuration = 6 * 60 * 60; // 6 jam
    await muteUser(chatId, userId, muteDuration);

    // Hapus pesan command dari user
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Error deleting command message:', error);
    }
    return;
  }

  // ========== FITUR 3: MENTION ALL UNTUK ADMIN ==========
  if (userIsAdmin && text.toLowerCase().includes('xixi')) {
    try {
      // Hapus pesan admin yang trigger
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Error deleting admin message:', error);
    }

    // Buat mention untuk semua member yang tersimpan
    const members = groupMembers[chatId] || new Map();
    let mentions = [];
    
    for (const [memberId, memberData] of members.entries()) {
      if (memberData.username) {
        mentions.push(`@${memberData.username}`);
      } else {
        // Untuk user tanpa username, gunakan mention dengan ID
        mentions.push(`[${memberData.firstName}](tg://user?id=${memberId})`);
      }
    }

    if (mentions.length > 0) {
      // Kirim dalam chunk jika terlalu banyak (max 50 mention per pesan)
      const chunkSize = 50;
      for (let i = 0; i < mentions.length; i += chunkSize) {
        const chunk = mentions.slice(i, i + chunkSize);
        const mentionText = chunk.join(' ');
        
        await bot.sendMessage(chatId, mentionText, {
          parse_mode: 'Markdown'
        });
      }
    } else {
      await bot.sendMessage(chatId, '📢 Mention all - Tidak ada member yang tersimpan. Tunggu member mengirim pesan terlebih dahulu.');
    }
    return;
  }
});

// Handler untuk member baru bergabung
bot.on('new_chat_members', async (msg) => {
  const chatId = msg.chat.id;
  msg.new_chat_members.forEach(member => {
    saveMember(chatId, member.id, member.username, member.first_name);
  });
});

// ========== START BOT ==========
console.log('🤖 Bot Moderator Telegram berhasil dijalankan!');
console.log('📝 Fitur yang aktif:');
console.log('   1. Auto mute 6 jam untuk link/file/video (non-admin)');
console.log('   2. Auto mute dan hapus pesan untuk command / (non-admin)');
console.log('   3. Mention all ketika admin kirim "xixi"');
console.log('');
console.log('⚠️  PENTING: Pastikan bot sudah menjadi admin di grup!');
console.log('   Permissions yang diperlukan:');
console.log('   - Delete messages');
console.log('   - Restrict members');
console.log('');

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});
