import { z } from 'zod';

export const TransactionKindSchema = z.enum(['income', 'expense', 'transfer']);

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  kind: TransactionKindSchema,
  amount: z.number().int(), // in cents, positive
  description: z.string().max(200).default(''),
  notes: z.string().max(1000).default(''),
  date: z.string(), // ISO date YYYY-MM-DD
  importHash: z.string().nullable(),
  transferAccountId: z.string().uuid().nullable(), // for transfers
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateTransactionInput = TransactionSchema.pick({
  accountId: true,
  categoryId: true,
  kind: true,
  amount: true,
  description: true,
  notes: true,
  date: true,
  transferAccountId: true,
});

export const UpdateTransactionInput = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  kind: TransactionKindSchema.optional(),
  amount: z.number().int().optional(),
  description: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  date: z.string().optional(),
  transferAccountId: z.string().uuid().nullable().optional(),
});

export const ListTransactionsInput = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  kind: TransactionKindSchema.optional(),
  search: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});

export const ImportTransactionRow = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  kind: TransactionKindSchema,
  amount: z.number().int().positive(),
  description: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  date: z.string(),
  transferAccountId: z.string().uuid().nullable().optional(),
});

export const BulkCreateInput = z.object({
  rows: z.array(ImportTransactionRow).min(1).max(1000),
});

export const BulkCreateResult = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  errors: z.number().int(),
});

export const RecentTransactionsInput = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  accountId: z.string().uuid().optional(),
});

export const RecentTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  categoryColor: z.string().nullable(),
  kind: TransactionKindSchema,
  amount: z.number().int(),
  description: z.string(),
  date: z.string(),
});

export const SummaryByMonthInput = z.object({
  months: z.number().int().min(1).max(24).default(6),
  accountId: z.string().uuid().optional(),
});

export const MonthlySummarySchema = z.object({
  month: z.string(),
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  netCents: z.number().int(),
});

export const SummaryByCategoryInput = z.object({
  from: z.string(),
  to: z.string(),
  accountId: z.string().uuid().optional(),
});

export const CategoryAggregateSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  name: z.string(),
  color: z.string(),
  cents: z.number().int(),
  count: z.number().int(),
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionKind = z.infer<typeof TransactionKindSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionInput>;
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionInput>;
export type ListTransactionsInput = z.infer<typeof ListTransactionsInput>;
export type ImportTransactionRow = z.infer<typeof ImportTransactionRow>;
export type BulkCreateInput = z.infer<typeof BulkCreateInput>;
export type BulkCreateResult = z.infer<typeof BulkCreateResult>;
export type RecentTransactionsInput = z.infer<typeof RecentTransactionsInput>;
export type RecentTransaction = z.infer<typeof RecentTransactionSchema>;
export type SummaryByMonthInput = z.infer<typeof SummaryByMonthInput>;
export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;
export type SummaryByCategoryInput = z.infer<typeof SummaryByCategoryInput>;
export type CategoryAggregate = z.infer<typeof CategoryAggregateSchema>;