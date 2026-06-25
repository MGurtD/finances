import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey().$defaultFn(uuid),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['checking', 'savings', 'credit_card', 'cash', 'investment'],
  }).notNull(),
  currency: text('currency').$type<'EUR'>().notNull().default('EUR'),
  color: text('color').notNull().default('#6366F1'),
  icon: text('icon').notNull().default('wallet'),
  initialBalance: integer('initial_balance').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(now),
  updatedAt: text('updated_at').notNull().$defaultFn(now),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().$defaultFn(uuid),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
  parentId: text('parent_id'),
  icon: text('icon').notNull().default('tag'),
  color: text('color').notNull().default('#8B7355'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(now),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    categoryId: text('category_id').references(() => categories.id),
    kind: text('kind', { enum: ['income', 'expense', 'transfer'] }).notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull().default(''),
    notes: text('notes').notNull().default(''),
    date: text('date').notNull(),
    importHash: text('import_hash'),
    transferAccountId: text('transfer_account_id').references(() => accounts.id),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    dateIdx: index('transactions_date_idx').on(t.date),
    accountIdx: index('transactions_account_idx').on(t.accountId),
    categoryIdx: index('transactions_category_idx').on(t.categoryId),
    accountDateIdx: index('transactions_account_date_idx').on(t.accountId, t.date),
    importHashIdx: index('transactions_import_hash_idx').on(t.importHash),
  }),
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    categoryId: text('category_id').references(() => categories.id),
    month: text('month').notNull(), // YYYY-MM
    amountCents: integer('amount_cents').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    monthIdx: index('budgets_month_idx').on(t.month),
    // SQLite treats NULL as distinct in unique indexes, so categoryId IS NULL rows
    // are not deduplicated. That is intentional — a user can have at most one
    // global budget per month (categoryId = NULL) because we upsert with the
    // (NULL, month) pair and the API layer guards duplicates.
    categoryMonthUnique: uniqueIndex('budgets_category_month_unique').on(t.categoryId, t.month),
  }),
);

export type AccountRow = typeof accounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;