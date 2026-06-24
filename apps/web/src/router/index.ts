import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { trpc } from '@/trpc/client';
import { useAuthStore } from '@/stores/auth';

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
      const status = await trpc.auth.status.query();
      auth.set(status);
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