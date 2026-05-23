// ============================================================
// handlers/messageHandler.ts - Processes each incoming message.
// ============================================================

import { WASocket, proto } from '@whiskeysockets/baileys';
import { rules } from './rules';
import { humanDelay } from '../utils/delay';
import { createRateLimiter } from '../utils/rateLimiter';
import { createLogger } from '../logger';
import { config } from '../config';

const log = createLogger('message-handler');

const rateLimiter = createRateLimiter({
  maxMessages: config.rateLimitMax,
  windowMs: config.rateLimitWindowMs,
  limitReachedMessage: config.rateLimitMessage,
});

const sentMessageIds = new Set<string>();

export const handleMessage = async (
  sock: WASocket,
  msg: proto.IWebMessageInfo
): Promise<void> => {
  const messageId = msg.key.id;
  if (messageId && sentMessageIds.has(messageId)) {
    sentMessageIds.delete(messageId);
    log.debug({ messageId }, 'Ignoring own bot reply message');
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

  // status === 'allowed' - check rules normally
  for (const rule of rules) {
    if (rule.condition(msg)) {
      log.info({ rule: rule.name, chatId, sender }, 'Rule matched');

      await humanDelay();

      try {
        const text = rule.response(msg);
        const sentMsg = await sock.sendMessage(chatId, { text });
        if (sentMsg?.key?.id) {
          sentMessageIds.add(sentMsg.key.id);
        }
        log.info({ rule: rule.name, text }, 'Reply sent successfully');
      } catch (err) {
        log.error({ err, rule: rule.name }, 'Failed to send reply');
      }

      break;
    }
  }
};