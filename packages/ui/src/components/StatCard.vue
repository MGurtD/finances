<script setup lang="ts">
import { computed } from 'vue';
import Card from './Card.vue';
import { formatMoney } from '../utils/money';
import { cn } from '../utils/cn';

const props = withDefaults(
  defineProps<{
    label: string;
    cents: number;
    trend?: number; // percentage vs previous period
    variant?: 'default' | 'income' | 'expense';
    showSign?: boolean;
  }>(),
  {
    variant: 'default',
    showSign: false,
  }
);

const valueClass = computed(() => {
  if (props.variant === 'income') return 'text-positive';
  if (props.variant === 'expense') return 'text-negative';
  return 'text-ink';
});

const trendClass = computed(() => {
  if (props.trend === undefined) return '';
  return props.trend >= 0 ? 'text-positive' : 'text-negative';
});

const trendArrow = computed(() => {
  if (props.trend === undefined) return '';
  return props.trend >= 0 ? '↑' : '↓';
});
</script>

<template>
  <Card padding="md" hoverable>
    <div class="flex flex-col gap-2">
      <span class="text-xs uppercase tracking-wide text-ink-subtle font-medium">
        {{ label }}
      </span>
      <span :class="cn('font-mono text-finance-2xl font-semibold tabular-nums', valueClass)">
        {{ formatMoney(cents, { showSign }) }}
      </span>
      <span
        v-if="trend !== undefined"
        :class="cn('text-xs font-medium tabular-nums', trendClass)"
      >
        {{ trendArrow }} {{ Math.abs(trend).toFixed(1) }}% vs anterior
      </span>
    </div>
  </Card>
</template>