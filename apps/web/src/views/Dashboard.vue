<script setup lang="ts">
import { computed } from 'vue';
import { Card, StatCard } from '@finances/ui';
import { RouterLink } from 'vue-router';
import { useAddMovementStore } from '@/stores/addMovement';
import {
  useDashboardSummary,
  useRecentTransactions,
  useSummaryByMonth,
  useBudgetStatus,
} from '@/composables/queries';
import { useMonth } from '@/composables/useMonth';
import { formatMoney } from '@finances/ui';
import MonthSelector from '@/components/MonthSelector.vue';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart.vue';
import CategoryDonutChart from '@/components/charts/CategoryDonutChart.vue';
import TopCategoriesBarChart from '@/components/charts/TopCategoriesBarChart.vue';
import RecentTransactionsCard from '@/components/RecentTransactionsCard.vue';

const addMovement = useAddMovementStore();
const month = useMonth();

const filter = computed(() => ({ from: month.from.value, to: month.to.value }));
const { data: summary, isLoading, isError } = useDashboardSummary(filter);
const { data: trend } = useSummaryByMonth(6);
const { data: recent, isLoading: recentLoading } = useRecentTransactions(6);
const { data: budgetStatus } = useBudgetStatus(month.currentMonth);

const expenseBreakdown = computed(() => summary.value?.byCategory ?? []);

const budgetHighlights = computed(() => {
  const list = budgetStatus.value ?? [];
  return list
    .filter((b) => b.budgetCents > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);
});

function statusColor(status: string): string {
  if (status === 'over') return '#c62828';
  if (status === 'warning') return '#ed6c02';
  return '#2e7d32';
}

function fillWidth(percent: number): number {
  return Math.min(100, Math.max(2, percent));
}
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <div class="container py-8 space-y-8 animate-fade-in">
      <!-- Period -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex flex-col gap-1">
          <MonthSelector :label="month.label.value" @prev="month.prev" @next="month.next" />
          <span class="text-sm text-ink-subtle">fotografia del mes</span>
        </div>
        <button
          type="button"
          class="self-start sm:self-auto inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent text-white font-medium hover:bg-accent-hover shadow-soft transition-colors"
          @click="addMovement.open({ kind: 'expense' })"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Afegir moviment
        </button>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Estalvi net"
          :cents="summary?.netSavingsCents ?? 0"
          variant="income"
          :show-sign="(summary?.netSavingsCents ?? 0) !== 0"
        />
        <StatCard
          label="Despeses"
          :cents="summary?.expenseCents ?? 0"
          variant="expense"
        />
        <StatCard
          label="Ingressos"
          :cents="summary?.incomeCents ?? 0"
          variant="default"
        />
      </div>

      <!-- Loading / error -->
      <div v-if="isLoading" class="text-sm text-ink-subtle">Carregant dades…</div>
      <div v-else-if="isError" class="text-sm text-negative">
        No s'han pogut carregar les dades. Comprova que l'API està en marxa.
      </div>

      <template v-else>
        <!-- Budgets highlight -->
        <Card v-if="budgetHighlights.length > 0" padding="lg">
          <header class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">Pressupostos</h3>
            <RouterLink to="/budgets" class="text-xs text-accent hover:underline">
              Gestionar →
            </RouterLink>
          </header>
          <ul class="space-y-3">
            <li v-for="b in budgetHighlights" :key="b.budgetId ?? b.categoryName" class="space-y-1.5">
              <div class="flex items-center gap-3">
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: b.categoryColor }"
                />
                <span class="flex-1 text-sm font-medium truncate">{{ b.categoryName }}</span>
                <span
                  class="text-xs font-mono tabular-nums shrink-0"
                  :style="{ color: statusColor(b.status) }"
                >
                  {{ b.percent }}%
                </span>
              </div>
              <div class="flex items-baseline justify-between text-xs">
                <span class="text-ink-subtle">
                  {{ formatMoney(b.spentCents) }} / {{ formatMoney(b.budgetCents) }}
                </span>
              </div>
              <div class="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500 ease-smooth"
                  :style="{ width: `${fillWidth(b.percent)}%`, backgroundColor: statusColor(b.status) }"
                />
              </div>
            </li>
          </ul>
        </Card>

        <!-- Trend -->
        <Card padding="lg">
          <header class="flex items-center justify-between mb-5">
            <h3 class="font-semibold">Tendència 6 mesos</h3>
            <span class="text-xs text-ink-subtle">ingressos vs despeses</span>
          </header>
          <MonthlyTrendChart :data="trend" />
        </Card>

        <!-- Categories: donut + bar -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="lg">
            <header class="flex items-center justify-between mb-5">
              <h3 class="font-semibold">Distribució del mes</h3>
              <span class="text-xs text-ink-subtle">per categoria</span>
            </header>
            <CategoryDonutChart :data="expenseBreakdown" />
          </Card>

          <Card padding="lg">
            <header class="flex items-center justify-between mb-5">
              <h3 class="font-semibold">Top categories</h3>
              <span class="text-xs text-ink-subtle">
                {{ summary?.transactionCount ?? 0 }} moviments
              </span>
            </header>
            <TopCategoriesBarChart :data="expenseBreakdown" :limit="6" />
          </Card>
        </div>

        <!-- Recent transactions -->
        <RecentTransactionsCard :data="recent ?? []" :loading="recentLoading" />
      </template>
    </div>
  </main>
</template>