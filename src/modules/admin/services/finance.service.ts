import type { Request } from 'express';
import type { FilterQuery, Model } from 'mongoose';
import { ExpenseSource } from '../../../common/enums/expense-source';
import { BadRequestException, NotFoundException } from '../../../common/errors/http-exception';
import type { PaginatedData } from '../../../common/types/api-response';
import {
  BudgetModel,
  EmiModel,
  ExpenseModel,
  GoalModel,
  GroupModel,
  IncomeModel,
  InvestmentModel,
} from '../../../database/models.registry';
import type { ExpenseDocument } from '../../expenses/expenses.model';
import type { IncomeDocument } from '../../income/income.model';
import {
  amountRange,
  byCurrencyStage,
  castIds,
  dateRange,
  escapeRegex,
  listWithUsers,
  toCurrencyTotals,
  withUsers,
  type CurrencyTotal,
} from '../admin.helpers';
import type { ListExpensesQuery, ListIncomeQuery, ListPlanningQuery } from '../admin.validation';
import { auditService } from '../audit/audit.service';

/** A page of records plus the totals of everything matching the filter (per currency). */
export interface ListWithTotals extends PaginatedData<Record<string, unknown>> {
  totals: CurrencyTotal[];
}

export type PlanningResource = 'budgets' | 'emis' | 'goals' | 'investments';

/** Which field each planning resource's `type` filter maps to, and what to total. */
const PLANNING: Record<
  PlanningResource,
  {
    model: Model<any>;
    /** Field the `type` filter narrows (null = the resource has no type). */
    typeField: string | null;
    amountField: string;
    search: string[];
  }
> = {
  budgets: {
    model: BudgetModel as never,
    typeField: 'period',
    amountField: '$amount',
    search: ['name', 'category'],
  },
  emis: {
    model: EmiModel as never,
    typeField: 'type',
    amountField: '$amount',
    search: ['name', 'category'],
  },
  goals: {
    model: GoalModel as never,
    typeField: null,
    amountField: '$targetAmount',
    search: ['name'],
  },
  investments: {
    model: InvestmentModel as never,
    typeField: 'type',
    amountField: '$currentValue',
    search: ['name', 'platform'],
  },
};

async function totals<T>(model: Model<T>, filter: FilterQuery<T>, field = '$amount') {
  return toCurrencyTotals(await model.aggregate([{ $match: filter }, byCurrencyStage(field)]));
}

