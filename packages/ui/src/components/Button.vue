<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-smooth disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-white hover:bg-accent-hover shadow-soft active:scale-[0.98]',
        secondary:
          'bg-surface-2 text-ink hover:bg-border border border-border',
        ghost:
          'bg-transparent text-ink hover:bg-surface-2',
        outline:
          'bg-transparent text-ink border border-border hover:bg-surface-2',
        destructive:
          'bg-negative text-white hover:opacity-90 shadow-soft active:scale-[0.98]',
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded-md',
        md: 'h-10 px-4 text-sm rounded-md',
        lg: 'h-12 px-6 text-base rounded-lg',
        icon: 'h-10 w-10 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant'];
    size?: ButtonVariants['size'];
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
  }
);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="cn(buttonVariants({ variant, size }))"
  >
    <slot />
  </button>
</template>