// ============================================================
// utils/messageFilter.test.ts - Unit tests for isNonContentMessage.
//
// Guards against regressions where a WhatsApp edit (or other
// protocol-only payload) slips past the upsert filter and causes
// the bot to reply on every edit of a target sender's message.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { proto } from '@whiskeysockets/baileys';
import { isNonContentMessage } from './messageFilter';

test('returns false for a plain text message', () => {
  const msg: proto.IMessage = { conversation: 'hello' };
  assert.equal(isNonContentMessage(msg), false);
});

test('returns false for an extendedTextMessage', () => {
  const msg: proto.IMessage = { extendedTextMessage: { text: 'hi' } };
  assert.equal(isNonContentMessage(msg), false);
});

test('skips top-level protocolMessage (MESSAGE_EDIT)', () => {
  const msg: proto.IMessage = {
    protocolMessage: {
      type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
      editedMessage: { conversation: 'new text' },
    },
  };
  assert.equal(isNonContentMessage(msg), true);
});

test('skips top-level editedMessage wrapper', () => {
  const msg: proto.IMessage = {
    editedMessage: { message: { conversation: 'new text' } },
  };
  assert.equal(isNonContentMessage(msg), true);
});

test('skips an edit nested inside an ephemeralMessage', () => {
  const msg: proto.IMessage = {
    ephemeralMessage: {
      message: { editedMessage: { message: { conversation: 'edited' } } },
    },
  };
  assert.equal(isNonContentMessage(msg), true);
});

test('skips a protocolMessage nested inside viewOnceMessage', () => {
  const msg: proto.IMessage = {
    viewOnceMessage: {
      message: {
        protocolMessage: {
          type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
        },
      },
    },
  };
  assert.equal(isNonContentMessage(msg), true);
});

test('skips reactionMessage', () => {
  const msg: proto.IMessage = {
    reactionMessage: { key: { id: 'x' }, text: '👍' },
  };
  assert.equal(isNonContentMessage(msg), true);
});

test('skips pollUpdateMessage', () => {
  const msg: proto.IMessage = {
    pollUpdateMessage: { pollCreationMessageKey: { id: 'x' } },
  };
  assert.equal(isNonContentMessage(msg), true);
});

test('returns false for null and undefined', () => {
  assert.equal(isNonContentMessage(null), false);
  assert.equal(isNonContentMessage(undefined), false);
});

test('returns false for a regular ephemeralMessage with text', () => {
  const msg: proto.IMessage = {
    ephemeralMessage: { message: { conversation: 'ephemeral hi' } },
  };
  assert.equal(isNonContentMessage(msg), false);
});
