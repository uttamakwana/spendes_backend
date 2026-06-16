import mongoose from 'mongoose';
import { config } from '../config';
import { createLogger } from '../logger';
import { connectDatabase, disconnectDatabase } from './connection';
import { redactUri } from './maintenance.shared';
import './models.registry'; // registers every model so we can enumerate them

const logger = createLogger('db:stats');

/**
 * Read-only: prints a document count per collection (and a total). Handy for
 * sanity-checking before/after a reset or delete.
 *   npm run db:stats
 */
async function main(): Promise<void> {
  await connectDatabase();
  try {
    logger.info(`db "${mongoose.connection.name}" @ ${redactUri(config.database.uri)}`);

    const rows = await Promise.all(
      Object.values(mongoose.models).map(async (m) => ({
        name: m.collection.collectionName,
        count: await m.countDocuments({}),
      })),
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));

    let total = 0;
    for (const r of rows) {
      total += r.count;
      logger.info(`  ${r.name.padEnd(18)} ${r.count}`);
    }
    logger.info(`  ${'— total —'.padEnd(18)} ${total}`);
  } finally {
    await disconnectDatabase();
  }
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Stats failed');
  process.exit(1);
});
