<script setup lang="ts">
import { ThemeToggle } from '@finances/ui';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { trpc } from '@/trpc/client';

const themeStore = useThemeStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const links = [
  { to: { name: 'dashboard' }, label: 'Inici', key: 'dashboard' },
  { to: { name: 'moviments' }, label: 'Moviments', key: 'moviments' },
  { to: { name: 'accounts' }, label: 'Comptes', key: 'accounts' },
  { to: { name: 'categories' }, label: 'Categories', key: 'categories' },
  { to: { name: 'budgets' }, label: 'Pressupostos', key: 'budgets' },
  { to: { name: 'import' }, label: 'Importar', key: 'import' },
] as const;

function isActive(key: string): boolean {
  return route.name === key;
}

async function logout() {
  try {
    await trpc.auth.logout.mutate();
  } finally {
    auth.clear();
    void router.replace({ name: 'login' });
  }
}
</script>

<template>
  <header class="hidden sm:block sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
    <div class="container flex items-center justify-between h-16">
      <div class="flex items-center gap-8">
        <RouterLink :to="{ name: 'dashboard' }" class="font-semibold text-lg text-ink">
          Finances
        </RouterLink>
        <nav class="flex items-center gap-1">
          <RouterLink
            v-for="l in links"
            :key="l.key"
            :to="l.to"
            class="px-3 py-1.5 rounded-md text-sm transition-colors"
            :class="isActive(l.key) ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:text-ink hover:bg-surface-2'"
          >
            {{ l.label }}
          </RouterLink>
        </nav>
      </div>
      <div class="flex items-center gap-2">
        <RouterLink
          to="/health"
          class="text-xs text-ink-subtle hover:text-ink px-2 py-1 rounded"
          aria-label="Estat de la connexio"
        >
          ·API
        </RouterLink>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border text-ink-subtle hover:text-ink hover:border-ink-subtle transition-colors"
          aria-label="Obrir command palette"
          @click="$emit('open-palette')"
        >
          <span class="hidden md:inline mr-1.5">Cerca</span>
          <kbd class="text-[10px]">⌘K</kbd>
        </button>
        <button
          v-if="auth.authenticated"
          type="button"
          class="text-xs text-ink-subtle hover:text-ink px-2 py-1 rounded"
          aria-label="Tanca la sessio"
          @click="logout"
        >
          Tanca sessio
        </button>
        <ThemeToggle @click="themeStore.toggleTheme()" />
      </div>
    </div>
  </header>
</template>

<script lang="ts">
defineEmits<{ 'open-palette': [] }>();
</script>