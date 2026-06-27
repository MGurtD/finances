<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Card, Button, Input } from '@finances/ui';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { AuthStatusResponse } from '@/api/types';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

async function submit() {
  if (!password.value) return;
  error.value = null;
  submitting.value = true;
  try {
    const { data, error: err } = await api.POST('/auth/login' as never, { body: { password: password.value } } as never);
    if (err) throw err;
    if (data) auth.set(data as unknown as AuthStatusResponse);
    password.value = '';
    const redirect = (route.query['redirect'] as string) || '/';
    void router.replace(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error iniciant sessió';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (auth.ready && auth.authenticated) {
    const redirect = (route.query['redirect'] as string) || '/';
    void router.replace(redirect);
    return;
  }
  try {
    const { data, error: err } = await api.GET('/auth/status' as never);
    if (err) throw err;
    if (data) {
      const status = data as unknown as AuthStatusResponse;
      auth.set(status);
      if (status.authenticated) {
        const redirect = (route.query['redirect'] as string) || '/';
        void router.replace(redirect);
      }
    }
  } catch {
    auth.clear();
  }
});
</script>

<template>
  <main class="min-h-screen bg-bg flex items-center justify-center p-4">
    <Card padding="lg" class="w-full max-w-sm animate-fade-in">
      <form class="space-y-5" @submit.prevent="submit">
        <header class="space-y-1">
          <h1 class="text-finance-xl font-semibold">Finances</h1>
          <p class="text-sm text-ink-subtle">Inicia sessió per continuar</p>
        </header>

        <Input
          v-model="password"
          type="password"
          label="Contrasenya"
          placeholder="••••••••"
          autocomplete="current-password"
          required
          :disabled="submitting"
          @keydown.enter="submit"
        />

        <p v-if="error" class="text-sm text-negative" role="alert">{{ error }}</p>

        <Button type="submit" class="w-full" :disabled="submitting || !password">
          {{ submitting ? 'Entrant…' : 'Entrar' }}
        </Button>
      </form>
    </Card>
  </main>
</template>