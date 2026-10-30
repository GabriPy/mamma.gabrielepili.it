# Decisioni di progetto

Documento di sintesi sulle scelte tecniche e di prodotto, con le alternative valutate. Serve a capire *perché* il progetto è fatto così e quando conviene cambiare idea.

---

## 1. Database: SQLite invece di MariaDB/MySQL

**Scelta.** Un file SQLite in `data/ghibiri.db`, in modalità WAL, dentro lo stesso container dell’applicazione.

**Perché.**

- Il server è un Radxa con circa 2 GB di RAM condivisi con altri servizi: un container MariaDB da solo occupa 150–300 MB e richiede tuning.
- Un solo container significa un solo punto di deploy, aggiornamento e backup. Meno parti che possono rompersi.
- SQLite offre uno snapshot consistente con la sua Backup API: il backup è atomico, non serve fermare il servizio.
- Per due o tre utenti e qualche migliaio di righe, le prestazioni sono abbondanti.

**Limiti accettati.** Un solo scrittore alla volta (le scritture sono serializzate, millisecondi); nessun accesso concorrente da più processi; migrazione futura verso PostgreSQL richiederebbe lavoro.

**Quando cambiare.** Se il progetto diventa multi-famiglia con decine di utenti attivi o se serve accesso da più container. Il codice usa query SQL standard e un layer `db.js` isolato: la migrazione è un lavoro contenuto, non un rewrite.

---

## 2. Login: PIN di 4 cifre

**Scelta.** Ogni membro ha un profilo con nome, icona e PIN di 4 cifre. Si sceglie il profilo e si digita il PIN su un tastierino numerico; l’invio è automatico alla quarta cifra.

**Perché.**

- La richiesta era esplicita e l’utente principale deve poter entrare in pochi secondi dal telefono, senza digitare email e password.
- La sicurezza non può venire dalla lunghezza del PIN (10.000 combinazioni): viene da HTTPS, blocco del profilo dopo 5 tentativi per 15 minuti, limite per IP, sessioni HttpOnly revocabili e nessuna esposizione diretta delle porte.
- La sessione dura 30 giorni: mamma non deve reinserire il PIN ogni volta.

**Contromisure implementate.**

