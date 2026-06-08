import { logger } from '../logger';
import { seedCategories } from '../modules/categories/categories.seed';
import { connectDatabase, disconnectDatabase } from './connection';

/**
 * Standalone database seeder (run via `npm run seed`). Connects, runs every seeder,
 * then disconnects. Each seeder is idempotent, so this is safe to run repeatedly.
 * The same seeders also run automatically on application startup (see `server.ts`).
 */
async function main(): Promise<void> {
  await connectDatabase();
  try {
    await seedCategories();
    logger.info('✅ Seeding complete');
  } finally {
    await disconnectDatabase();
  }
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Seeding failed');
  process.exit(1);
});
