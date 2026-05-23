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
export const isSleepingTime = (startHour = 3, endHour = 7): boolean => {
  const currentHour = new Date().getHours();
  return currentHour >= startHour && currentHour < endHour;
};
