import { router } from './trpc.js';
import { healthRouter } from '../routers/health.js';
import { authRouter } from '../routers/auth.js';
import { accountsRouter } from '../routers/accounts.js';
import { categoriesRouter } from '../routers/categories.js';
import { transactionsRouter } from '../routers/transactions.js';
import { dashboardRouter } from '../routers/dashboard.js';
import { budgetsRouter } from '../routers/budgets.js';

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