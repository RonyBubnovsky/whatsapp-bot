// ============================================================
// index.ts - Entry point.
// ============================================================

import { initErrorHandlers } from './utils/errorHandler';
import { config } from './config';
import { createLogger } from './logger';
import { connectToWhatsApp } from './connection';

// Initialize global error handlers first
initErrorHandlers();

const log = createLogger('app');

log.info({ env: config.nodeEnv, logLevel: config.logLevel }, 'Starting WhatsApp bot');

connectToWhatsApp().catch((err: unknown) => {
  log.fatal({ err }, 'Fatal error on startup');
  process.exit(1);
});