import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { computed, toValue } from 'vue';
import { trpc } from '@/trpc/client';
import type {
  Account,
  Category,
  CreateTransactionInput,
  DashboardSummary,
  MonthlySummary,
  RecentTransaction,
  Transaction,
} from '@finances/contracts';

type MaybeRef<T> = MaybeRefOrGetter<T> | ComputedRef<T>;

export const financeKeys = {
  accounts: () => ['accounts'] as const,
  categories: () => ['categories'] as const,
  transactions: (filter: { from?: string; to?: string; accountId?: string }) =>
    ['transactions', filter] as const,
  dashboardSummary: (from: string, to: string) => ['dashboard', 'summary', from, to] as const,
  recentTransactions: (limit: number) => ['transactions', 'recent', limit] as const,
  summaryByMonth: (months: number) => ['transactions', 'summaryByMonth', months] as const,
};

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: financeKeys.accounts(),
    queryFn: () => trpc.accounts.list.query(),
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: financeKeys.categories(),
    queryFn: () => trpc.categories.list.query(),
    staleTime: 5 * 60_000,
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