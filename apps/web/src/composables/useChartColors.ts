import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useThemeStore } from '@/stores/theme';

/**
 * Reactive palette of design tokens read from CSS variables so Chart.js
 * charts always match the active theme (light/dark).
 */
export function useChartColors() {
  const themeStore = useThemeStore();
  const palette = ref({
    positive: '#2e7d32',
    negative: '#c62828',
    accent: '#6366F1',
    ink: '#2b1810',
    inkMuted: '#6b5d50',
    inkSubtle: '#8b7355',
    border: '#ebe3d6',
    surface: '#ffffff',
    surface2: '#f3ede4',
  });

  function read() {
    if (typeof window === 'undefined') return;
    const style = getComputedStyle(document.documentElement);
    palette.value = {
      positive: style.getPropertyValue('--positive').trim() || palette.value.positive,
      negative: style.getPropertyValue('--negative').trim() || palette.value.negative,
      accent: style.getPropertyValue('--accent').trim() || palette.value.accent,
      ink: style.getPropertyValue('--ink').trim() || palette.value.ink,
      inkMuted: style.getPropertyValue('--ink-muted').trim() || palette.value.inkMuted,
      inkSubtle: style.getPropertyValue('--ink-subtle').trim() || palette.value.inkSubtle,
      border: style.getPropertyValue('--border').trim() || palette.value.border,
      surface: style.getPropertyValue('--surface').trim() || palette.value.surface,
      surface2: style.getPropertyValue('--surface-2').trim() || palette.value.surface2,
    };
  }

  let observer: MutationObserver | null = null;
  onMounted(() => {
    read();
    observer = new MutationObserver(() => read());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
  });
  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
  });

  return { palette, theme: computed(() => themeStore.theme) };
}