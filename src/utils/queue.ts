// ============================================================
// utils/queue.ts - In-memory sequential queue per chat.
// ============================================================

import { createLogger } from '../logger';

const log = createLogger('queue');

const chatQueues = new Map<string, Promise<void>>();

/**
 * Enqueues an asynchronous task for a specific chat/sender.
 * Guarantees tasks for the same chat run sequentially.
 * Cleans up memory automatically when the queue becomes idle.
 */
export const enqueue = (
  chatId: string,
  taskId: string,
  task: () => Promise<void>
): Promise<void> => {
  log.debug({ chatId, taskId }, 'Enqueuing task');
  const current = chatQueues.get(chatId) || Promise.resolve();

  const next = current
    .then(async () => {
      log.debug({ chatId, taskId }, 'Executing task from queue');
      try {
        await task();
      } catch (err) {
        log.error({ err, chatId, taskId }, 'Error executing queued task');
      } finally {
        log.debug({ chatId, taskId }, 'Task execution finished');
      }
    })
    .finally(() => {
      // Clean up map key if no new tasks were appended to this promise chain
      if (chatQueues.get(chatId) === next) {
        chatQueues.delete(chatId);
        log.debug({ chatId }, 'Queue cleaned up from memory');
      }
    });

  chatQueues.set(chatId, next);
  return next;
};
