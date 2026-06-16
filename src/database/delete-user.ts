import mongoose from 'mongoose';
import { config } from '../config';
import { createLogger } from '../logger';
import { cascadeDeleteUser, resolveUserByIdentifier } from '../modules/users/user-cascade';
import { connectDatabase, disconnectDatabase } from './connection';
import { guardProduction, isApply, redactUri } from './maintenance.shared';
import './models.registry';

const logger = createLogger('db:delete-user');

/**
 * Deletes one user and everything tied to them (see `cascadeDeleteUser` for the
 * exact rules — categories are never touched). Use `db:reset` to wipe everyone.
 *
 * Accepts a 24-char user id OR a phone number. Dry run by default.
 *   npm run db:delete-user -- 665f0c…                # preview by id
 *   npm run db:delete-user -- 9876543210 --yes       # delete by phone
 *   npm run db:delete-user -- 9876543210 --yes --keep-user   # wipe data, keep login
 */
async function main(): Promise<void> {
  guardProduction(logger);

  const identifier = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const keepUser = process.argv.includes('--keep-user');
  const apply = isApply();

  if (!identifier) {
    logger.fatal('Usage: npm run db:delete-user -- <userId|phone> [--yes] [--keep-user]');
    process.exit(1);
  }

  await connectDatabase();
  try {
    const user = await resolveUserByIdentifier(identifier);
    if (!user) {
      logger.error(`No user matched "${identifier}". Pass the 24-char id or the 10-digit phone.`);
      return;
    }

    logger.info(`Target: db "${mongoose.connection.name}" @ ${redactUri(config.database.uri)}`);
    logger.info(
      `User:   ${user.firstName} ${user.lastName} · ${user.dialCode} ${user.phoneNumber} · ${user._id.toString()}`,
    );
    logger.info(
      apply
        ? 'Mode:   APPLY — data WILL be deleted'
        : 'Mode:   DRY RUN — re-run with --yes to apply',
    );

    const { steps, total } = await cascadeDeleteUser(user, { apply, keepUser });
    for (const s of steps) {
      logger.info(
        `  • ${s.label.padEnd(22)} ${s.count} ${apply ? 'affected' : 'would be affected'}`,
      );
    }

    logger.info(
      apply
        ? `✅ Done — removed ${total} document(s) for ${user.phoneNumber}. Categories untouched.`
        : `Dry run — ${total} document(s) would be removed. Re-run with --yes to apply.`,
    );
  } finally {
    await disconnectDatabase();
  }
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Delete-user failed');
  process.exit(1);
});
