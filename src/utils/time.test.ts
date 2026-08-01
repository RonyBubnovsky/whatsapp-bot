// ============================================================
// utils/time.test.ts - Unit tests for isConnectionStalled.
//
// Guards the watchdog decision in health.ts. Getting the null
// case wrong would kill a perfectly healthy bot on a timer.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { isConnectionStalled } from './time';

const THRESHOLD = 10 * 60 * 1000;
const NOW = 1_780_000_000_000;

test('never stalled while the connection is open', () => {
  assert.equal(isConnectionStalled(null, NOW, THRESHOLD), false);
});

test('not stalled before the threshold elapses', () => {
  assert.equal(isConnectionStalled(NOW - THRESHOLD + 1, NOW, THRESHOLD), false);
});

test('stalled once the threshold is reached', () => {
  assert.equal(isConnectionStalled(NOW - THRESHOLD, NOW, THRESHOLD), true);
});

test('stalled well past the threshold', () => {
  assert.equal(isConnectionStalled(NOW - THRESHOLD * 100, NOW, THRESHOLD), true);
});
