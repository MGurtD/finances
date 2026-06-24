import { z } from 'zod';
import { db } from '@finances/db';
import { transactions } from '@finances/db';
import {
  TransactionSchema,
  CreateTransactionInput,
  ListTransactionsInput,
} from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';
import { and, between, desc, eq, gte, lte, sql } from 'drizzle-orm';

export const transactionsRouter = router({
  list: protectedProcedure
    .input(ListTransactionsInput)
    .output(z.array(TransactionSchema))
    .query(({ input }) => {
      const conditions = [];
      if (input.accountId) conditions.push(eq(transactions.accountId, input.accountId));
      if (input.categoryId) conditions.push(eq(transactions.categoryId, input.categoryId));
      if (input.kind) conditions.push(eq(transactions.kind, input.kind));
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
          transferAccountId: input.transferAccountId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!row) throw new Error('Failed to create transaction');
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
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
});