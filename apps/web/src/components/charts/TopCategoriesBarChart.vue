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
import type { CategoryBreakdown } from '@finances/contracts';
import { useChartColors } from '@/composables/useChartColors';
import { formatMoney } from '@finances/ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const props = withDefaults(
  defineProps<{
    data: CategoryBreakdown[] | undefined;
    limit?: number;
  }>(),
  { limit: 6 },
);

const { palette } = useChartColors();

const top = computed(() =>
  (props.data ?? []).slice().sort((a, b) => b.cents - a.cents).slice(0, props.limit),
);

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: top.value.map((c) => c.name),
  datasets: [
    {
      label: 'Despesa',
      data: top.value.map((c) => c.cents),
      backgroundColor: top.value.map((c) => c.color),
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