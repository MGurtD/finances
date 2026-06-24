<script setup lang="ts">
import { cn } from '../utils/cn';

withDefaults(
  defineProps<{
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hoverable?: boolean;
    as?: 'div' | 'article' | 'section';
  }>(),
  {
    padding: 'md',
    hoverable: false,
    as: 'div',
  }
);
</script>

<template>
  <component
    :is="as"
    :class="cn(
      'bg-surface rounded-lg border border-border shadow-soft',
      padding === 'sm' && 'p-3',
      padding === 'md' && 'p-5',
      padding === 'lg' && 'p-7',
      hoverable && 'transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5 cursor-pointer'
    )"
  >
    <slot />
  </component>
</template>