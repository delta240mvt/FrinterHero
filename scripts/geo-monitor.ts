import dotenv from 'dotenv';
import { runGeoMonitorJob } from '../src/lib/jobs/geo';

dotenv.config({ path: '.env.local' });

runGeoMonitorJob().catch((error) => {
  console.error('[GEO] Fatal error:', error);
  process.exit(1);
});
