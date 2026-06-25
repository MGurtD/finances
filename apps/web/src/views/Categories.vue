<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@finances/ui';
import type { CategoryTreeNode } from '@finances/contracts';
import {
  useArchiveCategory,
  useCategoryTree,
  useCreateCategory,
  useUpdateCategory,
} from '@/composables/queries';
import Modal from '@/components/Modal.vue';
import CategoryTreeNodeRow from '@/components/CategoryTreeNodeRow.vue';

const { data: incomeTree } = useCategoryTree('income');
const { data: expenseTree } = useCategoryTree('expense');
const create = useCreateCategory();
const update = useUpdateCategory();
const archive = useArchiveCategory();

const COLORS = ['#8B7355', '#E85D2C', '#2E7D32', '#1976D2', '#7B1FA2', '#ED6C02', '#5D4037'];

const dialogOpen = ref(false);
const editing = ref<CategoryTreeNode | null>(null);
const form = ref({
  name: '',
  kind: 'expense' as 'income' | 'expense',
  parentId: null as string | null,
  color: COLORS[0]!,
});

function openCreate(parent: CategoryTreeNode | null, kind: 'income' | 'expense') {
  editing.value = null;
  form.value = {
    name: '',
    kind,
    parentId: parent?.id ?? null,
    color: COLORS[0]!,
  };
  dialogOpen.value = true;
}

function openEdit(node: CategoryTreeNode) {
  editing.value = node;
  form.value = {
    name: node.name,
    kind: node.kind,
    parentId: node.parentId,
    color: node.color,
  };
  dialogOpen.value = true;
}

async function submit() {
  if (form.value.name.trim() === '') return;
  if (editing.value) {
    await update.mutateAsync({
      id: editing.value.id,
      name: form.value.name.trim(),
      color: form.value.color,
    });
  } else {
    await create.mutateAsync({
      name: form.value.name.trim(),
      kind: form.value.kind,
      parentId: form.value.parentId,
      color: form.value.color,
      icon: 'tag',
    });
  }
  dialogOpen.value = false;
}

async function confirmArchive(node: CategoryTreeNode) {
  if (window.confirm(`Arxivar la categoria "${node.name}"?`)) {
    await archive.mutateAsync(node.id);
  }
}

// ---- DnD state (native HTML5) ---------------------------------------------
// We track the "active drag" by id. Drop targets decide what to do:
//   - drop onto a category row in the same section -> set parentId = target.id
//   - drop onto the section header / FAB area -> demote to top-level
//   - drop between siblings -> reorder (we don't reorder via drop yet; just reparent)
const dragId = ref<string | null>(null);
const overId = ref<string | null>(null);

function onDragStart(e: DragEvent, id: string) {
  dragId.value = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
}

function onDragOver(e: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  overId.value = id;
}

function onDragLeave(id: string) {
  if (overId.value === id) overId.value = null;
}

async function onDrop(e: DragEvent, targetId: string) {
  e.preventDefault();
  const sourceId = dragId.value;
  dragId.value = null;
  overId.value = null;
  if (!sourceId || sourceId === targetId) return;

  const source = findNode(sourceId);
  const target = findNode(targetId);
  if (!source || !target) return;
  // Prevent making a node a child of itself or its own descendant.
  if (isDescendant(target, sourceId)) return;

  await update.mutateAsync({ id: sourceId, parentId: target.id });
}

async function onDemote(e: DragEvent, kind: 'income' | 'expense') {
  e.preventDefault();
  const sourceId = dragId.value;
  dragId.value = null;
  overId.value = null;
  if (!sourceId) return;
  const source = findNode(sourceId);
  if (!source || source.kind !== kind || source.parentId === null) return;
  await update.mutateAsync({ id: sourceId, parentId: null });
}

function findNode(id: string, roots?: CategoryTreeNode[][]): CategoryTreeNode | null {
  const lists: CategoryTreeNode[][] = roots ?? [incomeTree.value ?? [], expenseTree.value ?? []];
  for (const rootsForKind of lists) {
    for (const root of rootsForKind) {
      const stack: CategoryTreeNode[] = [root];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.id === id) return node;
        for (const c of node.children) stack.push(c);
      }
    }
  }
  return null;
}

function isDescendant(node: CategoryTreeNode, ancestorId: string): boolean {
  const stack: CategoryTreeNode[] = [...node.children];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.id === ancestorId) return true;
    stack.push(...n.children);
  }
  return false;
}

