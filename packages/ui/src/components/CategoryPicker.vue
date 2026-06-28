<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { onClickOutside, useEventListener } from '@vueuse/core';
import { cn } from '../utils/cn';

export interface CategoryOption {
  id: string;
  name: string;
  kind?: 'income' | 'expense' | string;
  color: string;
  icon?: string;
  parentId: string | null;
  sortOrder?: number;
  archived?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    categories: CategoryOption[];
    kind?: string | null;
    placeholder?: string;
    disabled?: boolean;
    allowClear?: boolean;
    size?: 'sm' | 'md';
  }>(),
  {
    placeholder: 'Selecciona categoria…',
    disabled: false,
    allowClear: true,
    size: 'md',
    kind: null,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  select: [category: CategoryOption];
}>();

const listboxId = useId();

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const triggerEl = ref<HTMLButtonElement | null>(null);
const dropdownEl = ref<HTMLDivElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

const position = ref<{ top: string; left: string; width: string; placement: 'top' | 'bottom' }>({
  top: '0px',
  left: '0px',
  width: '0px',
  placement: 'bottom',
});

const available = computed(() =>
  props.categories
    .filter((c) => !c.archived)
    .filter((c) => !props.kind || c.kind === props.kind),
);

interface Group {
  parent: CategoryOption;
  children: CategoryOption[];
}

function sortByOrder(a: CategoryOption, b: CategoryOption): number {
  const ao = a.sortOrder ?? 0;
  const bo = b.sortOrder ?? 0;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
}

const groups = computed<Group[]>(() => {
  const sorted = [...available.value].sort(sortByOrder);
  const parents = sorted.filter((c) => c.parentId === null);
  return parents.map((p) => ({
    parent: p,
    children: sorted.filter((c) => c.parentId === p.id).sort(sortByOrder),
  }));
});

const filteredGroups = computed<Group[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return groups.value;
  return groups.value
    .map((g) => {
      const parentMatch = g.parent.name.toLowerCase().includes(q);
      const matchingChildren = g.children.filter((c) => c.name.toLowerCase().includes(q));
      if (parentMatch) return g;
      if (matchingChildren.length > 0) return { parent: g.parent, children: matchingChildren };
      return null;
    })
    .filter((g): g is Group => g !== null);
});

const flat = computed<CategoryOption[]>(() => {
  const out: CategoryOption[] = [];
  for (const g of filteredGroups.value) {
    if (g.children.length > 0) {
      for (const c of g.children) out.push(c);
    } else {
      out.push(g.parent);
    }
  }
  return out;
});

const selected = computed<CategoryOption | null>(() => {
  if (!props.modelValue) return null;
  return props.categories.find((c) => c.id === props.modelValue) ?? null;
});

const activeOptionId = computed<string | null>(() => {
  if (!open.value) return null;
  return flat.value[activeIndex.value]?.id ?? null;
});

const selectedLabel = computed(() => {
  const s = selected.value;
  if (!s) return '';
  if (s.parentId) {
    const parent = props.categories.find((c) => c.id === s.parentId);
    return parent ? `${parent.name} › ${s.name}` : s.name;
  }
  return s.name;
});

watch(flat, () => {
  activeIndex.value = 0;
});

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    updatePosition();
    inputEl.value?.focus();
  }
});

useEventListener(
  window,
  'scroll',
  () => {
    if (open.value) updatePosition();
  },
  { passive: true, capture: true },
);
useEventListener(window, 'resize', () => {
  if (open.value) updatePosition();
});

onClickOutside(
  dropdownEl,
  () => {
    if (open.value) closeDropdown();
  },
  { ignore: [triggerEl] },
);

function updatePosition() {
  if (!triggerEl.value) return;
  const rect = triggerEl.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const dropdownMaxHeight = 320;
  const minMargin = 8;
  const desiredWidth = Math.max(rect.width, 240);
  const spaceBelow = viewportHeight - rect.bottom;
  const placeAbove = spaceBelow < dropdownMaxHeight && rect.top > spaceBelow;

  let left = rect.left;
  if (left + desiredWidth > viewportWidth - minMargin) {
    left = Math.max(minMargin, viewportWidth - desiredWidth - minMargin);
  }
  if (left < minMargin) {
    left = minMargin;
  }

  position.value = {
    top: placeAbove ? `${rect.top - 4}px` : `${rect.bottom + 4}px`,
    left: `${left}px`,
    width: `${desiredWidth}px`,
    placement: placeAbove ? 'top' : 'bottom',
  };
}

async function toggleDropdown() {
  if (props.disabled) return;
  if (open.value) {
    closeDropdown();
  } else {
    open.value = true;
    query.value = '';
    activeIndex.value = 0;
  }
}

function closeDropdown() {
  open.value = false;
  query.value = '';
}

function selectCategory(c: CategoryOption) {
  emit('update:modelValue', c.id);
  emit('select', c);
  closeDropdown();
}

function clearSelection(e: Event) {
  e.stopPropagation();
  e.preventDefault();
  emit('update:modelValue', null);
  closeDropdown();
}

