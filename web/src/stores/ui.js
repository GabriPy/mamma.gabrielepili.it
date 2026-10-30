import { defineStore } from 'pinia';

let toastId = 0;
let confirmResolver = null;

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [],
    confirmState: null,
    searchOpen: false,
    generatorOpen: false,
    generatorSeed: null,
    recipesVersion: 0,
  }),
  actions: {
    toast(message, type = 'success', duration = 3800) {
      const id = ++toastId;
      this.toasts.push({ id, message, type });
      if (duration > 0) {
        setTimeout(() => this.dismissToast(id), duration);
      }
      return id;
    },
    success(message) {
      return this.toast(message, 'success');
    },
    error(message) {
      return this.toast(message, 'error', 5200);
    },
    info(message) {
      return this.toast(message, 'info');
    },
    dismissToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
    confirm({
      title = 'Sei sicuro?',
      message = '',
      confirmLabel = 'Conferma',
      cancelLabel = 'Annulla',
      danger = false,
    } = {}) {
      if (confirmResolver) {
        confirmResolver(false);
        confirmResolver = null;
      }
      this.confirmState = { title, message, confirmLabel, cancelLabel, danger };
      return new Promise((resolve) => {
        confirmResolver = resolve;
      });
    },
    answerConfirm(value) {
      this.confirmState = null;
      if (confirmResolver) {
        confirmResolver(value);
        confirmResolver = null;
      }
    },
    openSearch() {
      this.searchOpen = true;
    },
    closeSearch() {
      this.searchOpen = false;
    },
    openGenerator(seed = null) {
      this.generatorSeed = seed;
      this.generatorOpen = true;
    },
    closeGenerator() {
      this.generatorOpen = false;
      this.generatorSeed = null;
    },
    markRecipesChanged() {
      this.recipesVersion += 1;
    },
  },
});
