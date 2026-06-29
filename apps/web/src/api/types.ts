// Shared types derived from the OpenAPI schema.
// Replaces @finances/contracts imports across the web app.

export type TransactionKind = 'income' | 'expense' | 'transfer';

export interface HealthResponse {
  status?: string;
  timestamp?: string;
  uptime?: string;
  version?: string;
}



export type AccountType = 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  initialBalance: number;
  currency: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  color: string;
  icon: string;
  parentId: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  date: string;
  description: string;
  kind: TransactionKind;
  notes: string;
  importHash: string | null;
  transferAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Transaction with joined account/category names (returned by /transactions/recent)
export interface TransactionWithDetails extends Transaction {
  accountName: string;
  categoryName: string | null;
  categoryColor: string;
  transferAccountName?: string;
}

export interface RecentTransaction {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  date: string;
  description: string;
  kind: TransactionKind;
}

// Monthly summary — JSON field names match the Go struct tags.
export interface MonthlySummary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  count: number;
}

// Category breakdown for charts — uses 'cents' to match chart component expectations
export interface CategoryBreakdown {
  name: string;
  cents: number;
  color?: string;
  categoryId?: string;
}

export interface DashboardSummary {
  incomeCents: number;
  expenseCents: number;
  netSavingsCents: number;
  transactionCount: number;
  byCategory: SummaryByCategoryItem[];
}

// Summary item returned by /transactions/summary-by-category
// and by /dashboard/summary's byCategory array
export interface SummaryByCategoryItem {
  categoryId: string | null;
  categoryName: string;
  total: number;
  count: number;
  color?: string;
}

export interface AccountWithBalance extends Account {
  balanceCents?: number;
}

// Request body types (for mutations)
export interface CreateAccountInput {
  name: string;
  type: string;
  color?: string;
  icon?: string;
  initialBalance?: number;
  currency?: string;
}

export interface UpdateAccountInput {
  name?: string;
  type?: string;
  color?: string;
  icon?: string;
  initialBalance?: number;
}

export interface CreateCategoryInput {
  name: string;
  kind: 'income' | 'expense';
  color?: string;
  icon?: string;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  kind?: 'income' | 'expense';
  color?: string;
  icon?: string;
  parentId?: string | null;
}

export interface CreateTransactionInput {
  accountId: string;
  categoryId?: string | null;
  amount: number;
  date: string;
  description?: string;
  kind: TransactionKind;
  notes?: string;
  importHash?: string;
  transferAccountId?: string | null;
}

export interface UpdateTransactionInput {
  amount?: number;
  categoryId?: string | null;
  date?: string;
  description?: string;
  kind?: TransactionKind;
  notes?: string;
  transferAccountId?: string | null;
}

export interface UpsertBudgetInput {
  month: string;
  categoryId?: string | null;
  amountCents: number;
}

export interface ReorderInput {
  order: string[];
}

export interface BulkCreateInput {
  transactions: CreateTransactionInput[];
}

export interface BulkCreateResult {
  inserted: number;
  skipped: number;
}

export interface BulkDeleteInput {
  ids: string[];
}

export interface BulkDeleteResult {
  deleted: number;
}

export interface LoginInput {
  password: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  issuedAt?: string;
}

export interface Budget {
  id?: string;
  categoryId?: string | null;
  month?: string;
  amountCents?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetProgress {
  categoryId: string | null;
  categoryName: string;
  categoryColor?: string;
  month: string;
  budgetId?: string;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  percent: number;
  status: 'on_track' | 'warning' | 'over';
}