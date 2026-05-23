import http from 'http';
import { createLogger } from './logger';
import { config } from './config';

const log = createLogger('health');

let hasDecryptionError = false;
let connectionState: 'open' | 'connecting' | 'close' = 'close';

// Monkey patch console.error to intercept libsignal decryption failures
const originalConsoleError = console.error;
console.error = function (...args: any[]) {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');

  if (
    message.includes('MessageCounterError') ||
    message.includes('Failed to decrypt message')
  ) {
    if (!hasDecryptionError) {
      log.error({ message }, 'Decryption error detected in stderr stream!');
      hasDecryptionError = true;
    }
  }
  originalConsoleError.apply(console, args);
};

export function setConnectionState(state: 'open' | 'connecting' | 'close') {
  if (connectionState !== state) {
    log.info({ from: connectionState, to: state }, 'Connection state updated');
    connectionState = state;
  }
}

export function startHealthCheckServer() {
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
