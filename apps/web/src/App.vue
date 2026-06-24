<script setup lang="ts">
import { ref } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import TopNav from '@/components/TopNav.vue';
import BottomNav from '@/components/BottomNav.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import AddMovementDialog from '@/components/AddMovementDialog.vue';
import { useShortcuts, type GotoTarget } from '@/composables/useShortcuts';
import { useAddMovementStore } from '@/stores/addMovement';

const paletteOpen = ref(false);
const router = useRouter();
const addMovement = useAddMovementStore();

useShortcuts({
  onPalette: () => {
    paletteOpen.value = true;
  },
  onNewMovement: () => {
    addMovement.open();
  },
  onGoto: (target: GotoTarget) => {
    void router.push({ name: target });
  },
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <TopNav @open-palette="paletteOpen = true" />
    <RouterView />
    <BottomNav />
    <AddMovementDialog />
    <CommandPalette :open="paletteOpen" @close="paletteOpen = false" />
  </div>
</template>