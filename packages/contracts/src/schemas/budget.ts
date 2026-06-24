import { z } from 'zod';

export const BudgetMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().nullable(), // null = global budget for the month
  month: BudgetMonthSchema,
  amountCents: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateBudgetInput = z.object({
  categoryId: z.string().uuid().nullable(),
  month: BudgetMonthSchema,
  amountCents: z.number().int().positive(),
});

export const UpdateBudgetInput = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().positive().optional(),
});

export const UpsertBudgetInput = CreateBudgetInput;

export const BudgetStatusSchema = z.enum(['ok', 'warning', 'over']);

export const BudgetProgressSchema = z.object({
  budgetId: z.string().uuid().nullable(), // null when no budget is configured
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  categoryColor: z.string(),
  month: BudgetMonthSchema,
  budgetCents: z.number().int(),
  spentCents: z.number().int(),
  remainingCents: z.number().int(),
  percent: z.number(), // 0..n, clamped for display
  status: BudgetStatusSchema,
});

export const BudgetStatusInput = z.object({
  month: BudgetMonthSchema,
});

export type Budget = z.infer<typeof BudgetSchema>;
export type BudgetMonth = z.infer<typeof BudgetMonthSchema>;
export type CreateBudgetInput = z.infer<typeof CreateBudgetInput>;
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetInput>;
export type UpsertBudgetInput = z.infer<typeof UpsertBudgetInput>;
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;
export type BudgetProgress = z.infer<typeof BudgetProgressSchema>;
export type BudgetStatusInput = z.infer<typeof BudgetStatusInput>;