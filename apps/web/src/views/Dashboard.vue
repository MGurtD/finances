<script setup lang="ts">
import { Card, StatCard, ThemeToggle } from '@finances/ui';
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();

const stats = [
  { label: 'Estalvi net', cents: 118155, variant: 'income' as const },
  { label: 'Despeses', cents: 321845, variant: 'expense' as const },
  { label: 'Ingressos', cents: 440000, variant: 'default' as const },
];

const categories = [
  { name: 'Habitatge', cents: 102900, percent: 32, color: '#e85d2c' },
  { name: 'Supermercat', cents: 45000, percent: 14, color: '#2e7d32' },
  { name: 'Oci', cents: 25700, percent: 8, color: '#1976d2' },
  { name: 'Subscripcions', cents: 8900, percent: 3, color: '#7b1fa2' },
];
</script>

<template>
  <main class="min-h-screen bg-bg">
    <!-- Header -->
    <header class="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
      <div class="container flex items-center justify-between h-16">
        <h1 class="font-semibold text-lg">Finances</h1>
        <ThemeToggle @click="themeStore.toggleTheme()" />
      </div>
    </header>

    <div class="container py-8 space-y-8 animate-fade-in">
      <!-- Period -->
      <div class="flex items-baseline gap-3">
        <h2 class="text-finance-2xl font-semibold">Juny 2026</h2>
        <span class="text-sm text-ink-subtle">fotografia del mes</span>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          v-for="s in stats"
          :key="s.label"
          :label="s.label"
          :cents="s.cents"
          :variant="s.variant"
          :show-sign="s.variant === 'income'"
        />
      </div>

      <!-- Categories -->
      <Card padding="lg">
        <h3 class="font-semibold mb-5">Despeses per categoria</h3>
        <div class="space-y-3">
          <div
            v-for="cat in categories"
            :key="cat.name"
            class="flex items-center gap-4"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-sm font-medium">{{ cat.name }}</span>
                <span class="text-sm font-mono tabular-nums text-ink-muted">
                  {{ (cat.cents / 100).toFixed(2) }} € · {{ cat.percent }}%
                </span>
              </div>
              <div class="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500 ease-smooth"
                  :style="{ width: `${cat.percent * 2}%`, backgroundColor: cat.color }"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Footer nav (mòbil preview) -->
      <nav class="fixed bottom-0 inset-x-0 bg-surface border-t border-border sm:hidden">
        <div class="flex items-center justify-around h-16">
          <button class="flex flex-col items-center gap-1 text-xs text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12L12 3l9 9M5 10v10h14V10"/></svg>
            Inici
          </button>
          <button class="flex flex-col items-center gap-1 text-xs text-ink-subtle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            Moviments
          </button>
          <button class="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-accent text-white shadow-warm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </nav>
    </div>
  </main>
</template>