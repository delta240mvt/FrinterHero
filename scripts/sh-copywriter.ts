import * as dotenv from 'dotenv';
import * as path from 'path';
import { runShCopyJob } from '../src/lib/jobs/sh-copy';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

runShCopyJob({
  briefId: parseInt(process.env.SH_BRIEF_ID || '0', 10),
  siteId: parseInt(process.env.SITE_ID || '0', 10) || null,
  model: process.env.SH_COPYWRITER_MODEL || 'claude-sonnet-4-6',
  thinkingBudget: process.env.SH_COPYWRITER_THINKING_BUDGET
    ? parseInt(process.env.SH_COPYWRITER_THINKING_BUDGET, 10)
    : undefined,
  brandVoiceFile: process.env.SH_BRAND_VOICE_FILE || '',
  viralEngineRuntime: process.env.SH_VIRAL_ENGINE_RUNTIME
    ? JSON.parse(process.env.SH_VIRAL_ENGINE_RUNTIME)
    : undefined,
})
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch((error: any) => {
    process.stderr.write(`SH_ERROR:${error.message}\n`);
    process.exit(1);
  });
