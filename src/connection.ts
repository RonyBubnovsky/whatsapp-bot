// ============================================================
// connection.ts - Manages the WhatsApp WebSocket connection.
// ============================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { handleMessage } from './handlers/messageHandler';
import { createLogger } from './logger';
import qrcode from 'qrcode-terminal';
import { config } from './config';
import { setConnectionState } from './health';
import { enqueue } from './utils/queue';
import { isNonContentMessage } from './utils/messageFilter';

const log = createLogger('connection');

export const connectToWhatsApp = async (): Promise<void> => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  log.info({ version: version.join('.') }, 'Using WhatsApp Web version');

  let lastQr: string | undefined = undefined;

  const sock = makeWASocket({
    version,
    auth: state,
    // Silence Baileys internal logs - our logger handles everything
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (connection) {
      setConnectionState(connection);
    }

    if (qr) {
      if (qr !== lastQr) {
        lastQr = qr;
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'open') {
      log.info('Connected to WhatsApp successfully');

      // Resolve target sender LID
      try {
        const jid = `${config.targetSenderNumber}@s.whatsapp.net`;
        const result = await sock.onWhatsApp(jid);
        if (result && result.length > 0 && result[0].exists) {
          const resolvedLid = result[0].lid;
          if (typeof resolvedLid === 'string' && resolvedLid) {
            config.targetSenderLid = resolvedLid;
            log.info({ resolvedLid }, 'Resolved target sender LID');
          }
        } else {
          log.warn({ jid }, 'Could not resolve LID for target sender');
        }
      } catch (err) {
        log.error({ err }, 'Failed to resolve target sender LID');
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      // Clean up event listeners on old socket to prevent memory leak
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');

      if (shouldReconnect) {
        log.warn({ statusCode }, 'Connection closed, reconnecting in 3s');
        await new Promise(resolve => setTimeout(resolve, 3000));
        connectToWhatsApp();
      } else {
        log.error('Logged out of WhatsApp. Delete the auth_info folder and restart.');
        process.exit(1);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      // Drop edits, reactions, poll updates, and other protocol-only
      // payloads. Edits in particular can arrive wrapped as either
      // protocolMessage (MESSAGE_EDIT) or editedMessage, optionally
      // nested inside future-proof wrappers - the helper handles both.
      if (isNonContentMessage(msg.message)) continue;

      if (process.env.NODE_ENV !== 'production') {
        log.debug(
          {
            chatId: msg.key.remoteJid,
            fromMe: msg.key.fromMe,
            messageKeys: Object.keys(msg.message),
          },
          'Upsert message'
        );
      }

      // Skip messages sent by the bot itself or sent outside the target group
      if (msg.key.fromMe || msg.key.remoteJid !== config.targetGroupId) continue;

      // Skip historical / offline messages synced on connection
      const timestamp = msg.messageTimestamp;
      if (timestamp) {
        const msgTime = typeof timestamp === 'number'
          ? timestamp
          : (timestamp as any).toNumber
            ? (timestamp as any).toNumber()
            : Number(timestamp);
        const now = Math.floor(Date.now() / 1000);
        if (now - msgTime > 10) {
          log.debug({ msgId: msg.key.id, age: now - msgTime }, 'Skipping historical message');
          continue;
        }
      }

      const chatId = msg.key.remoteJid;
      const msgId = msg.key.id || 'unknown';
      if (chatId) {
        enqueue(chatId, msgId, () => handleMessage(sock, msg));
      }
    }
  });
};