function scrollActiveIntoView() {
  nextTick(() => {
    const activeId = flat.value[activeIndex.value]?.id;
    if (!activeId || !dropdownEl.value) return;
    const el = dropdownEl.value.querySelector(`[data-cat-id="${activeId}"]`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  });
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (open.value) {
      e.preventDefault();
      closeDropdown();
      triggerEl.value?.focus();
    }
    return;
  }
  if (e.key === 'Tab') {
    if (open.value) closeDropdown();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!open.value) {
      open.value = true;
      return;
    }
    if (flat.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % flat.value.length;
      scrollActiveIntoView();
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open.value) {
      open.value = true;
      return;
    }
    if (flat.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length;
      scrollActiveIntoView();
    }
    return;
  }
  if (e.key === 'Home') {
    if (open.value) {
      e.preventDefault();
      activeIndex.value = 0;
      scrollActiveIntoView();
    }
    return;
  }
  if (e.key === 'End') {
    if (open.value) {
      e.preventDefault();
      activeIndex.value = flat.value.length - 1;
      scrollActiveIntoView();
    }
    return;
  }
  if (e.key === 'Enter') {
    if (open.value) {
      const item = flat.value[activeIndex.value];
      if (item) {
        e.preventDefault();
        selectCategory(item);
      }
    }
    return;
  }
}
</script>

<template>
  <div class="relative inline-block w-full">
    <button
      ref="triggerEl"
      type="button"
      role="combobox"
      :aria-expanded="open"
      :aria-haspopup="'listbox'"
      :aria-controls="open ? listboxId : undefined"
      :aria-activedescendant="activeOptionId ? `${listboxId}-opt-${activeOptionId}` : undefined"
      :disabled="disabled"
      :class="cn(
        'w-full flex items-center gap-2 rounded-md bg-surface text-ink border border-border transition-colors',
        'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-2 text-xs' : 'h-11 px-3 text-sm',
        selected ? '' : 'text-ink-subtle',
      )"
      @click="toggleDropdown"
      @keydown="onKey"
    >
      <span
        v-if="selected"
        class="inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/5"
        :style="{ backgroundColor: selected.color }"
        aria-hidden="true"
      />
      <span class="flex-1 text-left truncate">{{ selected ? selectedLabel : placeholder }}</span>
      <button
        v-if="allowClear && selected && !disabled"
        type="button"
        class="text-ink-subtle hover:text-ink p-1 -m-1 rounded shrink-0"
        :aria-label="'Netejar selecció'"
        @click="clearSelection"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <svg
        v-else
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-ink-subtle shrink-0 transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          :id="listboxId"
          ref="dropdownEl"
          role="listbox"
          :aria-label="placeholder"
          class="fixed z-50 bg-surface border border-border rounded-md shadow-soft-lg overflow-hidden"
          :style="{
            top: position.top,
            left: position.left,
            width: position.width,
            transform: position.placement === 'top' ? 'translateY(-100%)' : 'none',
          }"
          @keydown="onKey"
        >
          <div class="flex items-center gap-2 border-b border-border px-3 py-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="text-ink-subtle shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              :placeholder="'Cerca…'"
              class="flex-1 bg-transparent text-ink placeholder:text-ink-subtle focus:outline-none text-sm"
              @keydown="onKey"
            />
            <kbd
              v-if="flat.length > 0"
              class="hidden sm:inline-block text-[10px] text-ink-subtle border border-border rounded px-1.5 py-0.5"
            >esc</kbd>
          </div>

          <div
            v-if="available.length === 0"
            class="px-3 py-6 text-sm text-ink-subtle text-center"
          >
            No hi ha categories.
            <a href="/categories" class="text-accent hover:underline ml-1">Crea'n una</a>
          </div>

          <div
            v-else-if="flat.length === 0"
            class="px-3 py-6 text-sm text-ink-subtle text-center"
          >
            Cap resultat per «{{ query }}».
          </div>

          <div v-else class="max-h-72 overflow-y-auto py-1">
            <template v-for="g in filteredGroups" :key="g.parent.id">
              <template v-if="g.children.length > 0">
                <div
                  class="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle border-b border-border/60"
                >
                  {{ g.parent.name }}
                </div>
                <button
                  v-for="cat in g.children"
                  :key="cat.id"
                  :id="`${listboxId}-opt-${cat.id}`"
                  type="button"
                  role="option"
                  :data-cat-id="cat.id"
                  :aria-selected="modelValue === cat.id"
                  :class="cn(
                    'w-full text-left pl-9 pr-3 py-2 flex items-center gap-2.5 transition-colors text-sm',
                    'min-h-[36px]',
                    cat.id === flat[activeIndex]?.id
                      ? 'bg-accent/15 text-ink'
                      : 'text-ink hover:bg-accent/5',
                    modelValue === cat.id ? 'font-medium' : '',
                  )"
                  @click="selectCategory(cat)"
                  @mouseenter="activeIndex = flat.findIndex((x) => x.id === cat.id)"
                >
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                    :style="{ backgroundColor: cat.color }"
                    aria-hidden="true"
                  />
                  <span class="flex-1 truncate min-w-0">{{ cat.name }}</span>
                  <svg
                    v-if="modelValue === cat.id"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-accent shrink-0"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </template>
              <button
                v-else
                :id="`${listboxId}-opt-${g.parent.id}`"
                type="button"
                role="option"
                :data-cat-id="g.parent.id"
                :aria-selected="modelValue === g.parent.id"
                :class="cn(
                  'w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors text-sm',
                  'min-h-[36px]',
                  g.parent.id === flat[activeIndex]?.id
                    ? 'bg-accent/15 text-ink'
                    : 'text-ink hover:bg-accent/5',
                  modelValue === g.parent.id ? 'font-medium' : '',
                )"
                @click="selectCategory(g.parent)"
                @mouseenter="activeIndex = flat.findIndex((x) => x.id === g.parent.id)"
              >
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                  :style="{ backgroundColor: g.parent.color }"
                  aria-hidden="true"
                />
                <span class="flex-1 truncate min-w-0">{{ g.parent.name }}</span>
                <svg
                  v-if="modelValue === g.parent.id"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-accent shrink-0"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>