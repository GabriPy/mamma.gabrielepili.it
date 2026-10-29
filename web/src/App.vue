<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useUiStore } from '@/stores/ui.js';
import ToastHost from '@/components/ToastHost.vue';
import ConfirmHost from '@/components/ConfirmHost.vue';

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

function onExpired() {
  if (!auth.user) return;
  auth.user = null;
  ui.info('La sessione è scaduta. Accedi di nuovo.');
  router.push({ name: 'login' });
}

onMounted(() => window.addEventListener('gh:auth-expired', onExpired));
onUnmounted(() => window.removeEventListener('gh:auth-expired', onExpired));
</script>

<template>
  <RouterView />
  <ToastHost />
  <ConfirmHost />
</template>
