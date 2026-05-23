// ============================================================
// handlers/messageHandler.ts - Processes each incoming message.
// ============================================================

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
      fromMe: msg.key.fromMe,
      hasMessage: !!msg.message,
      messageKeys: msg.message ? Object.keys(msg.message) : [],
    },
    'Incoming message'
  );

  for (const rule of rules) {
    if (rule.condition(msg)) {
      const result = rateLimiter.check(sender);

      if (result.status === 'blocked') {
        return;
      }

      if (result.status === 'limit_reached') {
        await humanDelay();
        await sock.sendMessage(chatId, { text: rateLimiter.limitReachedMessage });
        log.info({ sender }, 'Rate limit warning sent');
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