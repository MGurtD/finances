import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
      path: '/health',
      name: 'health',
      component: () => import('@/views/Health.vue'),
    },
  ],
});