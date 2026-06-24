<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Card, Button } from '@finances/ui';
import { trpc } from '@/trpc/client';
import type { Health } from '@finances/contracts';

const health = ref<Health | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function check() {
  loading.value = true;
  error.value = null;
  try {
    health.value = await trpc.health.get.query();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error desconegut';
  } finally {
    loading.value = false;
  }
}

onMounted(check);
</script>

<template>
  <div class="container py-12 max-w-2xl space-y-6">
    <header class="flex items-center justify-between">
      <h1 class="text-finance-xl font-semibold">Connexió amb l'API</h1>
      <router-link to="/" class="text-sm text-accent hover:underline">← Tornar</router-link>
    </header>

    <Card padding="lg">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-ink-subtle uppercase tracking-wide">tRPC · health.get</p>
            <p class="font-mono text-sm mt-1">
              <span v-if="loading" class="text-ink-muted">comprovant…</span>
              <span v-else-if="error" class="text-negative">{{ error }}</span>
              <span v-else-if="health" class="text-positive">● connectat</span>
            </p>
          </div>
          <Button @click="check" :disabled="loading">Reintentar</Button>
        </div>

        <pre v-if="health" class="bg-surface-2 rounded-md p-4 text-xs font-mono overflow-auto">{{ health }}</pre>
      </div>
    </Card>
  </div>
</template>