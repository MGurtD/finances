import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AuthStatus } from '@finances/contracts';

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus | null>(null);
  const ready = ref(false);

  const authenticated = computed(() => status.value?.authenticated === true);

  function set(next: AuthStatus) {
    status.value = next;
    ready.value = true;
  }

  function clear() {
    status.value = { authenticated: false };
    ready.value = true;
  }

  return { status, ready, authenticated, set, clear };
});