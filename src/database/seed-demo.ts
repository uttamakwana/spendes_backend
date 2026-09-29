/**
 * Builds a demo account with roughly ten weeks of history — the kind of data an
 * account has after two months of real use, across every module.
 *
 * It drives the **services**, not the collections, so everything it produces is
 * something the app itself could have produced: split maths, personal-share
 * materialisation, consent, notifications and balances all run for real. That makes
 * it a seeder and a smoke test at once — if a module is broken, this fails.
 *
 *   npm run seed:demo              # +91 9664836313 (sign in with OTP 123456)
 *   npm run seed:demo -- --phone 9876543210 --fresh
 *
 * `--fresh` deletes the demo user (and everything cascading from them) first, so
 * re-running gives a clean two months rather than four.
 */
import { connectDatabase, disconnectDatabase } from './connection';
import { PaymentMethod } from '../common/enums/payment-method';
import { BudgetPeriod } from '../common/enums/budget-period';
import { PaymentHandleType } from '../common/reference/countries';
import { logger } from '../logger';
import { budgetsService } from '../modules/budgets/budgets.service';
import { emisService } from '../modules/emis/emis.service';
import { EmiFrequency, EmiType } from '../modules/emis/emis.enums';
import { expensesService } from '../modules/expenses/expenses.service';
import { friendsService } from '../modules/friends/friends.service';
import { goalsService } from '../modules/goals/goals.service';
import { groupsService } from '../modules/groups/groups.service';
import { incomeService } from '../modules/income/income.service';
import { investmentsService } from '../modules/investments/investments.service';
import { InvestmentType, SipFrequency } from '../modules/investments/investments.enums';
import { DisputeReason } from '../modules/notifications/notifications.enums';
import { notificationsService } from '../modules/notifications/notifications.service';
import { splitsService } from '../modules/splits/splits.service';
import { SplitStrategy } from '../modules/splits/splits.enums';
import { usersService } from '../modules/users/users.service';
import type { UserDocument } from '../modules/users/users.model';
import { cascadeDeleteUser } from '../modules/users/user-cascade';

// ── Dates ────────────────────────────────────────────────────────────────────

const NOW = new Date();
/** `days` ago, at a plausible hour of the day. */
const ago = (days: number, hour = 13, minute = 20): Date => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
};
/** The nth of a month `monthsBack` months ago — for salaries and rent. */
const monthDay = (monthsBack: number, day: number, hour = 10): Date => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - monthsBack, day, hour, 0, 0, 0);
  return d;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── The cast ─────────────────────────────────────────────────────────────────

interface Persona {
  phone: string;
  firstName: string;
  lastName: string;
  handle?: { type: PaymentHandleType; value: string };
  country?: string;
  timezone?: string;
  currency?: string;
}

/**
 * Supporting accounts. Fixed numbers so re-running finds the same people, and a
 * deliberate mix: an Indian friend on UPI, one who hasn't added a handle at all,
 * and an American on Venmo — the case that used to be impossible.
 */
const CAST: Persona[] = [
  {
    phone: '9812300001',
    firstName: 'Rahul',
    lastName: 'Mehta',
    handle: { type: PaymentHandleType.Upi, value: 'rahul.mehta@okicici' },
  },
  { phone: '9812300002', firstName: 'Priya', lastName: 'Nair' },
  {
    phone: '9812300003',
    firstName: 'Ananya',
    lastName: 'Shah',
    handle: { type: PaymentHandleType.Upi, value: 'ananya@okaxis' },
  },
  {
    phone: '4155550101',
    firstName: 'Sam',
    lastName: 'Whitfield',
    country: 'US',
    timezone: 'America/New_York',
    currency: 'USD',
    handle: { type: PaymentHandleType.Venmo, value: '@sam-whitfield' },
  },
];

// ── Personal spending ────────────────────────────────────────────────────────

interface Recurring {
  category: string;
  merchant: string;
  amount: number;
  method: PaymentMethod;
  /** Roughly every N days. */
  everyDays: number;
  jitter: number;
  description?: string;
}

