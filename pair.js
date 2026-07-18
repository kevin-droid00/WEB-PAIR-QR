import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import { parsePhoneNumber } from 'awesome-phonenumber';
import path from 'path';
import os from 'os';
import {
    makeWASocket, useMultiFileAuthState, delay,
    makeCacheableSignalKeyStore, Browsers, jidNormalizedUser,
    fetchLatestBaileysVersion, DisconnectReason
} from '@whiskeysockets/baileys';
import { upload as megaUpload } from './mega.js';

const router = express.Router();
const AUTH_DIR = path.join(os.tmpdir(), 'auth_info_baileys');

const MESSAGE = `🚀 *𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗙𝗨𝗟𝗬* ✅

> 🚫ᴅᴏɴ'ᴛ ꜱʜᴀʀᴇ ᴛʜɪꜱ ᴄᴏᴅᴇ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ!!!

🪀 *Fᴏʟʟᴏᴡ Wʜᴀᴛꜱᴀᴘᴘ Gʀᴏᴜᴘ* 🪀
https://chat.whatsapp.com/K2pvtjtFLETBFWZIatx8uR?mode=gi_t

👨🏻‍💻 *Cᴏɴᴛᴀᴄᴛ Oᴡɴᴇʀ* 👨🏻‍💻
https://wa.me/94711726564

🎯 *𝚂𝚑𝚊𝚗 𝙼𝙳 𝙱𝚢 𝚂𝚑𝚊𝚗* 🎯
> ©SHAN | 2026`;

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send({ error: 'Phone number is required' });

    num = num.replace(/[^0-9]/g, '');
    const phone = parsePhoneNumber('+' + num);
    if (!phone.valid) return res.status(400).send({ error: 'Invalid phone number.' });
    num = phone.number.e164.replace('+', '');

    const sessionId = `SHAN_MD_${Date.now()}`;
    const dirs = path.join(AUTH_DIR, sessionId);

    let sessionCompleted = false;

    async function startPairing() {
        try {
            if (!fs.existsSync(dirs)) await fs.mkdir(dirs, { recursive: true });
            const { state, saveCreds } = await useMultiFileAuthState(dirs);
            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                version,
                auth: { 
                    creds: state.creds, 
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) 
                },
                printQRInTerminal: false, 
                logger: pino({ level: "silent" }),
                browser: ["SHAN-MD", "Chrome", "1.0.0"],
                connectTimeoutMs: 30000,
                defaultQueryTimeoutMs: 30000,
                keepAliveIntervalMs: 5000,
            });

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    sessionCompleted = true;
                    console.log(`✅ [${num}] Open`);
                    try {
                        await delay(3000); // Optimized delay for Vercel
                        const credsFile = path.join(dirs, 'creds.json');
                        if (fs.existsSync(credsFile)) {
                            const content = await fs.readFile(credsFile);
                            const megaLink = await megaUpload(content, `${sessionId}.json`);
                            const megaSessionId = megaLink.replace('https://mega.nz/file/', '𝚂𝙷𝙰𝙽-𝙼𝙳=');
                            const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                            
                            await sock.sendMessage(userJid, { text: megaSessionId });
                            await sock.sendMessage(userJid, { text: MESSAGE });
                            console.log(`✅ Sent`);
                        }
                    } catch (e) {
                        console.error(e);
                    } finally {
                        await delay(1000);
                        process.exit(0); // Force exit to ensure Vercel completes
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        await fs.remove(dirs);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            await delay(2000);
            if (!sock.authState.creds.registered) {
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) res.send({ code: code?.match(/.{1,4}/g)?.join('-') || code });
            }

        } catch (err) {
            if (!res.headersSent) res.status(500).send({ error: 'Error' });
        }
    }

    await startPairing();
});

export default router;
