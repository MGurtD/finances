import { router } from './trpc.js';
import { healthRouter } from '../routers/health.js';
import { accountsRouter } from '../routers/accounts.js';
import { categoriesRouter } from '../routers/categories.js';
import { transactionsRouter } from '../routers/transactions.js';
import { dashboardRouter } from '../routers/dashboard.js';

export const appRouter = router({
  health: healthRouter,
  accounts: accountsRouter,
  categories: categoriesRouter,
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;