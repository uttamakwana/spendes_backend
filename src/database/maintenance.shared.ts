import type { Logger } from 'pino';
import { config } from '../config';

/**
 * Shared helpers for the destructive maintenance scripts (reset / delete-user).
 * They default to a dry run and refuse to touch production, so a stray command
 * can't wipe real data.
 */

/** True only when the operator explicitly opts in with `--yes` (or `--force`). */
export function isApply(argv: string[] = process.argv): boolean {
  return argv.includes('--yes') || argv.includes('--force');
}

/** Strip any `user:pass@` credentials from a Mongo URI so logs never leak them. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/[^@/]*@/, '//');
}

/** Hard-stop if pointed at a production database — these scripts delete data. */
export function guardProduction(logger: Logger): void {
  if (config.app.isProduction) {
    logger.fatal('Refusing to run a destructive script with NODE_ENV=production. Aborting.');
    process.exit(1);
  }
}
