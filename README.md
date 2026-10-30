# Ghibiri Home

**La casa di famiglia, organizzata.** Calendario, spesa, scadenze, ricette e piante in un posto solo, privato e pensato per il telefono.

Servizio web self-hosted per **mamma.gabrielepili.it**, dockerizzato, con login a PIN e promemoria via email. Pensato per stare su un piccolo server (Radxa, 2 GB di RAM) dietro Cloudflare Tunnel.

---

## Cosa c’è dentro

| Area | Cosa puoi fare |
| --- | --- |
| **Oggi** | Riepilogo della giornata: appuntamenti, scadenze vicine, spesa e piante da curare. Aggiunta rapida alla spesa. |
| **Spesa** | Più liste (casa, festa, mare), reparti, quantità, spunta, pulizia dei completati. Un prodotto già presente non viene duplicato. |
| **Calendario** | Vista mensile, eventi con ora/luogo/categoria, ricorrenze (giorno, settimana, mese, anno), promemoria email. |
| **Scadenze** | Bollette, documenti, veicoli, casa. Importo, note, ricorrenza mensile/annuale, “fatto” con avanzamento automatico. |
| **Ricette** | Ingredienti, porzioni, tempo, procedimento a step, foto, preferiti, **“aggiungi ingredienti alla spesa”** e **generazione con AI** tramite provider compatibile OpenAI. |
| **Piante** | Schede con foto, attività ricorrenti (acqua, concime, potatura, rinvaso, controllo), diario delle cure. |
| **Foto e allegati** | Immagini, PDF e documenti Word su eventi, scadenze, ricette e piante, protetti da login. |
| **Famiglia** | Profili separati con PIN di 4 cifre, ruoli amministratore/famiglia, dati condivisi o privati. |
| **Promemoria** | Email per scadenze (7 e 1 giorno prima), eventi (1 giorno prima) e piante (il giorno stesso), con coda persistente. |
| **Backup** | Pulsante “Esporta backup”: archivio ZIP con database, foto/allegati, dati leggibili e istruzioni di ripristino. |

Interfaccia interamente in italiano, mobile-first, installabile come PWA (Android/iOS) e utilizzabile anche da desktop.

---

## Le decisioni prese

Le richieste erano: sottodominio `mamma.gabrielepili.it`, Docker con una porta esposta, login a PIN, promemoria email, dati condivisi/privati a mia scelta, backup manuale, foto e allegati da subito.

| Tema | Decisione | Perché |
| --- | --- | --- |
| Database | **SQLite** (file singolo, WAL) invece di MariaDB | Un solo container, ~40 MB di RAM, nessun servizio da amministrare su 2 GB. Il backup è uno snapshot atomico. Per una famiglia il limite di un solo scrittore è irrilevante. |
| Login | PIN di 4 cifre per profilo | Mamma non deve ricordare username o password. La sicurezza viene da HTTPS, blocco dopo 5 tentativi, sessioni HttpOnly e rate limiting. |
| Dati condivisi | **Condivisi di default**, con opzione “Privato” su eventi e scadenze | La casa è di tutti; ciò che è personale resta solo di chi lo crea. L’amministratore non li vede nell’app, anche se controlla il server. |
| Foto/allegati | Disponibili da subito su tutti i moduli | Caricamento immediato per gli elementi esistenti; per un elemento nuovo i file vengono selezionati e caricati subito dopo il salvataggio. |
| Backup | **Solo manuale**, con pulsante di esportazione | Come richiesto: niente job automatici. L’archivio contiene tutto e le istruzioni per ripristinare. |
| Promemoria | Email SMTP configurabile | Se SMTP non è configurato, i promemoria restano in coda e partono appena il server email viene attivato. |
| Deploy | Un container, porta `3080`, volume `./data` | Cloudflare Tunnel è configurato dalla dashboard e il connettore `cloudflared` gira fuori da questo progetto, puntando a `http://localhost:3080`. |

Dettagli e alternative scartate: [`docs/DECISIONI.md`](docs/DECISIONI.md).

---

## Avvio rapido con Docker

Requisiti: Docker e Docker Compose, circa 200 MB di RAM libera e 1 GB di disco.

