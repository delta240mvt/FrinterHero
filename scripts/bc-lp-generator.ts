import * as dotenv from 'dotenv';
import * as path from 'path';
import { runBcGenerateJob } from '../src/lib/jobs/bc-generate';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

runBcGenerateJob({
  projectId: parseInt(process.env.BC_PROJECT_ID || '0', 10),
  iterationId: parseInt(process.env.BC_ITERATION_ID || '0', 10) || null,
})
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch((error: any) => {
    console.error('[FATAL]', error.message);
    process.exit(1);
  });
