<script setup lang="ts">
import { computed } from 'vue';
import { Card, StatCard, ThemeToggle } from '@finances/ui';
import { RouterLink, useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAddMovementStore } from '@/stores/addMovement';
import { useAuthStore } from '@/stores/auth';
import { useDashboardSummary } from '@/composables/queries';
import { useMonth } from '@/composables/useMonth';
import MonthSelector from '@/components/MonthSelector.vue';
import AddMovementDialog from '@/components/AddMovementDialog.vue';
import { trpc } from '@/trpc/client';

const themeStore = useThemeStore();
const addMovement = useAddMovementStore();
const auth = useAuthStore();
const router = useRouter();
const month = useMonth();

const filter = computed(() => ({ from: month.from.value, to: month.to.value }));
const { data: summary, isLoading, isError } = useDashboardSummary(filter);

async function logout() {
  try {
    await trpc.auth.logout.mutate();
  } finally {
    auth.clear();
    void router.replace({ name: 'login' });
  }
}
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <header class="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
      <div class="container flex items-center justify-between h-16">
        <h1 class="font-semibold text-lg">Finances</h1>
        <div class="flex items-center gap-1">
          <RouterLink
            to="/health"
            class="text-xs text-ink-subtle hover:text-ink px-2 py-1 rounded"
            aria-label="Estat de la connexió"
          >
            ·API
          </RouterLink>
          <button
            v-if="auth.authenticated"
            type="button"
            class="text-xs text-ink-subtle hover:text-ink px-2 py-1 rounded"
            aria-label="Tanca la sessió"
            @click="logout"
          >
            Tanca sessió
          </button>
          <ThemeToggle @click="themeStore.toggleTheme()" />
        </div>
      </div>
    </header>

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

      <!-- Categories -->
      <Card v-if="!isLoading && !isError" padding="lg">
        <header class="flex items-center justify-between mb-5">
          <h3 class="font-semibold">Despeses per categoria</h3>
          <span class="text-xs text-ink-subtle">
            {{ summary?.transactionCount ?? 0 }} moviments
          </span>
        </header>

        <div v-if="(summary?.byCategory?.length ?? 0) === 0" class="text-sm text-ink-subtle py-8 text-center">
          Cap despesa aquest mes.
          <button class="text-accent hover:underline ml-1" @click="addMovement.open({ kind: 'expense' })">
            Afegir-ne una
          </button>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="cat in summary?.byCategory ?? []"
            :key="cat.categoryId ?? 'uncategorized'"
            class="flex items-center gap-4"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-sm font-medium">{{ cat.name }}</span>
                <span class="text-sm font-mono tabular-nums text-ink-muted">
                  {{ (cat.cents / 100).toFixed(2) }} € · {{ cat.percent }}%
                </span>
              </div>
              <div class="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500 ease-smooth"
                  :style="{ width: `${Math.max(cat.percent * 2, 2)}%`, backgroundColor: cat.color }"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Bottom nav (mobile) -->
    <nav class="fixed bottom-0 inset-x-0 bg-surface border-t border-border sm:hidden z-20">
      <div class="flex items-center justify-around h-16">
        <RouterLink
          to="/"
          class="flex flex-col items-center gap-1 text-xs text-ink"
          active-class="text-accent"
          :exact-active-class="'text-accent'"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12L12 3l9 9M5 10v10h14V10"/></svg>
          Inici
        </RouterLink>
        <RouterLink
          to="/moviments"
          class="flex flex-col items-center gap-1 text-xs text-ink-subtle"
          active-class="text-accent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          Moviments
        </RouterLink>
        <button
          type="button"
          class="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-accent text-white shadow-warm"
          aria-label="Afegir moviment"
          @click="addMovement.open()"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </nav>

    <AddMovementDialog />
  </main>
</template>