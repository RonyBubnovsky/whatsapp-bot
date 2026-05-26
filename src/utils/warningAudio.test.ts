// ============================================================
// utils/warningAudio.test.ts - Unit tests for warning audio safety checks.
//
// These tests guard against sending OGG Vorbis files as WhatsApp voice notes.
// Mobile WhatsApp clients expect OGG Opus for push-to-talk audio.
// ============================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  describeOggAudio,
  getWarningAudioMessage,
  isOggOpusAudio,
} from './warningAudio';

const OGG_OPUS_BYTES = Buffer.concat([
  Buffer.from('OggS', 'ascii'),
  Buffer.from([0, 1, 2, 3]),
  Buffer.from('OpusHead', 'ascii'),
]);

const OGG_VORBIS_BYTES = Buffer.concat([
  Buffer.from('OggS', 'ascii'),
  Buffer.from([0, 1, 2, 3]),
  Buffer.from('vorbis', 'ascii'),
]);

/**
 * Creates an isolated temporary folder for one test case.
 * Input: none.
 * Output: the absolute path to a folder that can hold test audio files.
 */
const createTempAppRoot = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'warning-audio-'));
};

test('isOggOpusAudio accepts OGG files with an Opus header', () => {
  assert.equal(isOggOpusAudio(OGG_OPUS_BYTES), true);
  assert.equal(describeOggAudio(OGG_OPUS_BYTES), 'opus');
});

test('isOggOpusAudio rejects OGG Vorbis files', () => {
  assert.equal(isOggOpusAudio(OGG_VORBIS_BYTES), false);
  assert.equal(describeOggAudio(OGG_VORBIS_BYTES), 'vorbis');
});

test('getWarningAudioMessage skips Vorbis OGG and falls back to MP4', () => {
  const appRoot = createTempAppRoot();
  fs.writeFileSync(path.join(appRoot, 'chat_response.ogg'), OGG_VORBIS_BYTES);
  fs.writeFileSync(path.join(appRoot, 'chat_response.mp4'), Buffer.from('mp4-audio'));

  const result = getWarningAudioMessage(appRoot);

  assert.equal(result.status, 'found');
  assert.equal(result.status === 'found' ? result.fileName : undefined, 'chat_response.mp4');
  assert.deepEqual(result.skipped, [
    {
      fileName: 'chat_response.ogg',
      reason: 'Expected OGG Opus for WhatsApp voice note, found vorbis.',
    },
  ]);
});

test('getWarningAudioMessage returns OGG Opus as a push-to-talk message', () => {
  const appRoot = createTempAppRoot();
  fs.writeFileSync(path.join(appRoot, 'chat_response.ogg'), OGG_OPUS_BYTES);

  const result = getWarningAudioMessage(appRoot);

  assert.equal(result.status, 'found');
  assert.equal(result.status === 'found' ? result.fileName : undefined, 'chat_response.ogg');
  assert.equal(result.status === 'found' ? result.message.mimetype : undefined, 'audio/ogg; codecs=opus');
  assert.equal(result.status === 'found' ? result.message.ptt : undefined, true);
});
