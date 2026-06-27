<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Card, Button, formatMoney } from '@finances/ui';
import { useAddMovementStore } from '@/stores/addMovement';
import { useMonth } from '@/composables/useMonth';
import {
  useTransactionsList,
  useCategories,
  useDeleteTransaction,
  useUpdateTransaction,
  useBulkDeleteTransactions,
} from '@/composables/queries';
import { recordLearnedRule } from '@/utils/autoCategorize/learnedRules';
import MonthSelector from '@/components/MonthSelector.vue';
import Modal from '@/components/Modal.vue';

const month = useMonth();
const addMovement = useAddMovementStore();
const { data: categories } = useCategories();
const del = useDeleteTransaction();
const upd = useUpdateTransaction();
const bulkDel = useBulkDeleteTransactions();

const filter = computed(() => ({ from: month.from.value, to: month.to.value }));
const { data: transactions, isLoading } = useTransactionsList(filter);

const categoryMap = computed(() => {
  const map = new Map<string, { name: string; color: string }>();
  for (const c of categories.value ?? []) map.set(c.id, { name: c.name, color: c.color });
  return map;
});

function categoryFor(id: string | null) {
  if (!id) return { name: 'Sense categoria', color: '#8B7355' };
  return categoryMap.value.get(id) ?? { name: '—', color: '#8B7355' };
}

const groupedByDate = computed(() => {
  const map = new Map<string, typeof transactions.value>();
  for (const t of transactions.value ?? []) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
});

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

// ─── Inline category editor ─────────────────────────────────────────
// Tracks which row is currently being edited (by transaction id). When
// the user picks a new category from the dropdown, we save it via the
// update mutation and record a learned rule so the same description
// auto-categorises next time it comes through the importer.
const editingId = ref<string | null>(null);

function startEdit(id: string) {
  editingId.value = id;
}

function cancelEdit() {
  editingId.value = null;
}

async function changeCategory(
  transactionId: string,
  description: string,
  categoryId: string,
) {
  // `categoryId` is the literal string "null" when the user picks
  // "— Sense categoria —" (the option's value). We translate that into
  // a real null before sending to the API.
  const realId: string | null = categoryId === 'null' ? null : categoryId;
  await upd.mutateAsync({
    id: transactionId,
    categoryId: realId,
  });
  // Record a learned rule only when the user actively chose a category.
  // Removing the category should NOT pollute the learned store — if they
  // re-import the same description we still want our best guess.
  if (realId) {
    recordLearnedRule(description, realId);
  }
  editingId.value = null;
}

// ─── Bulk re-categorise ─────────────────────────────────────────────
// Click a row's checkbox to add it to the selection. When the user
// opens the bulk action and picks a category, every selected
// transaction gets the new category + a learned rule. Useful when
// you realise 10 supermarket rows ended up under "Altres" — pick
// them all and bulk-fix in one click.
const selectedIds = ref<Set<string>>(new Set());
const bulkCategoryId = ref<string>('');

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function clearSelection() {
  selectedIds.value = new Set();
  bulkCategoryId.value = '';
}

async function applyBulkCategory() {
  if (!bulkCategoryId.value || selectedIds.value.size === 0) return;
  const newId: string | null =
    bulkCategoryId.value === 'null' ? null : bulkCategoryId.value;
  const targets = (transactions.value ?? []).filter((t) =>
    selectedIds.value.has(t.id),
  );
  // Fire all updates in parallel — TanStack Query dedupes optimistic
  // updates per mutation, and the API is fast enough that 20 sequential
  // calls would be noticeable.
  await Promise.all(
    targets.map((t) =>
      upd
        .mutateAsync({
          id: t.id,
          categoryId: newId,
        })
        .then(() => {
          if (newId) recordLearnedRule(t.description, newId);
        }),
    ),
  );
  clearSelection();
}

const selectedCount = computed(() => selectedIds.value.size);

// ─── Bulk delete ───────────────────────────────────────────────────
// Destructive action, gated behind a confirm modal. Goes through a
// single POST /transactions/bulk-delete so the SQL DELETE is atomic.
const showConfirmDelete = ref(false);
const bulkDeleteError = ref<string | null>(null);

const allSelected = computed(() => {
  const list = transactions.value ?? [];
  return list.length > 0 && list.every((t) => selectedIds.value.has(t.id));
});

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set((transactions.value ?? []).map((t) => t.id));
  }
}

function askBulkDelete() {
  if (selectedIds.value.size === 0) return;
  bulkDeleteError.value = null;
  showConfirmDelete.value = true;
}

async function confirmBulkDelete() {
  const ids = Array.from(selectedIds.value);
  bulkDeleteError.value = null;
  try {
    await bulkDel.mutateAsync({ ids });
    showConfirmDelete.value = false;
    clearSelection();
  } catch (e) {
    bulkDeleteError.value =
      e instanceof Error ? e.message : 'No s\u2019han pogut eliminar els moviments.';
  }
}

