import { z } from 'zod';

export const DashboardSummaryInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.string().uuid().optional(),
});

export const CategoryBreakdownSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  name: z.string(),
  color: z.string(),
  cents: z.number().int(),
  percent: z.number(),
});

export const DashboardSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  netSavingsCents: z.number().int(),
  transactionCount: z.number().int(),
  byCategory: z.array(CategoryBreakdownSchema),
});

export type DashboardSummaryInput = z.infer<typeof DashboardSummaryInput>;
export type CategoryBreakdown = z.infer<typeof CategoryBreakdownSchema>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;