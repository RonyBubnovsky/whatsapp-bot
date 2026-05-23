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

export const config = {
  targetSenderNumber,
  targetGroupId: process.env.TARGET_GROUP_ID || '',

  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
  chatResponse: process.env.CHAT_RESPONSE || 'יתותח!',

  // Rate limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '5', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10),
  rateLimitMessage: process.env.RATE_LIMIT_MESSAGE || 'חחחחח',
};