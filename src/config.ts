// ============================================================
// config.ts - All configuration comes from environment variables.
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

const targetSenderNumber = process.env.TARGET_SENDER_NUMBER;
if (!targetSenderNumber) {
  throw new Error(
    `Missing required environment variable: TARGET_SENDER_NUMBER\n` +
    `Copy .env.example to .env and fill in the value.`
  );
}

// Ensure number is only digits (with country code, e.g. 972501234567)
if (!/^\d+$/.test(targetSenderNumber)) {
  throw new Error(
    `Invalid TARGET_SENDER_NUMBER: "${targetSenderNumber}".\n` +
    `It must contain digits only, with no spaces, symbols, or "@s.whatsapp.net".`
  );
}

const targetGroupId = process.env.TARGET_GROUP_ID || '';
if (targetGroupId && !/^\d+(-\d+)?@g\.us$/.test(targetGroupId)) {
  throw new Error(
    `Invalid TARGET_GROUP_ID: "${targetGroupId}".\n` +
    `It must be a valid group JID ending with "@g.us" (e.g. 120363024823901923@g.us).`
  );
}

export const config = {
  targetSenderNumber,
  targetGroupId,
  targetSenderLid: '',

  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
  chatResponse: process.env.CHAT_RESPONSE || 'יתותח!',

  // Rate limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '5', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10),
  rateLimitMessage: process.env.RATE_LIMIT_MESSAGE || 'חחחחח',
};