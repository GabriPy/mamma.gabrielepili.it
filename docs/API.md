# API

Tutte le API sono sotto `/api`. Le risposte sono JSON (tranne file e backup). L’autenticazione usa un cookie di sessione `HttpOnly`; non ci sono token Bearer.

Formato errore:

```json
{ "error": "Messaggio leggibile", "code": "validation", "details": [] }
```

| Codice | Significato |
| --- | --- |
| 400 | Dati non validi |
| 401 | Sessione assente o scaduta |
| 403 | Permesso negato o origine non consentita |
| 404 | Elemento inesistente (o non visibile) |
| 409 | Conflitto (es. nome già usato) |
| 413 / 415 | File troppo grande / tipo non supportato |
| 429 | Troppi tentativi |

---

## Autenticazione

| Metodo | Percorso | Accesso | Note |
| --- | --- | --- | --- |
| GET | `/api/auth/profiles` | pubblico | Profili attivi (id, nome, ruolo, colore, icona). Nessun PIN. |
| POST | `/api/auth/login` | pubblico | `{ userId, pin }`; imposta il cookie di sessione. Blocco dopo 5 errori. |
| POST | `/api/auth/logout` | sessione | Revoca la sessione corrente. |
| GET | `/api/auth/me` | sessione | Utente corrente. |
| PATCH | `/api/auth/me` | sessione | `{ name, email, color, emoji }`. |
| POST | `/api/auth/me/pin` | sessione | `{ currentPin, newPin }`; chiude le altre sessioni. |
| POST | `/api/auth/me/check-pin` | sessione | Verifica il PIN corrente. |

## Famiglia (solo amministratore)

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/users` | Elenco membri con email e ultimo accesso. |
| POST | `/api/users` | `{ name, email, pin, role, color, emoji }`. |
| PATCH | `/api/users/:id` | Campi parziali; `pin` reimposta e chiude le sessioni. |
| DELETE | `/api/users/:id` | Non si può eliminare l’ultimo amministratore né se stessi. |

## Oggi e ricerca

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/dashboard?date=YYYY-MM-DD` | Eventi di oggi e della settimana, scadenze aperte, spesa, piante, conteggi. |
| GET | `/api/search?q=testo` | Ricerca trasversale (min. 2 caratteri), rispetta la privacy. |

## Eventi

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/events?from=YYYY-MM-DD&to=YYYY-MM-DD` | Espande le ricorrenze; max 400 giorni. |
| GET | `/api/events/:id` | Dettaglio con allegati. |
| POST | `/api/events` | `{ title, startsAt, endsAt?, allDay?, location?, category?, recurrence?, recurrenceUntil?, visibility? }` |
| PATCH | `/api/events/:id` | Campi parziali. |
| DELETE | `/api/events/:id` | Elimina tutta la serie, i promemoria e gli allegati. |

`startsAt` è ora locale `YYYY-MM-DDTHH:mm` (fuso `Europe/Rome`). Ricorrenze: `none`, `daily`, `weekly`, `monthly`, `yearly`.

## Scadenze

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/deadlines?filter=open\|done\|overdue\|all` | Include `daysLeft` calcolato dal server. |
| POST | `/api/deadlines` | `{ title, dueDate, category?, notes?, recurrence?, visibility?, amount? }` |
| PATCH | `/api/deadlines/:id` | Campi parziali, anche `status`. |
| POST | `/api/deadlines/:id/complete` | `{ done: true }`; se ricorrente avanza la data e resta aperta. |
| DELETE | `/api/deadlines/:id` | Elimina anche promemoria e allegati. |

