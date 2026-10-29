import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';

const AppShell = () => import('@/components/AppShell.vue');

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: 'Accedi' },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', name: 'today', component: () => import('@/views/OggiView.vue'), meta: { title: 'Oggi' } },
        { path: 'spesa', name: 'shopping', component: () => import('@/views/SpesaView.vue'), meta: { title: 'Spesa' } },
        { path: 'calendario', name: 'calendar', component: () => import('@/views/CalendarioView.vue'), meta: { title: 'Calendario' } },
        { path: 'scadenze', name: 'deadlines', component: () => import('@/views/ScadenzeView.vue'), meta: { title: 'Scadenze' } },
        { path: 'ricette', name: 'recipes', component: () => import('@/views/RicetteView.vue'), meta: { title: 'Ricette' } },
        {
          path: 'ricette/:id',
          name: 'recipe',
          component: () => import('@/views/RicettaView.vue'),
          props: true,
          meta: { title: 'Ricetta' },
        },
        { path: 'piante', name: 'plants', component: () => import('@/views/PianteView.vue'), meta: { title: 'Piante' } },
        {
          path: 'piante/:id',
          name: 'plant',
          component: () => import('@/views/PiantaView.vue'),
          props: true,
          meta: { title: 'Pianta' },
        },
        {
          path: 'impostazioni',
          name: 'settings',
          component: () => import('@/views/ImpostazioniView.vue'),
          meta: { title: 'Impostazioni', admin: true },
        },
        { path: 'profilo', name: 'profile', component: () => import('@/views/ProfiloView.vue'), meta: { title: 'Profilo' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.bootstrap();
  if (to.meta.public) {
    if (auth.isAuthenticated && to.name === 'login') return { name: 'today' };
    return true;
  }
  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
  }
  if (to.meta.admin && !auth.isAdmin) return { name: 'today' };
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title ? `${to.meta.title} · Ghibiri Home` : 'Ghibiri Home';
  document.title = title;
});

export default router;
