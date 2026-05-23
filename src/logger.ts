// ============================================================
// logger.ts - Central logger for the entire app.
//
// In development (NODE_ENV=development):
//   Prints colorized, human-readable output with timestamps.
//
// In production (NODE_ENV=production):
//   Prints structured JSON - one line per log entry.
//   JSON logs are easy to search, filter, and forward to
//   log aggregators (Datadog, Grafana Loki, etc.) if needed later.
//
// Usage in any file:
//   import { createLogger } from './logger';
//   const log = createLogger('my-module');
//   log.info('something happened');
//   log.error({ err }, 'something failed');
//
// Log levels (from lowest to highest severity):
//   trace, debug, info, warn, error, fatal
//   Only logs at or above LOG_LEVEL will appear.
// ============================================================

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

// Root logger instance
const rootLogger = pino(
  {
    level,

    // Add a timestamp to every log line
    timestamp: pino.stdTimeFunctions.isoTime,

    // Format for production: plain JSON, easy to parse by log tools
    // Format for development: pretty printed with colors
    ...(isDev
      ? {}
      : {
          // In production, serialize Error objects properly
          serializers: {
            err: pino.stdSerializers.err,
          },
        }),
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          // Show the module name in brackets: [connection] Connected...
          messageFormat: '[{module}] {msg}',
        },
      })
    : undefined
);

// Returns a child logger that stamps every line with the module name
// This lets you filter logs by module in production
export const createLogger = (module: string) =>
  rootLogger.child({ module });

export default rootLogger;