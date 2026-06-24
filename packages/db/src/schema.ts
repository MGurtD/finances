import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey().$defaultFn(uuid),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['checking', 'savings', 'credit_card', 'cash', 'investment'],
  }).notNull(),
  currency: text('currency').$type<'EUR'>().notNull().default('EUR'),
  color: text('color').notNull().default('#E85D2C'),
  icon: text('icon').notNull().default('wallet'),
  initialBalance: integer('initial_balance').notNull().default(0),
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
    transferAccountId: text('transfer_account_id').references(() => accounts.id),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    dateIdx: index('transactions_date_idx').on(t.date),
    accountIdx: index('transactions_account_idx').on(t.accountId),
    categoryIdx: index('transactions_category_idx').on(t.categoryId),
  }),
);

export type AccountRow = typeof accounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;