/** The rhythm of an ordinary month, so the charts have a believable shape. */
const HABITS: Recurring[] = [
  {
    category: 'Food & Dining',
    merchant: 'Swiggy',
    amount: 420,
    method: PaymentMethod.Upi,
    everyDays: 4,
    jitter: 260,
    description: 'Dinner order',
  },
  {
    category: 'Groceries',
    merchant: 'BigBasket',
    amount: 1850,
    method: PaymentMethod.Card,
    everyDays: 9,
    jitter: 700,
    description: 'Weekly groceries',
  },
  {
    category: 'Transport',
    merchant: 'Uber',
    amount: 240,
    method: PaymentMethod.Upi,
    everyDays: 3,
    jitter: 180,
    description: 'Ride to work',
  },
  {
    category: 'Fuel',
    merchant: 'HP Petrol Pump',
    amount: 2200,
    method: PaymentMethod.Card,
    everyDays: 16,
    jitter: 400,
  },
  {
    category: 'Entertainment',
    merchant: 'BookMyShow',
    amount: 700,
    method: PaymentMethod.Upi,
    everyDays: 14,
    jitter: 350,
    description: 'Movie night',
  },
  {
    category: 'Personal Care',
    merchant: 'Urban Company',
    amount: 800,
    method: PaymentMethod.Upi,
    everyDays: 21,
    jitter: 300,
  },
  {
    category: 'Shopping',
    merchant: 'Myntra',
    amount: 2600,
    method: PaymentMethod.Card,
    everyDays: 18,
    jitter: 1500,
  },
  {
    category: 'Health & Medical',
    merchant: 'Apollo Pharmacy',
    amount: 640,
    method: PaymentMethod.Upi,
    everyDays: 26,
    jitter: 300,
  },
  {
    category: 'Mobile & Internet',
    merchant: 'Jio',
    amount: 799,
    method: PaymentMethod.Upi,
    everyDays: 30,
    jitter: 0,
    description: 'Recharge',
  },
];

/** Deterministic jitter, so two runs of the seeder produce comparable data. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.round((x - Math.floor(x)) * spread);
}

// ── Seeding ──────────────────────────────────────────────────────────────────

const DEMO_DAYS = 70;

interface Args {
  phone: string;
  fresh: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const phoneIndex = argv.indexOf('--phone');
  return {
    phone: phoneIndex >= 0 ? (argv[phoneIndex + 1] ?? '9664836313') : '9664836313',
    fresh: argv.includes('--fresh'),
  };
}

/** Registers a persona, or returns the existing account for that number. */
async function ensureUser(persona: Persona): Promise<UserDocument> {
  const dialCode = persona.country === 'US' ? '+1' : '+91';
  const existing = await usersService.findByPhone(dialCode, persona.phone);
  if (existing) {
    return existing;
  }
  return usersService.createFromRegistration({
    dialCode,
    phoneNumber: persona.phone,
    firstName: persona.firstName,
    lastName: persona.lastName,
    country: persona.country ?? 'IN',
    timezone: persona.timezone ?? 'Asia/Kolkata',
    defaultCurrency: persona.currency ?? 'INR',
    paymentHandle: persona.handle,
    isPhoneVerified: true,
  });
}

