import { createLogger } from '../logger';

const log = createLogger('error-handler');

export const initErrorHandlers = (): void => {
  // Capture errors that are thrown but not caught anywhere in code
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    // Exit process because app is in an unstable state
    process.exit(1);
  });

  // Capture promises that fail/reject without a .catch() block
  process.on('unhandledRejection', (reason) => {
    log.error({ reason }, 'Unhandled rejection');
  });
};