/** Read-mostly access to every user's money records, for support and moderation. */
class AdminFinanceService {
  async listExpenses(query: ListExpensesQuery): Promise<ListWithTotals> {
    const filter: FilterQuery<ExpenseDocument> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.category) filter.category = new RegExp(`^${escapeRegex(query.category)}$`, 'i');
    if (query.source) filter.source = query.source;
    if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
    if (query.currency) filter.currency = query.currency;
    if (query.groupId) filter.groupId = query.groupId;
    const when = dateRange(query.from, query.to);
    if (when) filter.spentAt = when;
    const amount = amountRange(query.minAmount, query.maxAmount);
    if (amount) filter.amount = amount;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ description: rx }, { merchant: rx }, { notes: rx }, { tags: rx }];
    }
    const [page, sums] = await Promise.all([
      listWithUsers(ExpenseModel, filter, query, { spentAt: -1 }),
      totals(ExpenseModel, castIds(filter)),
    ]);
    return { ...page, totals: sums };
  }

  async getExpense(id: string) {
    const doc = await ExpenseModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Expense not found');
    const [row] = await withUsers([doc]);
    const group = doc.groupId
      ? await GroupModel.findById(doc.groupId).select('name kind').lean()
      : null;
    return {
      ...row,
      group: group ? { id: group._id.toString(), name: group.name, kind: group.kind } : null,
    };
  }

  async deleteExpense(req: Request, id: string): Promise<void> {
    const doc = await ExpenseModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Expense not found');
    if (doc.source === ExpenseSource.GroupShare) {
      // Shares are materialized from a group expense; deleting one alone would
      // desync the user's books from the group's. Moderate the group instead.
      throw new BadRequestException('This is a group share — manage it from its group');
    }
    await ExpenseModel.deleteOne({ _id: id });
    await auditService.record(req, {
      action: 'expense.delete',
      targetType: 'expense',
      targetId: id,
      summary: `Deleted expense ${doc.currency} ${doc.amount} (${doc.category})`,
      before: doc as unknown as Record<string, unknown>,
    });
  }

  async listIncome(query: ListIncomeQuery): Promise<ListWithTotals> {
    const filter: FilterQuery<IncomeDocument> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.category) filter.category = new RegExp(`^${escapeRegex(query.category)}$`, 'i');
    if (query.receivedVia) filter.receivedVia = query.receivedVia;
    if (query.currency) filter.currency = query.currency;
    if (query.isRecurring !== undefined) filter.isRecurring = query.isRecurring;
    const when = dateRange(query.from, query.to);
    if (when) filter.receivedAt = when;
    const amount = amountRange(query.minAmount, query.maxAmount);
    if (amount) filter.amount = amount;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ description: rx }, { source: rx }, { notes: rx }, { tags: rx }];
    }
    const [page, sums] = await Promise.all([
      listWithUsers(IncomeModel, filter, query, { receivedAt: -1 }),
      totals(IncomeModel, castIds(filter)),
    ]);
    return { ...page, totals: sums };
  }

  async deleteIncome(req: Request, id: string): Promise<void> {
    const doc = await IncomeModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Income not found');
    await auditService.record(req, {
      action: 'income.delete',
      targetType: 'income',
      targetId: id,
      summary: `Deleted income ${doc.currency} ${doc.amount} (${doc.category})`,
      before: doc as unknown as Record<string, unknown>,
    });
  }

  /** Budgets / EMIs / goals / investments share one list shape. */
  async listPlanning(
    resource: PlanningResource,
    query: ListPlanningQuery,
  ): Promise<ListWithTotals> {
    const spec = PLANNING[resource];
    const filter: Record<string, unknown> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.type && spec.typeField) filter[spec.typeField] = query.type;
    if (query.currency) filter.currency = query.currency;
    const when = dateRange(query.from, query.to);
    if (when) filter.createdAt = when;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = spec.search.map((f) => ({ [f]: rx }));
    }
    const [page, sums] = await Promise.all([
      listWithUsers(spec.model, filter, query, { createdAt: -1 }, { select: '-contributions' }),
      totals(spec.model, castIds(filter), spec.amountField),
    ]);
    return { ...page, totals: sums };
  }

  /** Module-level shape of the planning features (how people use them). */
  async planningStats() {
    const count = (model: Model<never>, field: string) =>
      model.aggregate<{ _id: string; count: number }>([
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
    const users = (model: Model<never>) => model.distinct('userId').then((ids) => ids.length);

    const [
      budgetPeriods,
      emiTypes,
      investmentTypes,
      budgetUsers,
      emiUsers,
      goalUsers,
      investmentUsers,
      goalsAchieved,
      activeSips,
    ] = await Promise.all([
      count(BudgetModel as never, 'period'),
      count(EmiModel as never, 'type'),
      count(InvestmentModel as never, 'type'),
      users(BudgetModel as never),
      users(EmiModel as never),
      users(GoalModel as never),
      users(InvestmentModel as never),
      GoalModel.countDocuments({ $expr: { $gte: ['$currentAmount', '$targetAmount'] } }),
      InvestmentModel.countDocuments({ 'sip.isActive': true }),
    ]);

    const kc = (rows: { _id: string; count: number }[]) =>
      rows.map((r) => ({ key: r._id ?? 'unknown', count: r.count }));
    return {
      budgets: { users: budgetUsers, byPeriod: kc(budgetPeriods) },
      emis: { users: emiUsers, byType: kc(emiTypes) },
      goals: { users: goalUsers, achieved: goalsAchieved },
      investments: { users: investmentUsers, byType: kc(investmentTypes), activeSips },
    };
  }
}

export const adminFinanceService = new AdminFinanceService();
