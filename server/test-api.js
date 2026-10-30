import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_PIN = process.env.TEST_ADMIN_PIN || '1234';
const MAMMA_PIN = process.env.TEST_MAMMA_PIN || '1111';
const stamp = Date.now();
let cookie = '';

async function call(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  let data = null;
  if (type.includes('application/json')) data = await res.json();
  return { res, data, status: res.status, type };
}

async function login(userId, pin) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, pin }),
  });
  assert.equal(res.status, 200, `login ${userId}`);
  const setCookie = res.headers.getSetCookie()[0];
  cookie = setCookie.split(';')[0];
  const data = await res.json();
  return data.user;
}

const results = [];
async function waitForAiJob(jobId, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const state = await call(`/api/ai/recipes/jobs/${jobId}`);
    if (state.status !== 200) throw new Error(`job ${jobId}: HTTP ${state.status}`);
    if (state.data.status === 'done') return state.data.result;
    if (state.data.status === 'error') throw new Error(state.data.error?.message || 'job error');
  }
  throw new Error('job timeout');
}

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.error(`✗ ${name}: ${err.message}`);
  }
}

async function main() {
  await step('health', async () => {
    const { status, data } = await call('/api/health');
    assert.equal(status, 200);
    assert.equal(data.database, 'ok');
  });

  await step('profili e login admin', async () => {
    const profiles = await call('/api/auth/profiles');
    assert.ok(profiles.data.profiles.length >= 2);
    const user = await login(1, ADMIN_PIN);
    assert.equal(user.role, 'admin');
  });

  await step('dashboard', async () => {
    const { status, data } = await call('/api/dashboard');
    assert.equal(status, 200);
    assert.ok(data.counts.recipes >= 1);
    assert.ok(data.today);
  });

  await step('evento ricorrente e espansione', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const created = await call('/api/events', {
      method: 'POST',
      body: {
        title: `Test ricorrenza ${stamp}`,
        startsAt: `${today}T18:30`,
        endsAt: `${today}T19:30`,
        recurrence: 'weekly',
        category: 'Casa',
      },
    });
    assert.equal(created.status, 201);
    const id = created.data.event.id;
    const rangeEnd = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
    const list = await call(`/api/events?from=${today}&to=${rangeEnd}`);
    const occurrences = list.data.events.filter((e) => e.id === id);
    assert.ok(occurrences.length >= 3, `occorrenze: ${occurrences.length}`);
    const updated = await call(`/api/events/${id}`, { method: 'PATCH', body: { title: `Test ricorrenza mod ${stamp}` } });
    assert.equal(updated.status, 200);
    const removed = await call(`/api/events/${id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
  });

  await step('scadenza ricorrente', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const created = await call('/api/deadlines', {
      method: 'POST',
      body: { title: `Test bolletta ${stamp}`, dueDate: today, category: 'Bollette', recurrence: 'monthly', amount: 12.5 },
    });
    assert.equal(created.status, 201);
    const id = created.data.deadline.id;
    const done = await call(`/api/deadlines/${id}/complete`, { method: 'POST', body: { done: true } });
    assert.equal(done.status, 200);
    assert.equal(done.data.repeated, true);
    assert.notEqual(done.data.deadline.dueDate, today);
    assert.equal(done.data.deadline.status, 'open');
    await call(`/api/deadlines/${id}`, { method: 'DELETE' });
  });

  await step('lista spesa: aggiunta, unione, spunta', async () => {
    const lists = await call('/api/shopping/lists');
    const listId = lists.data.lists[0].id;
    const name = `Test pomodori ${stamp}`;
    const first = await call(`/api/shopping/lists/${listId}/items`, { method: 'POST', body: { name, quantity: '1', unit: 'kg' } });
    assert.equal(first.status, 201);
    assert.equal(first.data.merged, false);
    const second = await call(`/api/shopping/lists/${listId}/items`, { method: 'POST', body: { name, quantity: '2', unit: 'kg' } });
    assert.equal(second.data.merged, true);
    const itemId = first.data.item.id;
    const toggled = await call(`/api/shopping/items/${itemId}`, { method: 'PATCH', body: { done: true } });
    assert.equal(toggled.data.item.done, true);
    await call(`/api/shopping/items/${itemId}`, { method: 'DELETE' });
  });

  await step('ricetta: creazione, ingredienti, spesa', async () => {
    const title = `Test torta ${stamp}`;
    const created = await call('/api/recipes', {
      method: 'POST',
      body: {
        title,
        category: 'Dolci',
        servings: 4,
        prepMinutes: 30,
        ingredients: [
          { name: `Farina test ${stamp}`, quantity: '200', unit: 'g' },
          { name: `Mele test ${stamp}`, quantity: '2', unit: 'pz' },
        ],
      },
    });
    assert.equal(created.status, 201);
    const id = created.data.recipe.id;
    const detail = await call(`/api/recipes/${id}`);
    assert.equal(detail.data.recipe.ingredients.length, 2);
    const shop = await call(`/api/recipes/${id}/to-shopping`, { method: 'POST', body: {} });
    assert.equal(shop.status, 200);
    assert.equal(shop.data.added.length, 2);
    const fav = await call(`/api/recipes/${id}/favorite`, { method: 'POST' });
    assert.equal(fav.data.favorite, true);

    const lists = await call('/api/shopping/lists');
    const items = await call(`/api/shopping/lists/${lists.data.lists[0].id}/items`);
    for (const item of items.data.items.filter((i) => i.name.includes(`test ${stamp}`))) {
      await call(`/api/shopping/items/${item.id}`, { method: 'DELETE' });
    }
    await call(`/api/recipes/${id}`, { method: 'DELETE' });
  });

  await step('ricetta generata con AI (se configurata)', async () => {
    const status = await call('/api/ai/status');
    if (!status.data?.ai?.configured) {
      console.log('  (AI non configurata: salto la generazione)');
      return;
    }
    const generated = await call('/api/ai/recipes/generate', {
      method: 'POST',
      body: { prompt: 'Ho zucchine e pasta, qualcosa di veloce', servings: 2, maxMinutes: 30 },
    });
    assert.equal(generated.status, 202, JSON.stringify(generated.data));
    assert.ok(generated.data.jobId);
    const generatedResult = await waitForAiJob(generated.data.jobId);
    assert.ok(generatedResult.recipe.title);
    assert.ok(generatedResult.recipe.ingredients.length >= 3);
    assert.ok(generatedResult.recipe.steps.length >= 2);

    const saved = await call('/api/recipes', {
      method: 'POST',
      body: {
        title: generatedResult.recipe.title,
        description: generatedResult.recipe.description,
        category: generatedResult.recipe.category,
        servings: generatedResult.recipe.servings,
        prepMinutes: generatedResult.recipe.prepMinutes,
        notes: generatedResult.recipe.steps.map((stepText, index) => `${index + 1}. ${stepText}`).join('\n'),
        ingredients: generatedResult.recipe.ingredients,
        source: 'ai',
        sourcePrompt: 'test automatico',
      },
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.data.recipe.source, 'ai');

    await new Promise((resolve) => setTimeout(resolve, 2600));
    const similar = await call('/api/ai/recipes/generate', {
      method: 'POST',
      body: { mode: 'similar', seed: generatedResult.recipe, servings: 2 },
    });
    assert.equal(similar.status, 202, JSON.stringify(similar.data));
    const similarResult = await waitForAiJob(similar.data.jobId);
    assert.ok(similarResult.recipe.title);

    await call(`/api/recipes/${saved.data.recipe.id}`, { method: 'DELETE' });
  });

  await step('pianta: creazione, cura, diario', async () => {
    const created = await call('/api/plants', {
      method: 'POST',
      body: {
        name: `Test felce ${stamp}`,
        species: 'Nephrolepis',
        location: 'Bagno',
        tasks: [{ type: 'acqua', intervalDays: 3 }],
      },
    });
    assert.equal(created.status, 201);
    const plant = created.data.plant;
    assert.equal(plant.tasks.length, 1);
    const task = plant.tasks[0];
    const done = await call(`/api/plants/${plant.id}/tasks/${task.id}/done`, {
      method: 'POST',
      body: { note: 'Terreno asciutto' },
    });
    assert.equal(done.status, 200);
    assert.notEqual(done.data.task.nextDueDate, task.nextDueDate);
    const detail = await call(`/api/plants/${plant.id}`);
    assert.ok(detail.data.logs.length >= 1);
    await call(`/api/plants/${plant.id}`, { method: 'DELETE' });
  });

  await step('allegati: upload, lettura, eliminazione', async () => {
    const created = await call('/api/events', {
      method: 'POST',
      body: { title: `Test allegato ${stamp}`, startsAt: `${new Date().toISOString().slice(0, 10)}T12:00` },
    });
    const eventId = created.data.event.id;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2y9WQAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
    form.append('entityType', 'event');
    form.append('entityId', String(eventId));
    const uploaded = await call('/api/attachments', { method: 'POST', form });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
    const attachment = uploaded.data.attachment;
    const file = await fetch(`${BASE}${attachment.url}`, { headers: { Cookie: cookie } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    const removed = await call(`/api/attachments/${attachment.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    await call(`/api/events/${eventId}`, { method: 'DELETE' });
  });

  await step('privacy: dati privati invisibili all’altro profilo', async () => {
    await login(2, MAMMA_PIN);
    const created = await call('/api/deadlines', {
      method: 'POST',
      body: { title: `Test privata ${stamp}`, dueDate: new Date().toISOString().slice(0, 10), visibility: 'private' },
    });
    assert.equal(created.status, 201);
    const privateId = created.data.deadline.id;

    await login(1, ADMIN_PIN);
    const adminList = await call('/api/deadlines?filter=all');
    assert.ok(!adminList.data.deadlines.some((d) => d.id === privateId), 'l’admin non deve vedere la scadenza privata');
    const forbidden = await call(`/api/deadlines/${privateId}`, { method: 'PATCH', body: { title: 'hack' } });
    assert.equal(forbidden.status, 403);

    await login(2, MAMMA_PIN);
    const own = await call('/api/deadlines?filter=all');
    assert.ok(own.data.deadlines.some((d) => d.id === privateId));
    await call(`/api/deadlines/${privateId}`, { method: 'DELETE' });
  });

  await step('ricerca globale', async () => {
    await login(1, ADMIN_PIN);
    const { data } = await call('/api/search?q=pasta');
    assert.ok(data.results.some((r) => r.type === 'recipe'));
  });

  await step('impostazioni e coda promemoria', async () => {
    const before = await call('/api/settings');
    assert.equal(before.status, 200);
    const patched = await call('/api/settings', { method: 'PATCH', body: { household_name: 'Casa Ghibiri' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.data.settings.household_name, 'Casa Ghibiri');
    const test = await call('/api/settings/test-email', { method: 'POST', body: {} });
    const health = await call('/api/health');
    if (health.data.email === 'not_configured') {
      assert.equal(test.status, 400, 'senza SMTP deve rispondere 400');
    }
    const reminders = await call('/api/settings');
    assert.ok(reminders.data.reminders.length >= 1, 'la coda promemoria deve avere elementi');
  });

  await step('utenti: creazione, modifica, eliminazione', async () => {
    const created = await call('/api/users', {
      method: 'POST',
      body: { name: `Test utente ${stamp}`, pin: '4682', role: 'member', email: 'test@example.com' },
    });
    assert.equal(created.status, 201);
    const id = created.data.user.id;
    const patched = await call(`/api/users/${id}`, { method: 'PATCH', body: { role: 'admin', pin: '1357' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.data.user.role, 'admin');
    const removed = await call(`/api/users/${id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
  });

  await step('backup zip', async () => {
    const res = await fetch(`${BASE}/api/backup/export`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /zip/);
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    assert.ok(buffer.length > 2000, `dimensione ${buffer.length}`);
    fs.writeFileSync('.test-backup.zip', buffer);
    const json = await call('/api/backup/export/json');
    assert.equal(json.status, 200);
    assert.ok(json.data.tables.users.length >= 2);
  });

  await step('logout', async () => {
    const out = await call('/api/auth/logout', { method: 'POST' });
    assert.equal(out.status, 200);
    const me = await call('/api/auth/me');
    assert.equal(me.status, 401);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} test superati`);
  if (failed.length) {
    console.log(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
