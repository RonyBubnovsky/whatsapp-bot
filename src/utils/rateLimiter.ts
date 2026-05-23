// ============================================================
// utils/rateLimiter.ts - Per-sender rate limiter.
//
// Behavior:
//   Messages 1 to maxMessages: allowed, bot replies normally
//   Message maxMessages+1 exactly: allowed, but returns a warning message
//   Messages beyond that: blocked silently until the window resets
// ============================================================

import { createLogger } from '../logger';

const log = createLogger('rate-limiter');

interface RateLimiterOptions {
  // Max messages to reply to normally per sender within the window
  maxMessages: number;
  // Time window in milliseconds (e.g. 3600000 = 1 hour)
  windowMs: number;
  // Message to send on the first blocked attempt
  limitReachedMessage: string;
}

export type RateLimitResult =
  | { status: 'allowed' }
  | { status: 'limit_reached' }  // exactly the first message over the limit - send warning
  | { status: 'blocked' };       // already warned, ignore silently

const TRACKING_WINDOW_MS = 3600000; // 1 hour

interface SenderRecord {
  count: number;
  windowStart: number;
  blockedUntil: number;
  warningSent: boolean;
}

export const createRateLimiter = (options: RateLimiterOptions) => {
  const { maxMessages, windowMs, limitReachedMessage } = options;

  const senders = new Map<string, SenderRecord>();

  const check = (senderId: string): RateLimitResult => {
    const now = Date.now();
    const record = senders.get(senderId);

    if (record) {
      // If currently blocked
      if (now < record.blockedUntil) {
        log.debug({ senderId, count: record.count }, 'Rate limit exceeded - ignoring');
        return { status: 'blocked' };
      }

      // If block expired - reset tracking
      if (record.blockedUntil > 0 && now >= record.blockedUntil) {
        record.count = 1;
        record.windowStart = now;
        record.blockedUntil = 0;
        record.warningSent = false;
        return { status: 'allowed' };
      }

      // If tracking window expired - reset tracking window
      if (now - record.windowStart > TRACKING_WINDOW_MS) {
        record.count = 1;
        record.windowStart = now;
        record.blockedUntil = 0;
        record.warningSent = false;
        return { status: 'allowed' };
      }

      record.count += 1;

      if (record.count <= maxMessages) {
        return { status: 'allowed' };
      }

      // Exceeded limit - block
      record.blockedUntil = now + windowMs; // Sleep for windowMs (e.g. 20000)

      if (!record.warningSent) {
        record.warningSent = true;
        log.warn({ senderId, count: record.count }, 'Rate limit reached - sending warning message');
        return { status: 'limit_reached' };
      }

      log.debug({ senderId, count: record.count }, 'Rate limit exceeded - ignoring');
      return { status: 'blocked' };
    }

    // New sender
    senders.set(senderId, {
      count: 1,
      windowStart: now,
      blockedUntil: 0,
      warningSent: false,
    });
    return { status: 'allowed' };
  };

  return { check, limitReachedMessage };
};