async function seedPersonalSpending(userId: string): Promise<number> {
  let created = 0;
  for (const [index, habit] of HABITS.entries()) {
    for (let day = DEMO_DAYS; day >= 0; day -= habit.everyDays) {
      const amount = round2(
        habit.amount + wobble(index * 100 + day, habit.jitter) - habit.jitter / 2,
      );
      if (amount <= 0) continue;
      await expensesService.create(userId, {
        amount,
        category: habit.category,
        merchant: habit.merchant,
        description: habit.description,
        paymentMethod: habit.method,
        spentAt: ago(day, 9 + (day % 11), (day * 7) % 60),
      });
      created += 1;
    }
  }

  // The last few days always get something, so a month that has only just begun
  // still has a story on the home screen.
  const recent: [string, string, number, PaymentMethod][] = [
    ['Food & Dining', 'Blue Tokai', 480, PaymentMethod.Upi],
    ['Transport', 'Namma Metro', 60, PaymentMethod.Wallet],
    ['Groceries', 'Local kirana', 640, PaymentMethod.Cash],
    ['Food & Dining', 'Zomato', 730, PaymentMethod.Upi],
    ['Entertainment', 'Spotify', 199, PaymentMethod.Card],
  ];
  for (const [index, [category, merchant, amount, method]] of recent.entries()) {
    await expensesService.create(userId, {
      amount,
      category,
      merchant,
      paymentMethod: method,
      spentAt: ago(index, 11 + index, 15),
    });
    created += 1;
  }

  // A couple of one-offs, so the biggest expenses aren't all routine.
  await expensesService.create(userId, {
    amount: 18500,
    category: 'Electronics',
    merchant: 'Croma',
    description: 'Noise-cancelling headphones',
    paymentMethod: PaymentMethod.Card,
    spentAt: ago(38, 19, 5),
    notes: 'Replaced the pair that broke on the Goa trip.',
    tags: ['big-ticket'],
  });
  await expensesService.create(userId, {
    amount: 4200,
    category: 'Gifts & Donations',
    merchant: 'Ferns N Petals',
    description: 'Anniversary gift',
    paymentMethod: PaymentMethod.Upi,
    spentAt: ago(21, 11, 40),
  });
  return created + 2;
}

async function seedIncome(userId: string): Promise<number> {
  let created = 0;
  for (let month = 2; month >= 0; month -= 1) {
    // Payday is the 1st. On the 1st itself that instant may still be ahead of us,
    // so nudge it into the past rather than dating income in the future.
    const payday = monthDay(month, 1, 10);
    await incomeService.create(userId, {
      amount: 118000,
      category: 'Salary',
      source: 'Zeta Systems Pvt Ltd',
      receivedVia: PaymentMethod.BankTransfer,
      receivedAt: payday > NOW ? new Date(NOW.getTime() - 60 * 60 * 1000) : payday,
      isRecurring: true,
    });
    created += 1;
  }
  await incomeService.create(userId, {
    amount: 26000,
    category: 'Freelance',
    source: 'Logo redesign — Kettle Coffee',
    receivedVia: PaymentMethod.Upi,
    receivedAt: ago(33, 16, 15),
  });
  await incomeService.create(userId, {
    amount: 3480,
    category: 'Interest',
    source: 'HDFC savings interest',
    receivedVia: PaymentMethod.BankTransfer,
    receivedAt: ago(12, 8, 0),
  });
  await incomeService.create(userId, {
    amount: 7500,
    category: 'Gifts Received',
    source: 'Birthday — Dad',
    receivedVia: PaymentMethod.Upi,
    receivedAt: ago(47, 12, 0),
  });
  return created + 3;
}

async function seedBudgets(userId: string): Promise<void> {
  // One of each period, and deliberately one already blown — the "exceeded" state
  // is the one worth looking at, and it only appears if a limit is genuinely low.
  await budgetsService.create(userId, {
    name: 'Eating out',
    category: 'Food & Dining',
    amount: 4000,
    period: BudgetPeriod.Monthly,
    alertThresholdPct: 75,
  });
  await budgetsService.create(userId, {
    name: 'Groceries',
    category: 'Groceries',
    amount: 9000,
    period: BudgetPeriod.Monthly,
  });
  await budgetsService.create(userId, {
    name: 'Everything',
    amount: 65000,
    period: BudgetPeriod.Monthly,
    alertThresholdPct: 80,
  });
  await budgetsService.create(userId, {
    name: 'This week',
    amount: 6000,
    period: BudgetPeriod.Weekly,
  });
  await budgetsService.create(userId, {
    name: 'Travel fund 2026',
    category: 'Travel',
    amount: 120000,
    period: BudgetPeriod.Yearly,
  });
  await budgetsService.create(userId, {
    name: 'Goa trip window',
    amount: 25000,
    period: BudgetPeriod.Custom,
    startDate: ago(45),
    endDate: ago(30),
  });
}

