<script setup lang="ts">
import { computed } from 'vue';
import { Card, formatMoney } from '@finances/ui';
import { RouterLink } from 'vue-router';
import type { TransactionWithDetails } from '@/api/types';

const props = defineProps<{
  data: TransactionWithDetails[] | undefined;
  loading?: boolean;
}>();

function formatDate(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return 'Avui';
  if (iso === yesterday) return 'Ahir';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function shortMonth(iso: string): string {
  const [, m] = iso.split('-');
  const MONTHS = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'];
  const idx = (Number(m) || 1) - 1;
  return MONTHS[idx] ?? m ?? '';
}

const hasData = computed(() => (props.data?.length ?? 0) > 0);
</script>

<template>
  <Card padding="lg">
    <header class="flex items-center justify-between mb-5">
      <h3 class="font-semibold">Últims moviments</h3>
      <RouterLink
        to="/moviments"
        class="text-xs text-accent hover:underline"
      >
        Veure tots →
      </RouterLink>
    </header>

    <div v-if="loading && !hasData" class="text-sm text-ink-subtle py-8 text-center">
      Carregant…
    </div>

    <div v-else-if="!hasData" class="text-sm text-ink-subtle py-8 text-center">
      Cap moviment encara.
    </div>

    <ul v-else class="divide-y divide-border -mx-2">
      <li
        v-for="t in data"
        :key="t.id"
        class="flex items-center gap-3 px-2 py-3"
      >
        <span
          class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: t.categoryColor ?? '#8B7355' }"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">
            {{ t.description || t.categoryName || 'Moviment' }}
          </p>
          <p class="text-xs text-ink-subtle truncate">
            {{ t.categoryName ?? 'Sense categoria' }} · {{ t.accountName }}
          </p>
        </div>
        <div class="text-right shrink-0">
          <p
            class="font-mono text-sm tabular-nums"
            :class="t.kind === 'income' ? 'text-positive' : 'text-negative'"
          >
            {{ formatMoney(t.kind === 'income' ? (t.amount ?? 0) : -(t.amount ?? 0), { showSign: true }) }}
          </p>
          <p class="text-[11px] text-ink-subtle">
            {{ formatDate(t.date ?? '') }}
            <span v-if="!['Avui','Ahir'].includes(formatDate(t.date ?? ''))" class="ml-0.5">{{ shortMonth(t.date ?? '') }}</span>
          </p>
        </div>
      </li>
    </ul>
  </Card>
</template>