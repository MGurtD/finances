<script setup lang="ts">
import { computed } from 'vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { MonthlySummary } from '@finances/contracts';
import { useChartColors } from '@/composables/useChartColors';
import { formatCompactMoney } from '@finances/ui';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

const props = defineProps<{
  data: MonthlySummary[] | undefined;
}>();

const { palette } = useChartColors();

const chartData = computed<ChartData<'line'>>(() => ({
  labels: (props.data ?? []).map((m) => monthLabel(m.month)),
  datasets: [
    {
      label: 'Ingressos',
      data: (props.data ?? []).map((m) => m.incomeCents / 100),
      borderColor: palette.value.positive,
      backgroundColor: hexToRgba(palette.value.positive, 0.12),
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    },
    {
      label: 'Despeses',
      data: (props.data ?? []).map((m) => m.expenseCents / 100),
      borderColor: palette.value.negative,
      backgroundColor: hexToRgba(palette.value.negative, 0.12),
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'top',
      align: 'end',
      labels: {
        color: palette.value.inkMuted,
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 8,
        font: { size: 12 },
      },
    },
    tooltip: {
      backgroundColor: palette.value.ink,
      titleColor: palette.value.surface,
      bodyColor: palette.value.surface,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${formatCompactMoney((ctx.parsed.y ?? 0) * 100)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: palette.value.inkSubtle, font: { size: 11 } },
      border: { color: palette.value.border },
    },
    y: {
      grid: { color: palette.value.border, drawTicks: false },
      ticks: {
        color: palette.value.inkSubtle,
        font: { size: 11 },
        callback: (v) => formatCompactMoney(Number(v) * 100),
      },
      border: { display: false },
      beginAtZero: true,
    },
  },
}));

function monthLabel(m: string): string {
  const [, mm] = m.split('-');
  const MONTHS = ['Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des'];
  const idx = (Number(mm) || 1) - 1;
  return MONTHS[idx] ?? m;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
</script>

<template>
  <div class="h-64">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>