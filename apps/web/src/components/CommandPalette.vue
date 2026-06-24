<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Card } from '@finances/ui';
import { trpc } from '@/trpc/client';
import { useAddMovementStore } from '@/stores/addMovement';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const addMovement = useAddMovementStore();
const auth = useAuthStore();
const themeStore = useThemeStore();

const query = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const activeIndex = ref(0);

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  kbd?: string;
  action: () => void;
  keywords?: string[];
}

const navigate = (name: string) => {
  void router.push({ name });
  emit('close');
};

const staticItems = computed<Item[]>(() => [
  { id: 'nav-d', group: 'Navegacio', label: 'Inici', kbd: 'g d', action: () => navigate('dashboard') },
  { id: 'nav-m', group: 'Navegacio', label: 'Moviments', kbd: 'g m', action: () => navigate('moviments') },
  { id: 'nav-a', group: 'Navegacio', label: 'Comptes', kbd: 'g a', action: () => navigate('accounts') },
  { id: 'nav-c', group: 'Navegacio', label: 'Categories', kbd: 'g c', action: () => navigate('categories') },
  { id: 'nav-b', group: 'Navegacio', label: 'Pressupostos', kbd: 'g b', action: () => navigate('budgets') },
  { id: 'nav-i', group: 'Navegacio', label: 'Importar', kbd: 'g i', action: () => navigate('import') },
  {
    id: 'act-new',
    group: 'Accions',
    label: 'Nou moviment',
    kbd: 'Cmd+N',
    action: () => {
      addMovement.open();
      emit('close');
    },
  },
  {
    id: 'act-theme',
    group: 'Accions',
    label: 'Canvia tema (clar/fosc)',
    action: () => {
      themeStore.toggleTheme();
      emit('close');
    },
  },
  {
    id: 'act-logout',
    group: 'Accions',
    label: 'Tanca sessio',
    action: () => {
      void trpc.auth.logout.mutate().finally(() => {
        auth.clear();
        void router.replace({ name: 'login' });
      });
      emit('close');
    },
  },
]);

const recent = ref<
  { id: string; description: string; date: string; amount: number; kind: 'income' | 'expense' }[]
>([]);
async function loadRecent() {
  if (recent.value.length > 0) return;
  try {
    const rows = await trpc.transactions.recent.query({ limit: 8 });
    recent.value = rows.map((r) => ({
      id: r.id,
      description: r.description || r.categoryName || 'Moviment',
      date: r.date,
      amount: r.amount,
      kind: r.kind as 'income' | 'expense',
    }));
  } catch {
    recent.value = [];
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      query.value = '';
      activeIndex.value = 0;
      await nextTick();
      inputEl.value?.focus();
      void loadRecent();
    }
  },
);

const recentItems = computed<Item[]>(() =>
  recent.value.map((t) => ({
    id: `tx-${t.id}`,
    group: 'Moviments recents',
    label: t.description,
    hint: `${t.kind === 'income' ? '+' : '-'}${(t.amount / 100).toFixed(2)} EUR`,
    keywords: [t.date],
    action: () => {
      void router.push({ name: 'moviments', query: { highlight: t.id } });
      emit('close');
    },
  })),
);

const filtered = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase();
  const all = [...staticItems.value, ...recentItems.value];
  if (!q) return all;
  return all.filter((item) => {
    const hay = [item.label, item.hint ?? '', item.kbd ?? '', ...(item.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const grouped = computed(() => {
  const out: { group: string; items: Item[] }[] = [];
  for (const item of filtered.value) {
    const last = out.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
});

const flat = computed<Item[]>(() => grouped.value.flatMap((g) => g.items));

watch(filtered, () => {
  activeIndex.value = 0;
});

function activate(item: Item) {
  item.action();
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % Math.max(flat.value.length, 1);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + flat.value.length) % Math.max(flat.value.length, 1);
    return;
  }
  if (e.key === 'Enter') {
    const item = flat.value[activeIndex.value];
    if (item) {
      e.preventDefault();
      activate(item);
    }
    return;
  }
}
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
        class="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 backdrop-blur-sm p-0 sm:p-4 pt-[10vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        @click.self="emit('close')"
      >
        <Card
          padding="none"
          class="w-full sm:max-w-lg rounded-none sm:rounded-xl shadow-soft-lg overflow-hidden animate-fade-in"
        >
          <div class="flex items-center gap-2 border-b border-border px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-ink-subtle">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="Cerca o escriu una ordre..."
              class="flex-1 bg-transparent text-ink placeholder:text-ink-subtle focus:outline-none"
              @keydown="onKey"
            />
            <kbd class="hidden sm:inline-block text-[10px] text-ink-subtle border border-border rounded px-1.5 py-0.5">esc</kbd>
          </div>

          <div v-if="flat.length === 0" class="px-4 py-8 text-sm text-ink-subtle text-center">
            Cap resultat.
          </div>

          <div v-else class="max-h-80 overflow-y-auto py-1">
            <div v-for="g in grouped" :key="g.group">
              <p class="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {{ g.group }}
              </p>
              <button
                v-for="item in g.items"
                :key="item.id"
                type="button"
                class="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                :class="flat[activeIndex]?.id === item.id ? 'bg-accent/10 text-ink' : 'text-ink hover:bg-surface-2'"
                @click="activate(item)"
                @mouseenter="activeIndex = flat.findIndex((x) => x.id === item.id)"
              >
                <span class="flex-1 truncate text-sm">{{ item.label }}</span>
                <span v-if="item.hint" class="text-xs text-ink-subtle font-mono tabular-nums">{{ item.hint }}</span>
                <kbd v-if="item.kbd" class="text-[10px] text-ink-subtle border border-border rounded px-1.5 py-0.5">
                  {{ item.kbd }}
                </kbd>
              </button>
            </div>
          </div>
        </Card>
      </div>
    </Transition>
  </Teleport>
</template>