async function seedCommitments(userId: string): Promise<void> {
  await emisService.create(userId, {
    name: 'Home loan',
    type: EmiType.Loan,
    amount: 32400,
    frequency: EmiFrequency.Monthly,
    startDate: monthDay(26, 5),
    principal: 3200000,
    interestRatePct: 8.6,
    tenureCount: 240,
    installmentsPaid: 26,
    autoDebit: true,
    paymentMethod: PaymentMethod.BankTransfer,
  });
  await emisService.create(userId, {
    name: 'Rent',
    type: EmiType.Rent,
    amount: 28000,
    frequency: EmiFrequency.Monthly,
    startDate: monthDay(14, 3),
    autoDebit: false,
    paymentMethod: PaymentMethod.BankTransfer,
  });
  await emisService.create(userId, {
    name: 'Netflix',
    type: EmiType.Subscription,
    amount: 649,
    frequency: EmiFrequency.Monthly,
    startDate: monthDay(9, 18),
    autoDebit: true,
    paymentMethod: PaymentMethod.Card,
  });
  await emisService.create(userId, {
    name: 'Term insurance',
    type: EmiType.Insurance,
    amount: 18400,
    frequency: EmiFrequency.Yearly,
    startDate: monthDay(8, 12),
    autoDebit: false,
  });
  // Finished, so the "completed" branch of the schedule maths is on screen too.
  await emisService.create(userId, {
    name: 'Laptop EMI (closed)',
    type: EmiType.Loan,
    amount: 6500,
    frequency: EmiFrequency.Monthly,
    startDate: monthDay(20, 8),
    tenureCount: 12,
    installmentsPaid: 12,
  });
}

async function seedGoals(userId: string): Promise<void> {
  const emergency = await goalsService.create(userId, {
    name: 'Emergency fund',
    targetAmount: 600000,
    targetDate: new Date(NOW.getFullYear() + 1, 11, 31),
    icon: 'shield-checkmark-outline',
    color: '#16A34A',
    notes: 'Six months of expenses.',
  });
  for (let month = 5; month >= 0; month -= 1) {
    await goalsService.contribute(userId, emergency.id, {
      amount: 15000,
      note: 'Monthly transfer',
      contributedAt: monthDay(month, 3),
    });
  }

  const japan = await goalsService.create(userId, {
    name: 'Japan trip',
    targetAmount: 250000,
    targetDate: new Date(NOW.getFullYear() + 1, 3, 15),
    icon: 'airplane-outline',
    color: '#4F46E5',
  });
  await goalsService.contribute(userId, japan.id, { amount: 40000, contributedAt: ago(58) });
  await goalsService.contribute(userId, japan.id, { amount: 22000, contributedAt: ago(24) });

  // Already met — exercises the achieved / "needs ₹0 a month" branch.
  const laptop = await goalsService.create(userId, {
    name: 'New laptop',
    targetAmount: 90000,
    icon: 'laptop-outline',
    color: '#D97706',
  });
  await goalsService.contribute(userId, laptop.id, { amount: 60000, contributedAt: ago(64) });
  await goalsService.contribute(userId, laptop.id, { amount: 30000, contributedAt: ago(19) });
}

