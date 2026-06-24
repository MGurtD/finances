/**
 * @finances/api — type-only mirror of apps/api/src/trpc/router.ts.
 * The web client imports `AppRouter` from this package for inference;
 * the runtime tRPC client lives in apps/web/src/trpc/client.ts and
 * talks to apps/api. This mirror exists so the web does not depend
 * on apps/api source at build time.
 *
 * Boundary rule (per AGENTS.md):
 * - web imports `import type { AppRouter } from '@finances/api'` — types only
 * - apps/api does NOT import this package
 *
 * Each procedure below mirrors apps/api shape for type inference.
 * Bodies return stub values that satisfy .output schemas; they never
 * run on the web (the type import is stripped by Vite/esbuild).
 */

import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import {
  HealthSchema,
  AccountSchema,
  CreateAccountInput,
  CategorySchema,
  CreateCategoryInput,
  TransactionSchema,
  CreateTransactionInput,
  ListTransactionsInput,
  DashboardSummaryInput,
  DashboardSummarySchema,
} from '@finances/contracts';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const healthRouter = router({
  get: publicProcedure
    .output(HealthSchema)
    .query(() => ({
      status: 'ok' as const,
      version: '0.1.0',
      uptime: 0,
      timestamp: new Date().toISOString(),
    })),
});

const accountsRouter = router({
  list: publicProcedure
    .output(z.array(AccountSchema))
    .query(() => []),
  create: publicProcedure
    .input(CreateAccountInput)
    .output(AccountSchema)
    .mutation(() => ({} as never)),
});

const categoriesRouter = router({
  list: publicProcedure
    .output(z.array(CategorySchema))
    .query(() => []),
  create: publicProcedure
    .input(CreateCategoryInput)
    .output(CategorySchema)
    .mutation(() => ({} as never)),
});

const transactionsRouter = router({
  list: publicProcedure
    .input(ListTransactionsInput)
    .output(z.array(TransactionSchema))
    .query(() => []),
  create: publicProcedure
    .input(CreateTransactionInput)
    .output(TransactionSchema)
    .mutation(() => ({} as never)),
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string().uuid() }))
    .mutation(() => ({ id: '' })),
  hasAny: publicProcedure
    .output(z.boolean())
    .query(() => false),
});

const dashboardRouter = router({
  summary: publicProcedure
    .input(DashboardSummaryInput)
    .output(DashboardSummarySchema)
    .query(() => ({
      from: '',
      to: '',
      incomeCents: 0,
      expenseCents: 0,
      netSavingsCents: 0,
      transactionCount: 0,
      byCategory: [],
    })),
});

export const appRouter = router({
  health: healthRouter,
  accounts: accountsRouter,
  categories: categoriesRouter,
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;