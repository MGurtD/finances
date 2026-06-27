<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Card, Button } from '@finances/ui';
import { api } from '@/api/client';
import type { HealthResponse } from '@/api/types';

const health = ref<HealthResponse | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function check() {
  loading.value = true;
  error.value = null;
  try {
    const { data, error: err } = await api.GET('/health');
    if (err) throw err;
    health.value = data ?? null;
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
            <p class="text-sm text-ink-subtle uppercase tracking-wide">Go · GET /health</p>
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