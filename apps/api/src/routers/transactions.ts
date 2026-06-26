import { TRPCError } from '@trpc/server';
import { createHash } from 'node:crypto';
import { and, between, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@finances/db';
import { transactions, accounts, categories } from '@finances/db';
import {
  TransactionSchema,
  CreateTransactionInput,
  UpdateTransactionInput,
  ListTransactionsInput,
  BulkCreateInput,
  BulkCreateResult,
  RecentTransactionsInput,
  RecentTransactionSchema,
  SummaryByMonthInput,
  MonthlySummarySchema,
  SummaryByCategoryInput,
  CategoryAggregateSchema,
} from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';

const IdInput = z.object({ id: z.string().uuid() });

function importHash(input: {
  accountId: string;
  date: string;
  amount: number;
  description: string;
}): string {
  return createHash('sha256')
    .update(`${input.accountId}|${input.date}|${input.amount}|${input.description}`)
    .digest('hex');
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function startOfMonth(monthKeyStr: string): Date {
  const [y, m] = monthKeyStr.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
}

export const transactionsRouter = router({
  list: protectedProcedure
    .input(ListTransactionsInput)
    .output(z.array(TransactionSchema))
    .query(({ input }) => {
      const conditions = [];
      if (input.accountId) conditions.push(eq(transactions.accountId, input.accountId));
      if (input.categoryId) conditions.push(eq(transactions.categoryId, input.categoryId));
      if (input.kind) conditions.push(eq(transactions.kind, input.kind));
      if (input.search) conditions.push(like(transactions.description, `%${input.search}%`));
      if (input.from && input.to) {
        conditions.push(between(transactions.date, input.from, input.to));
      } else if (input.from) {
        conditions.push(gte(transactions.date, input.from));
      } else if (input.to) {
        conditions.push(lte(transactions.date, input.to));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      return db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
    }),

  byId: protectedProcedure
    .input(IdInput)
    .output(TransactionSchema)
    .query(({ input }) => {
      const row = db.select().from(transactions).where(eq(transactions.id, input.id)).get();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Moviment no trobat' });
      }
      return row;
    }),

  create: protectedProcedure
    .input(CreateTransactionInput)
    .output(TransactionSchema)
    .mutation(({ input }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(transactions)
        .values({
          id,
          accountId: input.accountId,
          categoryId: input.categoryId ?? null,
          kind: input.kind,
          amount: input.amount,
          description: input.description,
          notes: input.notes,
          date: input.date,
          importHash: null,
          transferAccountId: input.transferAccountId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!row) throw new Error('Failed to create transaction');
      return row;
    }),

  update: protectedProcedure
    .input(UpdateTransactionInput)
    .output(TransactionSchema)
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Moviment no trobat' });
      }
      const now = new Date().toISOString();
      db.update(transactions)
        .set({ ...patch, updatedAt: now })
        .where(eq(transactions.id, id))
        .run();
      const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!row) throw new Error('Failed to update transaction');
      return row;
    }),

  delete: protectedProcedure
    .input(IdInput)
    .output(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) => {
      db.delete(transactions).where(eq(transactions.id, input.id)).run();
      return { id: input.id };
    }),

  /**
   * True when there are zero transactions. Helps the UI distinguish
   * "fresh install" from "empty month".
   */
  hasAny: protectedProcedure
    .output(z.boolean())
    .query(() => {
      const row = db
        .select({ c: sql<number>`count(*)` })
        .from(transactions)
        .get();
      return (row?.c ?? 0) > 0;
    }),

  bulkCreate: protectedProcedure
    .input(BulkCreateInput)
    .output(BulkCreateResult)
    .mutation(({ input }) => {
      let created = 0;
      let skipped = 0;
      let errors = 0;
      const now = new Date().toISOString();

      for (const row of input.rows) {
        const hash = importHash({
          accountId: row.accountId,
          date: row.date,
          amount: row.amount,
          description: row.description ?? '',
        });
        try {
          const existing = db
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.importHash, hash))
            .get();
          if (existing) {
            skipped += 1;
            continue;
          }
          db.insert(transactions)
            .values({
              id: crypto.randomUUID(),
              accountId: row.accountId,
              categoryId: row.categoryId ?? null,
              kind: row.kind,
              amount: row.amount,
              description: row.description ?? '',
              notes: row.notes ?? '',
              date: row.date,
              importHash: hash,
              transferAccountId: row.transferAccountId ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          created += 1;
        } catch {
          errors += 1;
        }
      }

      return { created, skipped, errors };
    }),

  recent: protectedProcedure
    .input(RecentTransactionsInput)
    .output(z.array(RecentTransactionSchema))
    .query(({ input }) => {
      const where =
        input.accountId !== undefined
          ? eq(transactions.accountId, input.accountId)
          : undefined;
      const rows = db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          accountName: accounts.name,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          kind: transactions.kind,
          amount: transactions.amount,
          description: transactions.description,
          date: transactions.date,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(where)
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(input.limit)
        .all();

      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        accountName: r.accountName ?? 'Compte esborrat',
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        kind: r.kind,
        amount: r.amount,
        description: r.description,
        date: r.date,
      }));
    }),

  summaryByMonth: protectedProcedure
    .input(SummaryByMonthInput)
    .output(z.array(MonthlySummarySchema))
    .query(({ input }) => {
      const today = new Date();
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (input.months - 1), 1));
      const startStr = start.toISOString().slice(0, 10);

      const accountFilter =
        input.accountId !== undefined
          ? eq(transactions.accountId, input.accountId)
          : undefined;

      const rows = db
        .select({
          month: sql<string>`substr(${transactions.date}, 1, 7)`,
          income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.kind} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
          expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.kind} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        })
        .from(transactions)
        .where(
          accountFilter
            ? and(gte(transactions.date, startStr), accountFilter)
            : gte(transactions.date, startStr),
        )
        .groupBy(sql`substr(${transactions.date}, 1, 7)`)
        .all();

      const byMonth = new Map<string, { incomeCents: number; expenseCents: number }>();
      for (const r of rows) {
        byMonth.set(r.month, { incomeCents: r.income, expenseCents: r.expense });
      }

      const out: { month: string; incomeCents: number; expenseCents: number; netCents: number }[] = [];
      for (let i = input.months - 1; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
        const key = monthKey(d);
        const totals = byMonth.get(key) ?? { incomeCents: 0, expenseCents: 0 };
        // Amounts are signed cents (expense < 0, income > 0). Normalise to
        // absolute for display and compute net from the raw signs.
        out.push({
          month: key,
          incomeCents: Math.abs(totals.incomeCents),
          expenseCents: Math.abs(totals.expenseCents),
          netCents: totals.incomeCents + totals.expenseCents,
        });
      }
      return out;
    }),

  summaryByCategory: protectedProcedure
    .input(SummaryByCategoryInput)
    .output(z.array(CategoryAggregateSchema))
    .query(({ input }) => {
      const conditions = [
        gte(transactions.date, input.from),
        lte(transactions.date, input.to),
      ];
      if (input.accountId !== undefined) {
        conditions.push(eq(transactions.accountId, input.accountId));
      }

      const rows = db
        .select({
          categoryId: transactions.categoryId,
          name: categories.name,
          color: categories.color,
          cents: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(...conditions))
        .groupBy(transactions.categoryId, categories.name, categories.color)
        .all();

      return rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name ?? 'Sense categoria',
        color: r.color ?? '#8B7355',
        cents: Math.abs(r.cents),
        count: r.count,
      }));
    }),
});