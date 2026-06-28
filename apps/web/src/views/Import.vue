<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Card, CategoryPicker, formatMoney } from '@finances/ui';
import {
  useAccounts,
  useBulkCreateTransactions,
  useCategories,
  useTransactionsList,
} from '@/composables/queries';
import { autoCategorize, type Categorisation } from '@/utils/autoCategorize';
import { autoCategorizeCached, clearCategorisationCache } from '@/utils/autoCategorize/cache';
import { recordLearnedRule } from '@/utils/autoCategorize/learnedRules';
import {
  confidenceLabel,
  detectFormat,
  importers,
  parseWith,
  suggestImporter,
  type ImporterSuggestion,
  type ParsedRow,
} from '@/utils/importers';
import { buildBulkPayload } from '@/utils/importers/payload';

type Step = 'upload' | 'confirm' | 'preview' | 'done';

interface EditableRow extends ParsedRow {
  id: string;
  /** User-confirmed category id. Starts as the auto-categorise suggestion. */
  categoryId: string | null;
  /** Confidence of the auto-categorise suggestion at the time it was set.
   *  Used to visually flag low/medium confidence rows in the preview. */
  suggestion: Categorisation;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `row-${counter}`;
}

const step = ref<Step>('upload');
const filename = ref<string>('');
const format = ref<'csv' | 'ofx' | 'unknown'>('unknown');
const dragOver = ref(false);
const errorMsg = ref<string | null>(null);

const selectedAccountId = ref<string | null>(null);
const { data: accounts } = useAccounts();
const { data: categories } = useCategories();
const bulk = useBulkCreateTransactions();

const rows = ref<EditableRow[]>([]);

// ── Suggestion state ────────────────────────────────────────────────────────
// `loadFile` only reads the file and asks the registry to score each
// importer; parsing + categorisation wait for the user to confirm the
// chosen importer on the next step. This split keeps the suggestion
// cheap (string scan, no CSV parse) and lets the user override the
// detected format without re-dropping the file.
const rawContent = ref<string>('');
const suggestion = ref<ImporterSuggestion | null>(null);
const selectedImporterId = ref<string | null>(null);

const confidenceByImporter = computed(() => {
  const map: Record<string, number> = {};
  if (!suggestion.value) return map;
  for (const a of suggestion.value.alternatives) {
    map[a.importer.id] = a.confidence;
  }
  if (suggestion.value.primary) {
    map[suggestion.value.primary.id] = suggestion.value.confidence;
  }
  return map;
});

// Probe existing transactions to tell the user how many rows are duplicates
// before they commit. Limited to the file's date range + selected account so
// the query stays cheap.
const probeRange = computed(() => {
  if (rows.value.length === 0) {
    // No file loaded yet → probe a wide range so the query stays valid but
    // duplicate detection won't kick in (rows is empty).
    return { from: '1970-01-01', to: '2999-12-31', accountId: selectedAccountId.value ?? undefined };
  }
  const dates = rows.value.map((r) => r.date).sort();
  return {
    from: dates[0]!,
    to: dates[dates.length - 1]!,
    accountId: selectedAccountId.value ?? undefined,
  };
});
const { data: probeTransactions } = useTransactionsList(probeRange);

const duplicateCount = computed(() => {
  if (!probeTransactions.value || rows.value.length === 0) return 0;
  // Build a set of existing fingerprints (account|YYYY-MM-DD|signed cents|description)
  // to match against the rows the user is about to import.
  const existing = new Set<string>();
  for (const tx of probeTransactions.value) {
    const amt = tx.kind === 'expense' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
    existing.add(
      `${tx.accountId}|${tx.date}|${amt}|${(tx.description ?? '').trim()}`,
    );
  }
  let n = 0;
  for (const r of rows.value) {
    const amt = r.kind === 'expense' ? -Math.abs(r.amountCents) : Math.abs(r.amountCents);
    const key = `${selectedAccountId.value}|${r.date}|${amt}|${r.description.trim()}`;
    if (existing.has(key)) n += 1;
  }
  return n;
});

const newRowCount = computed(
  () => Math.max(0, rows.value.length - duplicateCount.value),
);

