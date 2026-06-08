import type { AnyBulkWriteOperation } from 'mongoose';
import { CategoryType } from '../../common/enums/category-type';
import { createLogger } from '../../logger';
import { CategoryModel, type CategoryDocument } from './categories.model';

const logger = createLogger('CategorySeed');

/** A default category before its `type`/`sortOrder` are applied. `icon` names an Ionicons glyph. */
interface SeedDefinition {
  name: string;
  slug: string;
  icon: string;
  color: string;
}

/**
 * The default expense categories shipped with the app. Tuned for Indian personal
 * finance (rent, mobile/internet, loan & EMI, fuel…). `icon` values are Ionicons
 * names so the Expo app can render them without bundling extra assets.
 */
const EXPENSE_DEFAULTS: SeedDefinition[] = [
  { name: 'Food & Dining', slug: 'food-dining', icon: 'restaurant-outline', color: '#FF6B6B' },
  { name: 'Groceries', slug: 'groceries', icon: 'cart-outline', color: '#4ECDC4' },
  { name: 'Transport', slug: 'transport', icon: 'car-outline', color: '#45B7D1' },
  { name: 'Fuel', slug: 'fuel', icon: 'speedometer-outline', color: '#F0932B' },
  { name: 'Shopping', slug: 'shopping', icon: 'bag-handle-outline', color: '#F7B731' },
  { name: 'Bills & Utilities', slug: 'bills-utilities', icon: 'receipt-outline', color: '#5D5FEF' },
  { name: 'Rent & Housing', slug: 'rent-housing', icon: 'home-outline', color: '#A55EEA' },
  { name: 'Mobile & Internet', slug: 'mobile-internet', icon: 'wifi-outline', color: '#1289A7' },
  {
    name: 'Entertainment',
    slug: 'entertainment',
    icon: 'game-controller-outline',
    color: '#FC5C65',
  },
  { name: 'Health & Medical', slug: 'health-medical', icon: 'medkit-outline', color: '#26DE81' },
  { name: 'Fitness', slug: 'fitness', icon: 'barbell-outline', color: '#2BCBBA' },
  { name: 'Education', slug: 'education', icon: 'school-outline', color: '#4B7BEC' },
  { name: 'Travel', slug: 'travel', icon: 'airplane-outline', color: '#FD9644' },
  { name: 'Personal Care', slug: 'personal-care', icon: 'sparkles-outline', color: '#EB3B5A' },
  { name: 'Subscriptions', slug: 'subscriptions', icon: 'repeat-outline', color: '#8854D0' },
  { name: 'Insurance', slug: 'insurance', icon: 'shield-checkmark-outline', color: '#3867D6' },
  { name: 'Investments', slug: 'investments', icon: 'trending-up-outline', color: '#0FB9B1' },
  { name: 'Gifts & Donations', slug: 'gifts-donations', icon: 'gift-outline', color: '#F53B57' },
  { name: 'Family & Kids', slug: 'family-kids', icon: 'people-outline', color: '#FA8231' },
  { name: 'Pets', slug: 'pets', icon: 'paw-outline', color: '#B33771' },
  { name: 'Electronics', slug: 'electronics', icon: 'hardware-chip-outline', color: '#575FCF' },
  { name: 'Home & Furniture', slug: 'home-furniture', icon: 'bed-outline', color: '#778CA3' },
  { name: 'Taxes', slug: 'taxes', icon: 'document-text-outline', color: '#574B90' },
  { name: 'Loan & EMI', slug: 'loan-emi', icon: 'card-outline', color: '#303952' },
  {
    name: 'Miscellaneous',
    slug: 'miscellaneous',
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#A5B1C2',
  },
];

/** The default income categories shipped with the app (used by the income module). */
const INCOME_DEFAULTS: SeedDefinition[] = [
  { name: 'Salary', slug: 'salary', icon: 'cash-outline', color: '#20BF6B' },
  { name: 'Business', slug: 'business', icon: 'briefcase-outline', color: '#0FB9B1' },
  { name: 'Freelance', slug: 'freelance', icon: 'laptop-outline', color: '#4B7BEC' },
  {
    name: 'Investment Returns',
    slug: 'investment-returns',
    icon: 'trending-up-outline',
    color: '#26DE81',
  },
  { name: 'Interest', slug: 'interest', icon: 'stats-chart-outline', color: '#2BCBBA' },
  { name: 'Rental Income', slug: 'rental-income', icon: 'business-outline', color: '#8854D0' },
  { name: 'Refunds', slug: 'refunds', icon: 'return-down-back-outline', color: '#45B7D1' },
  { name: 'Gifts Received', slug: 'gifts-received', icon: 'gift-outline', color: '#F53B57' },
  { name: 'Other Income', slug: 'other-income', icon: 'wallet-outline', color: '#A5B1C2' },
];

/** Builds the typed default rows, assigning a stable `sortOrder` (10, 20, …) per type. */
const withTypeAndOrder = (
  defs: SeedDefinition[],
  type: CategoryType,
): Partial<CategoryDocument>[] =>
  defs.map((def, index) => ({ ...def, type, sortOrder: (index + 1) * 10 }));

/** Every system category the app ships with. */
export const DEFAULT_CATEGORIES: Partial<CategoryDocument>[] = [
  ...withTypeAndOrder(EXPENSE_DEFAULTS, CategoryType.Expense),
  ...withTypeAndOrder(INCOME_DEFAULTS, CategoryType.Income),
];

/**
 * Idempotently ensures the default system categories exist. Each is upserted by its
 * `(type, slug)` identity using `$setOnInsert`, so re-running never overwrites admin
 * customizations (renamed labels, recoloured icons) — it only inserts what's missing.
 * Safe to call on every boot and via `npm run seed`.
 */
export async function seedCategories(): Promise<{ created: number; total: number }> {
  const operations: AnyBulkWriteOperation<CategoryDocument>[] = DEFAULT_CATEGORIES.map(
    (category) => ({
      updateOne: {
        filter: { type: category.type, slug: category.slug },
        update: { $setOnInsert: { ...category, isSystem: true, isActive: true } },
        upsert: true,
      },
    }),
  );

  const result = await CategoryModel.bulkWrite(operations, { ordered: false });
  const created = result.upsertedCount;
  logger.info(
    `Category seed complete: ${created} created, ${DEFAULT_CATEGORIES.length} defaults total`,
  );
  return { created, total: DEFAULT_CATEGORIES.length };
}
