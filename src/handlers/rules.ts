// ============================================================
// handlers/rules.ts - This is where you define all bot rules.
//
// Each rule has:
//   name      - just a label for logging
//   condition - a function that returns true when the rule should fire
//   response  - a function that returns the text to send back
//
// To add a new behavior in the future, just add a new object
// to the rules array below.
// ============================================================

import { proto, jidNormalizedUser } from '@whiskeysockets/baileys';
import { config } from '../config';

export interface Rule {
  name: string;
  condition: (msg: proto.IWebMessageInfo) => boolean;
  response: (msg: proto.IWebMessageInfo) => string;
}

export const rules: Rule[] = [
  {
    name: 'group-sender-reply',

    // Fires when the target person sends a message in the target group
    condition: (msg) => {
      const isGroup = msg.key.remoteJid === config.targetGroupId;
      const targetSenderJid = `${config.targetSenderNumber}@s.whatsapp.net`;
      const isTargetSender = msg.key.participant && 
        (jidNormalizedUser(msg.key.participant) === jidNormalizedUser(targetSenderJid) ||
         (config.targetSenderLid && jidNormalizedUser(msg.key.participant) === jidNormalizedUser(config.targetSenderLid)));
      return !!(isGroup && isTargetSender && !msg.key.fromMe);
    },

    response: () => config.chatResponse,
  },
];