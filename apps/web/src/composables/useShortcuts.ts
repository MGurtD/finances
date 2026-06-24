import { onMounted, onUnmounted, ref } from 'vue';

export type GotoTarget = 'dashboard' | 'moviments' | 'accounts' | 'categories' | 'budgets' | 'import';

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcuts. Skips events whose target is an editable
 * element (input/textarea/select/contenteditable) so typing is never
 * hijacked.
 *
 * Cmd/Ctrl + K  → open command palette
 * Cmd/Ctrl + N  → new movement
 * Cmd/Ctrl + /  → open command palette
 * g then one of {d, m, a, c, b} → goto dashboard/moviments/accounts/categories/budgets
 */
export function useShortcuts(handlers: {
  onPalette: () => void;
  onNewMovement: () => void;
  onGoto: (target: GotoTarget) => void;
}) {
  const pendingG = ref(false);
  let pendingGTimer: number | null = null;

  function onKeydown(e: KeyboardEvent) {
    if (isEditable(e.target)) return;

    const hasMod = e.metaKey || e.ctrlKey;

    if (hasMod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      handlers.onPalette();
      return;
    }

    if (hasMod && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      handlers.onNewMovement();
      return;
    }

    if (hasMod && e.key === '/') {
      e.preventDefault();
      handlers.onPalette();
      return;
    }

    if (pendingG.value && !hasMod) {
      const map: Record<string, GotoTarget> = {
        d: 'dashboard',
        m: 'moviments',
        a: 'accounts',
        c: 'categories',
        b: 'budgets',
        i: 'import',
      };
      const target = map[e.key];
      pendingG.value = false;
      if (pendingGTimer !== null) {
        window.clearTimeout(pendingGTimer);
        pendingGTimer = null;
      }
      if (target) {
        e.preventDefault();
        handlers.onGoto(target);
      }
      return;
    }

    if (!hasMod && e.key === 'g') {
      pendingG.value = true;
      if (pendingGTimer !== null) window.clearTimeout(pendingGTimer);
      pendingGTimer = window.setTimeout(() => {
        pendingG.value = false;
        pendingGTimer = null;
      }, 1200);
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
    if (pendingGTimer !== null) window.clearTimeout(pendingGTimer);
  });

  return { pendingG };
}