async function seedInvestments(userId: string): Promise<void> {
  const sip = await investmentsService.create(userId, {
    name: 'Parag Parikh Flexi Cap',
    type: InvestmentType.MutualFund,
    investedAmount: 0,
    platform: 'Zerodha Coin',
    sip: { amount: 10000, frequency: SipFrequency.Monthly, startDate: monthDay(6, 5) },
  });
  // Six months of installments, with the value drifting up as they land.
  for (let month = 5; month >= 0; month -= 1) {
    await investmentsService.contribute(userId, sip.id, {
      amount: 10000,
      investedAt: monthDay(month, 5),
      currentValue: round2((6 - month) * 10000 * (1 + 0.012 * (6 - month))),
      note: 'SIP installment',
    });
  }

  await investmentsService.create(userId, {
    name: 'HDFC Bank',
    type: InvestmentType.Stock,
    investedAmount: 84000,
    currentValue: 96300,
    quantity: 50,
    platform: 'Zerodha',
  });
  await investmentsService.create(userId, {
    name: 'Tata Motors',
    type: InvestmentType.Stock,
    investedAmount: 62000,
    // Down, so the loss branch renders too.
    currentValue: 54100,
    quantity: 80,
    platform: 'Zerodha',
  });
  await investmentsService.create(userId, {
    name: 'SBI Fixed Deposit',
    type: InvestmentType.Fd,
    investedAmount: 200000,
    currentValue: 213600,
    platform: 'SBI',
  });
  await investmentsService.create(userId, {
    name: 'Sovereign Gold Bond',
    type: InvestmentType.Gold,
    investedAmount: 75000,
    currentValue: 88200,
    quantity: 12,
  });
  await investmentsService.create(userId, {
    name: 'Bitcoin',
    type: InvestmentType.Crypto,
    investedAmount: 30000,
    currentValue: 41500,
    quantity: 0.012,
    platform: 'CoinDCX',
  });
}

/** Flatmates: a standing group with every split strategy and a partial settle-up. */
async function seedFlatGroup(userId: string, cast: Record<string, UserDocument>): Promise<void> {
  const group = await groupsService.create(userId, {
    name: 'Flat 402',
    description: 'Rent, bills and the weekly grocery run',
    members: [
      { userId: cast.Rahul._id.toString() },
      { userId: cast.Priya._id.toString() },
      // Invited by phone and never joined — the placeholder case.
      { dialCode: '+91', phoneNumber: '9812309999', displayName: 'Vikram (flatmate)' },
    ],
  });
  const id = group.id;
  const me = group.members.find((m) => m.isYou)!;
  const rahul = group.members.find((m) => m.displayName.startsWith('Rahul'))!;
  const priya = group.members.find((m) => m.displayName.startsWith('Priya'))!;
  const vikram = group.members.find((m) => m.displayName.startsWith('Vikram'))!;

  // Equal — the everyday case.
  for (let week = 9; week >= 0; week -= 1) {
    const payer = week % 3 === 0 ? me : week % 3 === 1 ? rahul : priya;
    await splitsService
      .createExpense(payer.id === me.id ? userId : cast.Rahul._id.toString(), id, {
        description: `Groceries — week ${10 - week}`,
        amount: round2(3200 + wobble(week, 900) - 450),
        category: 'Groceries',
        spentAt: ago(week * 7 + 2, 18, 30),
        paidBy: [{ memberId: payer.id, amount: round2(3200 + wobble(week, 900) - 450) }],
        splitStrategy: SplitStrategy.Equal,
        splits: [
          { memberId: me.id },
          { memberId: rahul.id },
          { memberId: priya.id },
          { memberId: vikram.id },
        ],
      })
      .catch(() => undefined);
  }

  // Exact — the electricity bill, split by what each room actually used.
  await splitsService.createExpense(userId, id, {
    description: 'Electricity bill',
    amount: 6400,
    category: 'Bills & Utilities',
    spentAt: ago(12, 20, 0),
    paidBy: [{ memberId: me.id, amount: 6400 }],
    splitStrategy: SplitStrategy.Exact,
    splits: [
      { memberId: me.id, exactAmount: 2100 },
      { memberId: rahul.id, exactAmount: 1800 },
      { memberId: priya.id, exactAmount: 1500 },
      { memberId: vikram.id, exactAmount: 1000 },
    ],
  });

  // Percentage — rent, by room size.
  await splitsService.createExpense(userId, id, {
    description: 'Rent — this month',
    amount: 56000,
    category: 'Rent & Housing',
    spentAt: ago(9, 10, 0),
    paidBy: [{ memberId: me.id, amount: 56000 }],
    splitStrategy: SplitStrategy.Percentage,
    splits: [
      { memberId: me.id, percentage: 30 },
      { memberId: rahul.id, percentage: 30 },
      { memberId: priya.id, percentage: 25 },
      { memberId: vikram.id, percentage: 15 },
    ],
  });

  // Shares — the internet bill, two of them stream far more than the rest.
  await splitsService.createExpense(userId, id, {
    description: 'Internet — fibre',
    amount: 1499,
    category: 'Mobile & Internet',
    spentAt: ago(6, 21, 15),
    paidBy: [{ memberId: rahul.id, amount: 1499 }],
    splitStrategy: SplitStrategy.Shares,
    splits: [
      { memberId: me.id, shares: 2 },
      { memberId: rahul.id, shares: 3 },
      { memberId: priya.id, shares: 2 },
      { memberId: vikram.id, shares: 1 },
    ],
  });

  // Multi-payer, then a partial settle-up so balances aren't all round numbers.
  await splitsService.createExpense(userId, id, {
    description: 'Deep clean + pest control',
    amount: 5000,
    category: 'Home & Furniture',
    spentAt: ago(16, 12, 0),
    paidBy: [
      { memberId: me.id, amount: 3000 },
      { memberId: priya.id, amount: 2000 },
    ],
    splitStrategy: SplitStrategy.Equal,
    splits: [
      { memberId: me.id },
      { memberId: rahul.id },
      { memberId: priya.id },
      { memberId: vikram.id },
    ],
  });

  await splitsService.createSettlement(cast.Rahul._id.toString(), id, {
    fromMemberId: rahul.id,
    toMemberId: me.id,
    amount: 4000,
    method: PaymentMethod.Upi,
    settledAt: ago(4, 19, 0),
    note: 'Part of what I owe for rent',
  });
}

