<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, formatMoney } from '@finances/ui';
import type { Account, AccountType } from '@finances/contracts';
import {
  useAccounts,
  useAccountBalances,
  useArchiveAccount,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from '@/composables/queries';
import Modal from '@/components/Modal.vue';

const { data: accounts, isLoading } = useAccounts();
const { data: balances } = useAccountBalances();
const create = useCreateAccount();
const update = useUpdateAccount();
const archive = useArchiveAccount();
const remove = useDeleteAccount();

const balanceMap = computed(() => {
  const m = new Map<string, number>();
  for (const b of balances.value ?? []) m.set(b.accountId, b.balanceCents);
  return m;
});

const totalCents = computed(() => {
  let total = 0;
  for (const [, cents] of balanceMap.value) total += cents;
  return total;
});

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Compte corrent' },
  { value: 'savings', label: 'Estalvis' },
  { value: 'credit_card', label: 'Targeta de crèdit' },
  { value: 'cash', label: 'Efectiu' },
  { value: 'investment', label: 'Inversió' },
];

const COLORS = ['#6366F1', '#2E7D32', '#1976D2', '#7B1FA2', '#ED6C02', '#5D4037'];

const dialogOpen = ref(false);
const editing = ref<Account | null>(null);
const form = ref({
  name: '',
  type: 'checking' as AccountType,
  color: COLORS[0]!,
  initialBalance: 0,
});

function openCreate() {
  editing.value = null;
  form.value = { name: '', type: 'checking', color: COLORS[0]!, initialBalance: 0 };
  dialogOpen.value = true;
}

function openEdit(acc: Account) {
  editing.value = acc;
  form.value = {
    name: acc.name,
    type: acc.type,
    color: acc.color,
    initialBalance: acc.initialBalance,
  };
  dialogOpen.value = true;
}

async function submit() {
  if (form.value.name.trim() === '') return;
  if (editing.value) {
    await update.mutateAsync({
      id: editing.value.id,
      name: form.value.name.trim(),
      type: form.value.type,
      color: form.value.color,
      initialBalance: form.value.initialBalance,
    });
  } else {
    await create.mutateAsync({
      name: form.value.name.trim(),
      type: form.value.type,
      color: form.value.color,
      icon: 'wallet',
      initialBalance: form.value.initialBalance,
    });
  }
  dialogOpen.value = false;
}

async function confirmArchive(acc: Account) {
  if (window.confirm(`Arxivar el compte "${acc.name}"?`)) {
    await archive.mutateAsync(acc.id);
  }
}

async function confirmDelete(acc: Account) {
  if (
    window.confirm(
      `Eliminar el compte "${acc.name}"? Aquesta acció esborra el compte i totes les transaccions associades. No es pot desfer.`,
    )
  ) {
    await remove.mutateAsync(acc.id);
  }
}

function typeLabel(t: AccountType): string {
  return ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;
}
</script>

<template>
  <main class="min-h-screen bg-bg pb-24 sm:pb-0">
    <div class="container py-8 space-y-6 animate-fade-in">
      <h1 class="font-semibold text-lg">Comptes</h1>
      <!-- Total -->
      <div class="flex items-baseline justify-between">
        <span class="text-sm text-ink-subtle">Saldo total</span>
        <span
          class="font-mono tabular-nums text-2xl font-semibold"
          :class="totalCents < 0 ? 'text-negative' : 'text-ink'"
        >
          {{ formatMoney(totalCents, { showSign: totalCents < 0 }) }}
        </span>
      </div>

      <div v-if="isLoading" class="text-sm text-ink-subtle">Carregant…</div>

      <div v-else-if="(accounts?.length ?? 0) === 0" class="text-center py-16 space-y-4">
        <p class="text-ink-subtle">Encara no tens cap compte.</p>
        <Button @click="openCreate">Crear el primer</Button>
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="acc in accounts"
          :key="acc.id"
          class="flex items-center gap-3 p-4 bg-surface border border-border rounded-lg hover:border-accent/40 transition-colors"
        >
          <span
            class="inline-block w-3 h-3 rounded-full shrink-0"
            :style="{ backgroundColor: acc.color }"
          />
          <button
            type="button"
            class="flex-1 text-left min-w-0"
            @click="openEdit(acc)"
          >
            <p class="font-medium truncate">{{ acc.name }}</p>
            <p class="text-xs text-ink-subtle">{{ typeLabel(acc.type) }}</p>
          </button>
          <span
            class="font-mono tabular-nums text-sm shrink-0"
            :class="(balanceMap.get(acc.id) ?? 0) < 0 ? 'text-negative' : 'text-ink'"
          >
            {{ formatMoney(balanceMap.get(acc.id) ?? 0) }}
          </span>
          <button
            type="button"
            class="text-ink-subtle hover:text-negative p-1 shrink-0"
            :aria-label="`Eliminar ${acc.name}`"
            :disabled="remove.isPending.value"
            @click="confirmDelete(acc)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <!-- FAB -->
    <button
      type="button"
      class="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-accent text-white shadow-warm hover:bg-accent-hover transition-colors flex items-center justify-center"
      aria-label="Crear compte"
      @click="openCreate"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <Modal :open="dialogOpen" :title="editing ? 'Editar compte' : 'Nou compte'" @close="dialogOpen = false">
      <form class="space-y-4" @submit.prevent="submit">
        <div class="flex flex-col gap-1.5">
          <label for="acc-name" class="text-sm font-medium">Nom <span class="text-negative">*</span></label>
          <input
            id="acc-name"
            v-model="form.name"
            type="text"
            required
            maxlength="50"
            class="h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Caixa, Sabadell, Revolut…"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="acc-type" class="text-sm font-medium">Tipus</label>
          <select
            id="acc-type"
            v-model="form.type"
            class="h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option v-for="t in ACCOUNT_TYPES" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="acc-balance" class="text-sm font-medium">Saldo inicial (cèntims)</label>
          <input
            id="acc-balance"
            v-model.number="form.initialBalance"
            type="number"
            step="1"
            class="h-11 px-3 rounded-md bg-surface text-ink border border-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
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