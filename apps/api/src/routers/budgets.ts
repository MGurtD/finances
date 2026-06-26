import { TRPCError } from '@trpc/server';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@finances/db';
import { budgets, categories, transactions } from '@finances/db';
import {
  BudgetSchema,
  UpsertBudgetInput,
  UpdateBudgetInput,
  BudgetProgressSchema,
  BudgetStatusInput,
} from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';

const IdInput = z.object({ id: z.string().uuid() });
const ListInput = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

function statusFor(percent: number): 'ok' | 'warning' | 'over' {
  if (percent >= 100) return 'over';
  if (percent >= 80) return 'warning';
  return 'ok';
}

function monthBounds(month: string): { from: string; to: string } {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mes invàlid' });
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export const budgetsRouter = router({
  list: protectedProcedure
    .input(ListInput)
    .output(z.array(BudgetSchema))
    .query(({ input }) => {
      return db
        .select()
        .from(budgets)
        .where(eq(budgets.month, input.month))
        .all();
    }),

  upsert: protectedProcedure
    .input(UpsertBudgetInput)
    .output(BudgetSchema)
    .mutation(({ input }) => {
      const now = new Date().toISOString();
      // categoryId can be NULL (global budget) — Drizzle returns undefined for
      // a missing match in the where clause so we handle that case explicitly.
      const where =
        input.categoryId === null
          ? and(eq(budgets.month, input.month), sql`${budgets.categoryId} IS NULL`)
          : and(eq(budgets.month, input.month), eq(budgets.categoryId, input.categoryId));

      const existing = db.select().from(budgets).where(where).get();
      if (existing) {
        db.update(budgets)
          .set({ amountCents: input.amountCents, updatedAt: now })
          .where(eq(budgets.id, existing.id))
          .run();
        const row = db.select().from(budgets).where(eq(budgets.id, existing.id)).get();
        if (!row) throw new Error('Failed to update budget');
        return row;
      }

      const id = crypto.randomUUID();
      db.insert(budgets)
        .values({
          id,
          categoryId: input.categoryId,
          month: input.month,
          amountCents: input.amountCents,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(budgets).where(eq(budgets.id, id)).get();
      if (!row) throw new Error('Failed to create budget');
      return row;
    }),

  update: protectedProcedure
    .input(UpdateBudgetInput)
    .output(BudgetSchema)
    .mutation(({ input }) => {
      const existing = db.select().from(budgets).where(eq(budgets.id, input.id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pressupost no trobat' });
      }
      const patch: { amountCents?: number; updatedAt: string } = {
        updatedAt: new Date().toISOString(),
      };
      if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
      db.update(budgets).set(patch).where(eq(budgets.id, input.id)).run();
      const row = db.select().from(budgets).where(eq(budgets.id, input.id)).get();
      if (!row) throw new Error('Failed to update budget');
      return row;
    }),

  delete: protectedProcedure
    .input(IdInput)
    .output(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) => {
      db.delete(budgets).where(eq(budgets.id, input.id)).run();
      return { id: input.id };
    }),

  /**
   * Per-category progress for a month. Categories without a configured budget
   * still appear with budgetId=null and budgetCents=0 so the UI can render
   * inline "set budget" affordances.
   */
  status: protectedProcedure
    .input(BudgetStatusInput)
    .output(z.array(BudgetProgressSchema))
    .query(({ input }) => {
      const { from, to } = monthBounds(input.month);

      const budgetRows = db
        .select()
        .from(budgets)
        .where(eq(budgets.month, input.month))
        .all();

      const categoryRows = db
        .select()
        .from(categories)
        .where(eq(categories.archived, false))
        .all()
        .filter((c) => c.kind === 'expense');

      const spentRows = db
        .select({
          categoryId: transactions.categoryId,
          cents: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.kind, 'expense'),
            gte(transactions.date, from),
            lte(transactions.date, to),
          ),
        )
        .groupBy(transactions.categoryId)
        .all();

      const spentMap = new Map<string, number>();
      for (const r of spentRows) {
        // Amounts are signed cents — expenses are negative. Normalise to
        // absolute before reporting "spent" to the UI.
        if (r.categoryId) spentMap.set(r.categoryId, Math.abs(r.cents));
      }

      const budgetByCat = new Map<string, (typeof budgetRows)[number]>();
      let globalBudget: (typeof budgetRows)[number] | null = null;
      for (const b of budgetRows) {
        if (b.categoryId === null) globalBudget = b;
        else budgetByCat.set(b.categoryId, b);
      }

      const out: z.infer<typeof BudgetProgressSchema>[] = [];

      // Global budget (categoryId=null)
      if (globalBudget) {
        let totalSpent = 0;
        for (const cents of spentMap.values()) totalSpent += cents;
        const percent = globalBudget.amountCents > 0
          ? Math.round((totalSpent / globalBudget.amountCents) * 100)
          : 0;
        out.push({
          budgetId: globalBudget.id,
          categoryId: null,
          categoryName: 'Global',
          categoryColor: '#6366F1',
          month: input.month,
          budgetCents: globalBudget.amountCents,
          spentCents: totalSpent,
          remainingCents: globalBudget.amountCents - totalSpent,
          percent,
          status: statusFor(percent),
        });
      }

      // Per-category
      for (const c of categoryRows) {
        const b = budgetByCat.get(c.id);
        const spent = spentMap.get(c.id) ?? 0;
        if (b) {
          const percent = b.amountCents > 0 ? Math.round((spent / b.amountCents) * 100) : 0;
          out.push({
            budgetId: b.id,
            categoryId: c.id,
            categoryName: c.name,
            categoryColor: c.color,
            month: input.month,
            budgetCents: b.amountCents,
            spentCents: spent,
            remainingCents: b.amountCents - spent,
            percent,
            status: statusFor(percent),
          });
        } else {
          out.push({
            budgetId: null,
            categoryId: c.id,
            categoryName: c.name,
            categoryColor: c.color,
            month: input.month,
            budgetCents: 0,
            spentCents: spent,
            remainingCents: -spent,
            percent: 0,
            status: 'ok',
          });
        }
      }

      return out;
    }),
});