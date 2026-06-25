<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAddMovementStore } from '@/stores/addMovement';
import MoreMenu from '@/components/MoreMenu.vue';

const addMovement = useAddMovementStore();
const moreOpen = ref(false);
</script>

<template>
  <nav class="fixed bottom-0 inset-x-0 bg-surface border-t border-border sm:hidden z-20 pb-[env(safe-area-inset-bottom)]">
    <div class="flex items-center justify-around h-16">
      <RouterLink
        to="/"
        class="flex flex-col items-center justify-center gap-1 text-xs min-w-[64px] min-h-[44px]"
        active-class="text-accent"
        :exact-active-class="'text-accent'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12L12 3l9 9M5 10v10h14V10"/></svg>
        Inici
      </RouterLink>
      <RouterLink
        to="/moviments"
        class="flex flex-col items-center justify-center gap-1 text-xs text-ink-subtle min-w-[64px] min-h-[44px]"
        active-class="text-accent"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        Moviments
      </RouterLink>
      <button
        type="button"
        class="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-accent text-white shadow-warm"
        aria-label="Afegir moviment"
        @click="addMovement.open()"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <RouterLink
        to="/import"
        class="flex flex-col items-center justify-center gap-1 text-xs text-ink-subtle min-w-[64px] min-h-[44px]"
        active-class="text-accent"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M6 9l6-6 6 6M5 21h14"/></svg>
        Importar
      </RouterLink>
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 text-xs text-ink-subtle min-w-[64px] min-h-[44px]"
        :class="moreOpen ? 'text-accent' : ''"
        aria-label="Més opcions"
        :aria-expanded="moreOpen"
        aria-haspopup="dialog"
        @click="moreOpen = true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>
        Més
      </button>
    </div>

    <MoreMenu :open="moreOpen" @close="moreOpen = false" />
  </nav>
</template>