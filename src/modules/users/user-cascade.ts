import { Types, type FilterQuery, type Model } from 'mongoose';
import {
  BudgetModel,
  EmiModel,
  ExpenseModel,
  GoalModel,
  GroupExpenseModel,
  GroupModel,
  IncomeModel,
  InvestmentModel,
  NotificationModel,
  OtpCodeModel,
  PushTokenModel,
  SettlementModel,
  UserModel,
} from '../../database/models.registry';

export interface CascadeStep {
  label: string;
  count: number;
}

export interface CascadeResult {
  steps: CascadeStep[];
  /** Total documents deleted (or that would be deleted in a dry run). */
  total: number;
}

export interface CascadeOptions {
  /** When false, only counts what WOULD be removed (dry run); nothing is deleted. */
  apply: boolean;
  /** Keep the account itself and wipe only the data attached to it. */
  keepUser?: boolean;
}

/**
 * Deletes a user and every record tied to them — the single source of truth shared
 * by the admin "delete user" endpoint and the `db:delete-user` CLI script.
 *
 *   • personal data (expenses, income, budgets, emis, goals, investments, push tokens)
 *   • notifications they received OR triggered
 *   • groups they OWN — torn down whole (group + its splits + settlements)
 *   • in groups owned by OTHERS — only the splits/settlements they authored; they're
 *     dropped from the member list but the shared group is kept
 *   • their otp codes, and finally the account (unless `keepUser`)
 *
 * Categories are never touched.
 */
export async function cascadeDeleteUser(
  user: { _id: Types.ObjectId; dialCode: string; phoneNumber: string },
  opts: CascadeOptions,
): Promise<CascadeResult> {
  const { apply, keepUser = false } = opts;
  const userId = user._id;
  const steps: CascadeStep[] = [];
  let total = 0;

  const ownedGroupIds = (await GroupModel.find({ createdBy: userId }).select('_id').lean()).map(
    (g) => g._id,
  );

  const wipe = async <T>(label: string, m: Model<T>, filter: FilterQuery<T>): Promise<void> => {
    const count = apply
      ? ((await m.deleteMany(filter)).deletedCount ?? 0)
      : await m.countDocuments(filter);
    steps.push({ label, count });
    total += count;
  };

  await wipe('expenses', ExpenseModel, { userId });
  await wipe('income', IncomeModel, { userId });
  await wipe('budgets', BudgetModel, { userId });
  await wipe('emis', EmiModel, { userId });
  await wipe('goals', GoalModel, { userId });
  await wipe('investments', InvestmentModel, { userId });
  await wipe('pushTokens', PushTokenModel, { userId });
  await wipe('notifications', NotificationModel, { $or: [{ userId }, { actorUserId: userId }] });
  await wipe('ownedGroupSplits', GroupExpenseModel, { groupId: { $in: ownedGroupIds } });
  await wipe('ownedGroupSettlements', SettlementModel, { groupId: { $in: ownedGroupIds } });
  await wipe('authoredSplits', GroupExpenseModel, {
    createdByUserId: userId,
    groupId: { $nin: ownedGroupIds },
  });
  await wipe('authoredSettlements', SettlementModel, {
    createdByUserId: userId,
    groupId: { $nin: ownedGroupIds },
  });
  await wipe('ownedGroups', GroupModel, { _id: { $in: ownedGroupIds } });
  await wipe('otpCodes', OtpCodeModel, { dialCode: user.dialCode, phoneNumber: user.phoneNumber });

  // Remove (don't delete) the user from groups owned by someone else.
  const leaveFilter: FilterQuery<unknown> = {
    'members.userId': userId,
    createdBy: { $ne: userId },
  };
  const leftGroups = apply
    ? ((await GroupModel.updateMany(leaveFilter, { $pull: { members: { userId } } }))
        .modifiedCount ?? 0)
    : await GroupModel.countDocuments(leaveFilter);
  steps.push({ label: 'leftOthersGroups', count: leftGroups });

  if (!keepUser) {
    if (apply) await UserModel.deleteOne({ _id: userId });
    steps.push({ label: 'userAccount', count: 1 });
    total += 1;
  }

  return { steps, total };
}

/** Resolves a user by a 24-char ObjectId or a phone number (last 10 digits). */
export async function resolveUserByIdentifier(identifier: string) {
  if (identifier.length === 24 && Types.ObjectId.isValid(identifier)) {
    const byId = await UserModel.findById(identifier);
    if (byId) return byId;
  }
  const digits = identifier.replace(/\D/g, '');
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  return UserModel.findOne({ phoneNumber: national });
}
