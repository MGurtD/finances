import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@finances/db';
import { categories, transactions } from '@finances/db';
import {
  DashboardSummaryInput,
  DashboardSummarySchema,
  CategoryBreakdownSchema,
} from '@finances/contracts';
import { router, publicProcedure } from '../trpc/trpc.js';

export const dashboardRouter = router({
  summary: publicProcedure
    .input(DashboardSummaryInput)
    .output(DashboardSummarySchema)
    .query(({ input }) => {
      const dateFilter = and(
        gte(transactions.date, input.from),
        lte(transactions.date, input.to),
      );

      const totalsRow = db
        .select({
          income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.kind} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
          expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.kind} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(transactions)
        .where(dateFilter)
        .get();

      const incomeCents = totalsRow?.income ?? 0;
      const expenseCents = totalsRow?.expense ?? 0;
      const transactionCount = totalsRow?.count ?? 0;

      const categoryRows = db
        .select({
          categoryId: transactions.categoryId,
          name: categories.name,
          color: categories.color,
          cents: sql<number>`SUM(${transactions.amount})`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(eq(transactions.kind, 'expense'), dateFilter))
        .groupBy(transactions.categoryId, categories.name, categories.color)
        .all();

      const totalForPct = expenseCents || 1;
      const byCategory = categoryRows
        .map((row) => ({
          categoryId: row.categoryId,
          name: row.name ?? 'Sense categoria',
          color: row.color ?? '#8B7355',
          cents: row.cents,
          percent: Math.round((row.cents / totalForPct) * 100),
        }))
        .sort((a, b) => b.cents - a.cents);

      // Validate category shape (paranoia: protects the .output schema).
      for (const c of byCategory) CategoryBreakdownSchema.parse(c);

      return {
        from: input.from,
        to: input.to,
        incomeCents,
        expenseCents,
        netSavingsCents: incomeCents - expenseCents,
        transactionCount,
        byCategory,
      };
    }),
});