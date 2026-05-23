# WhatsApp Auto-Reply Bot

This is a WhatsApp bot built with TypeScript and Baileys. 

## What it does

1. Connects to your WhatsApp account by showing a QR code in the terminal.
2. Monitors a specific group chat.
3. Automatically replies to a specific person in that group chat when they send a message.
4. Uses a random human-like delay (1-4 seconds) before replying.
5. Limits how many times it replies to the same person to prevent spam.
6. Sleeps between 03:00 and 07:00 local time (ignores all messages).


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
   * `LOG_LEVEL`: Log detail level (e.g., "debug" locally to see all messages, "info" on server).
   * `PORT`: The port the health check server runs on (defaults to `3000`).
   * `HEALTH_TOKEN`: Secure Bearer authorization token to protect the health check endpoint.

3. Run the bot in development mode:
   ```bash
   npm run dev
   ```

4. Scan the QR code:
   The bot will print a QR code in the terminal. Open WhatsApp on your phone, go to Linked Devices, and scan the QR code to connect the bot.

5. How to find the Group ID:
   * Leave `TARGET_GROUP_ID` empty in your `.env` file.
   * Run the bot and send a message in the target group chat from your phone.
   * Look at the terminal logs. You will see a line with `chatId` ending in `@g.us` (for example, `120363231234567890@g.us`).
   * Copy that group JID and paste it as `TARGET_GROUP_ID` in your `.env` file.
   * Restart the bot (press `Ctrl + C` and then run `npm run dev` again).

6. Build the bot:
   ```bash
   npm run build
   ```

## Health Check Server

The bot includes a built-in HTTP server to monitor its health. It exposes a GET `/health` endpoint:
* **Headers**: `Authorization: Bearer <HEALTH_TOKEN>`
* **Responses**:
  * `200 OK`: Bot is connected and healthy.
  * `401 Unauthorized`: Missing or incorrect Bearer token.
  * `503 Service Unavailable`: Bot is disconnected or connecting.
  * `500 Internal Server Error`: A decryption error occurred (e.g., keys out of sync). Use this to trigger automated session resets.

## Keeping the Bot Running

For the bot to always work, it must run continuously.
* **Locally**: Keep `npm run dev` running in your terminal.
* **Cloud**: Deploy to a persistent server.
  * **Do not use serverless (Vercel, Netlify, etc.)**: They terminate active processes, causing the WhatsApp WebSocket connection to be lost.
  * **Free hosting options**: Render (Web Service), Oracle Cloud Always Free Tier, etc.
  * **VPS hosting**: Buying a VPS (e.g., Hetzner, DigitalOcean) is a reliable option for persistent hosting.

## Rate Limiting & Redis Setup

The bot limits incoming messages per user to prevent spam. You can run this in-memory (default) or with Redis for persistence.

### Option A: In-Memory (No setup required)
By default, the rate limiter stores data in RAM. It automatically prunes expired records hourly to prevent memory leaks. Set `USE_REDIS=false` in `.env`.

### Option B: Redis (Recommended for production)
Stores rate-limiting state in Redis. If Redis goes down, the bot falls back gracefully to in-memory tracking.

#### How to install Redis on host VM (Ubuntu/Debian):
1. **Install Redis server**:
   ```bash
   sudo apt update
   sudo apt install redis-server -y
   ```
2. **Start and enable service**:
   ```bash
   sudo systemctl enable --now redis-server
   ```
3. **Verify Redis is running**:
   ```bash
   redis-cli ping
   # Output should be: PONG
   ```

#### Enable in configuration:
Set these values in your `.env` file:
```env
USE_REDIS=true
REDIS_URL=redis://localhost:6379
```