const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const axios = require("axios");

require("./zang"); 

async function startBot() {
    console.log(" Menjalankan Mesin Xuantion...");
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState("session");

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // Wajib false untuk Pairing Code
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // SISTEM PAIRING CODE - DIPERBAIKI
    if (!sock.authState.creds.registered) {
        console.log(" Menunggu 5 detik untuk meminta Kode Pairing...");
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(global.botNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n\x1b[1;32m==============================\x1b[0m`);
                console.log(`\x1b[1;32mKODE PAIRING ANDA:\x1b[0m \x1b[1;44m ${code} \x1b[0m`);
                console.log(`\x1b[1;32m==============================\x1b[0m\n`);
                console.log("Silahkan masukkan kode di atas pada menu 'Tautkan Perangkat' di WhatsApp Anda.");
            } catch (err) {
                console.error("Gagal meminta kode pairing:", err);
            }
        }, 5000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(`Koneksi Terputus: ${reason}. Restarting...`);
            if (reason !== DisconnectReason.loggedOut) startBot();
        } else if (connection === "open") {
            console.log(`\n\x1b[1;32m[ BERHASIL CONNECT ] Selamat Datang Owner Xuantion!\x1b[0m\n`);
        }
    });

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message || m.key.remoteJid === "status@broadcast") return;
            const from = m.key.remoteJid;
            const body = m.message.conversation || m.message.extendedTextMessage?.text || "";
            const isCmd = body.startsWith(global.prefix);
            const command = isCmd ? body.slice(global.prefix.length).trim().split(' ').shift().toLowerCase() : "";
            const args = body.trim().split(/ +/).slice(1);
            const text = args.join(" ");

            if (isCmd) {
                switch (command) {
                    case 'menu':
                        let menuText = `*XUANTION BOT DASHBOARD*\n\n`
                        menuText += `◦ ${global.prefix}tt [link]\n`
                        menuText += `◦ ${global.prefix}ping\n`
                        menuText += `◦ ${global.prefix}owner\n`
                        if (fs.existsSync(global.thumbName)) {
                            await sock.sendMessage(from, { image: fs.readFileSync(global.thumbName), caption: menuText }, { quoted: m });
                        } else {
                            await sock.sendMessage(from, { text: menuText }, { quoted: m });
                        }
                        break;
                    
                    case 'tt':
                        if (!text) return sock.sendMessage(from, { text: "Linknya mana?" });
                        let { key } = await sock.sendMessage(from, { text: "🔄 LOADING 0%" }, { quoted: m });
                        for (let step of ["40%", "80%", "100%"]) {
                            await new Promise(r => setTimeout(r, 600));
                            await sock.sendMessage(from, { text: `🔄 LOADING ${step}`, edit: key });
                        }
                        try {
                            const res = await axios.get(`https://www.tikwm.com/api/?url=${text}`);
                            await sock.sendMessage(from, { video: { url: res.data.data.play }, caption: "Sukses!" }, { quoted: m });
                            await sock.sendMessage(from, { text: "✅ SELESAI!", edit: key });
                        } catch (e) {
                            await sock.sendMessage(from, { text: "Error!" }, { edit: key });
                        }
                        break;

                    case 'ping':
                        await sock.sendMessage(from, { text: "Pong!" });
                        break;
                }
            }
        } catch (err) { console.log(err); }
    });
}

startBot();
