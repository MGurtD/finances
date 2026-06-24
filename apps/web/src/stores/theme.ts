import { defineStore } from 'pinia';
import { ref } from 'vue';
import { initTheme, type Theme } from '@finances/ui';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(initTheme());

  function setTheme(t: Theme) {
    theme.value = t;
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
    localStorage.setItem('finances-theme', t);
  }

  function toggleTheme() {
    setTheme(theme.value === 'light' ? 'dark' : 'light');
  }

  return { theme, setTheme, toggleTheme };
});