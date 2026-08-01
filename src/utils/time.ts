// ============================================================
// utils/time.ts - Time-related utility functions
// ============================================================

/**
 * Checks if the current local time falls within the sleep hour range.
 * 
 * @param startHour - The hour the bot starts sleeping (inclusive, 0-23)
 * @param endHour - The hour the bot wakes up (exclusive, 0-23)
 * @returns true if the bot should be sleeping, false otherwise
 */
/**
 * Decides whether the WhatsApp connection has been down long enough to give up.
 *
 * @param notOpenSince - epoch ms of when the connection stopped being open, or
 *                       null while it is open (never stalled)
 * @param now - current epoch ms
 * @param thresholdMs - how long a non-open connection is tolerated
 * @returns true when the process should restart itself
 */
export const isConnectionStalled = (
  notOpenSince: number | null,
  now: number,
  thresholdMs: number
): boolean => notOpenSince !== null && now - notOpenSince >= thresholdMs;

export const isSleepingTime = (startHour = 3, endHour = 7): boolean => {
  const currentHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10
  );
  return currentHour >= startHour && currentHour < endHour;
};
