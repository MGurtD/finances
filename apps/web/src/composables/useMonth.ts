import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const MONTH_NAMES_CA = [
  'Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny',
  'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre',
];

const MONTH_RE = /^\d{4}-\d{2}$/;

export function currentMonthString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function fromMonth(month: string): string {
  return `${month}-01`;
}

export function toMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (y === undefined || m === undefined) return month;
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  if (y === undefined || m === undefined) return month;
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthString(d);
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (y === undefined || m === undefined) return month;
  return `${MONTH_NAMES_CA[m - 1] ?? ''} ${y}`;
}

/**
 * Reactive current month state, persisted to the URL as ?month=YYYY-MM.
 * Both Dashboard and Moviments share this so navigation preserves context.
 */
export function useMonth() {
  const route = useRoute();
  const router = useRouter();

  const currentMonth = computed<string>(() => {
    const q = route.query.month;
    if (typeof q === 'string' && MONTH_RE.test(q)) return q;
    return currentMonthString();
  });

  function goToMonth(month: string) {
    void router.replace({ query: { ...route.query, month } });
  }

  return {
    currentMonth,
    from: computed(() => fromMonth(currentMonth.value)),
    to: computed(() => toMonth(currentMonth.value)),
    label: computed(() => formatMonth(currentMonth.value)),
    prev: () => goToMonth(shiftMonth(currentMonth.value, -1)),
    next: () => goToMonth(shiftMonth(currentMonth.value, 1)),
    thisMonth: () => goToMonth(currentMonthString()),
  };
}