/** A finished trip: fully settled, so the "all square" state has something to show. */
async function seedTripGroup(userId: string, cast: Record<string, UserDocument>): Promise<void> {
  const group = await groupsService.create(userId, {
    name: 'Goa trip',
    description: 'Four days, one very expensive shack',
    members: [{ userId: cast.Ananya._id.toString() }, { userId: cast.Rahul._id.toString() }],
  });
  const id = group.id;
  const me = group.members.find((m) => m.isYou)!;
  const ananya = group.members.find((m) => m.displayName.startsWith('Ananya'))!;
  const rahul = group.members.find((m) => m.displayName.startsWith('Rahul'))!;

  const legs: [string, number, string, string][] = [
    ['Flights', 24000, 'Travel', me.id],
    ['Beach house — 3 nights', 31500, 'Travel', ananya.id],
    ['Scooter rental', 3600, 'Transport', rahul.id],
    ['Dinner at Thalassa', 8400, 'Food & Dining', me.id],
    ['Water sports', 6000, 'Entertainment', ananya.id],
  ];
  for (const [index, [description, amount, category, payer]] of legs.entries()) {
    await splitsService.createExpense(
      payer === me.id
        ? userId
        : payer === ananya.id
          ? cast.Ananya._id.toString()
          : cast.Rahul._id.toString(),
      id,
      {
        description,
        amount,
        category,
        spentAt: ago(44 - index, 12 + index, 0),
        paidBy: [{ memberId: payer, amount }],
        splitStrategy: SplitStrategy.Equal,
        splits: [{ memberId: me.id }, { memberId: ananya.id }, { memberId: rahul.id }],
      },
    );
  }

  // Settle it to zero the way people actually do — one transfer each.
  const balances = await splitsService.getBalances(userId, id);
  for (const transfer of balances.suggestedTransfers) {
    const payerUserId =
      transfer.fromMemberId === me.id
        ? userId
        : transfer.fromMemberId === ananya.id
          ? cast.Ananya._id.toString()
          : cast.Rahul._id.toString();
    await splitsService.createSettlement(payerUserId, id, {
      fromMemberId: transfer.fromMemberId,
      toMemberId: transfer.toMemberId,
      amount: transfer.amount,
      method: PaymentMethod.Upi,
      settledAt: ago(37, 20, 0),
      note: 'Goa settle-up',
    });
  }
}

