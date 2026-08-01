import http from 'http';
import { createLogger } from './logger';
import { config } from './config';
import { isConnectionStalled } from './utils/time';

const log = createLogger('health');

const startTime = Date.now();
let hasDecryptionError = false;
let decryptionErrorTimeout: NodeJS.Timeout | null = null;
let connectionState: 'open' | 'connecting' | 'close' = 'close';

// Epoch ms of when the connection stopped being open, null while it is open.
// Starts at process start so a bot that never connects is caught too.
let notOpenSince: number | null = startTime;

// How long the socket may sit in a non-open state before we exit. The
// reconnect logic in connection.ts only runs on a 'close' event; a socket that
// hangs in 'connecting' never emits one, so nothing retries and the process
// idles forever. Exiting is the only escape that does not depend on that
// event - the process manager (PM2) restarts us with a fresh socket.
const STALE_CONNECTION_MS = 10 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 60 * 1000;

// libsignal writes these straight to stderr rather than through our logger.
// 'Bad MAC' and 'Session error' mean the signal session keys have diverged -
// the process cannot decrypt anything until auth_info is wiped and re-paired.
const DECRYPTION_ERROR_MARKERS = [
  'MessageCounterError',
  'Failed to decrypt message',
  'Bad MAC',
  'Session error',
];

// Monkey patch console.error to intercept libsignal decryption failures
const originalConsoleError = console.error;
console.error = function (...args: any[]) {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');

  if (DECRYPTION_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    // Ignore errors during the first 2 minutes of startup (history sync)
    if (Date.now() - startTime < 120000) {
      originalConsoleError.apply(console, args);
      return;
    }

    if (!hasDecryptionError) {
      log.error({ message }, 'Decryption error detected in stderr stream!');
      hasDecryptionError = true;
    }

    // Auto-reset health status after 5 minutes of no new decryption errors
    if (decryptionErrorTimeout) {
      clearTimeout(decryptionErrorTimeout);
    }
    decryptionErrorTimeout = setTimeout(() => {
      if (hasDecryptionError) {
        log.info('Clearing decryption error state (no new errors for 5 minutes)');
        hasDecryptionError = false;
      }
    }, 300000); // 5 minutes
  }
  originalConsoleError.apply(console, args);
};

export function setConnectionState(state: 'open' | 'connecting' | 'close') {
  if (connectionState !== state) {
    log.info({ from: connectionState, to: state }, 'Connection state updated');
    connectionState = state;
    notOpenSince = state === 'open' ? null : Date.now();
  }
}

// Restarts the process when the connection has been stuck for too long.
// Deliberately ignores hasDecryptionError: a Bad MAC survives a restart, so
// exiting on it would only produce a restart loop that fixes nothing.
function startConnectionWatchdog() {
  const watchdog = setInterval(() => {
    if (!isConnectionStalled(notOpenSince, Date.now(), STALE_CONNECTION_MS)) {
      return;
    }

    log.fatal(
      { connectionState, stalledMs: Date.now() - notOpenSince! },
      'WhatsApp connection stalled - exiting so the process manager restarts us'
    );
    process.exit(1);
  }, WATCHDOG_INTERVAL_MS);

  if (typeof watchdog.unref === 'function') {
    watchdog.unref();
  }
}

export function startHealthCheckServer() {
  startConnectionWatchdog();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      if (config.healthToken) {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${config.healthToken}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'unhealthy',
              reason: 'Unauthorized',
            })
          );
          return;
        }
      }

      if (connectionState !== 'open') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'unhealthy',
            reason: `WhatsApp connection is ${connectionState}`,
          })
        );
        return;
      }

      if (hasDecryptionError) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'unhealthy',
            reason: 'Decryption key mismatch error detected',
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(config.port, () => {
    log.info({ port: config.port }, 'HTTP Health check server running');
  });
}
