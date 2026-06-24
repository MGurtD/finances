import { z } from 'zod';

export const BudgetPeriodSchema = z.enum(['monthly', 'yearly']);

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  period: BudgetPeriodSchema,
  amount: z.number().int(), // in cents
  startsAt: z.string(), // ISO date
  endsAt: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const CreateBudgetInput = BudgetSchema.pick({
  categoryId: true,
  period: true,
  amount: true,
  startsAt: true,
  endsAt: true,
});

export type Budget = z.infer<typeof BudgetSchema>;
export type BudgetPeriod = z.infer<typeof BudgetPeriodSchema>;
export type CreateBudgetInput = z.infer<typeof CreateBudgetInput>;