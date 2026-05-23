// ============================================================
// utils/delay.ts - Adds a human-like random delay
// before the bot sends a reply, so it does not look like
// an instant robot response
// ============================================================

export const humanDelay = (minMs = 1000, maxMs = 4000): Promise<void> => {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
};