const counts = computed(() => ({
  total: rows.value.length,
  withCategory: rows.value.filter((r) => r.categoryId !== null).length,
  duplicates: duplicateCount.value,
  new: newRowCount.value,
  lowConfidence: rows.value.filter(
    (r) => r.suggestion.confidence === 'low' || r.suggestion.confidence === 'medium',
  ).length,
}));

/**
 * Update the category for one row in the preview. Side effect: records a
 * learned rule in localStorage so the next time the same description comes
 * through the importer it's auto-categorised without user intervention.
 */
function setRowCategory(rowId: string, newCategoryId: string | null) {
  const row = rows.value.find((r) => r.id === rowId);
  if (!row) return;
  row.categoryId = newCategoryId;
  // Only record when the user actively chose a category — null means
  // "skip", which shouldn't pollute the learned-rule store.
  if (newCategoryId) {
    recordLearnedRule(row.description, newCategoryId);
    // Phase 5: invalidate the cache so subsequent calls to
    // autoCategorizeCached for this description re-read the learned
    // rule. Without this, a previous cached suggestion could shadow
    // the user's correction.
    clearCategorisationCache();
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
}

function onPick(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void loadFile(file);
  target.value = '';
}

/**
 * Step 1: read the file as text, ask the registry to score each
 * importer, present the suggestion. NO parsing yet — the user must
 * confirm (or override) the chosen importer before any work is done.
 */
async function loadFile(file: File) {
  errorMsg.value = null;
  filename.value = file.name;
  try {
    const text = await file.text();
    rawContent.value = text;
    format.value = detectFormat(file.name, text);
    suggestion.value = suggestImporter(file.name, text);
    selectedImporterId.value = suggestion.value.primary?.id ?? null;
    step.value = 'confirm';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Error llegint el fitxer";
  }
}

/**
 * Step 2 (after the user clicks "Continuar"): parse with the chosen
 * importer, then run autoCategorizeCached. Switching importer means
 * re-running this whole function — the categorisation is per-importer.
 */
async function confirmImporter() {
  const importerId = selectedImporterId.value;
  if (!importerId) {
    errorMsg.value = "Selecciona un importador per continuar.";
    return;
  }
  errorMsg.value = null;
  try {
    const parsed = await parseWith(importerId, rawContent.value);
    if (parsed.length === 0) {
      errorMsg.value = 'No hem pogut extreure cap fila. Comprova el format.';
      step.value = 'confirm';
      return;
    }
    // Phase 5: wipe the categorisation cache so user corrections from
    // a previous import take effect for the current one.
    clearCategorisationCache();
    rows.value = parsed.map((r) => {
      const suggestion = autoCategorizeCached({
        description: r.description,
        amountCents: r.amountCents,
        kind: r.kind,
        categories: categories.value ?? [],
      });
      return {
        ...r,
        id: nextId(),
        categoryId: suggestion.categoryId,
        suggestion,
      };
    });
    if (!selectedAccountId.value && accounts.value?.[0]) {
      selectedAccountId.value = accounts.value[0].id;
    }
    step.value = 'preview';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Error important el fitxer";
    step.value = 'confirm';
  }
}

function cancel() {
  step.value = 'upload';
  rows.value = [];
  filename.value = '';
  format.value = 'unknown';
  rawContent.value = '';
  suggestion.value = null;
  selectedImporterId.value = null;
  errorMsg.value = null;
}

function backToConfirm() {
  step.value = 'confirm';
  rows.value = [];
}

async function commitImport() {
  if (!selectedAccountId.value || rows.value.length === 0) return;
  const payload = buildBulkPayload(selectedAccountId.value, rows.value);
  const result = await bulk.mutateAsync(payload);
  step.value = 'done';
  // Stash the result count for display on the done step.
  (window as unknown as { __lastImportResult?: typeof result }).__lastImportResult = result;
}

function reset() {
  step.value = 'upload';
  rows.value = [];
  filename.value = '';
  format.value = 'unknown';
  rawContent.value = '';
  suggestion.value = null;
  selectedImporterId.value = null;
  errorMsg.value = null;
}

const lastResult = computed(() => {
  if (step.value !== 'done') return null;
  return (window as unknown as { __lastImportResult?: { inserted: number; skipped: number } }).__lastImportResult ?? null;
});

// Silence the unused-import warning for autoCategorize (still imported by
// autoCategorizeCached transitively) — kept in case future refactors
// need direct access.
void autoCategorize;
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <div class="container py-8 space-y-6 animate-fade-in">
      <h1 class="font-semibold text-lg">Importar moviments</h1>

      <!-- Step 1: Upload -->
      <Card v-if="step === 'upload'" padding="lg">
        <div
          class="border-2 border-dashed rounded-lg p-10 text-center transition-colors"
          :class="dragOver ? 'border-accent bg-accent/5' : 'border-border'"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <p class="text-sm text-ink-muted mb-3">
            Arrossega un fitxer CSV o OFX aquí, o
          </p>
          <label class="inline-block">
            <input type="file" accept=".csv,.ofx,.qfx,.txt" class="sr-only" @change="onPick" />
            <span class="inline-flex items-center h-10 px-4 rounded-md bg-accent text-white font-medium hover:bg-accent-hover cursor-pointer transition-colors">
              Selecciona un fitxer
            </span>
          </label>
          <p class="text-xs text-ink-subtle mt-3">
            Formats suportats: CSV genèric (CaixaBank, BBVA, Sabadell, ABANCA…), OFX/QFX i exportacions de Trade Republic.
          </p>
        </div>

        <p v-if="errorMsg" class="text-sm text-negative mt-4">{{ errorMsg }}</p>

        <div v-if="(accounts?.length ?? 0) === 0" class="mt-6 text-sm text-ink-subtle">
          Encara no tens cap compte. Crea'n un a la secció
          <a href="/accounts" class="text-accent hover:underline">Comptes</a> abans d'importar.
        </div>
      </Card>

      <!-- Step 2: Confirm importer -->
      <Card v-else-if="step === 'confirm'" padding="lg">
        <header class="mb-4">
          <p class="font-medium">{{ filename }}</p>
          <p class="text-xs text-ink-subtle">{{ format.toUpperCase() }}</p>
        </header>

        <div v-if="suggestion?.primary" class="rounded-md border border-border p-4 mb-4 bg-surface-2/50">
          <p class="text-sm">
            Sembla un
            <span class="font-medium">{{ suggestion.primary.label }}</span>
            · confiança <span class="font-medium">{{ confidenceLabel(suggestion.confidence) }}</span>
            <span class="text-ink-subtle">({{ Math.round(suggestion.confidence * 100) }}%)</span>
          </p>
        </div>
        <div v-else class="rounded-md border border-warning/40 bg-warning/5 p-4 mb-4 text-sm">
          No hem pogut identificar el format del fitxer. Tria un importador manualment.
        </div>

        <label class="block text-sm text-ink-muted mb-2" for="imp-importer">Importador:</label>
        <select
          id="imp-importer"
          v-model="selectedImporterId"
          class="w-full h-10 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent text-sm"
        >
          <option
            v-for="imp in importers"
            :key="imp.id"
            :value="imp.id"
          >
            {{ imp.label }} — {{ confidenceLabel(confidenceByImporter[imp.id] ?? 0) }}
          </option>
        </select>
        <p class="text-xs text-ink-subtle mt-2">
          Cada importador mostra la confiança que el registre ha calculat per aquest fitxer.
        </p>

        <p v-if="errorMsg" class="text-sm text-negative mt-4">{{ errorMsg }}</p>

        <div class="flex items-center gap-2 justify-end mt-4">
          <Button variant="ghost" @click="cancel">Cancel·lar</Button>
          <Button :disabled="!selectedImporterId" @click="confirmImporter">
            Continuar
          </Button>
        </div>
      </Card>

      <!-- Step 3: Preview -->
      <Card v-else-if="step === 'preview'" padding="lg">
        <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p class="font-medium">{{ filename }}</p>
            <p class="text-xs text-ink-subtle">
              {{ format.toUpperCase() }} · {{ counts.total }} moviments
              ({{ counts.withCategory }} auto-categoritzats)
              <template v-if="counts.duplicates > 0">
                · <span class="text-warning">{{ counts.duplicates }}</span> ja existien
              </template>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-ink-subtle" for="imp-account">Compte:</label>
            <select
              id="imp-account"
              v-model="selectedAccountId"
              class="h-9 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent text-sm"
            >
              <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
            </select>
          </div>
        </header>

        <div class="max-h-96 overflow-y-auto border border-border rounded-md">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-surface-2 text-ink-subtle text-xs uppercase tracking-wide">
              <tr>
                <th class="text-left px-3 py-2 font-medium">Data</th>
                <th class="text-left px-3 py-2 font-medium">Descripció</th>
                <th class="text-right px-3 py-2 font-medium">Import</th>
                <th class="text-left px-3 py-2 font-medium">Categoria</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="r in rows" :key="r.id" class="hover:bg-surface-2/50">
                <td class="px-3 py-2 text-ink-muted whitespace-nowrap">{{ r.date }}</td>
                <td class="px-3 py-2 truncate max-w-xs">{{ r.description }}</td>
                <td
                  class="px-3 py-2 text-right font-mono tabular-nums"
                  :class="r.kind === 'income' ? 'text-positive' : 'text-negative'"
                >
                  {{ formatMoney(r.kind === 'income' ? r.amountCents : -r.amountCents, { showSign: true }) }}
                </td>
                <td class="px-3 py-2">
                  <CategoryPicker
                    :model-value="r.categoryId"
                    :categories="(categories ?? []).filter((c) => !c.archived)"
                    :kind="r.kind"
                    size="sm"
                    :placeholder="r.categoryId === null ? '— Sense categoria —' : undefined"
                    @update:model-value="(v: string | null) => setRowCategory(r.id, v)"
                  />
                  <p
                    v-if="r.suggestion.confidence === 'low'"
                    class="text-[10px] text-warning mt-1"
                  >
                    Suggeriment dèbil — revisa
                  </p>
                  <details
                    v-if="r.suggestion.reasons.length > 0"
                    class="text-[10px] text-ink-subtle mt-1 cursor-pointer"
                  >
                    <summary>Per què?</summary>
                    <ul class="mt-1 space-y-0.5 list-disc list-inside">
                      <li
                        v-for="(reason, idx) in r.suggestion.reasons.slice(0, 3)"
                        :key="idx"
                      >
                        {{ reason.detail }}
                      </li>
                    </ul>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="errorMsg" class="text-sm text-negative mt-3">{{ errorMsg }}</p>

        <div class="flex items-center gap-2 justify-end mt-4">
          <Button variant="ghost" :disabled="bulk.isPending.value" @click="backToConfirm">Tornar</Button>
          <Button variant="ghost" :disabled="bulk.isPending.value" @click="cancel">Cancel·lar</Button>
          <Button
            :disabled="!selectedAccountId || rows.length === 0 || bulk.isPending.value || newRowCount === 0"
            @click="commitImport"
          >
            <template v-if="bulk.isPending.value">Important…</template>
            <template v-else-if="newRowCount === 0">Ja estan tots importats</template>
            <template v-else-if="newRowCount < rows.length">
              Importar {{ newRowCount }} ({{ rows.length - newRowCount }} ja existien)
            </template>
            <template v-else>
              Importar {{ rows.length }}
            </template>
          </Button>
        </div>
      </Card>

      <!-- Step 4: Done -->
      <Card v-else padding="lg">
        <div class="text-center py-6 space-y-4">
          <h2 class="font-semibold text-finance-lg">
            <span v-if="lastResult && lastResult.inserted > 0">Importació completada</span>
            <span v-else>Res nou per importar</span>
          </h2>
          <p v-if="lastResult" class="text-sm text-ink-muted">
            <template v-if="lastResult.inserted > 0">
              <span class="text-positive font-medium">{{ lastResult.inserted }}</span> moviments nous importats
            </template>
            <template v-else>
              Tots els <span class="text-ink font-medium">{{ lastResult.skipped }}</span>
              moviments del fitxer ja existien al compte seleccionat.
            </template>
          </p>
          <p v-if="lastResult && lastResult.skipped > 0 && lastResult.inserted > 0" class="text-xs text-ink-subtle">
            A més, {{ lastResult.skipped }} duplicats saltats.
          </p>
          <div class="flex items-center gap-2 justify-center">
            <Button variant="ghost" @click="reset">Importar un altre</Button>
            <Button @click="$router.push({ name: 'moviments' })">Anar a moviments</Button>
          </div>
        </div>
      </Card>
    </div>
  </main>
</template>
