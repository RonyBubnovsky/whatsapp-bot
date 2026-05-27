// ============================================================
// utils/messageFilter.ts - Detects non-content WhatsApp messages
// that must NOT trigger automated replies.
//
// Baileys exposes several wrappers for protocol-level messages
// (edits, reactions, deletes, key rotations). These wrappers can
// appear at the top level, or nested inside future-proof
// containers such as ephemeralMessage, viewOnceMessage, etc.
//
// Without a recursive check, an edit delivered as
//   { editedMessage: { message: { conversation: "new text" } } }
// looks like a regular text message and the rule fires again on
// every edit. This file centralises the detection logic so the
// connection layer can short-circuit before enqueuing work.
// ============================================================

import { proto } from '@whiskeysockets/baileys';

// Max depth to unwrap future-proof containers. WhatsApp realistically
// never nests these more than a couple of layers; the limit matches
// Baileys' own normalizeMessageContent guard against pathological input.
const MAX_UNWRAP_DEPTH = 5;

/**
 * Unwraps one layer of Baileys' future-proof message containers.
 * Returns the inner message, or undefined when the input is not a
 * known wrapper.
 */
const unwrapOnce = (
  m: proto.IMessage | null | undefined
): proto.IMessage | null | undefined => {
  if (!m) return undefined;
  return (
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessageV2Extension?.message ||
    m.documentWithCaptionMessage?.message ||
    undefined
  );
};

/**
 * Returns true when the message is a protocol-only payload that has
 * no fresh user-visible content the bot should react to. This covers:
 *   - Message edits (protocolMessage type MESSAGE_EDIT, and the
 *     editedMessage wrapper used as a future-proof container)
 *   - All other protocolMessage types (revokes, key rotations, etc.)
 *   - Reactions and poll updates
 * The check recurses through future-proof wrappers so an edit
 * delivered inside, e.g., an ephemeralMessage is still detected.
 *
 * Input: the Baileys IMessage payload (may be null/undefined).
 * Output: true when the upsert should be ignored.
 */
export const isNonContentMessage = (
  message: proto.IMessage | null | undefined
): boolean => {
  let current: proto.IMessage | null | undefined = message;
  for (let depth = 0; depth <= MAX_UNWRAP_DEPTH; depth++) {
    if (!current) return false;

    // Edits arrive either as a protocolMessage of type MESSAGE_EDIT
    // or as a top-level editedMessage wrapper. Both must be skipped.
    if (current.editedMessage) return true;
    if (current.protocolMessage) return true;

    // Reactions and poll updates carry no user-authored text.
    if (current.reactionMessage) return true;
    if (current.pollUpdateMessage) return true;

    const inner = unwrapOnce(current);
    if (!inner) return false;
    current = inner;
  }
  return false;
};
