import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@finances/db';
import { categories, transactions } from '@finances/db';
import {
  DashboardSummaryInput,
  DashboardSummarySchema,
  CategoryBreakdownSchema,
} from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';

export const dashboardRouter = router({
  summary: protectedProcedure
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

      // Normalise to absolute for display — income/expense amounts are signed
      // in the DB (income > 0, expense < 0), but the UI expects positives.
      const incomeAbs = Math.abs(incomeCents);
      const expenseAbs = Math.abs(expenseCents);

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

      const totalForPct = expenseAbs || 1;
      const byCategory = categoryRows
        .map((row) => ({
          categoryId: row.categoryId,
          name: row.name ?? 'Sense categoria',
          color: row.color ?? '#8B7355',
          cents: Math.abs(row.cents),
          percent: Math.round((Math.abs(row.cents) / totalForPct) * 100),
        }))
        .sort((a, b) => b.cents - a.cents);

      // Validate category shape (paranoia: protects the .output schema).
      for (const c of byCategory) CategoryBreakdownSchema.parse(c);

      return {
        from: input.from,
        to: input.to,
        incomeCents: incomeAbs,
        expenseCents: expenseAbs,
        netSavingsCents: incomeAbs - expenseAbs,
        transactionCount,
        byCategory,
      };
    }),
});