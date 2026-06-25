import { TRPCError } from '@trpc/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, rawSqlite } from '@finances/db';
import { accounts, transactions } from '@finances/db';
import {
  AccountSchema,
  CreateAccountInput,
  UpdateAccountInput,
  ReorderInput,
} from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';

const IdInput = z.object({ id: z.string().uuid() });

export const accountsRouter = router({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .output(z.array(AccountSchema))
    .query(({ input }) => {
      const includeArchived = input?.includeArchived ?? false;
      const where = includeArchived ? undefined : eq(accounts.archived, false);
      return db
        .select()
        .from(accounts)
        .where(where)
        .orderBy(accounts.sortOrder)
        .all();
    }),

  byId: protectedProcedure
    .input(IdInput)
    .output(AccountSchema)
    .query(({ input }) => {
      const row = db.select().from(accounts).where(eq(accounts.id, input.id)).get();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte no trobat' });
      }
      return row;
    }),

  create: protectedProcedure
    .input(CreateAccountInput)
    .output(AccountSchema)
    .mutation(({ input }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const maxRow = db
        .select({ s: accounts.sortOrder })
        .from(accounts)
        .orderBy(accounts.sortOrder)
        .all()
        .at(-1);
      db.insert(accounts)
        .values({
          id,
          name: input.name,
          type: input.type,
          currency: input.currency ?? 'EUR',
          color: input.color,
          icon: input.icon,
          initialBalance: input.initialBalance,
          sortOrder: (maxRow?.s ?? -1) + 1,
          archived: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!row) throw new Error('Failed to create account');
      return row;
    }),

  update: protectedProcedure
    .input(UpdateAccountInput)
    .output(AccountSchema)
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte no trobat' });
      }
      const now = new Date().toISOString();
      db.update(accounts)
        .set({ ...patch, updatedAt: now })
        .where(eq(accounts.id, id))
        .run();
      const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!row) throw new Error('Failed to update account');
      return row;
    }),

  archive: protectedProcedure
    .input(IdInput)
    .output(AccountSchema)
    .mutation(({ input }) => {
      const existing = db.select().from(accounts).where(eq(accounts.id, input.id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte no trobat' });
      }
      const now = new Date().toISOString();
      db.update(accounts)
        .set({ archived: true, updatedAt: now })
        .where(eq(accounts.id, input.id))
        .run();
      const row = db.select().from(accounts).where(eq(accounts.id, input.id)).get();
      if (!row) throw new Error('Failed to archive account');
      return row;
    }),

  /**
   * Hard-delete an account. Cascades to its transactions (both legs) so we
   * don't leave orphan rows behind the FK in `transactions.account_id`. Wrapped
   * in a single better-sqlite3 transaction for atomicity.
   *
   * For accounts involved in a transfer (transferAccountId), we also remove
   * the counter-leg transaction so the books stay consistent.
   */
  delete: protectedProcedure
    .input(IdInput)
    .output(z.object({ id: z.string().uuid(), deletedTransactions: z.number().int() }))
    .mutation(({ input }) => {
      const existing = db.select().from(accounts).where(eq(accounts.id, input.id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte no trobat' });
      }
      const txCount = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.accountId, input.id))
        .all();
      const counterLegs = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.transferAccountId, input.id))
        .all();

      const deleteAll = rawSqlite.transaction(() => {
        if (txCount.length > 0) {
          db.delete(transactions).where(eq(transactions.accountId, input.id)).run();
        }
        if (counterLegs.length > 0) {
          db.delete(transactions).where(eq(transactions.transferAccountId, input.id)).run();
        }
        db.delete(accounts).where(eq(accounts.id, input.id)).run();
      });
      deleteAll();

      return { id: input.id, deletedTransactions: txCount.length + counterLegs.length };
    }),

  reorder: protectedProcedure
    .input(ReorderInput)
    .output(z.object({ count: z.number().int() }))
    .mutation(({ input }) => {
      const now = new Date().toISOString();
      const updates = input.ids.map((id, idx) =>
        db
          .update(accounts)
          .set({ sortOrder: idx, updatedAt: now })
          .where(eq(accounts.id, id))
          .run(),
      );
      if (updates.length !== input.ids.length) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: "Alguns IDs no s'han trobat",
        });
      }
      const matched = db
        .select({ id: accounts.id })
        .from(accounts)
        .where(inArray(accounts.id, input.ids))
        .all();
      if (matched.length !== input.ids.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Algun dels IDs no existeix',
        });
      }
      return { count: input.ids.length };
    }),

  /**
   * Current balance per account: initial_balance + Σ(income) − Σ(expense).
   * Transfer entries net to zero (one +leg, one −leg) so they're included as-is.
   * Used by /accounts list to render the running balance.
   */
  balances: protectedProcedure
    .output(z.array(z.object({ accountId: z.string().uuid(), balanceCents: z.number().int() })))
    .query(() => {
      // Exclude archived accounts — they should not contribute to the running
      // total on the dashboard / accounts list. (See Bug 1: archive in the UI
      // used to be invisible because list ignored `archived` and the running
      // total kept counting them.)
      const accs = db
        .select()
        .from(accounts)
        .where(eq(accounts.archived, false))
        .all();
      const txRows = db
        .select({
          accountId: transactions.accountId,
          income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.kind} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
          expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.kind} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        })
        .from(transactions)
        .groupBy(transactions.accountId)
        .all();

      const txMap = new Map<string, { income: number; expense: number }>();
      for (const row of txRows) txMap.set(row.accountId, { income: row.income, expense: row.expense });

      return accs.map((a) => {
        const totals = txMap.get(a.id) ?? { income: 0, expense: 0 };
        const balanceCents = a.initialBalance + totals.income - totals.expense;
        return { accountId: a.id, balanceCents };
      });
    }),
});