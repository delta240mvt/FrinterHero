import * as dotenv from 'dotenv';
import * as path from 'path';
import { runBcSelectorJob } from '../src/lib/jobs/bc-selector';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

runBcSelectorJob({
  projectId: parseInt(process.env.BC_PROJECT_ID || '0', 10),
  iterationId: parseInt(process.env.BC_ITERATION_ID || '0', 10),
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
