const fs = require('fs');

global.owner = "6287752910121" 
global.botNumber = "6287752910121" 
global.botName = "XUANTION BOT"
global.companyName = "PT. XUANTION TEKNOLOGI" 
global.prefix = "."
global.thumbName = "./zang.jpg" 

global.mess = {
    wait: '⏳ Sedang diproses...',
    loading: '🔄 LOADING...',
    owner: '❌ Fitur ini khusus Owner!',
    success: '✅ Berhasil!',
    error: '⚠️ Terjadi kesalahan sistem.'
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(`Update ${__filename}`)
    delete require.cache[file]
    require(file)
})
