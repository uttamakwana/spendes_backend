import mongoose from 'mongoose';
import { config } from '../config';
import { createLogger } from '../logger';
import { seedCategories } from '../modules/categories/categories.seed';
import { connectDatabase, disconnectDatabase } from './connection';
import { guardProduction, isApply, redactUri } from './maintenance.shared';
import './models.registry'; // registers every model so we can enumerate them

const logger = createLogger('db:reset');

/**
 * Wipes all transactional / user-generated data so you can start a clean test
 * run, while keeping the things you don't want to recreate by hand:
 *
 *   • `users`     — accounts stay signed up (no re-OTP every time)
 *   • `categories`— seeded reference data (you asked to never lose these)
 *   • `waitlist`  — marketing signups from the landing page
 *
 * Everything else (expenses, income, budgets, emis, goals, investments, groups,
 * splits, settlements, notifications, push tokens, otp codes) is cleared.
 *
 * Safe by default: a DRY RUN that only reports counts. Pass `--yes` to delete.
 *   npm run db:reset            # preview
 *   npm run db:reset -- --yes   # actually wipe
 */
const PRESERVE = new Set(['users', 'categories', 'waitlist']);

async function main(): Promise<void> {
  guardProduction(logger);
  const apply = isApply();

  await connectDatabase();
  try {
    logger.info(`Target: db "${mongoose.connection.name}" @ ${redactUri(config.database.uri)}`);
    logger.info(
      apply
        ? 'Mode:   APPLY — matching data WILL be deleted'
        : 'Mode:   DRY RUN — nothing deleted (re-run with --yes to apply)',
    );
    logger.info(`Keeping: ${[...PRESERVE].join(', ')}`);

    let total = 0;
    for (const m of Object.values(mongoose.models)) {
      const name = m.collection.collectionName;
      if (PRESERVE.has(name)) {
        logger.info(`  • keep   ${name.padEnd(16)} ${await m.estimatedDocumentCount()} kept`);
        continue;
      }
      if (apply) {
        const { deletedCount } = await m.deleteMany({});
        total += deletedCount ?? 0;
        logger.info(`  • clear  ${name.padEnd(16)} ${deletedCount ?? 0} deleted`);
      } else {
        const would = await m.estimatedDocumentCount();
        total += would;
        logger.info(`  • clear  ${name.padEnd(16)} ${would} would be deleted`);
      }
    }

    if (apply) {
      // Categories are preserved, but make sure the defaults exist even on a fresh DB.
      await seedCategories();
      logger.info(
        `✅ Reset complete — ${total} document(s) deleted. Users, categories & waitlist kept.`,
      );
    } else {
      logger.info(
        `Dry run complete — ${total} document(s) would be deleted. Re-run with --yes to apply.`,
      );
    }
  } finally {
    await disconnectDatabase();
  }
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Reset failed');
  process.exit(1);
});