// Clear the selection (and any open confirm modal) when the month
// changes — otherwise we leak IDs from the previous month into the
// current one's bulk operations.
watch(
  () => month.currentMonth.value,
  () => {
    clearSelection();
    showConfirmDelete.value = false;
    bulkDeleteError.value = null;
  },
);
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <div class="container py-8 space-y-6 animate-fade-in">
      <h1 class="font-semibold text-lg">Moviments</h1>
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <MonthSelector :label="month.label.value" @prev="month.prev" @next="month.next" />
        <Button @click="addMovement.open({ date: month.from.value })">
          Afegir moviment
        </Button>
      </div>

      <!-- Bulk action bar — appears only when something is selected -->
      <Card v-if="selectedCount > 0" padding="md" class="border-accent">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-sm text-ink-muted">
            <span class="font-medium text-ink">{{ selectedCount }}</span>
            seleccionats
          </span>
          <button
            type="button"
            class="text-sm text-accent hover:underline"
            @click="toggleSelectAll"
          >
            {{ allSelected ? 'Desseleccionar tots' : 'Seleccionar tots' }}
          </button>
          <label class="text-xs text-ink-subtle" for="bulk-cat">Categoria:</label>
          <select
            id="bulk-cat"
            v-model="bulkCategoryId"
            class="h-9 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent text-sm"
          >
            <option value="">— Tria categoria —</option>
            <option value="null">— Sense categoria —</option>
            <option
              v-for="c in (categories ?? []).filter((c) => !c.archived)"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
          <Button
            size="sm"
            :disabled="!bulkCategoryId || upd.isPending.value || bulkDel.isPending.value"
            @click="applyBulkCategory"
          >
            {{ upd.isPending.value ? 'Aplicant…' : 'Aplicar a tots' }}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            :disabled="upd.isPending.value || bulkDel.isPending.value"
            @click="askBulkDelete"
          >
            Esborrar seleccionats
          </Button>
          <Button size="sm" variant="ghost" @click="clearSelection">
            Cancel·lar
          </Button>
        </div>
      </Card>

      <Card v-if="isLoading" padding="lg">
        <p class="text-sm text-ink-subtle">Carregant moviments…</p>
      </Card>

      <Card v-else-if="(transactions?.length ?? 0) === 0" padding="lg">
        <div class="py-12 text-center space-y-3">
          <p class="text-ink-subtle">Cap moviment aquest mes.</p>
          <Button @click="addMovement.open({ date: month.from.value })">
            Afegir el primer
          </Button>
        </div>
      </Card>

      <div v-else class="space-y-4">
        <div v-for="[date, items] in groupedByDate" :key="date">
          <h3 class="text-xs uppercase tracking-wide text-ink-subtle font-medium mb-2 px-1">
            {{ formatDate(date) }}
          </h3>
          <Card padding="none">
            <ul class="divide-y divide-border">
              <li
                v-for="t in items"
                :key="t.id"
                class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
                :class="selectedIds.has(t.id) ? 'bg-accent/5' : ''"
              >
                <!-- Bulk-select checkbox -->
                <input
                  type="checkbox"
                  :checked="selectedIds.has(t.id)"
                  :aria-label="`Seleccionar ${t.description || 'moviment'}`"
                  :disabled="bulkDel.isPending.value"
                  class="w-4 h-4 rounded border-border text-accent focus:ring-accent cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                  @change="toggleSelected(t.id)"
                />

                <span
                  class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: categoryFor(t.categoryId).color }"
                />

                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ t.description || categoryFor(t.categoryId).name }}</p>

                  <!-- Inline category editor -->
                  <div v-if="editingId === t.id" class="mt-1.5 flex items-center gap-2">
                    <select
                      :value="t.categoryId ?? 'null'"
                      class="h-8 px-2 rounded bg-surface text-ink border border-accent focus:outline-none text-xs"
                      @change="(e) => changeCategory(t.id, t.description, (e.target as HTMLSelectElement).value)"
                      @click.stop
                    >
                      <option value="null">— Sense categoria —</option>
                      <option
                        v-for="c in (categories ?? []).filter((c) => !c.archived)"
                        :key="c.id"
                        :value="c.id"
                      >
                        {{ c.name }}
                      </option>
                    </select>
                    <button
                      type="button"
                      class="text-xs text-ink-subtle hover:text-ink px-2 py-1 rounded"
                      @click.stop="cancelEdit"
                    >
                      Cancel·lar
                    </button>
                  </div>

                  <!-- Read-only category chip — click to edit -->
                  <button
                    v-else
                    type="button"
                    class="text-xs text-ink-subtle hover:text-accent hover:underline text-left mt-0.5 inline-flex items-center gap-1"
                    :aria-label="`Canviar categoria de ${t.description || 'moviment'}`"
                    @click.stop="startEdit(t.id)"
                  >
                    <span>{{ categoryFor(t.categoryId).name }}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>

                <span
                  class="font-mono text-sm tabular-nums shrink-0"
                  :class="t.kind === 'income' ? 'text-positive' : 'text-negative'"
                >
                  {{ formatMoney(t.kind === 'income' ? t.amount : -t.amount, { showSign: true }) }}
                </span>
                <button
                  type="button"
                  class="text-ink-subtle hover:text-negative p-1 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                  :aria-label="`Esborrar ${t.description || 'moviment'}`"
                  :disabled="del.isPending.value || bulkDel.isPending.value"
                  @click="del.mutate(t.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>

    <!-- Bulk delete confirmation modal -->
    <Modal
      :open="showConfirmDelete"
      title="Eliminar moviments"
      @close="showConfirmDelete = false"
    >
      <p class="text-sm text-ink">
        Vols eliminar <strong>{{ selectedCount }}</strong>
        {{ selectedCount === 1 ? 'moviment' : 'moviments' }}?
        Aquesta acció no es pot desfer.
      </p>
      <p v-if="bulkDeleteError" class="mt-3 text-sm text-negative">
        {{ bulkDeleteError }}
      </p>
      <div class="flex items-center gap-2 justify-end pt-4 mt-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          :disabled="bulkDel.isPending.value"
          @click="showConfirmDelete = false"
        >
          Cancel·lar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          :disabled="bulkDel.isPending.value"
          @click="confirmBulkDelete"
        >
          {{ bulkDel.isPending.value ? 'Eliminant…' : 'Eliminar' }}
        </Button>
      </div>
    </Modal>
  </main>
</template>