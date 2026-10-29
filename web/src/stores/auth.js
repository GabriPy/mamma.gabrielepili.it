import { defineStore } from 'pinia';
import { api } from '@/api.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    profiles: [],
    ready: false,
    loading: false,
    error: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    isAdmin: (state) => state.user?.role === 'admin',
    displayName: (state) => state.user?.name || '',
  },
  actions: {
    async bootstrap() {
      if (this.ready) return;
      this.loading = true;
      try {
        const [me] = await Promise.all([api('/api/auth/me'), this.loadProfiles()]);
        this.user = me.user;
      } catch (err) {
        if (err?.status !== 401) this.error = err?.message || null;
        this.user = null;
      } finally {
        this.loading = false;
        this.ready = true;
      }
    },
    async loadProfiles() {
      try {
        const data = await api('/api/auth/profiles');
        this.profiles = data.profiles || [];
      } catch {
        this.profiles = [];
      }
    },
    async login(userId, pin) {
      const data = await api('/api/auth/login', { method: 'POST', body: { userId, pin } });
      this.user = data.user;
      this.ready = true;
      this.error = null;
      return data.user;
    },
    async logout() {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        /* la sessione potrebbe essere già scaduta */
      }
      this.user = null;
      this.ready = true;
    },
    async refresh() {
      try {
        const data = await api('/api/auth/me');
        this.user = data.user;
      } catch {
        this.user = null;
      }
      return this.user;
    },
    async updateProfile(patch) {
      const data = await api('/api/auth/me', { method: 'PATCH', body: patch });
      this.user = data.user;
      await this.loadProfiles();
      return data.user;
    },
  },
});
