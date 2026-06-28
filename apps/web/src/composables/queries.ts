import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { computed, toValue } from 'vue';
import { api } from '@/api/client';
import type {
  Account,
  AccountWithBalance,
  AuthStatusResponse,
  BudgetProgress,
  BulkCreateInput,
  BulkCreateResult,
  BulkDeleteInput,
  BulkDeleteResult,
  Category,
  CategoryTreeNode,
  CreateAccountInput,
  CreateCategoryInput,
  CreateTransactionInput,
  DashboardSummary,
  MonthlySummary,
  ReorderInput,
  Transaction,
  TransactionWithDetails,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateTransactionInput,
  UpsertBudgetInput,
} from '@/api/types';

type MaybeRef<T> = MaybeRefOrGetter<T> | ComputedRef<T>;

// openapi-fetch v0.17 in Vue mode wraps `data` in a Svelte-style Readable.
// At runtime it resolves to the JSON body, but TS sees Readable<T>.
// Helper: unwrap with a cast. Runtime behavior is unchanged.
async function get<T>(path: string, opts?: Record<string, unknown>): Promise<T> {
  const { data, error } = await api.GET(path as never, (opts ?? {}) as never);
  if (error) throw error;
  return data as unknown as T;
}

async function post<T>(path: string, body: unknown, opts?: Record<string, unknown>): Promise<T> {
  const { data, error } = await api.POST(path as never, { body, ...opts } as never);
  if (error) throw error;
  return data as unknown as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const { data, error } = await api.PUT(path as never, { body } as never);
  if (error) throw error;
  return data as unknown as T;
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await api.PATCH(path as never, body ? ({ body } as never) : ({} as never));
  if (error) throw error;
  return data as unknown as T;
}

async function del<T>(path: string): Promise<T> {
  const { data, error } = await api.DELETE(path as never);
  if (error) throw error;
  return data as unknown as T;
}

// ── query keys ────────────────────────────────────────────────────────────────

export const financeKeys = {
  accounts: () => ['accounts'] as const,
  accountBalances: () => ['accounts', 'balances'] as const,
  categories: () => ['categories'] as const,
  categoryTree: (kind?: 'income' | 'expense') => ['categories', 'tree', kind ?? 'all'] as const,
  transactions: (filter: { from?: string; to?: string; accountId?: string }) =>
    ['transactions', filter] as const,
  dashboardSummary: (from: string, to: string) => ['dashboard', 'summary', from, to] as const,
  recentTransactions: (limit: number) => ['transactions', 'recent', limit] as const,
  summaryByMonth: (months: number) => ['transactions', 'summaryByMonth', months] as const,
  budgets: (month: string) => ['budgets', month] as const,
  budgetStatus: (month: string) => ['budgets', 'status', month] as const,
};

// ── accounts ──────────────────────────────────────────────────────────────────

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: financeKeys.accounts(),
    queryFn: () => get<Account[]>('/accounts'),
    staleTime: 5 * 60_000,
  });
}

export function useAccountBalances() {
  return useQuery<AccountWithBalance[]>({
    queryKey: financeKeys.accountBalances(),
    queryFn: () => get<AccountWithBalance[]>('/accounts/balances'),
    staleTime: 60_000,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => post<Account>('/accounts', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccountInput & { id: string }) =>
      put<Account>(`/accounts/${input.id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: ['accountBalances'] });
    },
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patch<Account>(`/accounts/${id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: ['accountBalances'] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<{ id: string }>(`/accounts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: ['accountBalances'] });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ── categories ────────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: financeKeys.categories(),
    queryFn: () => get<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });
}

export function useCategoryTree(kind?: MaybeRef<'income' | 'expense' | undefined>) {
  return useQuery<CategoryTreeNode[]>({
    queryKey: computed(() => financeKeys.categoryTree(toValue(kind))),
    queryFn: () => get<CategoryTreeNode[]>('/categories/tree', { params: { query: { kind: toValue(kind) } } }),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => post<Category>('/categories', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCategoryInput & { id: string }) =>
      put<Category>(`/categories/${input.id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patch<Category>(`/categories/${id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderInput) => post<{ ok: boolean }>('/categories/reorder', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

// ── transactions ──────────────────────────────────────────────────────────────

export function useTransactionsList(filter: MaybeRef<{ from: string; to: string; accountId?: string }>) {
  return useQuery<Transaction[]>({
    queryKey: computed(() => financeKeys.transactions(toValue(filter))),
    queryFn: () => {
      const f = toValue(filter);
      return get<Transaction[]>('/transactions', {
        params: { query: { from: f.from, to: f.to, accountId: f.accountId, limit: 1000, offset: 0 } },
      });
    },
  });
}

export function useDashboardSummary(filter: MaybeRef<{ from: string; to: string; accountId?: string }>) {
  return useQuery<DashboardSummary>({
    queryKey: computed(() => {
      const f = toValue(filter);
      return financeKeys.dashboardSummary(f.from, f.to);
    }),
    queryFn: () => {
      const f = toValue(filter);
      return get<DashboardSummary>('/dashboard/summary', {
        params: { query: { from: f.from, to: f.to } },
      });
    },
  });
}

export function useRecentTransactions(limit: number = 5) {
  return useQuery<TransactionWithDetails[]>({
    queryKey: financeKeys.recentTransactions(limit),
    queryFn: () => get<TransactionWithDetails[]>('/transactions/recent', { params: { query: { limit } } }),
  });
}

export function useSummaryByMonth(months: number = 6) {
  return useQuery<MonthlySummary[]>({
    queryKey: financeKeys.summaryByMonth(months),
    queryFn: () => get<MonthlySummary[]>('/transactions/summary-by-month', { params: { query: { months } } }),
    staleTime: 5 * 60_000,
  });
}

export function useBudgetStatus(month: MaybeRef<string>) {
  return useQuery<BudgetProgress[]>({
    queryKey: computed(() => financeKeys.budgetStatus(toValue(month))),
    queryFn: () => get<BudgetProgress[]>('/budgets/status', { params: { query: { month: toValue(month) } } }),
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBudgetInput) => post<BudgetProgress>('/budgets', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<{ id: string }>(`/budgets/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useBulkCreateTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkCreateInput) => post<BulkCreateResult>('/transactions/bulk', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => post<Transaction>('/transactions', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<{ id: string }>(`/transactions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useBulkDeleteTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkDeleteInput) =>
      post<BulkDeleteResult>('/transactions/bulk-delete', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTransactionInput & { id: string }) =>
      put<Transaction>(`/transactions/${input.id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

// ── auth ──────────────────────────────────────────────────────────────────────

export function useAuthStatus() {
  return useQuery<AuthStatusResponse>({
    queryKey: ['auth', 'status'] as const,
    queryFn: () => get<AuthStatusResponse>('/auth/status'),
    staleTime: 30_000,
  });
}