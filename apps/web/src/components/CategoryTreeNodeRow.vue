<script setup lang="ts">
import type { CategoryTreeNode } from '@/api/types';
// CategoryTreeNodeRow is auto-resolved by plugin-vue (recursive child render).
// Do NOT add an explicit `import CategoryTreeNodeRow from './CategoryTreeNodeRow.vue'`
// here — it creates a module self-cycle that prevents the tree from rendering.

const props = defineProps<{
  node: CategoryTreeNode;
  depth: number;
  dragId: string | null;
  overId: string | null;
}>();

const emit = defineEmits<{
  edit: [node: CategoryTreeNode];
  archive: [node: CategoryTreeNode];
  'add-child': [node: CategoryTreeNode, kind: 'income' | 'expense'];
  'drag-start': [event: DragEvent, id: string];
  'drag-over': [event: DragEvent, id: string];
  'drag-leave': [id: string];
  drop: [event: DragEvent, id: string];
}>();

function isOver(): boolean {
  return props.overId === props.node.id && props.dragId !== props.node.id;
}
</script>

<template>
  <li>
    <div
      class="group flex items-center gap-2 py-2 pr-2 rounded-md transition-colors"
      :class="[
        isOver() ? 'bg-accent/10 ring-2 ring-accent/40' : 'hover:bg-surface-2',
        dragId === node.id ? 'opacity-40' : '',
      ]"
      :style="{ paddingLeft: `${depth * 20 + 8}px` }"
      :draggable="true"
      @dragstart="emit('drag-start', $event, node.id)"
      @dragover="emit('drag-over', $event, node.id)"
      @dragleave="emit('drag-leave', node.id)"
      @drop="emit('drop', $event, node.id)"
    >
      <span class="cursor-grab text-ink-subtle text-xs select-none" aria-hidden="true">⋮⋮</span>
      <span
        class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        :style="{ backgroundColor: node.color }"
      />
      <button
        type="button"
        class="flex-1 text-left text-sm truncate"
        :class="node.archived ? 'text-ink-subtle line-through' : 'text-ink'"
        @click="emit('edit', node)"
      >
        {{ node.name }}
      </button>

      <!-- Mobile: always visible. Desktop: hover-only.
           Touch targets are p-2 (≥36px) + min-h-[44px] via the wrapper below
           so fingers hit them reliably on small screens. -->
      <div class="flex items-center sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          class="text-ink-subtle hover:text-ink p-2 sm:p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-xs"
          :aria-label="`Afegir fill a ${node.name}`"
          @click.stop="emit('add-child', node, node.kind)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          class="text-ink-subtle hover:text-negative p-2 sm:p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          :aria-label="`Arxivar ${node.name}`"
          @click.stop="emit('archive', node)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <ul v-if="node.children && node.children.length > 0" class="space-y-1">
      <CategoryTreeNodeRow
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :drag-id="dragId"
        :over-id="overId"
        @edit="emit('edit', $event)"
        @archive="emit('archive', $event)"
        @add-child="(n, k) => emit('add-child', n, k)"
        @drag-start="(e, id) => emit('drag-start', e, id)"
        @drag-over="(e, id) => emit('drag-over', e, id)"
        @drag-leave="(id) => emit('drag-leave', id)"
        @drop="(e, id) => emit('drop', e, id)"
      />
    </ul>
  </li>
</template>