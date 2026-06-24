<script setup lang="ts">
import { Button } from '@finances/ui';

const props = defineProps<{
  label: string;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
}>();
</script>

<template>
  <div class="flex items-center gap-2">
    <Button variant="ghost" size="icon" :aria-label="`Mes anterior (${props.label})`" @click="emit('prev')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </Button>
    <span class="font-semibold text-finance-xl min-w-[10rem] text-center tabular-nums">{{ props.label }}</span>
    <Button variant="ghost" size="icon" aria-label="Mes següent" @click="emit('next')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Button>
  </div>
</template>