## Spesa

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/shopping/lists` | Liste con conteggi. |
| POST | `/api/shopping/lists` | `{ name, emoji? }`. |
| PATCH | `/api/shopping/lists/:id` | Rinomina / cambia icona. |
| DELETE | `/api/shopping/lists/:id` | Non elimina l’ultima lista. |
| GET | `/api/shopping/lists/:id/items` | Prodotti ordinati per reparto. |
| POST | `/api/shopping/lists/:id/items` | `{ name, quantity?, unit?, category?, note? }`; unisce i duplicati pendenti. |
| PATCH | `/api/shopping/items/:id` | Anche `{ done: true }`. |
| DELETE | `/api/shopping/items/:id` | |
| POST | `/api/shopping/lists/:id/clear-done` | Elimina i prodotti già presi. |

## Ricette

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/recipes` | Con conteggio ingredienti e prima foto. |
| GET | `/api/recipes/:id` | Ingredienti completi e allegati. |
| POST | `/api/recipes` | `{ title, category?, servings?, prepMinutes?, description?, notes?, ingredients[] }` |
| PATCH | `/api/recipes/:id` | Se `ingredients` è presente, sostituisce l’elenco. |
| DELETE | `/api/recipes/:id` | |
| POST | `/api/recipes/:id/favorite` | Inverte il preferito. |
| POST | `/api/recipes/:id/to-shopping` | `{ listId? }`; salta gli ingredienti già presenti. |

## Piante

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/plants` | Schede con prossima attività e conteggio in scadenza. |
| GET | `/api/plants/:id` | Attività e ultime 40 cure. |
| POST | `/api/plants` | `{ name, species?, location?, notes?, tasks:[{ type, intervalDays, nextDueDate? }] }` |
| PATCH | `/api/plants/:id` | |
| DELETE | `/api/plants/:id` | Elimina attività, diario e allegati. |
| POST | `/api/plants/:id/tasks` | `{ type, intervalDays, nextDueDate?, notes? }` |
| PATCH | `/api/plants/tasks/:taskId` | |
| DELETE | `/api/plants/tasks/:taskId` | |
| POST | `/api/plants/:id/tasks/:taskId/done` | `{ doneAt?, note? }`; aggiorna prossima data e diario. |

Tipi attività: `acqua`, `concime`, `potatura`, `rinvaso`, `controllo`.

## Allegati

| Metodo | Percorso | Note |
| --- | --- | --- |
| POST | `/api/attachments` | `multipart/form-data`: `file`, `entityType` (`event\|deadline\|recipe\|plant`), `entityId`. |
| GET | `/api/attachments/:id/file?download=1` | Richiede sessione e accesso all’elemento. `Cache-Control: private`. |
| DELETE | `/api/attachments/:id` | Solo chi ha caricato il file o un amministratore. |
| GET | `/api/attachments/meta` | Limiti correnti. |

Tipi ammessi: immagini, PDF, `text/plain`, Word (`.doc`, `.docx`). Limite `MAX_UPLOAD_MB` (default 15), massimo `MAX_ATTACHMENTS` per elemento (default 12).

## Impostazioni e promemoria

| Metodo | Percorso | Accesso | Note |
| --- | --- | --- | --- |
| GET | `/api/settings/public` | sessione | Nome casa, orari, limiti (per l’interfaccia). |
| GET | `/api/settings` | admin | Impostazioni, stato SMTP, spazio, coda promemoria, ultimo backup. |
| PATCH | `/api/settings` | admin | `household_name`, `reminder_hour`, `reminder_email_enabled`, `deadline_offsets`, `event_offset_days`, `plant_reminders`. Rigenera la coda. |
| POST | `/api/settings/test-email` | admin | `{ to? }`; richiede SMTP configurato. |
| POST | `/api/settings/run-reminders` | admin | Forza il controllo della coda. |
| POST | `/api/settings/resync-reminders` | admin | Rigenera tutti i promemoria. |

## Backup

| Metodo | Percorso | Accesso | Note |
| --- | --- | --- | --- |
| GET | `/api/backup/export` | admin | ZIP con database, uploads, `dati.json`, manifest e istruzioni. |
| GET | `/api/backup/export/json` | admin | Solo dati, senza hash dei PIN. |
| GET | `/api/backup/info` | admin | Spazio occupato e data dell’ultimo export. |

## Sistema

| Metodo | Percorso | Note |
| --- | --- | --- |
| GET | `/api/health` | Pubblico. Stato applicazione, database, email, uptime. |
