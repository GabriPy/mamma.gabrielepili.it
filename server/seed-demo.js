import { fileURLToPath } from 'node:url';
import { db, getSetting, nowIso, setSetting } from './db.js';
import { addDays, todayLocal } from './lib/time.js';
import { syncDeadlineReminders, syncEventReminders, syncPlantTaskReminders } from './reminders.js';

/**
 * Popola la casa con contenuti di esempio. Utile per provare l'interfaccia.
 * Non sovrascrive mai dati esistenti: agisce solo su una casa vuota.
 */
export function seedDemo() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  if (existing > 0 || getSetting('demo_seeded') === 'true') {
    console.log('[demo] contenuti già presenti, nessuna modifica.');
    return;
  }
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const member = db.prepare("SELECT * FROM users WHERE role = 'member' ORDER BY id LIMIT 1").get();
  const author = admin?.id || null;
  const other = member?.id || author;
  const now = nowIso();
  const today = todayLocal();

  const list = db.prepare('SELECT * FROM shopping_lists ORDER BY is_default DESC LIMIT 1').get();
  if (list) {
    const items = [
      ['Pomodori ciliegini', '500', 'g', 'Freschi', 0],
      ['Pane integrale', '1', '', 'Freschi', 0],
      ['Latte', '2', 'L', 'Frigo', 0],
      ['Ricotta', '250', 'g', 'Frigo', 0],
      ['Pasta corta', '2', 'pz', 'Dispensa', 0],
      ['Olio extravergine', '1', 'bt', 'Dispensa', 0],
      ['Carta igienica', '6', 'rotoli', 'Casa', 0],
      ['Detersivo piatti', '', '', 'Casa', 1],
    ];
    const insert = db.prepare(
      `INSERT INTO shopping_items (list_id, name, quantity, unit, category, done, done_at, sort_order, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach(([name, quantity, unit, category, done], index) => {
      insert.run(list.id, name, quantity, unit, category, done, done ? now : null, index, author, now);
    });
  }

  const eventInsert = db.prepare(
    `INSERT INTO events (title, description, starts_at, ends_at, all_day, location, category, recurrence, recurrence_until, visibility, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL, 'shared', ?, ?, ?)`,
  );
  const events = [
    ['Cena da nonna', 'Portare il dolce.', `${today}T19:30`, `${today}T22:00`, 'Casa della nonna', 'Famiglia', 'none'],
    ['Dentista', 'Controllo di routine.', `${addDays(today, 1)}T10:00`, `${addDays(today, 1)}T10:45`, 'Studio Dott.ssa Rossi', 'Salute', 'none'],
    ['Pulizie di casa', 'Bagni, cucina e pavimenti.', `${addDays(today, 3)}T09:00`, `${addDays(today, 3)}T11:00`, '', 'Casa', 'none'],
    ['Compleanno di Luca', 'Torta e candeline.', `${addDays(today, 9)}T12:30`, `${addDays(today, 9)}T15:00`, 'Casa', 'Famiglia', 'none'],
  ];
  for (const event of events) {
    const info = eventInsert.run(...event, author, now, now);
    syncEventReminders(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid));
  }
  const weekly = db
    .prepare(
      `INSERT INTO events (title, description, starts_at, ends_at, all_day, location, category, recurrence, recurrence_until, visibility, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, '', 'Casa', 'weekly', NULL, 'shared', ?, ?, ?)`,
    )
    .run(
      'Mercato del sabato',
      'Frutta e verdura di stagione.',
      `${addDays(today, 5)}T08:30`,
      `${addDays(today, 5)}T09:30`,
      author,
      now,
      now,
    );
  syncEventReminders(db.prepare('SELECT * FROM events WHERE id = ?').get(weekly.lastInsertRowid));

  const deadlineInsert = db.prepare(
    `INSERT INTO deadlines (title, due_date, category, notes, status, recurrence, visibility, amount, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, 'shared', ?, ?, ?, ?)`,
  );
  const deadlines = [
    ['Bolletta ENEL', addDays(today, 2), 'Bollette', 'Luce e gas, seconda casa inclusa.', 'monthly', 68.4],
    ['Rinnovo assicurazione auto', addDays(today, 5), 'Veicoli', 'Polizza annuale, targa GG123BB.', 'yearly', 410],
    ['Documenti condominio', addDays(today, 12), 'Documenti', 'Ritirare le attestazioni in amministrazione.', 'none', null],
    ['Bollo auto', addDays(today, -2), 'Veicoli', 'Pagamento online sul portale ACI.', 'none', 186.5],
  ];
  for (const [title, due, category, notes, recurrence, amount] of deadlines) {
    const info = deadlineInsert.run(title, due, category, notes, recurrence, amount, author, now, now);
    syncDeadlineReminders(db.prepare('SELECT * FROM deadlines WHERE id = ?').get(info.lastInsertRowid));
  }

  const recipeInsert = db.prepare(
    `INSERT INTO recipes (title, description, servings, prep_minutes, category, notes, favorite, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ingredientInsert = db.prepare(
    'INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, position) VALUES (?, ?, ?, ?, ?)',
  );
  const recipes = [
    {
      title: 'Pasta al pomodoro',
      description: 'Il conforto della domenica, pronto in venti minuti.',
      servings: 4,
      prep: 20,
      category: 'Primi',
      favorite: 1,
      notes: '1. Soffriggere aglio e olio.\n2. Aggiungere i pomodori e cuocere 15 minuti.\n3. Scolare la pasta, mantecare con basilico e parmigiano.',
      ingredients: [
        ['Pasta corta', '400', 'g'],
        ['Pomodori pelati', '800', 'g'],
        ['Aglio', '2', 'spicchi'],
        ['Basilico', 'q.b.', ''],
        ['Parmigiano', '60', 'g'],
      ],
    },
    {
      title: 'Parmigiana di melanzane',
      description: 'La ricetta della domenica, con qualche strato in più.',
      servings: 6,
      prep: 90,
      category: 'Secondi',
      favorite: 0,
      notes: '1. Grigliare le melanzane.\n2. Alternare sugo, melanzane, mozzarella e parmigiano.\n3. Cuocere in forno a 180 °C per 35 minuti.',
      ingredients: [
        ['Melanzane', '1', 'kg'],
        ['Passata di pomodoro', '700', 'g'],
        ['Mozzarella', '500', 'g'],
        ['Parmigiano', '100', 'g'],
      ],
    },
    {
      title: 'Torta di mele',
      description: 'Soffice, profumata, perfetta per la merenda.',
      servings: 8,
      prep: 60,
      category: 'Dolci',
      favorite: 0,
      notes: '1. Montare uova e zucchero.\n2. Unire farina, latte e lievito.\n3. Aggiungere le mele a fettine e infornare a 175 °C per 40 minuti.',
      ingredients: [
        ['Mele', '3', 'pz'],
        ['Farina 00', '250', 'g'],
        ['Zucchero', '180', 'g'],
        ['Uova', '3', 'pz'],
        ['Latte', '120', 'ml'],
        ['Lievito', '1', 'bustina'],
      ],
    },
    {
      title: 'Insalata di ceci',
      description: 'Fresca, veloce, da portare anche in ufficio.',
      servings: 2,
      prep: 15,
      category: 'Contorni',
      favorite: 0,
      notes: 'Sciacquare i ceci, unire pomodorini, cipolla rossa, prezzemolo, olio e limone. Riposare 10 minuti prima di servire.',
      ingredients: [
        ['Ceci lessati', '400', 'g'],
        ['Pomodorini', '200', 'g'],
        ['Cipolla rossa', '1', 'pz'],
        ['Limone', '1', 'pz'],
        ['Prezzemolo', 'q.b.', ''],
      ],
    },
  ];
  for (const recipe of recipes) {
    const info = recipeInsert.run(
      recipe.title,
      recipe.description,
      recipe.servings,
      recipe.prep,
      recipe.category,
      recipe.notes,
      recipe.favorite,
      author,
      now,
      now,
    );
    recipe.ingredients.forEach((ing, index) => ingredientInsert.run(info.lastInsertRowid, ...ing, index));
  }

  const plantInsert = db.prepare(
    'INSERT INTO plants (name, species, location, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const taskInsert = db.prepare(
    'INSERT INTO plant_tasks (plant_id, type, interval_days, next_due_date, last_done_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const logInsert = db.prepare(
    'INSERT INTO plant_logs (plant_id, task_id, type, done_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const plants = [
    {
      name: 'Monstera',
      species: 'Monstera deliciosa',
      location: 'Soggiorno, vicino alla finestra',
      notes: 'Ruotare il vaso ogni tanto. Teme il freddo.',
      tasks: [
        ['acqua', 10, addDays(today, 2), 7],
        ['concime', 30, addDays(today, 18), 30],
      ],
    },
    {
      name: 'Basilico',
      species: 'Ocimum basilicum',
      location: 'Cucina, davanzale',
      notes: 'Bagnare spesso, non lasciare fiori.',
      tasks: [['acqua', 3, today, 3]],
    },
    {
      name: 'Rosmarino',
      species: 'Salvia rosmarinus',
      location: 'Balcone',
      notes: 'Poca acqua, tanto sole.',
      tasks: [['acqua', 14, addDays(today, -1), 14]],
    },
    {
      name: 'Pothos',
      species: 'Epipremnum aureum',
      location: 'Ingresso',
      notes: '',
      tasks: [['acqua', 7, addDays(today, 4), 7]],
    },
  ];
  for (const plant of plants) {
    const info = plantInsert.run(plant.name, plant.species, plant.location, plant.notes, other, now, now);
    for (const [type, interval, next, lastDays] of plant.tasks) {
      const lastDone = lastDays ? new Date(Date.now() - lastDays * 86400000).toISOString() : null;
      const task = taskInsert.run(info.lastInsertRowid, type, interval, next, lastDone, null, now);
      syncPlantTaskReminders(task.lastInsertRowid);
      if (lastDone) logInsert.run(info.lastInsertRowid, task.lastInsertRowid, type, lastDone, null, other);
    }
  }

  console.log('[demo] casa popolata con contenuti di esempio.');
  setSetting('demo_seeded', 'true');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) seedDemo();
