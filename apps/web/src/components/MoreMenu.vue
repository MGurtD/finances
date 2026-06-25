<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { RouteRecordName } from 'vue-router';

type MoreLink = {
  name: RouteRecordName;
  label: string;
  description: string;
  icon: string; // svg path 'd' attribute
};

const links: MoreLink[] = [
  {
    name: 'categories',
    label: 'Categories',
    description: 'Arbre de categories de moviments',
    icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  },
  {
    name: 'budgets',
    label: 'Pressupostos',
    description: 'Límits mensuals per categoria',
    icon: 'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4',
  },
  {
    name: 'accounts',
    label: 'Comptes',
    description: 'Comptes bancaris i targetes',
    icon: 'M3 7h18v10H3zM3 11h18M7 15h2',
  },
  {
    name: 'import',
    label: 'Importar',
    description: 'Importar moviments des de CSV',
    icon: 'M12 3v12M6 9l6-6 6 6M5 21h14',
  },
];

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const dialogEl = ref<HTMLDivElement | null>(null);

function go(name: RouteRecordName) {
  emit('close');
  void router.push({ name });
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : '';
    if (v) {
      // Focus the dialog for screen readers & keyboard users
      requestAnimationFrame(() => dialogEl.value?.focus());
    }
  },
);

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-smooth"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-smooth"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Més opcions"
        @click.self="emit('close')"
      >
        <div
          ref="dialogEl"
          tabindex="-1"
          class="w-full sm:max-w-sm rounded-t-xl sm:rounded-xl bg-surface border-t sm:border border-border max-h-[85vh] overflow-auto shadow-warm animate-fade-in outline-none"
        >
          <header class="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 class="font-semibold text-finance-lg">Més</h2>
            <button
              type="button"
              class="text-ink-subtle hover:text-ink p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Tancar"
              @click="emit('close')"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <ul class="px-2 pb-3 sm:pb-4">
            <li v-for="l in links" :key="String(l.name)">
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-surface-2 active:bg-surface-2/70 transition-colors min-h-[56px]"
                @click="go(l.name)"
              >
                <span class="flex items-center justify-center w-9 h-9 rounded-md bg-accent/10 text-accent shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path :d="l.icon" />
                  </svg>
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block font-medium text-finance-base text-ink">{{ l.label }}</span>
                  <span class="block text-finance-xs text-ink-subtle truncate">{{ l.description }}</span>
                </span>
                <svg class="text-ink-subtle shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </li>
          </ul>

          <div class="h-[env(safe-area-inset-bottom)] sm:hidden" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>