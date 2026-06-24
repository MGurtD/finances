<script setup lang="ts">
import { computed, useId } from 'vue';
import { cn } from '../utils/cn';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    type?: string;
    placeholder?: string;
    label?: string;
    hint?: string;
    error?: string;
    disabled?: boolean;
    required?: boolean;
    inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search';
    autocomplete?: string;
  }>(),
  {
    type: 'text',
    disabled: false,
    required: false,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  'blur': [];
  'focus': [];
}>();

const id = useId();

const inputClasses = computed(() =>
  cn(
    'w-full h-11 px-3 rounded-md bg-surface text-ink',
    'border border-border placeholder:text-ink-subtle',
    'transition-colors duration-200',
    'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    props.error && 'border-negative focus:border-negative focus:ring-negative/20'
  )
);
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium text-ink">
      {{ label }}
      <span v-if="required" class="text-negative">*</span>
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :inputmode="inputmode"
      :autocomplete="autocomplete"
      :class="inputClasses"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur')"
      @focus="emit('focus')"
    />
    <p v-if="hint && !error" class="text-xs text-ink-subtle">{{ hint }}</p>
    <p v-if="error" class="text-xs text-negative">{{ error }}</p>
  </div>
</template>