```bash
# 1. Configurazione
cp .env.example .env
#    modifica almeno APP_URL, ADMIN_PIN, ADMIN_EMAIL, MAMMA_PIN, MAMMA_EMAIL

# 2. Cartella dati (resta sul disco del server)
mkdir -p data

# 3. Avvio
docker compose up -d --build

# 4. Primo accesso
docker compose logs -f ghibiri-home
```

Apri `http://IP-DEL-SERVER:3080`.

> **Primo accesso e HTTPS.** Il file di esempio usa `APP_URL=http://localhost:3080` e lascia `COOKIE_SECURE` vuoto: così puoi entrare subito in HTTP sulla rete locale. Quando il tunnel è attivo, aggiorna `APP_URL=https://mamma.gabrielepili.it` e riavvia: il cookie diventa `Secure` automaticamente (anche in base allo schema della richiesta). Se metti l’URL HTTPS prima di avere il tunnel, il login in HTTP non riesce a salvare la sessione.

- Se in `.env` hai impostato `ADMIN_PIN` e `MAMMA_PIN`, i due profili esistono già.
- Se hai lasciato i PIN vuoti, il container ne genera uno casuale e lo stampa **una sola volta** nei log (`PIN ADMIN GENERATO…`). Prendilo e cambialo dal Profilo.
- I PIN vengono letti **solo al primo avvio**, quando il database è vuoto: modificarli in `.env` dopo non li cambia. Usa l’interfaccia o `reset-pin`.

Poi, da **Impostazioni → Famiglia**, aggiungi gli altri membri con nome, email, PIN e ruolo.

---

## Email e promemoria

Compila nel `.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=la-tua-email@gmail.com
SMTP_PASS=password-per-le-app
MAIL_FROM="Ghibiri Home <la-tua-email@gmail.com>"
```

Poi riavvia: `docker compose up -d`.

