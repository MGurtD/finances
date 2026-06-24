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
  UpdateAccountInput,
  CategorySchema,
  CategoryTreeNodeSchema,
  CreateCategoryInput,
  UpdateCategoryInput,
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
  DashboardSummaryInput,
  DashboardSummarySchema,
  BudgetSchema,
  UpsertBudgetInput,
  UpdateBudgetInput,
  BudgetProgressSchema,
  BudgetStatusInput,
} from '@finances/contracts';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure;
const router = t.router;

const IdInput = z.object({ id: z.string().uuid() });
const ReorderInput = z.object({ ids: z.array(z.string().uuid()).min(1) });

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
    .query(() => [] as unknown as z.infer<typeof AccountSchema>[]),
  byId: protectedProcedure
    .input(IdInput)
    .output(AccountSchema)
    .query(() => ({} as unknown as z.infer<typeof AccountSchema>)),
  create: protectedProcedure
    .input(CreateAccountInput)
    .output(AccountSchema)
    .mutation(() => ({} as unknown as z.infer<typeof AccountSchema>)),
  update: protectedProcedure
    .input(UpdateAccountInput)
    .output(AccountSchema)
    .mutation(() => ({} as unknown as z.infer<typeof AccountSchema>)),
  archive: protectedProcedure
    .input(IdInput)
    .output(AccountSchema)
    .mutation(() => ({} as unknown as z.infer<typeof AccountSchema>)),
  reorder: protectedProcedure
    .input(ReorderInput)
    .output(z.object({ count: z.number().int() }))
    .mutation(() => ({ count: 0 })),
  balances: protectedProcedure
    .output(z.array(z.object({ accountId: z.string().uuid(), balanceCents: z.number().int() })))
    .query(() => [] as unknown as { accountId: string; balanceCents: number }[]),
});

const categoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .output(z.array(CategorySchema))
    .query(() => [] as unknown as z.infer<typeof CategorySchema>[]),
  byId: protectedProcedure
    .input(IdInput)
    .output(CategorySchema)
    .query(() => ({} as unknown as z.infer<typeof CategorySchema>)),
  tree: protectedProcedure
    .input(z.object({ kind: z.enum(['income', 'expense']).optional() }).optional())
    .output(z.array(CategoryTreeNodeSchema))
    .query(() => [] as unknown as z.infer<typeof CategoryTreeNodeSchema>[]),
  create: protectedProcedure
    .input(CreateCategoryInput)
    .output(CategorySchema)
    .mutation(() => ({} as unknown as z.infer<typeof CategorySchema>)),
  update: protectedProcedure
    .input(UpdateCategoryInput)
    .output(CategorySchema)
    .mutation(() => ({} as unknown as z.infer<typeof CategorySchema>)),
  archive: protectedProcedure
    .input(IdInput)
    .output(CategorySchema)
    .mutation(() => ({} as unknown as z.infer<typeof CategorySchema>)),
  reorder: protectedProcedure
    .input(ReorderInput)
    .output(z.object({ count: z.number().int() }))
    .mutation(() => ({ count: 0 })),
});

const transactionsRouter = router({
  list: protectedProcedure
    .input(ListTransactionsInput)
    .output(z.array(TransactionSchema))
    .query(() => [] as unknown as z.infer<typeof TransactionSchema>[]),
  byId: protectedProcedure
    .input(IdInput)
    .output(TransactionSchema)
    .query(() => ({} as unknown as z.infer<typeof TransactionSchema>)),
  create: protectedProcedure
    .input(CreateTransactionInput)
    .output(TransactionSchema)
    .mutation(() => ({} as unknown as z.infer<typeof TransactionSchema>)),
  update: protectedProcedure
    .input(UpdateTransactionInput)
    .output(TransactionSchema)
    .mutation(() => ({} as unknown as z.infer<typeof TransactionSchema>)),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string().uuid() }))
    .mutation(() => ({ id: '' })),
  hasAny: protectedProcedure
    .output(z.boolean())
    .query(() => false),
  bulkCreate: protectedProcedure
    .input(BulkCreateInput)
    .output(BulkCreateResult)
    .mutation(() => ({ created: 0, skipped: 0, errors: 0 })),
  recent: protectedProcedure
    .input(RecentTransactionsInput)
    .output(z.array(RecentTransactionSchema))
    .query(() => [] as unknown as z.infer<typeof RecentTransactionSchema>[]),
  summaryByMonth: protectedProcedure
    .input(SummaryByMonthInput)
    .output(z.array(MonthlySummarySchema))
    .query(() => [] as unknown as z.infer<typeof MonthlySummarySchema>[]),
  summaryByCategory: protectedProcedure
    .input(SummaryByCategoryInput)
    .output(z.array(CategoryAggregateSchema))
    .query(() => [] as unknown as z.infer<typeof CategoryAggregateSchema>[]),
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

const budgetsRouter = router({
  list: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .output(z.array(BudgetSchema))
    .query(() => [] as unknown as z.infer<typeof BudgetSchema>[]),
  upsert: protectedProcedure
    .input(UpsertBudgetInput)
    .output(BudgetSchema)
    .mutation(() => ({} as unknown as z.infer<typeof BudgetSchema>)),
  update: protectedProcedure
    .input(UpdateBudgetInput)
    .output(BudgetSchema)
    .mutation(() => ({} as unknown as z.infer<typeof BudgetSchema>)),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string().uuid() }))
    .mutation(() => ({ id: '' })),
  status: protectedProcedure
    .input(BudgetStatusInput)
    .output(z.array(BudgetProgressSchema))
    .query(() => [] as unknown as z.infer<typeof BudgetProgressSchema>[]),
});

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  accounts: accountsRouter,
  categories: categoriesRouter,
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
  budgets: budgetsRouter,
});

export type AppRouter = typeof appRouter;