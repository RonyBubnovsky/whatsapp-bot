// ============================================================
// handlers/messageHandler.ts - Processes each incoming message.
// ============================================================

import fs from 'fs';
import path from 'path';
import { WASocket, proto } from '@whiskeysockets/baileys';
import { rules } from './rules';
import { humanDelay } from '../utils/delay';
import { createRateLimiter } from '../utils/rateLimiter';
import { createLogger } from '../logger';
import { config } from '../config';
import { isSleepingTime } from '../utils/time';

const log = createLogger('message-handler');

const rateLimiter = createRateLimiter({
  maxMessages: config.rateLimitMax,
  windowMs: config.rateLimitWindowMs,
  limitReachedMessage: config.rateLimitMessage,
});

export const handleMessage = async (
  sock: WASocket,
  msg: proto.IWebMessageInfo
): Promise<void> => {
  if (isSleepingTime()) {
    log.info('Bot is sleeping. Message ignored.');
    return;
  }

  const chatId = msg.key.remoteJid!;
  const sender = msg.key.participant || chatId;

  log.debug(
    {
      chatId,
      sender,
      hasMessage: !!msg.message,
      messageKeys: msg.message ? Object.keys(msg.message) : [],
    },
    'Incoming message'
  );

  for (const rule of rules) {
    if (rule.condition(msg)) {
      const result = await rateLimiter.check(sender);

      if (result.status === 'blocked') {
        return;
      }

      if (result.status === 'limit_reached') {
        await humanDelay();
        const oggPath = path.join(process.cwd(), 'chat_response.ogg');
        const mp4Path = path.join(process.cwd(), 'chat_response.mp4');
        const wavPath = path.join(process.cwd(), 'chat_response.wav');

        if (fs.existsSync(oggPath)) {
          await sock.sendMessage(chatId, {
            audio: fs.readFileSync(oggPath),
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
          });
          log.info({ sender, format: 'ogg' }, 'Rate limit warning sent as voice note');
        } else if (fs.existsSync(mp4Path)) {
          await sock.sendMessage(chatId, {
            audio: fs.readFileSync(mp4Path),
            mimetype: 'audio/mp4',
            ptt: true,
          });
          log.info({ sender, format: 'mp4' }, 'Rate limit warning sent as audio');
        } else if (fs.existsSync(wavPath)) {
          await sock.sendMessage(chatId, {
            audio: fs.readFileSync(wavPath),
            mimetype: 'audio/wav',
            ptt: true,
          });
          log.info({ sender, format: 'wav' }, 'Rate limit warning sent as WAV audio');
        } else {
          await sock.sendMessage(chatId, { text: rateLimiter.limitReachedMessage });
          log.info({ sender }, 'Rate limit warning sent as text (audio files missing)');
        }
        return;
      }

      log.info({ rule: rule.name, chatId, sender }, 'Rule matched');

      await humanDelay();

      try {
        const text = rule.response(msg);
        await sock.sendMessage(chatId, { text });
        log.info({ rule: rule.name, text }, 'Reply sent successfully');
      } catch (err) {
        log.error({ err, rule: rule.name }, 'Failed to send reply');
      }

      break;
    }
  }
};