// ============================================================
// utils/warningAudio.ts - Finds a mobile-safe warning audio file.
//
// WhatsApp mobile clients are stricter than WhatsApp Web about voice notes.
// A push-to-talk voice note must be OGG with Opus audio. This helper prevents
// the bot from sending a mismatched OGG file that mobile clients may reject as
// malformed.
// ============================================================

import fs from 'fs';
import path from 'path';

/**
 * Describes an audio message that is safe to pass to Baileys sendMessage.
 * Input: none directly; values are built from an existing file on disk.
 * Output: a typed message payload plus metadata for logging.
 */
export interface WarningAudioMessage {
  audio: Buffer;
  mimetype: string;
  ptt?: boolean;
  // Play length in whole seconds. WhatsApp mobile reads this off the message;
  // without it a voice note plays on WhatsApp Web but shows "malformed" on phones.
  seconds?: number;
}

/**
 * Describes a skipped warning audio file and why it was not sent.
 * Input: none directly; values are created while checking candidate files.
 * Output: a simple object that can be written to logs.
 */
export interface SkippedWarningAudio {
  fileName: string;
  reason: string;
}

/**
 * Represents the result of searching for a warning audio file.
 * Input: none directly; values are returned by getWarningAudioMessage.
 * Output: either a sendable audio message or missing with skip reasons.
 */
export type WarningAudioResult =
  | {
      status: 'found';
      fileName: string;
      format: string;
      message: WarningAudioMessage;
      skipped: SkippedWarningAudio[];
    }
  | {
      status: 'missing';
      skipped: SkippedWarningAudio[];
    };

/**
 * Stores the send rules for one warning audio candidate.
 * Input: fileName is resolved inside the app root; MIME and ptt are sent to WhatsApp.
 * Output: used internally to build a WarningAudioResult.
 */
interface WarningAudioCandidate {
  fileName: string;
  format: string;
  mimetype: string;
  ptt?: boolean;
  requiresOpusOgg: boolean;
}

// Searched as strings, not byte buffers: Buffer.includes/lastIndexOf accept a
// string in every @types/node version, sidestepping the Buffer vs
// Uint8Array<ArrayBuffer> variance mismatch between editor and CLI type defs.
const OGG_MAGIC = 'OggS';
const OPUS_HEAD_MARKER = 'OpusHead';
const VORBIS_MARKER = 'vorbis';

const WARNING_AUDIO_CANDIDATES: WarningAudioCandidate[] = [
  {
    fileName: 'chat_response.ogg',
    format: 'ogg-opus',
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
    requiresOpusOgg: true,
  },
  {
    fileName: 'chat_response.mp4',
    format: 'mp4',
    mimetype: 'audio/mp4',
    requiresOpusOgg: false,
  },
  {
    fileName: 'chat_response.wav',
    format: 'wav',
    mimetype: 'audio/wav',
    requiresOpusOgg: false,
  },
];

/**
 * Checks whether a buffer contains an OGG Opus audio stream.
 * Input: the file bytes from an audio candidate.
 * Output: true when the bytes look like an OGG container with an Opus header.
 */
export const isOggOpusAudio = (audio: Buffer): boolean => {
  return audio.subarray(0, OGG_MAGIC.length).toString('latin1') === OGG_MAGIC &&
    audio.includes(OPUS_HEAD_MARKER);
};

/**
 * Explains the likely codec inside an OGG file for logs and tests.
 * Input: the file bytes from an OGG audio candidate.
 * Output: a short codec label that is safe to write to logs.
 */
export const describeOggAudio = (audio: Buffer): 'opus' | 'vorbis' | 'unknown' | 'not-ogg' => {
  if (audio.subarray(0, OGG_MAGIC.length).toString('latin1') !== OGG_MAGIC) {
    return 'not-ogg';
  }

  if (audio.includes(OPUS_HEAD_MARKER)) {
    return 'opus';
  }

  if (audio.includes(VORBIS_MARKER)) {
    return 'vorbis';
  }

  return 'unknown';
};

/**
 * Reads the play length of an OGG Opus voice note in whole seconds.
 * Input: the file bytes of an OGG Opus audio file.
 * Output: duration in seconds, or 0 when it cannot be read.
 *
 * How: Opus always clocks its samples at 48000 Hz. The last OGG page carries a
 * "granule position" = total sample count, so seconds = samples / 48000.
 * ponytail: reads only the last page's granulepos; fine for one short clip.
 * If you ever send long or chained-stream audio, parse every page instead.
 */
export const getOggOpusDurationSeconds = (audio: Buffer): number => {
  const lastPage = audio.lastIndexOf('OggS');
  if (lastPage < 0 || lastPage + 14 > audio.length) {
    return 0;
  }

  const granulePosition = audio.readBigUInt64LE(lastPage + 6);
  const seconds = Number(granulePosition) / 48000;

  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
};

/**
 * Finds the first warning audio file that should be safe to send to WhatsApp.
 * Input: appRoot is the folder where chat_response files are stored.
 * Output: a found audio message, or missing with skip reasons for logging.
 */
export const getWarningAudioMessage = (appRoot: string): WarningAudioResult => {
  const skipped: SkippedWarningAudio[] = [];

  for (const candidate of WARNING_AUDIO_CANDIDATES) {
    const filePath = path.join(appRoot, candidate.fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const audio = fs.readFileSync(filePath);

      if (candidate.requiresOpusOgg && !isOggOpusAudio(audio)) {
        const codec = describeOggAudio(audio);
        skipped.push({
          fileName: candidate.fileName,
          reason: `Expected OGG Opus for WhatsApp voice note, found ${codec}.`,
        });
        continue;
      }

      const seconds = candidate.requiresOpusOgg ? getOggOpusDurationSeconds(audio) : 0;

      return {
        status: 'found',
        fileName: candidate.fileName,
        format: candidate.format,
        message: {
          audio,
          mimetype: candidate.mimetype,
          ...(candidate.ptt === undefined ? {} : { ptt: candidate.ptt }),
          ...(seconds > 0 ? { seconds } : {}),
        },
        skipped,
      };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unknown read error.';
      skipped.push({
        fileName: candidate.fileName,
        reason: `Could not read warning audio file: ${reason}`,
      });
    }
  }

  return {
    status: 'missing',
    skipped,
  };
};
