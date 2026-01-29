const TelegramBot = require('node-telegram-bot-api');

// ========== KONFIGURASI ==========
// Ganti dengan token bot Anda dari @BotFather
const BOT_TOKEN = '8540529857:AAH_KeHmFSqw8W1yc2n7DIvnjZdfFg3OO-c';

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ========== STORAGE DATA ==========
// Menyimpan member yang aktif di grup
const groupMembers = {};

// Menyimpan welcome message per grup
const welcomeSettings = {};
// Format: { chatId: { type: 'text' | 'photo', text: 'welcome text', photoId: 'file_id' } }

// Menyimpan state user untuk setup welcome
const userStates = {};
// Format: { userId: { state: 'waiting_welcome_type' | 'waiting_text' | 'waiting_photo', chatId: chatId } }

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

// Karakter invisible untuk mention (Zero-Width Space)
const INVISIBLE_CHAR = '\u200B';

// ========== COMMAND HANDLERS ==========

// Handler untuk /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Jika di private chat
  if (msg.chat.type === 'private') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '⚙️ Set Welcome Message', callback_data: 'set_welcome' }]
      ]
    };

    await bot.sendMessage(chatId, 'Halo Cok.', {
      reply_markup: keyboard
    });
  } else {
    // Jika di grup, cek apakah admin
    const userIsAdmin = await isAdmin(chatId, userId);
    if (userIsAdmin) {
      await bot.sendMessage(chatId, 'Halo Cok.', {
        reply_to_message_id: msg.message_id
      });
    }
  }
});

// ========== CALLBACK QUERY HANDLERS ==========

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'set_welcome') {
    // Tampilkan pilihan grup
    await bot.answerCallbackQuery(query.id);
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '📝 Text Only', callback_data: 'welcome_type_text' }],
        [{ text: '🖼️ Photo + Text', callback_data: 'welcome_type_photo' }],
        [{ text: '❌ Cancel', callback_data: 'cancel_setup' }]
      ]
    };

    await bot.sendMessage(chatId, '🔧 Pilih tipe welcome message:\n\n📝 Text Only - Hanya teks sambutan\n🖼️ Photo + Text - Foto dengan caption', {
      reply_markup: keyboard
    });
  } else if (data === 'welcome_type_text') {
    await bot.answerCallbackQuery(query.id);
    
    userStates[userId] = {
      state: 'waiting_text',
      type: 'text'
    };

    await bot.sendMessage(chatId, '📝 Kirim text welcome message Anda.\n\nGunakan {name} untuk mention user baru.\nContoh: Selamat datang {name} di grup kami!');
  } else if (data === 'welcome_type_photo') {
    await bot.answerCallbackQuery(query.id);
    
    userStates[userId] = {
      state: 'waiting_photo',
      type: 'photo'
    };

    await bot.sendMessage(chatId, '🖼️ Kirim foto untuk welcome message.\n\nSetelah kirim foto, Anda akan diminta kirim caption/text.');
  } else if (data === 'cancel_setup') {
    await bot.answerCallbackQuery(query.id, { text: 'Setup dibatalkan' });
    delete userStates[userId];
    await bot.sendMessage(chatId, '❌ Setup welcome message dibatalkan.');
  } else if (data.startsWith('confirm_group_')) {
    const targetChatId = data.replace('confirm_group_', '');
    await bot.answerCallbackQuery(query.id);
    
    if (userStates[userId]) {
      userStates[userId].chatId = targetChatId;
      
      const keyboard = {
        inline_keyboard: [
          [{ text: '📝 Text Only', callback_data: 'welcome_type_text' }],
          [{ text: '🖼️ Photo + Text', callback_data: 'welcome_type_photo' }],
          [{ text: '❌ Cancel', callback_data: 'cancel_setup' }]
        ]
      };

      await bot.sendMessage(chatId, '🔧 Pilih tipe welcome message:', {
        reply_markup: keyboard
      });
    }
  }
});

