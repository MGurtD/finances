<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getStoredTheme, getSystemTheme, type Theme } from '../utils/theme';
import Button from './Button.vue';

/**
 * Pure presentational toggle. Theme persistence is owned by the app's
 * theme store via the `toggle` event; this component only displays
 * the current theme and asks the parent to toggle.
 *
 * IMPORTANT: do NOT call applyTheme() here. The store owns writes
 * to localStorage and the data-theme attribute. A previous version
 * also applied the theme on watch, which double-wrote storage and
 * drifted between the two sources of truth.
 */
const theme = ref<Theme>('light');

onMounted(() => {
  theme.value = getStoredTheme() ?? getSystemTheme();
});

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :aria-label="`Canviar a tema ${theme === 'light' ? 'fosc' : 'clar'}`"
    @click="emit('toggle')"
  >
    <svg v-if="theme === 'light'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
    <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  </Button>
</template>