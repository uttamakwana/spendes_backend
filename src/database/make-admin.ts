import { Role } from '../common/enums/role';
import { createLogger } from '../logger';
import { resolveUserByIdentifier } from '../modules/users/user-cascade';
import { connectDatabase, disconnectDatabase } from './connection';
import './models.registry';

const logger = createLogger('db:make-admin');

/**
 * Promotes (or demotes) a user to the `admin` role so they can sign into the admin
 * panel. Accepts a 24-char user id or a phone number.
 *
 *   npm run db:make-admin -- 9876543210            # grant admin
 *   npm run db:make-admin -- 9876543210 --remove   # revoke admin
 */
async function main(): Promise<void> {
  const identifier = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const remove = process.argv.includes('--remove');

  if (!identifier) {
    logger.fatal('Usage: npm run db:make-admin -- <userId|phone> [--remove]');
    process.exit(1);
  }

  await connectDatabase();
  try {
    const user = await resolveUserByIdentifier(identifier);
    if (!user) {
      logger.error(`No user matched "${identifier}". Pass the 24-char id or the 10-digit phone.`);
      return;
    }

    const isAdmin = user.roles.includes(Role.Admin);
    if (remove) {
      if (!isAdmin) {
        logger.info(`${user.phoneNumber} is not an admin — nothing to do.`);
        return;
      }
      user.roles = user.roles.filter((r) => r !== Role.Admin);
    } else {
      if (isAdmin) {
        logger.info(`${user.phoneNumber} is already an admin — nothing to do.`);
        return;
      }
      user.roles = [...user.roles, Role.Admin];
    }

    await user.save();
    logger.info(
      `✅ ${user.firstName} ${user.lastName} (${user.dialCode} ${user.phoneNumber}) roles → [${user.roles.join(', ')}]`,
    );
  } finally {
    await disconnectDatabase();
  }
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'make-admin failed');
  process.exit(1);
});