// ========== MESSAGE HANDLERS ==========

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

  // Handle state untuk setup welcome message
  if (userStates[userId] && msg.chat.type === 'private') {
    const state = userStates[userId];

    if (state.state === 'waiting_text') {
      // Minta pilih grup
      const keyboard = {
        inline_keyboard: []
      };

      // Dapatkan daftar grup dari groupMembers
      for (const groupChatId in groupMembers) {
        keyboard.inline_keyboard.push([
          { text: `Grup ${groupChatId}`, callback_data: `save_welcome_text_${groupChatId}` }
        ]);
      }

      if (keyboard.inline_keyboard.length === 0) {
        await bot.sendMessage(chatId, '❌ Bot belum ada di grup manapun. Tambahkan bot ke grup terlebih dahulu.');
        delete userStates[userId];
        return;
      }

      // Simpan text sementara
      userStates[userId].text = text;

      await bot.sendMessage(chatId, '📋 Pilih grup untuk welcome message ini:', {
        reply_markup: keyboard
      });
    } else if (state.state === 'waiting_photo' && msg.photo) {
      // Simpan photo ID
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      userStates[userId].photoId = photoId;
      userStates[userId].state = 'waiting_caption';

      await bot.sendMessage(chatId, '📝 Kirim caption/text untuk foto.\n\nGunakan {name} untuk mention user baru.');
    } else if (state.state === 'waiting_caption') {
      const keyboard = {
        inline_keyboard: []
      };

      // Dapatkan daftar grup
      for (const groupChatId in groupMembers) {
        keyboard.inline_keyboard.push([
          { text: `Grup ${groupChatId}`, callback_data: `save_welcome_photo_${groupChatId}` }
        ]);
      }

      if (keyboard.inline_keyboard.length === 0) {
        await bot.sendMessage(chatId, '❌ Bot belum ada di grup manapun.');
        delete userStates[userId];
        return;
      }

      userStates[userId].text = text;

      await bot.sendMessage(chatId, '📋 Pilih grup untuk welcome message ini:', {
        reply_markup: keyboard
      });
    }
    return;
  }

  // Cek apakah user adalah admin
  const userIsAdmin = await isAdmin(chatId, userId);

  // ========== FITUR: AUTO MUTE UNTUK LINK/FILE/VIDEO ==========
  const hasLink = /https?:\/\/|www\./i.test(text) || msg.entities?.some(e => e.type === 'url' || e.type === 'text_link');
  const hasFile = msg.document || msg.video || msg.audio || msg.voice || msg.photo;

  if (!userIsAdmin && (hasLink || hasFile)) {
    const muteDuration = 6 * 60 * 60; // 6 jam
    const muteSuccess = await muteUser(chatId, userId, muteDuration);

    if (muteSuccess) {
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (error) {
        console.error('Error deleting message:', error);
      }

      const warningMessage = `⏳ (6 jam)\n⚠️ ${firstName} ASU sudah ku Bilangin jangan Jangan melanggar Aturan.`;
      await bot.sendMessage(chatId, warningMessage);
    }
    return;
  }

  // ========== FITUR: AUTO HAPUS DAN MUTE COMMAND (/) ==========
  if (!userIsAdmin && text.startsWith('/')) {
    const muteDuration = 6 * 60 * 60; // 6 jam
    await muteUser(chatId, userId, muteDuration);

    // Hapus pesan command dari user
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Error deleting command message:', error);
    }

    // Kirim peringatan dan hapus setelah beberapa detik
    const warningMsg = await bot.sendMessage(chatId, `⏳ (6 jam)\n⚠️ ${firstName} ASU sudah ku Bilangin jangan kirim command!`);
    
    // Hapus peringatan setelah 5 detik
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, warningMsg.message_id);
      } catch (error) {
        console.error('Error deleting warning message:', error);
      }
    }, 5000);
    
    return;
  }

  // ========== FITUR: TAG ALL DENGAN INVISIBLE CHARACTER ==========
  if (userIsAdmin && text.toLowerCase().includes('xixi')) {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Error deleting admin message:', error);
    }

    const members = groupMembers[chatId] || new Map();
    let mentions = [];
    
    for (const [memberId, memberData] of members.entries()) {
      // Gunakan invisible mention dengan zero-width space
      mentions.push(`[${INVISIBLE_CHAR}](tg://user?id=${memberId})`);
    }

    if (mentions.length > 0) {
      // Kirim pesan dengan invisible mentions
      const mentionText = mentions.join('') + ' ';
      
      await bot.sendMessage(chatId, mentionText, {
        parse_mode: 'Markdown'
      });
    } else {
      await bot.sendMessage(chatId, '📢 Belum ada member yang tersimpan.');
    }
    return;
  }
});

// Handle callback untuk save welcome
bot.on('callback_query', async (query) => {
  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message.chat.id;

  if (data.startsWith('save_welcome_text_')) {
    const targetChatId = data.replace('save_welcome_text_', '');
    
    if (userStates[userId] && userStates[userId].text) {
      welcomeSettings[targetChatId] = {
        type: 'text',
        text: userStates[userId].text
      };

      await bot.answerCallbackQuery(query.id, { text: 'Welcome message berhasil disimpan!' });
      await bot.sendMessage(chatId, `✅ Welcome message untuk grup ${targetChatId} berhasil disimpan!\n\nTipe: Text Only\nText: ${userStates[userId].text}`);
      
      delete userStates[userId];
    }
  } else if (data.startsWith('save_welcome_photo_')) {
    const targetChatId = data.replace('save_welcome_photo_', '');
    
    if (userStates[userId] && userStates[userId].photoId && userStates[userId].text) {
      welcomeSettings[targetChatId] = {
        type: 'photo',
        photoId: userStates[userId].photoId,
        text: userStates[userId].text
      };

      await bot.answerCallbackQuery(query.id, { text: 'Welcome message berhasil disimpan!' });
      await bot.sendMessage(chatId, `✅ Welcome message untuk grup ${targetChatId} berhasil disimpan!\n\nTipe: Photo + Text`);
      
      delete userStates[userId];
    }
  }
});

// ========== HANDLER MEMBER BARU ==========
bot.on('new_chat_members', async (msg) => {
  const chatId = msg.chat.id;
  
  msg.new_chat_members.forEach(async (member) => {
    saveMember(chatId, member.id, member.username, member.first_name);
    
    // Kirim welcome message jika sudah diset
    if (welcomeSettings[chatId]) {
      const setting = welcomeSettings[chatId];
      const userName = member.first_name;
      const userMention = `[${userName}](tg://user?id=${member.id})`;
      
      let welcomeText = setting.text.replace(/{name}/g, userMention);
      
      if (setting.type === 'text') {
        await bot.sendMessage(chatId, welcomeText, {
          parse_mode: 'Markdown'
        });
      } else if (setting.type === 'photo') {
        await bot.sendPhoto(chatId, setting.photoId, {
          caption: welcomeText,
          parse_mode: 'Markdown'
        });
      }
    }
  });
});

// ========== START BOT ==========
console.log('🤖 Bot Moderator Telegram berhasil dijalankan!');
console.log('📝 Fitur yang aktif:');
console.log('   1. Auto mute 6 jam untuk link/file/video (non-admin)');
console.log('   2. Auto mute dan hapus pesan untuk command / (non-admin)');
console.log('   3. Tag all dengan invisible mention (admin kirim "xixi")');
console.log('   4. Welcome message per grup (setup via /start)');
console.log('');
console.log('⚠️  PENTING: Pastikan bot sudah menjadi admin di grup!');
console.log('');

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});
