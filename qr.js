import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import {
    makeWASocket, 
    useMultiFileAuthState, 
    makeCacheableSignalKeyStore,
    Browsers, 
    jidNormalizedUser, 
    fetchLatestBaileysVersion, 
    delay, 
    DisconnectReason
} from '@whiskeysockets/baileys';
import { upload as megaUpload } from './mega.js';

const router = express.Router();
const MAX_RECONNECT_ATTEMPTS = 3;
const SESSION_TIMEOUT = 60000;

const MESSAGE = `
🚀 *𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗬* ✅

> 🚫ᴅᴏɴ'ᴛ ꜱʜᴀʀᴇ ᴛʜɪꜱ ᴄᴏᴅᴇ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ!!!

🪀 *Fᴏʟʟᴏᴡ Wʜᴀᴛꜱᴀᴘᴘ Gʀᴏᴜᴘ* 🪀
https://chat.whatsapp.com/K2pvtjtFLETBFWZIatx8uR?mode=gi_t

👨🏻‍💻 *Cᴏɴᴛᴀᴄᴛ Oᴡɴᴇʀ* 👨🏻‍💻
https://wa.me/94711726564

🎯 *𝚂𝚑𝚊𝚗 𝙼𝙳 𝙱𝚢 𝚂𝚑𝚊𝚗* 🎯
> ©SHAN | 2026
`;

async function removeFile(FilePath) {
    try {
        if (await fs.pathExists(FilePath)) {
            await fs.remove(FilePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

function randomMegaId(len = 6, numLen = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${out}${Math.floor(Math.random() * Math.pow(10, numLen))}`;
}

router.get('/', async (req, res) => {
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;
    
    if (!(await fs.pathExists('./qr_sessions'))) {
        await fs.ensureDir('./qr_sessions');
    }

    let qrGenerated = false;
    let sessionCompleted = false;
    let responseSent = false;
    let reconnectAttempts = 0;
    let currentSocket = null;
    let timeoutHandle = null;
    let isCleaningUp = false;

    async function cleanup(reason = 'unknown') {
        if (isCleaningUp) return;
        isCleaningUp = true;

        console.log(`🧹 Cleaning up session ${sessionId} - Reason: ${reason}`);

        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }

        if (currentSocket) {
            try {
                currentSocket.ev.removeAllListeners();
                currentSocket.end();
            } catch (e) {
                console.error('Error closing socket:', e);
            }
            currentSocket = null;
        }

        // Delay cleanup to allow any pending processes to finish
        setTimeout(async () => {
            try {
                await removeFile(dirs);
            } catch (e) {}
        }, 10000);
    }

    async function initiateSession() {
        if (sessionCompleted || isCleaningUp) return;

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            if (!responseSent && !res.headersSent) {
                responseSent = true;
                res.status(503).send({ code: 'CONNECTION_FAILED', error: 'Max reconnection attempts reached' });
            }
            await cleanup('max_reconnects');
            return;
        }

        await fs.ensureDir(dirs);
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();

            currentSocket = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.ubuntu('Chrome'), // Using ubuntu to match environment
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                markOnlineOnConnect: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
            });

            const sock = currentSocket;

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !qrGenerated && !sessionCompleted && !isCleaningUp) {
                    qrGenerated = true;
                    try {
                        const qrDataURL = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M' });
                        if (!responseSent && !res.headersSent) {
                            responseSent = true;
                            res.send({
                                qr: qrDataURL,
                                message: 'QR Code Generated! Scan with WhatsApp app.',
                                instructions: [
                                    'Open WhatsApp on your phone',
                                    'Go to Settings > Linked Devices',
                                    'Tap "Link a Device"',
                                    'Scan the QR code shown above'
                                ]
                            });
                        }
                    } catch (err) {
                        console.error('QR Generation Error:', err);
                        if (!responseSent && !res.headersSent) {
                            responseSent = true;
                            res.status(500).send({ code: 'QR_ERROR', error: 'Failed to generate QR code' });
                        }
                        await cleanup('qr_error');
                    }
                }

                if (connection === 'open') {
                    if (sessionCompleted) return;
                    sessionCompleted = true;

                    try {
                        const credsFile = `${dirs}/creds.json`;
                        if (await fs.pathExists(credsFile)) {
                            const id = randomMegaId();
                            const credsData = await fs.readFile(credsFile);
                            
                            // Upload to MEGA
                            const megaLink = await megaUpload(credsData, `${id}.json`);
                            const megaSessionId = megaLink.replace('https://mega.nz/file/', '𝚂𝚑𝚊𝚗-𝙼𝙳=');
                            
                            const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                            if (userJid) {
                                const msg = await sock.sendMessage(userJid, { text: megaSessionId });
                                await sock.sendMessage(userJid, { text: MESSAGE, quoted: msg });
                            }
                            
                            console.log('✅ Session successfully generated and sent to user.');
                        }
                    } catch (err) {
                        console.error('Session Upload Error:', err);
                    } finally {
                        await delay(5000);
                        await cleanup('session_complete');
                    }
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (shouldReconnect && !sessionCompleted && !isCleaningUp) {
                        reconnectAttempts++;
                        console.log(`🔁 Reconnecting... Attempt ${reconnectAttempts}`);
                        await initiateSession();
                    } else {
                        if (!responseSent && !res.headersSent) {
                            responseSent = true;
                            res.status(401).send({ code: 'SESSION_CLOSED', error: 'Connection closed' });
                        }
                        await cleanup('connection_closed');
                    }
                }
            });

            // Set timeout for QR generation
            timeoutHandle = setTimeout(async () => {
                if (!qrGenerated && !sessionCompleted && !isCleaningUp) {
                    if (!responseSent && !res.headersSent) {
                        responseSent = true;
                        res.status(408).send({ code: 'TIMEOUT', error: 'QR generation timed out' });
                    }
                    await cleanup('timeout');
                }
            }, SESSION_TIMEOUT);

        } catch (err) {
            console.error('Initialization Error:', err);
            if (!responseSent && !res.headersSent) {
                responseSent = true;
                res.status(500).send({ code: 'INIT_ERROR', error: 'Failed to initialize session' });
            }
            await cleanup('init_error');
        }
    }

    await initiateSession();
});

// Periodic cleanup of old session directories
setInterval(async () => {
    try {
        if (await fs.pathExists('./qr_sessions')) {
            const sessions = await fs.readdir('./qr_sessions');
            const now = Date.now();
            for (const session of sessions) {
                const sessionPath = `./qr_sessions/${session}`;
                const stats = await fs.stat(sessionPath);
                if (now - stats.mtimeMs > 600000) { // 10 minutes
                    await fs.remove(sessionPath);
                }
            }
        }
    } catch (e) {}
}, 300000);

export default router;
