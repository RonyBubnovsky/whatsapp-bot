# WhatsApp Auto-Reply Bot

This is a WhatsApp bot built with TypeScript and Baileys. 

## What it does

1. Connects to your WhatsApp account by showing a QR code in the terminal.
2. Monitors a specific group chat.
3. Automatically replies to a specific person in that group chat when they send a message.
4. Uses a random human-like delay (1-4 seconds) before replying.
5. Limits how many times it replies to the same person to prevent spam.

## How to setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configuration:
   Copy `.env.example` to `.env` and fill in the values:
   * `TARGET_SENDER_NUMBER`: The phone number of the person you want to reply to.
   * `TARGET_GROUP_ID`: The ID of the group chat. Leave this empty at first. Run the bot, send a message in the group, and copy the group ID from the terminal logs.
   * `CHAT_RESPONSE`: The message the bot sends.
   * `RATE_LIMIT_MAX`: How many messages the person can send in 1 hour before getting blocked.
   * `RATE_LIMIT_WINDOW_MS`: How long (in milliseconds) the person is blocked for when they exceed the limit.

3. Run the bot in development mode:
   ```bash
   npm run dev
   ```

4. Build the bot:
   ```bash
   npm run build
   ```