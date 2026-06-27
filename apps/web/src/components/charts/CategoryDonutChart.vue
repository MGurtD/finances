<script setup lang="ts">
import { computed } from 'vue';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { SummaryByCategoryItem } from '@/api/types';
import { useChartColors } from '@/composables/useChartColors';
import { formatMoney } from '@finances/ui';

ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps<{
  data: SummaryByCategoryItem[] | undefined;
}>();

const { palette } = useChartColors();

const chartColors = ['#6366F1', '#2E7D32', '#1976D2', '#7B1FA2', '#ED6C02', '#5D4037', '#00838F', '#AD1457', '#F9A825', '#455A64'];

const sorted = computed(() =>
  (props.data ?? []).slice().sort((a, b) => (b.total ?? 0) - (a.total ?? 0)),
);

const grandTotal = computed(() =>
  (props.data ?? []).reduce((sum, c) => sum + (c.total ?? 0), 0),
);

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: sorted.value.map((c) => c.categoryName ?? c.categoryId ?? 'Unknown'),
  datasets: [
    {
      data: sorted.value.map((c) => c.total ?? 0),
      backgroundColor: sorted.value.map((_, i) => chartColors[i % chartColors.length] ?? palette.value.accent),
      borderColor: palette.value.surface,
      borderWidth: 2,
      hoverOffset: 6,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'right',
      labels: {
        color: palette.value.inkMuted,
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        font: { size: 12 },
      },
    },
    tooltip: {
      backgroundColor: palette.value.ink,
      titleColor: palette.value.surface,
      bodyColor: palette.value.surface,
      callbacks: {
        label: (ctx) => {
          const total = Number(ctx.parsed) || 0;
          const pct = grandTotal.value > 0 ? Math.round((total / grandTotal.value) * 100) : 0;
          return ` ${ctx.label}: ${formatMoney(total)} · ${pct}%`;
        },
      },
    },
  },
}));
</script>

<template>
  <div class="h-64">
    <Doughnut :data="chartData" :options="chartOptions" />
  </div>
</template>