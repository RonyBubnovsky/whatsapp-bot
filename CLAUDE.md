# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # ts-node src/index.ts with NODE_ENV=development (pretty logs)
npm run build    # tsc -> dist/
npm test         # builds first, then: node --test "dist/**/*.test.js"
npm start        # node dist/index.js (what PM2 runs in production)
```

Tests are `node:test` + `node:assert/strict`, compiled before running. To run one file:

```bash
npm run build && node --test dist/utils/messageFilter.test.js
# single case: add --test-name-pattern "skips top-level editedMessage wrapper"
```

Requires a `.env` (copy from `.env.example`). Missing/invalid `TARGET_SENDER_NUMBER` or malformed `TARGET_GROUP_ID` throws at import time in `src/config.ts`.

## Architecture

Single long-lived Node process holding a Baileys WhatsApp WebSocket. `src/index.ts` wires three things in order: global error handlers, HTTP health server, WhatsApp connection.

### Message pipeline

`connection.ts` (`messages.upsert`) → filter → `utils/queue.enqueue(chatId, ...)` → `handlers/messageHandler.handleMessage`.

Filtering is split deliberately: cheap/structural rejection happens in `connection.ts` before enqueueing (non-content payloads via `isNonContentMessage`, `fromMe`, wrong chat, and messages older than 10s to drop history sync on reconnect); behavioral rejection happens in `handleMessage` (sleep window, rules, rate limit).

`enqueue` serializes tasks per `chatId` by chaining promises in a `Map`, and deletes the map entry when the chain goes idle — so the 1–4s `humanDelay` never overlaps and replies stay ordered.

### Rule matching and the LID problem

`handlers/rules.ts` holds the rules array — add behavior by appending an object, nothing else registers rules. A rule fires on the first match and processing stops.

WhatsApp may deliver `key.participant` as either a phone JID (`…@s.whatsapp.net`) or a LID (`…@lid`). On `connection === 'open'`, `connection.ts` calls `sock.onWhatsApp()` and **mutates `config.targetSenderLid`** at runtime; the rule compares the participant against both forms. `config` is not frozen — this is the one field written after startup.

### Rate limiting

`createRateLimiter` returns a tri-state: `allowed` → normal reply, `limit_reached` → send warning **exactly once**, `blocked` → silent drop. Redis (`USE_REDIS=true`) is tried first and falls back to the in-memory `Map` on any error, so both code paths must stay behaviorally equivalent. In-memory records are pruned on a 1h `unref`'d interval.

### Warning audio

`utils/warningAudio.ts` looks for `chat_response.{ogg,mp4,wav}` in `process.cwd()` (gitignored, deployed by hand). OGG is only sent as a voice note if the bytes actually contain an Opus header — WhatsApp mobile rejects OGG Vorbis as malformed even though Web accepts it. Duration comes from the last OGG page's granule position ÷ 48000; without `seconds` mobile shows the note as malformed. No valid file → falls back to `RATE_LIMIT_MESSAGE` text.

### Health endpoint

`health.ts` **monkey-patches `console.error`** to catch libsignal `MessageCounterError` / `Failed to decrypt message` (Baileys writes those to stderr, not through our logger). `GET /health` with `Authorization: Bearer $HEALTH_TOKEN`: 200 healthy, 401 bad token, 503 socket not open, 500 decryption error — 500 is the signal for an external supervisor to wipe `auth_info/` and re-pair. Errors in the first 2 minutes are ignored (history sync noise); the flag self-clears after 5 quiet minutes.

### Reconnection

On `connection === 'close'` (anything but `loggedOut`), all listeners are removed from the dead socket before recursing into `connectToWhatsApp()` after 3s — skipping the removal leaks listeners across reconnects. `loggedOut` exits the process; `auth_info/` must be deleted and the QR rescanned.

## Conventions

- Every module gets `createLogger('module-name')`; pino pretty-prints in dev, JSON in production. Baileys' own logger is silenced.
- Sleep window (03:00–07:00 `Asia/Jerusalem`) is hardcoded in `utils/time.ts`, not env-driven.
- Files open with a `// ====` banner comment naming the file and its job; exported functions document Input/Output.
- `ponytail:` comments mark deliberate simplifications and name the upgrade path — read one before "fixing" the code under it.

## Deployment

Push to `main` touching `src/**`, `package.json`, `package-lock.json`, or `tsconfig.json` triggers `.github/workflows/deploy.yml`: SSH to an Oracle Cloud VM, `git pull && npm install && npm run build && pm2 restart whatsapp-bot`. No build/test gate runs in CI — verify locally before merging.
