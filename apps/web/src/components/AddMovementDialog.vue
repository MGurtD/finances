<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Button, Card, Input, formatMoney, parseMoneyInput } from '@finances/ui';
import type { Category } from '@finances/contracts';
import { useAddMovementStore } from '@/stores/addMovement';
import { useAccounts, useCategories, useCreateTransaction } from '@/composables/queries';
import { toMonth, currentMonthString } from '@/composables/useMonth';

const store = useAddMovementStore();
const { data: accounts } = useAccounts();
const { data: categories } = useCategories();
const create = useCreateTransaction();

const kind = ref<'income' | 'expense'>('expense');
const amountText = ref('');
const description = ref('');
const categoryId = ref<string | null>(null);
const accountId = ref<string | null>(null);
const date = ref('');
const error = ref<string | null>(null);

const availableCategories = computed<Category[]>(() =>
  (categories.value ?? []).filter((c) => c.kind === kind.value && !c.archived),
);

const amountCents = computed(() => parseMoneyInput(amountText.value));

const isValid = computed(
  () =>
    amountCents.value > 0 &&
    accountId.value !== null &&
    date.value !== '',
);

watch(
  () => store.isOpen,
  (open) => {
    if (open) {
      kind.value = store.defaultKind;
      amountText.value = '';
      description.value = '';
      categoryId.value = null;
      accountId.value = accounts.value?.[0]?.id ?? null;
      date.value = store.defaultDate ?? `${toMonth(currentMonthString())}`;
      error.value = null;
    }
  },
);

watch(kind, () => {
  categoryId.value = null;
});

async function submit() {
  if (!isValid.value || !accountId.value) return;
  try {
    await create.mutateAsync({
      accountId: accountId.value,
      categoryId: categoryId.value,
      kind: kind.value,
      amount: amountCents.value,
      description: description.value,
      notes: '',
      date: date.value,
      transferAccountId: null,
    });
    store.close();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error creant el moviment";
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!store.isOpen) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    void submit();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-smooth"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-smooth"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="store.isOpen"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-movement-title"
      @click.self="store.close()"
    >
      <Card padding="lg" class="w-full sm:max-w-md rounded-t-xl sm:rounded-xl max-h-[90vh] overflow-auto animate-fade-in">
        <div class="space-y-5">
          <header class="flex items-center justify-between">
            <h2 id="add-movement-title" class="font-semibold text-finance-lg">Nou moviment</h2>
            <button
              type="button"
              class="text-ink-subtle hover:text-ink p-1"
              aria-label="Tancar"
              @click="store.close()"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div class="grid grid-cols-2 gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="kind === 'expense'"
              :class="[
                'h-11 rounded-md font-medium transition-colors',
                kind === 'expense' ? 'bg-negative text-white' : 'bg-surface-2 text-ink hover:bg-border',
              ]"
              @click="kind = 'expense'"
            >
              Despesa
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="kind === 'income'"
              :class="[
                'h-11 rounded-md font-medium transition-colors',
                kind === 'income' ? 'bg-positive text-white' : 'bg-surface-2 text-ink hover:bg-border',
              ]"
              @click="kind = 'income'"
            >
              Ingrés
            </button>
          </div>

          <Input
            v-model="amountText"
            type="text"
            inputmode="decimal"
            label="Import"
            placeholder="0,00"
            required
            :hint="amountCents > 0 ? formatMoney(amountCents, { showSign: false }) : undefined"
          />

          <Input
            v-model="description"
            type="text"
            label="Descripció"
            placeholder="Lloguer, Carrefour, Netflix…"
            :maxlength="200"
          />

          <div class="flex flex-col gap-1.5">
            <label for="am-category" class="text-sm font-medium text-ink">Categoria</label>
            <select
              id="am-category"
              v-model="categoryId"
              class="h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option :value="null">— Sense categoria —</option>
              <option v-for="cat in availableCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="am-account" class="text-sm font-medium text-ink">
              Compte <span class="text-negative">*</span>
            </label>
            <select
              id="am-account"
              v-model="accountId"
              required
              class="h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option v-for="acc in accounts ?? []" :key="acc.id" :value="acc.id">
                {{ acc.name }}
              </option>
            </select>
          </div>

          <Input
            v-model="date"
            type="date"
            label="Data"
            required
          />

          <p v-if="error" class="text-sm text-negative">{{ error }}</p>

          <div class="flex items-center gap-2 justify-end pt-2">
            <Button variant="ghost" @click="store.close()">Cancel·lar</Button>
            <Button :disabled="!isValid || create.isPending.value" @click="submit">
              {{ create.isPending.value ? 'Desant…' : 'Desar' }}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </Transition>
</template>