const totalCount = computed(() => {
  const count = (tree: CategoryTreeNode[] | undefined): number => {
    if (!tree) return 0;
    return tree.reduce((acc, n) => acc + 1 + count(n.children), 0);
  };
  return count(incomeTree.value) + count(expenseTree.value);
});
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <div class="container py-8 space-y-8 animate-fade-in">
      <h1 class="font-semibold text-lg">Categories</h1>
      <p v-if="totalCount === 0" class="text-sm text-ink-subtle text-center py-12">
        Encara no hi ha categories. Crea'n una amb el botó +.
      </p>

      <!-- Expense section -->
      <section>
        <header
          class="flex items-center justify-between mb-3 px-1"
          @dragover="onDemote($event, 'expense')"
          @drop="onDemote($event, 'expense')"
        >
          <h2 class="font-medium text-ink-muted text-sm uppercase tracking-wide">Despeses</h2>
          <button
            type="button"
            class="text-xs text-accent hover:underline"
            @click="openCreate(null, 'expense')"
          >
            + Categoria arrel
          </button>
        </header>
        <ul class="space-y-1">
          <CategoryTreeNodeRow
            v-for="node in expenseTree ?? []"
            :key="node.id"
            :node="node"
            :depth="0"
            :drag-id="dragId"
            :over-id="overId"
            @edit="openEdit"
            @archive="confirmArchive"
            @add-child="openCreate"
            @drag-start="onDragStart"
            @drag-over="onDragOver"
            @drag-leave="onDragLeave"
            @drop="onDrop"
          />
          <li
            v-if="(expenseTree?.length ?? 0) === 0"
            class="text-sm text-ink-subtle text-center py-6 border border-dashed border-border rounded-md"
          >
            Cap categoria de despeses.
          </li>
        </ul>
      </section>

      <!-- Income section -->
      <section>
        <header
          class="flex items-center justify-between mb-3 px-1"
          @dragover="onDemote($event, 'income')"
          @drop="onDemote($event, 'income')"
        >
          <h2 class="font-medium text-positive text-sm uppercase tracking-wide">Ingressos</h2>
          <button
            type="button"
            class="text-xs text-accent hover:underline"
            @click="openCreate(null, 'income')"
          >
            + Categoria arrel
          </button>
        </header>
        <ul class="space-y-1">
          <CategoryTreeNodeRow
            v-for="node in incomeTree ?? []"
            :key="node.id"
            :node="node"
            :depth="0"
            :drag-id="dragId"
            :over-id="overId"
            @edit="openEdit"
            @archive="confirmArchive"
            @add-child="openCreate"
            @drag-start="onDragStart"
            @drag-over="onDragOver"
            @drag-leave="onDragLeave"
            @drop="onDrop"
          />
          <li
            v-if="(incomeTree?.length ?? 0) === 0"
            class="text-sm text-ink-subtle text-center py-6 border border-dashed border-border rounded-md"
          >
            Cap categoria d'ingressos.
          </li>
        </ul>
      </section>
    </div>

    <Modal :open="dialogOpen" :title="editing ? 'Editar categoria' : 'Nova categoria'" @close="dialogOpen = false">
      <form class="space-y-4" @submit.prevent="submit">
        <div class="flex flex-col gap-1.5">
          <label for="cat-name" class="text-sm font-medium">Nom <span class="text-negative">*</span></label>
          <input
            id="cat-name"
            v-model="form.name"
            type="text"
            required
            maxlength="30"
            class="h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Supermercat, Lloguer, Sou…"
          />
        </div>

        <div v-if="!editing" class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Tipus</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="h-11 rounded-md font-medium transition-colors"
              :class="form.kind === 'expense' ? 'bg-negative text-white' : 'bg-surface-2 text-ink hover:bg-border'"
              @click="form.kind = 'expense'"
            >
              Despesa
            </button>
            <button
              type="button"
              class="h-11 rounded-md font-medium transition-colors"
              :class="form.kind === 'income' ? 'bg-positive text-white' : 'bg-surface-2 text-ink hover:bg-border'"
              @click="form.kind = 'income'"
            >
              Ingrés
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Color</span>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="c in COLORS"
              :key="c"
              type="button"
              class="w-8 h-8 rounded-full border-2 transition-all"
              :class="form.color === c ? 'border-ink scale-110' : 'border-transparent'"
              :style="{ backgroundColor: c }"
              :aria-label="`Color ${c}`"
              @click="form.color = c"
            />
          </div>
        </div>

        <p v-if="create.isError.value || update.isError.value" class="text-sm text-negative">
          No s'ha pogut desar.
        </p>

        <div class="flex items-center gap-2 justify-end pt-2">
          <Button variant="ghost" type="button" @click="dialogOpen = false">Cancel·lar</Button>
          <Button type="submit" :disabled="create.isPending.value || update.isPending.value">
            {{ create.isPending.value || update.isPending.value ? 'Desant…' : 'Desar' }}
          </Button>
        </div>
      </form>
    </Modal>
  </main>
</template>