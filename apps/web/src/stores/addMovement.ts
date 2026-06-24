import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAddMovementStore = defineStore('addMovement', () => {
  const isOpen = ref(false);
  const defaultKind = ref<'income' | 'expense'>('expense');
  const defaultDate = ref<string | null>(null);

  function open(opts: { kind?: 'income' | 'expense'; date?: string } = {}) {
    defaultKind.value = opts.kind ?? 'expense';
    defaultDate.value = opts.date ?? null;
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
  }

  return { isOpen, defaultKind, defaultDate, open, close };
});