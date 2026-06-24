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

export const ListTransactionsInput = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  kind: TransactionKindSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionKind = z.infer<typeof TransactionKindSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionInput>;
export type ListTransactionsInput = z.infer<typeof ListTransactionsInput>;