| Provider | Host | Porta | Note |
| --- | --- | --- | --- |
| Gmail | `smtp.gmail.com` | 587 | Serve una [password per le app](https://myaccount.google.com/apppasswords), non la password normale. |
| Brevo | `smtp-relay.brevo.com` | 587 | Piano gratuito generoso; utile se Gmail blocca l’invio. |
| Fastmail | `smtp.fastmail.com` | 465 | `SMTP_SECURE=true`. |

Verifica da **Impostazioni → Email e promemoria → Invia email di prova**.

La coda mostra i prossimi invii. Se cambi orari o giorni di preavviso, i promemoria vengono rigenerati automaticamente. Se SMTP non è configurato la coda resta ferma e nessuna email viene persa.

Orari e fuso: tutte le date sono intese in **Europe/Rome**; l’ora dei promemoria è configurabile (default `09:00`).

---

## Generare ricette con l’AI

Nel ricettario trovi **Genera con AI**: scrivi cosa hai in casa, l’app prepara un’anteprima con ingredienti e procedimento. Puoi aggiungerla al ricettario, generarne un’altra o generare una **simile** (anche partendo da una ricetta esistente). Le ricette salvate portano il badge AI e restano normali ricette, con foto e “aggiungi alla spesa”.

La generazione usa un **provider esterno compatibile OpenAI**. Non c’è un modello locale nel progetto: l’app resta leggera e non scarica modelli.

### Configurazione consigliata: Groq

Groq è gratuito, veloce e con circa 1.000 richieste al giorno:

```dotenv
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
AI_API_KEY=gsk_...
```

### Alternativa: Google Gemini

Qualità italiana migliore. Il piano free può usare i contenuti per migliorare i prodotti Google:

```dotenv
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.8-flash
AI_API_KEY=...
```

Funziona anche con OpenRouter o OpenAI. La chiave resta nel `.env`, non viene inviata al browser e non finisce nei backup. Con un provider esterno la richiesta esce dal server.

Se l’AI non è configurata, il pulsante “Genera con AI” resta nascosto e in **Impostazioni → Ricette AI** trovi stato, verifica connessione e istruzioni.

---

## Cloudflare Tunnel per `mamma.gabrielepili.it`

Il tunnel si configura dalla **dashboard Cloudflare** e il connettore `cloudflared` è **fuori da questo progetto**. Va installato sull’host o in un container separato: la dashboard da sola non crea la connessione.

Nel `.env` dell’app:

```dotenv
APP_URL=https://mamma.gabrielepili.it
COOKIE_SECURE=
```

Il cookie diventa `Secure` automaticamente quando la richiesta arriva in HTTPS.

Poi, nella dashboard del tunnel, aggiungi un *public hostname*:

- **Subdomain**: `mamma`
- **Domain**: `gabrielepili.it`
- **Service**: `http://localhost:3080`

Il connettore può girare come servizio sull’host:

```bash
sudo cloudflared service install <TOKEN>
```

oppure in un container separato, con rete host:

```bash
docker run -d --name ghibiri-tunnel --restart unless-stopped \
  --network host cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token <TOKEN>
```

Non serve aprire porte sul router. Guida completa: [`docs/cloudflare-tunnel.md`](docs/cloudflare-tunnel.md).

---

## Backup e ripristino

**Impostazioni → Backup → Esporta backup (.zip)**. Il file contiene:

```
database/ghibiri.db     snapshot consistente (SQLite backup API)
uploads/                tutte le foto e gli allegati
dati.json               copia leggibile delle tabelle (senza hash dei PIN)
manifest.json           conteggi, versione, data
LEGGIMI.txt             istruzioni di ripristino
```

Nessun backup automatico, come richiesto. **Scarica l’archivio e mettilo su un disco o cloud diverso dal server**: un backup sullo stesso disco non protegge da guasti o furti.

Ripristino sull’host Docker:

```bash
docker compose down
mv data data.vecchia
mkdir -p data
unzip ghibiri-home-backup-XXXX.zip -d /tmp/ghibiri-restore
cp /tmp/ghibiri-restore/database/ghibiri.db data/ghibiri.db
cp -R /tmp/ghibiri-restore/uploads data/uploads
docker compose up -d
```

L’entrypoint del container sistema i permessi della cartella `/data` automaticamente. Poi accedi e verifica scadenze, spesa e almeno una foto.

**Prova il ripristino ogni tanto**: un backup non è affidabile finché non lo hai ripristinato almeno una volta.

### Cancellare tutto

Non esiste un pulsante “cancella tutto” per evitare errori irreversibili. La procedura è volutamente manuale:

```bash
docker compose down
rm -rf data        # ATTENZIONE: cancella database, foto e allegati
mkdir -p data
docker compose up -d
```

Prima di `rm -rf data`, esporta un backup se i dati potrebbero servire ancora.

---

## Famiglia, privacy e sicurezza

- **PIN**: salvato con `scrypt` e salt casuale; mai in chiaro, mai nei log.
- **Sessioni**: token casuale in cookie `HttpOnly`, `SameSite=Lax`, `Secure` quando la richiesta arriva in HTTPS o `APP_URL` è HTTPS, scadenza 30 giorni, revocabili.
- **Tentativi**: blocco del profilo per 15 minuti dopo 5 PIN errati + limite per IP.
- **Privato**: la visibilità è verificata lato server su ogni richiesta; un evento o una scadenza privata non è visibile agli altri profili, nemmeno all’amministratore nell’app. Chi ha accesso fisico al server può comunque reimpostare un PIN o leggere un backup: la privacy vale verso gli altri membri, non verso chi amministra l’hardware.
- **Allegati**: serviti solo a sessione valida e con controllo sull’elemento a cui appartengono.
- **Rete**: helmet, CSP, controllo dell’origine sulle richieste che modificano dati, rate limiting.
- **Nessun servizio esterno**: niente analytics, niente font o CDN remoti, nessun dato che esce dal server (tranne le email che configuri).

Consiglio: attiva **Cloudflare Access** sul sottodominio se vuoi un secondo strato prima ancora del PIN. Un PIN di 4 cifre è comodo, non è una password forte: da solo non va esposto senza HTTPS e limiti di tentativi.

I backup contengono dati personali e hash dei PIN: trattali come dati sensibili.

### Se qualcuno dimentica il PIN

Dall’interfaccia: **Impostazioni → Famiglia → Modifica → Nuovo PIN**.

Se è l’amministratore ad averlo dimenticato:

```bash
docker compose exec ghibiri-home node server/reset-pin.js Gabriele
```

Il comando genera un PIN casuale (o usa quello passato come secondo argomento), sblocca il profilo e chiude le sessioni.

---

## Comandi utili

```bash
docker compose logs -f --tail=100          # log
docker compose restart                     # riavvio
docker compose down                        # stop (i dati restano in ./data)
docker compose up -d --build               # aggiornamento dopo modifiche
docker compose exec ghibiri-home sh        # shell nel container
docker compose exec ghibiri-home node server/reset-pin.js Mamma
docker compose ps                          # stato e healthcheck
```

Aggiornamento tipico:

```bash
git pull
docker compose up -d --build
```

---

## Sviluppo locale

```bash
npm install
cp .env.example .env      # per lo sviluppo: APP_URL=http://localhost:3000, COOKIE_SECURE=false
npm run dev               # API su http://localhost:3000
npm run dev:web           # Vite su http://localhost:5173 con proxy /api
```

Per popolare la casa con dati di esempio: `SEED_DEMO=true` nel `.env` al primo avvio (solo su database vuoto).

Test:

```bash
npm run test:api          # test end-to-end delle API (server già avviato)
npm run test:ui           # rendering delle pagine (Vitest + happy-dom, server avviato)
```

I test UI presuppongono i dati demo e il PIN `1234`; servono come verifica locale, non come suite di produzione. Si possono adattare con `TEST_ADMIN_PIN`, `TEST_MAMMA_PIN` e `TEST_BASE_URL`.

---

## Struttura del progetto

```
.
├── server/                 API Express + SQLite
│   ├── index.js            bootstrap, scheduler, arresto pulito
│   ├── app.js              middleware, sicurezza, SPA
│   ├── db.js               schema, hash PIN, impostazioni
│   ├── auth.js             sessioni, ruoli, lockout
│   ├── reminders.js        coda promemoria e scheduler
│   ├── mailer.js           SMTP e template email
│   ├── uploads.js          file, MIME, pulizia
│   ├── ai.js               provider AI compatibile OpenAI
│   └── routes/             auth, users, events, deadlines, shopping,
│                           recipes, plants, attachments, dashboard,
│                           search, settings, backup, ai
├── web/                    Vue 3 + Vite + Pinia
│   └── src/
│       ├── components/     AppShell, modali, uploader, PIN pad, generatore AI…
│       ├── views/          Oggi, Spesa, Calendario, Scadenze,
│       │                   Ricette, Piante, Impostazioni, Profilo
│       ├── stores/         auth, impostazioni, UI
│       └── assets/         design system
├── docker/entrypoint.sh    permessi /data e drop a utente node
├── docker-compose.yml      servizio principale
├── Dockerfile              build frontend + runtime
├── data/                   database e uploads (volume, non committare)
└── docs/                   decisioni, API, tunnel
```

> Cloudflare Tunnel e il connettore `cloudflared` sono volutamente fuori dal progetto: si configurano dalla dashboard e girano sull’host o in un container separato.

---

## API

Documentazione sintetica degli endpoint: [`docs/API.md`](docs/API.md).

---

## Cosa non c’è (per scelta)

Fuori da questa prima versione: sincronizzazione bidirezionale con Google Calendar, notifiche push native, riconoscimento piante con AI, multi-famiglia commerciale, pagamenti automatici, archivio documentale completo.

Sono tutte aggiunte possibili senza rifare le fondamenta: il modello dati e le API sono già separati per entità.

---

## Problemi comuni

| Sintomo | Cosa controllare |
| --- | --- |
| Il browser non apre il sito | `docker compose ps` deve dire `healthy`; la porta è `${APP_PORT}` (default 3080). |
| Errore 502 dal tunnel | Il public hostname deve puntare a `http://localhost:3080` e il connettore `cloudflared` deve essere attivo sull’host (o in un container separato). |
| Le email non arrivano | SMTP compilato? “Invia email di prova” dà errore? Controlla log, spam, `MAIL_FROM` autorizzato dal provider. |
| “Troppi tentativi” | Attendi 15 minuti oppure reimposta il PIN con `reset-pin.js`. |
| Upload rifiutato | Limite `MAX_UPLOAD_MB` (15 MB) e tipi ammessi: immagini, PDF, Word, testo. |
| Date sbagliate di un’ora | Il container deve avere `TZ=Europe/Rome` (già impostato in Compose). |
| Permessi su `data/` | Riavvia: l’entrypoint assegna la cartella all’utente `node`. |
| Lo spazio si esaurisce | Controlla `du -sh data/*`; esporta un backup e rimuovi allegati vecchi. |

---

Buona casa. 🏡