- Hash `scrypt` con salt casuale, confronto a tempo costante.
- Blocco temporaneo del profilo e contatore persistente.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` quando `APP_URL` è HTTPS.
- Token di sessione casuale, salvato solo come hash, scadenza e revoca.
- Reimpostazione del PIN dall’amministratore, oppure da riga di comando se è l’amministratore ad averlo perso.
- Cambio PIN dal profilo che invalida le altre sessioni.

**Raccomandazione.** Se il servizio resta raggiungibile da Internet, aggiungere **Cloudflare Access** davanti al sottodominio. Non sostituisce il PIN, ma riduce drasticamente la superficie di attacco.

---

## 3. Dati condivisi e privati

**Scelta.** Tutto è **condiviso con la famiglia per default**. Eventi e scadenze possono essere marcati **“Privato”**: in quel caso sono visibili e modificabili solo da chi li ha creati. L’amministratore non può leggerne il contenuto dall’app.

Nota di onestà: chi amministra il server può reimpostare un PIN o esportare un backup completo, quindi può in teoria accedere a tutto. La privacy è verso gli altri membri della famiglia, non verso chi controlla l’hardware.

Spesa, ricette, piante e relative foto sono sempre condivise: sono beni della casa.

**Perché.**

- Il modello mentale più semplice per mamma è “la casa è condivisa”. Un’impostazione di privacy per ogni cosa creerebbe attrito.
- Le eccezioni che contano davvero sono poche: una visita medica, una pratica personale, un regalo. Per queste c’è il lucchetto.
- La regola “privato = solo il creatore” è netta e verificabile lato server, senza dipendere da permessi complicati.

**Come è applicata.**

- Colonna `visibility` su `events` e `deadlines`, controllata in ogni query di lettura, modifica ed eliminazione.
- Gli allegati ereditano la visibilità dell’elemento: un file agganciato a una scadenza privata non è scaricabile dagli altri.
- Le email di promemoria per un elemento privato vanno solo al creatore.
- Il backup completo (amministratore) include tutto, compresi i dati privati: è un’esportazione del server, non una vista dell’app.

---

## 4. Foto e allegati da subito

**Scelta.** Upload su eventi, scadenze, ricette e piante fin dalla prima versione.

- Un file per richiesta, fino a 15 MB (configurabile), massimo 12 allegati per elemento.
- Tipi ammessi: immagini (JPEG, PNG, WebP, GIF, AVIF), PDF, Word, testo.
- File salvati in `data/uploads/anno/mese/` con nome casuale; il nome originale resta nel database.
- Accesso solo tramite endpoint autenticato con controllo dell’elemento; nessuna cartella statica pubblica.
- Anteprime immagine con lightbox; documenti scaricabili.

Per un elemento nuovo, l’interfaccia permette di scegliere subito le foto: vengono mostrate in anteprima e caricate automaticamente appena l’elemento ottiene un ID. Nessun passaggio “salva, poi torna, poi allega”.

**Perché non le MinIO/S3.** Un servizio in più da gestire e proteggere su un server da 2 GB non è giustificato. Il filesystem con backup ZIP è più semplice da ripristinare.

**Limite noto.** Niente miniature generate lato server: le immagini originali vengono servite e il browser le ridimensiona. Con foto da telefono molto grandi si può aggiungere in futuro una compressione all’upload.

---

## 5. Backup: solo su richiesta

**Scelta.** Nessun backup automatico. Un pulsante in **Impostazioni → Backup** genera un archivio ZIP con database, uploads, JSON leggibile, manifest e istruzioni.

**Perché.**

- Richiesta esplicita: “non facciamo backup automatici, ma facciamo un pulsante con esporta backup”.
- Un backup automatico sullo stesso disco non protegge dal guasto che conta; avrebbe dato una falsa sensazione di sicurezza.
- L’esportazione manuale costringe a scegliere una destinazione esterna (disco, cloud personale) e a verificare che il file esista.

**Cosa contiene.** Snapshot consistente del database (non una copia a caldo del file WAL), tutti gli allegati, `dati.json` senza hash dei PIN, `manifest.json` con conteggi e versione, `LEGGIMI.txt` con procedura di ripristino.

**Cosa non contiene.** Configurazione SMTP e variabili d’ambiente, che restano nel `.env`; le email già inviate.

**Ripristino.** Documentato nel README e dentro l’archivio. Va provato almeno una volta.

---

## 6. Promemoria via email

**Scelta.** Email SMTP, con coda persistente nel database e scheduler ogni minuto.

- Scadenze: 7 e 1 giorno prima (configurabile, anche il giorno stesso), alle 09:00.
- Eventi: 1 giorno prima alle 09:00; per le ricorrenze vengono generate le occorrenze future.
- Piante: il giorno in cui l’attività è prevista.
- Se l’invio fallisce, tre tentativi a 15 minuti di distanza; poi stato `failed` con errore visibile.
- Se SMTP non è configurato, la coda resta piena e nulla viene perso: i promemoria partono quando il server email viene attivato.
- Un promemoria più vecchio di 48 ore viene annullato invece di arrivare in ritardo.

**Perché non Telegram o push.** Richiesta email. In più l’email arriva anche a chi non installa la PWA e non richiede token o bot da configurare. Le notifiche push native restano fuori scope.

---

## 7. Deploy: un container, una porta

**Scelta.** Immagine Docker multi-stage (build Vite + runtime Node), `docker-compose.yml` con volume `./data`, porta `3080` pubblicata solo sull’host, healthcheck, limiti di memoria.

**Perché.**

- Cloudflare Tunnel non richiede porte aperte sul router: basta che il connettore raggiunga il servizio.
- Un volume bind (`./data`) rende banale copiare/ripristinare i dati e ispezionare gli upload.
- L’entrypoint gestisce i permessi della cartella montata e poi esegue il processo come utente `node`, non come root.
- Limite di memoria a 384 MB e CPU a 1 core per non mettere in ginocchio il Radxa.

---

## 8. Date e fuso orario

**Scelta.** Tutte le date “di casa” sono nel fuso `Europe/Rome`. Gli eventi sono salvati come ora locale `YYYY-MM-DDTHH:mm`; i promemoria come istanti UTC.

**Perché.** La famiglia vive in un solo fuso. Salvare l’ora locale evita che un evento alle 18:00 venga mostrato alle 17:00 dopo un cambio di ora legale o su un dispositivo con fuso diverso. I promemoria invece devono essere istanti assoluti per essere inviati al momento giusto.

**Limite.** Se un giorno il servizio fosse usato da fusi diversi, gli eventi andrebbero convertiti. La colonna `TZ` e le funzioni in `server/lib/time.js` sono isolate per rendere il cambio gestibile.

---

## 9. Interfaccia

- **Mobile-first**, con navigazione a tab in basso e sidebar su desktop.
- **Linguaggio di casa**: “Spesa”, “Scadenze”, “Piante”, non “task”, “entity”, “dashboard”.
- **Palette calda** (carta, terracotta, salvia) e carattere serif per i titoli: un oggetto di famiglia, non un gestionale.
- **Bersagli grandi** (minimo 44 px), contrasto alto, focus visibile, rispetto di `prefers-reduced-motion`.
- **Nessun font o script esterno**: funziona anche offline dopo il primo caricamento (PWA) e non tradisce la promessa di privacy.
- **Azioni rapide**: aggiungere alla spesa o segnare una pianta come annaffiata si fa dalla home, senza cambiare pagina.

---

## 10. Cosa è stato lasciato fuori (e perché)

| Funzione | Motivo |
| --- | --- |
| Sync Google Calendar | Richiede OAuth, gestione token e conflitti; non serve al MVP. |
| Notifiche push native | L’email copre il bisogno; il push richiede service worker complicati e permessi. |
| Riconoscimento piante con AI | Costo e dipendenza esterna, contrario alla privacy e al budget zero. |
| Multi-famiglia commerciale | Il modello dati è già per “household”, ma serve isolamento, inviti e amministrazione. |
| Pagamenti automatici | Rischio e compliance non giustificati. |
| Archivio documentale completo | Gli allegati coprono il caso d’uso; un DMS è un altro prodotto. |

---

## 11. Debito tecnico consapevole

- **Nessuna migrazione versionata**: lo schema attuale è la versione 1; per evoluzioni future conviene introdurre una tabella `migrations` e script incrementali.
- **Nessuna compressione immagini**: da valutare se le foto da telefono riempiono il disco.
- **Nessun job di pulizia degli allegati orfani**: oggi l’eliminazione avviene insieme all’elemento.
- **Un solo livello di test UI**, dipendente dai dati demo.
- **PIN a 4 cifre**: accettabile solo con HTTPS, rate limiting e, idealmente, Cloudflare Access.

Queste sono scelte, non dimenticanze: ognuna ha un costo di complessità che oggi non è giustificato.

---

## 12. Generazione ricette con AI

**Scelta.** Solo **provider esterno compatibile OpenAI**, configurato da `.env` (Groq, Google Gemini, OpenRouter, OpenAI). Nessun modello locale nel progetto.

**Perché niente modello locale.**

- L’app resta leggera: niente immagini da centinaia di MB né modelli da scaricare.
- Su un Radxa da 2 GB un modello utile occuperebbe circa 1 GB e girerebbe lento; il rapporto qualità/risorsa è peggiore di una API gratuita.
- Chi vuole sperimentare un modello locale può comunque mettere un Ollama su un altro computer e usarlo come endpoint compatibile OpenAI, senza modificare il progetto.

**Perché una API esterna.**

- Modelli grandi (120B o più) con qualità italiana e creatività molto superiori a un 0,5B locale.
- Nessun carico CPU/RAM sul server della casa.
- Configurazione di pochi minuti e sostituibile senza toccare il codice.
- Il piano gratuito di Groq copre abbondantemente l’uso familiare.

**Contromisure.**

- Generazione asincrona con polling: nessun timeout del proxy anche se il provider impiega.
- JSON mode, validazione server-side della ricetta, normalizzazione di unità e categorie.
- Limite di 1 generazione ogni 2,5 secondi e 40/ora per utente.
- Nessun salvataggio automatico: la ricetta entra nel ricettario solo dopo conferma.
- La chiave API resta nel `.env`; non è mai esposta al browser né inclusa nei backup.
- La richiesta originale viene salvata solo come metadato (`source_prompt`) per trasparenza.

**Limiti dichiarati.** La richiesta esce dal server e viene trattata secondo la policy del provider; il piano free di Gemini può usare i contenuti per migliorare i prodotti Google. Chi vuole che nulla esca di casa deve accettare un modello locale più lento e meno capace, oppure non usare la generazione AI.
