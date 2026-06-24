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
  AuthStatusSchema,
  LoginInput,
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
const protectedProcedure = t.procedure;
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

const authRouter = router({
  status: publicProcedure
    .output(AuthStatusSchema)
    .query(() => ({ authenticated: false })),
  login: publicProcedure
    .input(LoginInput)
    .output(AuthStatusSchema)
    .mutation(() => ({ authenticated: false as const })),
  logout: publicProcedure
    .output(AuthStatusSchema)
    .mutation(() => ({ authenticated: false as const })),
});

const accountsRouter = router({
  list: protectedProcedure
    .output(z.array(AccountSchema))
    .query(() => []),
  create: protectedProcedure
    .input(CreateAccountInput)
    .output(AccountSchema)
    .mutation(() => ({} as never)),
});

const categoriesRouter = router({
  list: protectedProcedure
    .output(z.array(CategorySchema))
    .query(() => []),
  create: protectedProcedure
    .input(CreateCategoryInput)
    .output(CategorySchema)
    .mutation(() => ({} as never)),
});

const transactionsRouter = router({
  list: protectedProcedure
    .input(ListTransactionsInput)
    .output(z.array(TransactionSchema))
    .query(() => []),
  create: protectedProcedure
    .input(CreateTransactionInput)
    .output(TransactionSchema)
    .mutation(() => ({} as never)),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string().uuid() }))
    .mutation(() => ({ id: '' })),
  hasAny: protectedProcedure
    .output(z.boolean())
    .query(() => false),
});

const dashboardRouter = router({
  summary: protectedProcedure
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
  auth: authRouter,
  accounts: accountsRouter,
  categories: categoriesRouter,
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;