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
import type { CategoryBreakdown } from '@finances/contracts';
import { useChartColors } from '@/composables/useChartColors';
import { formatMoney } from '@finances/ui';

ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps<{
  data: CategoryBreakdown[] | undefined;
}>();

const { palette } = useChartColors();

const sorted = computed(() => (props.data ?? []).slice().sort((a, b) => b.cents - a.cents));

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: sorted.value.map((c) => c.name),
  datasets: [
    {
      data: sorted.value.map((c) => c.cents),
      backgroundColor: sorted.value.map((c) => c.color),
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
          const cents = Number(ctx.parsed) || 0;
          const pct = (sorted.value[ctx.dataIndex]?.percent ?? 0);
          return ` ${ctx.label}: ${formatMoney(cents)} · ${pct}%`;
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