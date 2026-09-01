import type { AnyBulkWriteOperation, Types } from 'mongoose';
import { PaymentHandleType } from '../common/reference/countries';
import { createLogger } from '../logger';
import { UserModel } from '../modules/users/users.model';

const logger = createLogger('PaymentHandleMigration');

/**
 * Moves accounts created before Spendes went international onto the generalised
 * settle-up handle: `upiId: "name@bank"` becomes `paymentHandle: { type: 'upi',
 * value: "name@bank" }`, and the old field is dropped.
 *
 * Idempotent — it only touches documents that still carry `upiId` — so it is safe
 * to run on every boot alongside the category seeder, and safe to re-run after a
 * partial failure. Existing users keep being paid over UPI exactly as before; the
 * field simply learned to describe which rail it means.
 */
export async function migratePaymentHandles(): Promise<number> {
  const legacy = await UserModel.find(
    { upiId: { $exists: true, $ne: null } },
    { _id: 1, upiId: 1 },
  ).lean<{ _id: Types.ObjectId; upiId?: string }[]>();

  if (legacy.length === 0) {
    return 0;
  }

  const operations: AnyBulkWriteOperation[] = legacy.map((user) => {
    const value = user.upiId?.trim();
    return {
      updateOne: {
        filter: { _id: user._id },
        update: value
          ? {
              $set: { paymentHandle: { type: PaymentHandleType.Upi, value } },
              $unset: { upiId: '' },
            }
          : { $unset: { upiId: '' } },
      },
    };
  });

  const result = await UserModel.bulkWrite(operations);
  const migrated = result.modifiedCount ?? 0;
  logger.info(`Migrated ${migrated} user(s) from upiId to paymentHandle`);
  return migrated;
}
