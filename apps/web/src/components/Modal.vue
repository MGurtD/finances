<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { Card } from '@finances/ui';

const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : '';
  },
);

function onBackdrop() {
  emit('close');
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
        class="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="onBackdrop"
      >
        <Card
          padding="lg"
          class="w-full sm:max-w-md rounded-t-xl sm:rounded-xl max-h-[90vh] overflow-auto animate-fade-in"
        >
          <header class="flex items-center justify-between mb-5">
            <h2 class="font-semibold text-finance-lg">{{ title }}</h2>
            <button
              type="button"
              class="text-ink-subtle hover:text-ink p-1"
              aria-label="Tancar"
              @click="emit('close')"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>
          <slot />
        </Card>
      </div>
    </Transition>
  </Teleport>
</template>