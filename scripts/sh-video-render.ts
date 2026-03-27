import * as dotenv from 'dotenv';
import * as path from 'path';
import { runShVideoJob } from '../src/lib/jobs/sh-video';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

runShVideoJob({
  briefId: parseInt(process.env.SH_BRIEF_ID || '0', 10),
  copyId: parseInt(process.env.SH_COPY_ID || '0', 10),
  siteId: parseInt(process.env.SITE_ID || '0', 10) || null,
  avatarUrl: process.env.SH_AVATAR_URL || '',
  videoModel: process.env.SH_VIDEO_MODEL || 'wan-2.2-ultra-fast',
  voiceId: process.env.SH_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
})
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch((error: any) => {
    process.stdout.write(`SH_ERROR:${error.message ?? String(error)}\n`);
    process.exit(1);
  });
