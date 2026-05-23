// ============================================================
// utils/rateLimiter.ts - Per-sender rate limiter.
//
// Behavior:
//   Messages 1 to maxMessages: allowed, bot replies normally
//   Message maxMessages+1 exactly: allowed, but returns a warning message
//   Messages beyond that: blocked silently until the window resets
// ============================================================

import { createClient } from 'redis';
import { createLogger } from '../logger';
import { config } from '../config';

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

// Redis Client Setup
type RedisClientType = ReturnType<typeof createClient>;
let redisClient: RedisClientType | null = null;
let isRedisConnected = false;

if (config.useRedis) {
  redisClient = createClient({
    url: config.redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 100, 3000);
        log.warn({ retries, delay }, 'Redis reconnecting...');
        return delay;
      },
    },
  });

  redisClient.on('connect', () => {
    log.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    isRedisConnected = true;
    log.info('Redis client ready');
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    log.error({ err }, 'Redis client error');
  });

  redisClient.on('end', () => {
    isRedisConnected = false;
    log.warn('Redis connection closed');
  });

  redisClient.connect().catch((err) => {
    log.error({ err }, 'Failed to connect to Redis initially');
  });
}

export const createRateLimiter = (options: RateLimiterOptions) => {
  const { maxMessages, windowMs, limitReachedMessage } = options;

  const senders = new Map<string, SenderRecord>();

  // Periodic cleanup of inactive in-memory records to prevent memory leak
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    let pruneCount = 0;
    for (const [senderId, record] of senders.entries()) {
      const windowExpired = now - record.windowStart > TRACKING_WINDOW_MS;
      const blockExpired = now >= record.blockedUntil;
      if (windowExpired && blockExpired) {
        senders.delete(senderId);
        pruneCount++;
      }
    }
    if (pruneCount > 0) {
      log.info({ pruned: pruneCount }, 'Pruned expired in-memory rate limiter records');
    }
  }, TRACKING_WINDOW_MS);

  if (typeof pruneInterval.unref === 'function') {
    pruneInterval.unref();
  }

  const check = async (senderId: string): Promise<RateLimitResult> => {
    // 1. Try Redis rate limiter if enabled and connected
    if (redisClient && isRedisConnected) {
      try {
        const countKey = `rl:${senderId}:count`;
        const warnKey = `rl:${senderId}:warned`;

        // Increment count atomically
        const count = await redisClient.incr(countKey);

        // If new window, set the TTL
        if (count === 1) {
          await redisClient.pExpire(countKey, windowMs);
        }

        if (count <= maxMessages) {
          return { status: 'allowed' };
        }

        // Exceeded limit - check remaining time in the window
        const ttl = await redisClient.pTTL(countKey);
        const warningTtl = ttl > 0 ? ttl : windowMs;

        // Atomically check and set warning flag
        const warningSet = await redisClient.set(warnKey, '1', {
          NX: true,
          PX: warningTtl,
        });

        if (warningSet === 'OK') {
          log.warn({ senderId, count }, 'Rate limit reached - sending warning message (Redis)');
          return { status: 'limit_reached' };
        }

        log.debug({ senderId, count }, 'Rate limit exceeded - ignoring (Redis)');
        return { status: 'blocked' };
      } catch (err) {
        log.error({ err, senderId }, 'Redis rate limit check failed - falling back to in-memory');
      }
    }

    // 2. In-memory fallback
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
      record.blockedUntil = now + windowMs;

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