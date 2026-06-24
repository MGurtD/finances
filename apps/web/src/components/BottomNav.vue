<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useAddMovementStore } from '@/stores/addMovement';

const addMovement = useAddMovementStore();
</script>

<template>
  <nav class="fixed bottom-0 inset-x-0 bg-surface border-t border-border sm:hidden z-20">
    <div class="flex items-center justify-around h-16">
      <RouterLink
        to="/"
        class="flex flex-col items-center gap-1 text-xs"
        active-class="text-accent"
        :exact-active-class="'text-accent'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12L12 3l9 9M5 10v10h14V10"/></svg>
        Inici
      </RouterLink>
      <RouterLink
        to="/moviments"
        class="flex flex-col items-center gap-1 text-xs text-ink-subtle"
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
    </div>
  </nav>
</template>