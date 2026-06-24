<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Card, formatMoney } from '@finances/ui';
import { RouterLink } from 'vue-router';
import {
  useBudgetStatus,
  useDeleteBudget,
  useUpsertBudget,
} from '@/composables/queries';
import { useMonth } from '@/composables/useMonth';

const month = useMonth();
const monthKey = computed(() => month.currentMonth.value);
const { data: progress, isLoading } = useBudgetStatus(monthKey);
const upsert = useUpsertBudget();
const del = useDeleteBudget();

const global = computed(() => (progress.value ?? []).find((p) => p.categoryId === null) ?? null);
const perCategory = computed(() =>
  (progress.value ?? []).filter((p) => p.categoryId !== null),
);

const draftAmounts = ref<Record<string, string>>({});

watch(
  () => monthKey.value,
  () => {
    draftAmounts.value = {};
  },
);

async function saveGlobal() {
  const cents = parseDraftToCents(draftAmounts.value['__global'] ?? '');
  if (cents <= 0) return;
  await upsert.mutateAsync({
    categoryId: null,
    month: monthKey.value,
    amountCents: cents,
  });
  draftAmounts.value['__global'] = '';
}

async function removeGlobal() {
  if (!global.value?.budgetId) return;
  await del.mutateAsync(global.value.budgetId);
}

async function saveCategory(categoryId: string) {
  const cents = parseDraftToCents(draftAmounts.value[categoryId] ?? '');
  if (cents <= 0) return;
  await upsert.mutateAsync({
    categoryId,
    month: monthKey.value,
    amountCents: cents,
  });
  draftAmounts.value[categoryId] = '';
}

async function removeCategory(budgetId: string) {
  await del.mutateAsync(budgetId);
}

function parseDraftToCents(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function statusColor(status: string): string {
  if (status === 'over') return '#c62828';
  if (status === 'warning') return '#ed6c02';
  return '#2e7d32';
}

function statusLabel(status: string): string {
  if (status === 'over') return 'Superat';
  if (status === 'warning') return 'Aprop del límit';
  return 'En marxa';
}

function fillWidth(percent: number): number {
  return Math.min(100, Math.max(2, percent));
}
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <header class="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
      <div class="container flex items-center justify-between h-16">
        <h1 class="font-semibold text-lg">Pressupostos</h1>
        <RouterLink to="/" class="text-sm text-accent hover:underline">← Inici</RouterLink>
      </div>
    </header>

    <div class="container py-8 space-y-6 animate-fade-in">
      <p class="text-sm text-ink-subtle">{{ month.label.value }}</p>

      <!-- Global budget -->
      <Card padding="lg">
        <header class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">Pressupost global</h3>
          <span
            v-if="global"
            class="text-xs font-medium px-2 py-0.5 rounded-full"
            :style="{ backgroundColor: statusColor(global.status) + '22', color: statusColor(global.status) }"
          >
            {{ statusLabel(global.status) }}
          </span>
        </header>

        <div v-if="global" class="mb-4">
          <div class="flex items-baseline justify-between text-sm mb-1.5">
            <span class="text-ink-subtle">
              {{ formatMoney(global.spentCents) }} de {{ formatMoney(global.budgetCents) }}
            </span>
            <span class="font-mono tabular-nums">{{ global.percent }}%</span>
          </div>
          <div class="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500 ease-smooth"
              :style="{ width: `${fillWidth(global.percent)}%`, backgroundColor: statusColor(global.status) }"
            />
          </div>
          <button
            type="button"
            class="mt-3 text-xs text-ink-subtle hover:text-negative"
            :disabled="del.isPending.value"
            @click="removeGlobal"
          >
            Esborrar pressupost global
          </button>
        </div>

        <form class="flex items-center gap-2" @submit.prevent="saveGlobal">
          <input
            v-model="draftAmounts['__global']"
            type="text"
            inputmode="decimal"
            placeholder="0,00"
            class="flex-1 h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="submit"
            class="h-11 px-4 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50"
            :disabled="upsert.isPending.value"
          >
            {{ global ? 'Actualitzar' : 'Crear' }}
          </button>
        </form>
      </Card>

      <!-- Per category -->
      <Card v-if="!isLoading" padding="lg">
        <header class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">Per categoria</h3>
          <span class="text-xs text-ink-subtle">{{ perCategory.length }} categories</span>
        </header>

        <div v-if="perCategory.length === 0" class="text-sm text-ink-subtle py-8 text-center">
          Cap categoria de despeses.
        </div>

        <ul v-else class="space-y-4">
          <li v-for="row in perCategory" :key="row.categoryId ?? row.categoryName">
            <div class="flex items-center gap-3 mb-1.5">
              <span
                class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: row.categoryColor }"
              />
              <span class="flex-1 text-sm font-medium truncate">{{ row.categoryName }}</span>
              <span
                v-if="row.budgetCents > 0"
                class="text-xs font-medium px-2 py-0.5 rounded-full"
                :style="{ backgroundColor: statusColor(row.status) + '22', color: statusColor(row.status) }"
              >
                {{ statusLabel(row.status) }}
              </span>
            </div>

            <div v-if="row.budgetCents > 0" class="mb-2">
              <div class="flex items-baseline justify-between text-xs mb-1">
                <span class="text-ink-subtle">
                  {{ formatMoney(row.spentCents) }} de {{ formatMoney(row.budgetCents) }}
                </span>
                <span class="font-mono tabular-nums text-ink-muted">{{ row.percent }}%</span>
              </div>
              <div class="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500 ease-smooth"
                  :style="{ width: `${fillWidth(row.percent)}%`, backgroundColor: statusColor(row.status) }"
                />
              </div>
            </div>

            <form class="flex items-center gap-2" @submit.prevent="saveCategory(row.categoryId ?? '')">
              <input
                v-model="draftAmounts[row.categoryId ?? '']"
                type="text"
                inputmode="decimal"
                :placeholder="row.budgetCents > 0 ? formatMoney(row.budgetCents) : '0,00'"
                class="flex-1 h-9 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 text-sm"
              />
              <button
                type="submit"
                class="h-9 px-3 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                :disabled="upsert.isPending.value"
              >
                {{ row.budgetCents > 0 ? 'Actualitzar' : 'Crear' }}
              </button>
              <button
                v-if="row.budgetId"
                type="button"
                class="h-9 px-2 text-ink-subtle hover:text-negative text-sm"
                :disabled="del.isPending.value"
                @click="removeCategory(row.budgetId ?? '')"
              >
                ✕
              </button>
            </form>
          </li>
        </ul>
      </Card>

      <div v-else class="text-sm text-ink-subtle">Carregant…</div>
    </div>
  </main>
</template>