<script setup lang="ts">
import { computed } from 'vue';
import { Card, Button, formatMoney } from '@finances/ui';
import { useAddMovementStore } from '@/stores/addMovement';
import { useMonth } from '@/composables/useMonth';
import { useTransactionsList, useCategories, useDeleteTransaction } from '@/composables/queries';
import MonthSelector from '@/components/MonthSelector.vue';

const month = useMonth();
const addMovement = useAddMovementStore();
const { data: categories } = useCategories();
const del = useDeleteTransaction();

const filter = computed(() => ({ from: month.from.value, to: month.to.value }));
const { data: transactions, isLoading } = useTransactionsList(filter);

const categoryMap = computed(() => {
  const map = new Map<string, { name: string; color: string }>();
  for (const c of categories.value ?? []) map.set(c.id, { name: c.name, color: c.color });
  return map;
});

function categoryFor(id: string | null) {
  if (!id) return { name: 'Sense categoria', color: '#8B7355' };
  return categoryMap.value.get(id) ?? { name: '—', color: '#8B7355' };
}

const groupedByDate = computed(() => {
  const map = new Map<string, typeof transactions.value>();
  for (const t of transactions.value ?? []) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
});

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <div class="container py-8 space-y-6 animate-fade-in">
      <h1 class="font-semibold text-lg">Moviments</h1>
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <MonthSelector :label="month.label.value" @prev="month.prev" @next="month.next" />
        <Button @click="addMovement.open({ date: month.from.value })">
          Afegir moviment
        </Button>
      </div>

      <Card v-if="isLoading" padding="lg">
        <p class="text-sm text-ink-subtle">Carregant moviments…</p>
      </Card>

      <Card v-else-if="(transactions?.length ?? 0) === 0" padding="lg">
        <div class="py-12 text-center space-y-3">
          <p class="text-ink-subtle">Cap moviment aquest mes.</p>
          <Button @click="addMovement.open({ date: month.from.value })">
            Afegir el primer
          </Button>
        </div>
      </Card>

      <div v-else class="space-y-4">
        <div v-for="[date, items] in groupedByDate" :key="date">
          <h3 class="text-xs uppercase tracking-wide text-ink-subtle font-medium mb-2 px-1">
            {{ formatDate(date) }}
          </h3>
          <Card padding="none">
            <ul class="divide-y divide-border">
              <li
                v-for="t in items"
                :key="t.id"
                class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
              >
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: categoryFor(t.categoryId).color }"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ t.description || categoryFor(t.categoryId).name }}</p>
                  <p class="text-xs text-ink-subtle">{{ categoryFor(t.categoryId).name }}</p>
                </div>
                <span
                  class="font-mono text-sm tabular-nums shrink-0"
                  :class="t.kind === 'income' ? 'text-positive' : 'text-negative'"
                >
                  {{ formatMoney(t.kind === 'income' ? t.amount : -t.amount, { showSign: true }) }}
                </span>
                <button
                  type="button"
                  class="text-ink-subtle hover:text-negative p-1 shrink-0"
                  :aria-label="`Esborrar ${t.description || 'moviment'}`"
                  :disabled="del.isPending.value"
                  @click="del.mutate(t.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  </main>
</template>