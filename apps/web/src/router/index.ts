import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { AuthStatusResponse } from '@/api/types';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
    },
    {
      path: '/moviments',
      name: 'moviments',
      component: () => import('@/views/Moviments.vue'),
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: () => import('@/views/Accounts.vue'),
    },
    {
      path: '/categories',
      name: 'categories',
      component: () => import('@/views/Categories.vue'),
    },
    {
      path: '/budgets',
      name: 'budgets',
      component: () => import('@/views/Budgets.vue'),
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/Import.vue'),
    },
    {
      path: '/health',
      name: 'health',
      component: () => import('@/views/Health.vue'),
      meta: { public: true },
    },
  ],
});

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore();
  const isPublic = to.meta['public'] === true;

  if (!auth.ready) {
    try {
      const { data, error } = await api.GET('/auth/status' as never);
      if (!error && data) {
        auth.set(data as unknown as AuthStatusResponse);
      } else {
        auth.clear();
      }
    } catch {
      auth.clear();
    }
  }

  const authenticated = auth.authenticated;

  if (!isPublic && !authenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && authenticated) {
    return { path: '/' };
  }
  return true;
});