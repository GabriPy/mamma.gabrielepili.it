import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_PIN = process.env.TEST_ADMIN_PIN || '1234';
let cookie = '';
let loginUser = null;
let app = null;
let router = null;
let errors = [];
let warnings = [];

function nodeFetch(input, init = {}) {
  const target = new URL(typeof input === 'string' ? input : input.url, BASE);
  const headers = {};
  if (init.headers) {
    if (typeof init.headers.forEach === 'function') init.headers.forEach((value, key) => (headers[key] = value));
    else Object.assign(headers, init.headers);
  }
  if (cookie) headers.Cookie = cookie;
  const body = init.body && typeof init.body !== 'string' ? init.body : init.body;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method: init.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve(
            new Response(new Uint8Array(Buffer.concat(chunks)), {
              status: res.statusCode,
              headers: res.headers,
            }),
          );
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function apiJson(path) {
  return nodeFetch(path).then((res) => res.json());
}

function login() {
  const body = JSON.stringify({ userId: 1, pin: ADMIN_PIN });
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE}/api/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error('Server non disponibile: avvia `node server/index.js` prima dei test.'));
            return;
          }
          cookie = String((res.headers['set-cookie'] || [])[0] || '').split(';')[0];
          resolve(JSON.parse(raw).user);
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

async function settle(ms = 500) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Ghibiri Home — smoke test dell’interfaccia', () => {
  beforeAll(async () => {
    loginUser = await login();
    globalThis.fetch = nodeFetch;

    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args) => {
      errors.push(args.map(String).join(' '));
      originalError(...args);
    };
    console.warn = (...args) => {
      const text = args.map(String).join(' ');
      if (text.includes('[Vue warn]')) warnings.push(text);
      originalWarn(...args);
    };

    const { createApp } = await import('vue');
    const { createPinia, setActivePinia } = await import('pinia');
    const { useAuthStore } = await import('./stores/auth.js');
    const routerModule = await import('./router.js');
    router = routerModule.default;
    const App = (await import('./App.vue')).default;

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = loginUser;
    auth.ready = true;
    auth.profiles = [loginUser];

    document.body.innerHTML = '<div id="app"></div>';
    app = createApp(App);
    app.use(pinia);
    app.use(router);
    await router.push('/');
    await router.isReady();
    app.mount('#app');
    await settle(900);
  }, 30000);

  afterAll(async () => {
    app?.unmount();
    await settle(50);
  });

  const routes = [
    ['/', 'Oggi'],
    ['/spesa', 'Lista della spesa'],
    ['/calendario', 'Calendario'],
    ['/scadenze', 'Scadenze'],
    ['/ricette', 'Ricettario'],
    ['/piante', 'Le piante'],
    ['/impostazioni', 'Impostazioni'],
    ['/profilo', 'Profilo'],
  ];

  for (const [path, expected] of routes) {
    it(`renderizza ${path}`, async () => {
      await router.push(path);
      await settle(650);
      expect(router.currentRoute.value.path, `redirect inatteso da ${path}`).toBe(path);
      const text = document.body.textContent || '';
      expect(text.length, `pagina ${path} vuota`).toBeGreaterThan(400);
      expect(text).toContain(expected);
      const fatal = errors.filter(
        (e) => !e.includes('Not implemented') && !e.includes('Failed to fetch') && !e.includes('NetworkError'),
      );
      expect(fatal, `errori console su ${path}: ${fatal.join(' | ')}`).toEqual([]);
    }, 20000);
  }

  it('renderizza il dettaglio di una ricetta', async () => {
    const list = await apiJson('/api/recipes');
    const recipe = list.recipes[0];
    await router.push(`/ricette/${recipe.id}`);
    await settle(700);
    expect(document.body.textContent).toContain(recipe.title);
  }, 20000);

  it('renderizza il dettaglio di una pianta', async () => {
    const list = await apiJson('/api/plants');
    const plant = list.plants[0];
    await router.push(`/piante/${plant.id}`);
    await settle(700);
    expect(document.body.textContent).toContain(plant.name);
  }, 20000);

  it('apre il generatore di ricette AI (se configurato)', async () => {
    const { useMetaStore } = await import('./stores/meta.js');
    const { useUiStore } = await import('./stores/ui.js');
    const meta = useMetaStore();
    if (!meta.aiEnabled) return;
    const ui = useUiStore();
    ui.openGenerator();
    await settle(350);
    expect(document.body.textContent).toContain('Cosa hai in casa');
    expect(document.body.textContent).toContain('Allergie o ingredienti da evitare');
    ui.closeGenerator();
    await settle(150);
  });

  it('genera e salva una ricetta dalla modale AI', async () => {
    const { useMetaStore } = await import('./stores/meta.js');
    const { useUiStore } = await import('./stores/ui.js');
    const { api } = await import('./api.js');
    const meta = useMetaStore();
    if (!meta.aiEnabled) return;
    const ui = useUiStore();

    ui.openGenerator();
    await settle(400);
    const textarea = document.querySelector('#ai-prompt');
    expect(textarea).toBeTruthy();
    textarea.value = 'Ho delle zucchine e della pasta, qualcosa di veloce';
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle(100);

    const generate = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Genera');
    expect(generate, 'pulsante Genera non trovato').toBeTruthy();
    generate.click();
    await settle(2800);
    expect(document.body.textContent).toContain('Aggiungi al ricettario');

    const save = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Aggiungi al ricettario'));
    expect(save).toBeTruthy();
    save.click();
    await settle(1400);
    expect(document.body.textContent).toContain('Ricetta salvata');
    ui.closeGenerator();
    await settle(200);

    // Pulizia: rimuove le ricette create da questo test.
    const list = await api('/api/recipes');
    for (const recipe of list.recipes.filter((item) => item.source === 'ai' && item.title === 'Pasta alle zucchine')) {
      await api(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
    }
  });

  it('non produce warning Vue', () => {
    const relevant = warnings.filter((w) => !w.includes('Failed to resolve component'));
    expect(relevant, relevant.join('\n')).toEqual([]);
  });
});
