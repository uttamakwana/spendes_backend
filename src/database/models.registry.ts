/**
 * One place that imports (and re-exports) every Mongoose model. Importing this
 * module registers all models on the connection, so maintenance scripts can
 * enumerate `mongoose.models` or address a specific collection without each
 * script repeating the full import list. Keep this in sync when a model is added.
 */
export { UserModel } from '../modules/users/users.model';
export { CategoryModel } from '../modules/categories/categories.model';
export { WaitlistEntryModel } from '../modules/waitlist/waitlist.model';
export { ExpenseModel } from '../modules/expenses/expenses.model';
export { IncomeModel } from '../modules/income/income.model';
export { BudgetModel } from '../modules/budgets/budgets.model';
export { EmiModel } from '../modules/emis/emis.model';
export { GoalModel } from '../modules/goals/goals.model';
export { InvestmentModel } from '../modules/investments/investments.model';
export { NotificationModel } from '../modules/notifications/notification.model';
export { PushTokenModel } from '../modules/push/push-token.model';
export { GroupModel } from '../modules/groups/groups.model';
export { GroupExpenseModel } from '../modules/splits/group-expense.model';
export { SettlementModel } from '../modules/splits/settlement.model';
export { OtpCodeModel } from '../modules/auth/otp/otp.model';
