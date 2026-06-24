<script setup lang="ts">
import { cn } from '../utils/cn';

withDefaults(
  defineProps<{
    name: string;
    color?: string;
    icon?: string;
    size?: 'sm' | 'md';
    active?: boolean;
  }>(),
  {
    color: '#8b7355',
    icon: '●',
    size: 'sm',
    active: false,
  }
);
</script>

<template>
  <span
    :class="cn(
      'inline-flex items-center gap-1.5 rounded-full border transition-all duration-200',
      size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      active
        ? 'border-transparent text-white'
        : 'border-border text-ink-muted bg-surface-2'
    )"
    :style="active ? { backgroundColor: color, borderColor: color } : {}"
  >
    <span
      class="inline-block w-2 h-2 rounded-full shrink-0"
      :style="{ backgroundColor: active ? 'white' : color }"
    />
    {{ name }}
  </span>
</template>