/** 1-on-1 friendships, including the ones that are awkward on purpose. */
async function seedFriends(userId: string, cast: Record<string, UserDocument>): Promise<void> {
  // Ananya: a running tab that lands in the red for us.
  const ananya = await friendsService.addFriend(userId, { userId: cast.Ananya._id.toString() });
  await friendsService.createExpense(userId, ananya.friendshipId, {
    description: 'Concert tickets',
    amount: 7000,
    category: 'Entertainment',
    spentAt: ago(28, 20, 0),
    paidBy: [{ memberId: ananya.friendMemberId, amount: 7000 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: ananya.myMemberId }, { memberId: ananya.friendMemberId }],
  });
  await friendsService.createExpense(userId, ananya.friendshipId, {
    description: 'Lunch at Toit',
    amount: 2400,
    category: 'Food & Dining',
    spentAt: ago(5, 14, 0),
    paidBy: [{ memberId: ananya.friendMemberId, amount: 2400 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: ananya.myMemberId }, { memberId: ananya.friendMemberId }],
  });

  // Priya: owed to us, and settled — the "all square" friend.
  const priya = await friendsService.addFriend(userId, { userId: cast.Priya._id.toString() });
  await friendsService.createExpense(userId, priya.friendshipId, {
    description: 'Airport cab',
    amount: 1800,
    category: 'Transport',
    spentAt: ago(20, 6, 0),
    paidBy: [{ memberId: priya.myMemberId, amount: 1800 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: priya.myMemberId }, { memberId: priya.friendMemberId }],
  });
  await friendsService.createSettlement(cast.Priya._id.toString(), priya.friendshipId, {
    fromMemberId: priya.friendMemberId,
    toMemberId: priya.myMemberId,
    amount: 900,
    method: PaymentMethod.Upi,
    settledAt: ago(18, 9, 0),
  });

  // Sam in New York: a USD friendship. Venmo can't settle rupees and rupees aren't
  // converted, so this is the cross-border case the Pay button has to handle.
  const sam = await friendsService.addFriend(userId, {
    userId: cast.Sam._id.toString(),
    currency: 'USD',
  });
  await friendsService.createExpense(userId, sam.friendshipId, {
    description: 'Domain + hosting for the side project',
    amount: 180,
    currency: 'USD',
    category: 'Subscriptions',
    spentAt: ago(15, 22, 0),
    paidBy: [{ memberId: sam.friendMemberId, amount: 180 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: sam.myMemberId }, { memberId: sam.friendMemberId }],
  });

  // Invited by phone and still not on Spendes — the placeholder friend.
  const neighbour = await friendsService.addFriend(userId, {
    dialCode: '+91',
    phoneNumber: '9812308888',
    displayName: 'Kavya (neighbour)',
  });
  await friendsService.createExpense(userId, neighbour.friendshipId, {
    description: 'Society maintenance — shared',
    amount: 3000,
    category: 'Bills & Utilities',
    spentAt: ago(11, 17, 0),
    paidBy: [{ memberId: neighbour.myMemberId, amount: 3000 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: neighbour.myMemberId }, { memberId: neighbour.friendMemberId }],
  });
}

/**
 * Inbound activity: someone adds *us* and splits, so the review screen has a real
 * pending request, one confirmed thread and one flagged thread to look at.
 */
