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
import { getWarningAudioMessage } from '../utils/warningAudio';

const log = createLogger('message-handler');

const rateLimiter = createRateLimiter({
  maxMessages: config.rateLimitMax,
  windowMs: config.rateLimitWindowMs,
  limitReachedMessage: config.rateLimitMessage,
});

/**
 * Handles one incoming WhatsApp message from Baileys.
 * Input: the active WhatsApp socket and the raw Baileys message.
 * Output: resolves when the message was ignored, rate-limited, or answered.
 */
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
        const warningAudio = getWarningAudioMessage(process.cwd());

        for (const skippedAudio of warningAudio.skipped) {
          log.warn(
            { sender, fileName: skippedAudio.fileName, reason: skippedAudio.reason },
            'Rate limit warning audio skipped'
          );
        }

        if (warningAudio.status === 'found') {
          await sock.sendMessage(chatId, warningAudio.message);
          log.info(
            { sender, fileName: warningAudio.fileName, format: warningAudio.format },
            'Rate limit warning sent as audio'
          );
        } else {
          await sock.sendMessage(chatId, { text: rateLimiter.limitReachedMessage });
          log.info({ sender }, 'Rate limit warning sent as text (audio files missing)');
        }
        return;
      }

      const incomingText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        undefined;
      log.info({ rule: rule.name, chatId, sender, incomingText }, 'Rule matched');

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
