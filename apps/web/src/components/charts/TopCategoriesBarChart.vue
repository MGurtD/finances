<script setup lang="ts">
import { computed } from 'vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { SummaryByCategoryItem } from '@/api/types';
import { useChartColors } from '@/composables/useChartColors';
import { formatMoney } from '@finances/ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const props = withDefaults(
  defineProps<{
    data: SummaryByCategoryItem[] | undefined;
    limit?: number;
  }>(),
  { limit: 6 },
);

const { palette } = useChartColors();

// Map backend SummaryByCategoryItem to chart expectations:
// - categoryName → name
// - total → cents
// - color: generated from palette since backend doesn't provide it
const chartColors = ['#6366F1', '#2E7D32', '#1976D2', '#7B1FA2', '#ED6C02', '#5D4037', '#00838F', '#AD1457', '#F9A825', '#455A64'];

const top = computed(() =>
  (props.data ?? []).slice().sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, props.limit),
);

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: top.value.map((c) => c.categoryName ?? c.categoryId ?? 'Unknown'),
  datasets: [
    {
      label: 'Despesa',
      data: top.value.map((c) => c.total ?? 0),
      backgroundColor: top.value.map((_, i) => chartColors[i % chartColors.length] ?? palette.value.accent),
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 28,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: palette.value.ink,
      titleColor: palette.value.surface,
      bodyColor: palette.value.surface,
      callbacks: {
        label: (ctx) => ` ${formatMoney(Number(ctx.parsed.x) || 0)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { color: palette.value.border, drawTicks: false },
      ticks: {
        color: palette.value.inkSubtle,
        font: { size: 11 },
        callback: (v) => formatMoney(Number(v) || 0),
      },
      border: { display: false },
      beginAtZero: true,
    },
    y: {
      grid: { display: false },
      ticks: { color: palette.value.inkMuted, font: { size: 12 } },
      border: { color: palette.value.border },
    },
  },
}));
</script>

<template>
  <div class="h-64">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>