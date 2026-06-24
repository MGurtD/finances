import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { computed, toValue } from 'vue';
import { trpc } from '@/trpc/client';
import type {
  Account,
  Budget,
  BudgetProgress,
  BulkCreateInput,
  BulkCreateResult,
  Category,
  CategoryTreeNode,
  CreateAccountInput,
  CreateCategoryInput,
  CreateTransactionInput,
  DashboardSummary,
  MonthlySummary,
  RecentTransaction,
  ReorderInput,
  Transaction,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpsertBudgetInput,
} from '@finances/contracts';

type MaybeRef<T> = MaybeRefOrGetter<T> | ComputedRef<T>;

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

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: financeKeys.accounts(),
    queryFn: () => trpc.accounts.list.query(),
    staleTime: 5 * 60_000,
  });
}

export function useAccountBalances() {
  return useQuery<{ accountId: string; balanceCents: number }[]>({
    queryKey: financeKeys.accountBalances(),
    queryFn: () => trpc.accounts.balances.query(),
    staleTime: 60_000,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => trpc.accounts.create.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccountInput) => trpc.accounts.update.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: ['accountBalances'] });
    },
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.accounts.archive.mutate({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: ['accountBalances'] });
    },
  });
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: financeKeys.categories(),
    queryFn: () => trpc.categories.list.query(),
    staleTime: 5 * 60_000,
  });
}

export function useCategoryTree(kind?: MaybeRef<'income' | 'expense' | undefined>) {
  return useQuery<CategoryTreeNode[]>({
    queryKey: computed(() => financeKeys.categoryTree(toValue(kind))),
    queryFn: () => trpc.categories.tree.query({ kind: toValue(kind) }),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => trpc.categories.create.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCategoryInput) => trpc.categories.update.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.categories.archive.mutate({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderInput) => trpc.categories.reorder.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useTransactionsList(filter: MaybeRef<{ from: string; to: string; accountId?: string }>) {
  return useQuery<Transaction[]>({
    queryKey: computed(() => financeKeys.transactions(toValue(filter))),
    queryFn: () => {
      const f = toValue(filter);
      return trpc.transactions.list.query({
        from: f.from,
        to: f.to,
        accountId: f.accountId,
        limit: 200,
        offset: 0,
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
      return trpc.dashboard.summary.query({ from: f.from, to: f.to });
    },
  });
}

export function useRecentTransactions(limit: number = 5) {
  return useQuery<RecentTransaction[]>({
    queryKey: financeKeys.recentTransactions(limit),
    queryFn: () => trpc.transactions.recent.query({ limit }),
  });
}

export function useSummaryByMonth(months: number = 6) {
  return useQuery<MonthlySummary[]>({
    queryKey: financeKeys.summaryByMonth(months),
    queryFn: () => trpc.transactions.summaryByMonth.query({ months }),
    staleTime: 5 * 60_000,
  });
}

export function useBudgetStatus(month: MaybeRef<string>) {
  return useQuery<BudgetProgress[]>({
    queryKey: computed(() => financeKeys.budgetStatus(toValue(month))),
    queryFn: () => trpc.budgets.status.query({ month: toValue(month) }),
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBudgetInput) => trpc.budgets.upsert.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.budgets.delete.mutate({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useBulkCreateTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkCreateInput) => trpc.transactions.bulkCreate.mutate(input),
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
    mutationFn: (input: CreateTransactionInput) =>
      trpc.transactions.create.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.transactions.delete.mutate({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}