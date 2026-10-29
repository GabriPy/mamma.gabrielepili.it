import { defineStore } from 'pinia';
import { api } from '@/api.js';

export const useMetaStore = defineStore('meta', {
  state: () => ({
    loaded: false,
    householdName: 'Casa Ghibiri',
    reminderHour: '09:00',
    emailReminders: false,
    deadlineOffsets: '7,1',
    eventOffsetDays: 1,
    plantReminders: true,
    maxUploadMb: 15,
    appUrl: '',
  }),
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return;
      try {
        const data = await api('/api/settings/public');
        Object.assign(this, data);
        this.loaded = true;
      } catch {
        /* le impostazioni pubbliche non bloccano l'app */
      }
    },
    reset() {
      this.loaded = false;
    },
  },
});