async function seedInbox(userId: string, cast: Record<string, UserDocument>): Promise<void> {
  const rahulId = cast.Rahul._id.toString();

  // Rahul adds us and splits — this is the request that stays pending.
  const fromRahul = await friendsService.addFriend(rahulId, { userId });
  await friendsService.createExpense(rahulId, fromRahul.friendshipId, {
    description: 'Badminton court booking',
    amount: 1200,
    category: 'Fitness',
    spentAt: ago(2, 20, 0),
    paidBy: [{ memberId: fromRahul.myMemberId, amount: 1200 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: fromRahul.myMemberId }, { memberId: fromRahul.friendMemberId }],
  });

  // Ananya splits something we've already confirmed, and something we flagged.
  const ananyaId = cast.Ananya._id.toString();
  const withAnanya = await friendsService.addFriend(ananyaId, { userId });
  await friendsService.createExpense(ananyaId, withAnanya.friendshipId, {
    description: 'Birthday cake for Priya',
    amount: 1600,
    category: 'Gifts & Donations',
    spentAt: ago(8, 18, 0),
    paidBy: [{ memberId: withAnanya.myMemberId, amount: 1600 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: withAnanya.myMemberId }, { memberId: withAnanya.friendMemberId }],
  });
  await friendsService.createExpense(ananyaId, withAnanya.friendshipId, {
    description: 'Cab I never took',
    amount: 900,
    category: 'Transport',
    spentAt: ago(3, 9, 0),
    paidBy: [{ memberId: withAnanya.myMemberId, amount: 900 }],
    splitStrategy: SplitStrategy.Equal,
    splits: [{ memberId: withAnanya.myMemberId }, { memberId: withAnanya.friendMemberId }],
  });

  // Answer two of them, leaving Rahul's fresh, so the inbox shows all three states.
  const inbox = await notificationsService.list(userId, { page: 1, limit: 50, sortOrder: 'desc' });
  const splits = inbox.items.filter((n) => n.type === 'split_added');
  const cake = splits.find((n) => n.body.includes('Birthday cake'));
  const cab = splits.find((n) => n.body.includes('Cab I never took'));
  if (cake) await notificationsService.confirm(userId, cake.id);
  if (cab) await notificationsService.dispute(userId, cab.id, { reason: DisputeReason.NotMine });
}

async function main(): Promise<void> {
  const args = parseArgs();
  await connectDatabase();

  const demo: Persona = {
    phone: args.phone,
    firstName: 'Uttam',
    lastName: 'Makwana',
    handle: { type: PaymentHandleType.Upi, value: 'uttam@okhdfcbank' },
  };

  if (args.fresh) {
    const existing = await usersService.findByPhone('+91', demo.phone);
    if (existing) {
      const result = await cascadeDeleteUser(existing, { apply: true });
      logger.info(`Cleared the previous demo account: ${JSON.stringify(result)}`);
    }
  }

  const user = await ensureUser(demo);
  const userId = user._id.toString();
  logger.info(
    `Seeding demo data for ${user.firstName} ${user.lastName} (${user.dialCode}${user.phoneNumber})`,
  );

  const cast: Record<string, UserDocument> = {};
  for (const persona of CAST) {
    cast[persona.firstName] = await ensureUser(persona);
  }

  const expenses = await seedPersonalSpending(userId);
  const income = await seedIncome(userId);
  await seedBudgets(userId);
  await seedCommitments(userId);
  await seedGoals(userId);
  await seedInvestments(userId);
  await seedFlatGroup(userId, cast);
  await seedTripGroup(userId, cast);
  await seedFriends(userId, cast);
  await seedInbox(userId, cast);

  const [summary, friends, unread] = await Promise.all([
    expensesService.summary(userId, {}),
    friendsService.listFriends(userId),
    notificationsService.unreadCount(userId),
  ]);

  logger.info('─'.repeat(64));
  logger.info(`Demo account ready — sign in as ${user.dialCode}${user.phoneNumber} (OTP 123456)`);
  logger.info(`  personal expenses seeded : ${expenses} (+ materialised split shares)`);
  logger.info(`  income entries           : ${income}`);
  logger.info(`  total spent on record    : ${summary.totalAmount}`);
  logger.info(`  friends                  : ${friends.friends.length}`);
  logger.info(`  owed to you / you owe    : ${friends.totalYouAreOwed} / ${friends.totalYouOwe}`);
  logger.info(`  unread activity          : ${unread.count}`);
  logger.info('─'.repeat(64));

  await disconnectDatabase();
}

void main().catch((error: unknown) => {
  logger.error({ err: error }, 'Demo seeding failed');
  void disconnectDatabase().finally(() => process.exit(1));
});
