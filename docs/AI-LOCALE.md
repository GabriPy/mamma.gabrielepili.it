# Modello AI locale per le ricette

Ghibiri Home può generare ricette in due modi:

1. **Modello locale** (consigliato se vuoi zero quote e zero dati in uscita): un container separato con [llama.cpp](https://github.com/ggml-org/llama.cpp) e **Qwen2.5 0.5B Instruct** quantizzato Q4_K_M.
2. **Provider esterno** compatibile OpenAI: OpenAI, OpenRouter, Groq, oppure un Ollama su un altro computer della casa.

L’app resta la stessa: cambia solo `AI_BASE_URL` e `AI_MODEL`.

---

## Perché un container separato

Mettere il modello dentro l’immagine dell’app significherebbe:

- un’immagine molto più grande (il solo modello pesa ~400 MB);
- due processi nello stesso container, senza limiti di memoria separati;
- rischio che un’inferenza pesante faccia riavviare anche l’app.

Con un container dedicato l’app resta leggera (limite 384 MB) e il modello ha il suo limite (1 GB). Se il modello è lento o si blocca, la casa continua a funzionare.

---

## Requisiti

| Risorsa | Minimo | Note |
| --- | --- | --- |
| RAM libera | ~900 MB | Il container AI è limitato a 1 GB; l’app usa ~100–150 MB. |
| CPU | 2 core | Con 4 core puoi alzare `LOCAL_AI_THREADS`. |
| Disco | ~800 MB | Immagine llama.cpp + modello. |
| Architettura | amd64 o arm64 | L’immagine llama.cpp è multi-arch. |
| Internet | solo alla prima build | Il modello viene scaricato durante `docker compose build`. |

Su un Radxa da 2 GB, con altri servizi attivi, 0,5B è la scelta sicura. Un modello 1,5B richiede più memoria e rischia lo swap.

---

## Avvio

Dalla cartella del progetto:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-ai.yml up -d --build
```

La prima build scarica il modello da Hugging Face (circa 400 MB) e crea l’immagine. Le volte successive usa la cache.

Controlla i log mentre il modello si carica:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-ai.yml logs -f local-ai
```

Quando vedi il server in ascolto su `0.0.0.0:8080`, apri **Ricette → Genera con AI**.

Non serve modificare il `.env`: il file `docker-compose.local-ai.yml` imposta automaticamente per l’app:

```dotenv
AI_BASE_URL=http://local-ai:8080/v1
AI_MODEL=ghibiri-local
AI_TIMEOUT_MS=180000
AI_MAX_TOKENS=1200
AI_JSON_MODE=schema
```

`AI_JSON_MODE=schema` fa usare a llama.cpp la decodifica vincolata allo schema JSON: il modello è costretto a produrre una ricetta con i campi giusti, il che aiuta molto un modello piccolo.

La generazione è **asincrona**: l’app avvia un lavoro sul server e ne controlla lo stato, quindi un’attesa di 60–90 secondi non fa scattare il timeout di 100 secondi di Cloudflare.

---

## Come funziona nell’interfaccia

- **Genera con AI** nel ricettario: scrivi cosa hai in casa, porzioni, tempo massimo, categoria, eventuale dieta vegetariana e ingredienti da evitare.
- Viene mostrata un’**anteprima**: ingredienti, procedimento, consiglio.
- Puoi:
  - **Aggiungere al ricettario** (la ricetta viene salvata come le altre, con badge AI);
  - **Generare un’altra** con la stessa richiesta;
  - **Generare una simile** partendo dalla bozza appena creata;
  - **Cambiare richiesta** senza perdere l’anteprima.
- Dal dettaglio di una ricetta esistente trovi **Genera una simile**: usa quella ricetta come punto di partenza.

Ogni ricetta salvata ricorda di essere stata generata (`source: ai`) e conserva la richiesta originale (`source_prompt`), visibile nel database ma non usata per altro.

---

## Qualità e limiti

Un modello da 0,5 miliardi di parametri è **piccolo**. Sa scrivere ricette semplici in italiano, ma:

- può essere ripetitivo o poco creativo;
- può sbagliare quantità o tempi di cottura;
- ogni tanto produce una risposta incompleta (in quel caso l’app mostra un errore e puoi rigenerare).

**Controlla sempre cottura, allergeni e ingredienti.** L’app lo ricorda sotto ogni ricetta generata.

Tempi indicativi su un Radxa con 2–4 core: **20–60 secondi** per ricetta, a seconda del modello e dei thread. La prima generazione è più lenta perché il modello viene caricato in memoria.

Se vuoi più qualità:

- usa un provider esterno (OpenAI, Groq, OpenRouter) o un Ollama su un PC più potente;
- oppure passa a **Qwen2.5 1.5B Instruct** (vedi sotto), accettando più RAM e latenza.

---

## Cambiare modello locale

Il modello deve essere un file **GGUF** compatibile con llama.cpp. Puoi usare un altro modello cambiando `LOCAL_AI_MODEL_URL` nel `.env` e ricostruendo:

```dotenv
LOCAL_AI_MODEL_URL=https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

Poi:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-ai.yml build --no-cache local-ai
docker compose -f docker-compose.yml -f docker-compose.local-ai.yml up -d
```

Per un 1,5B alza il limite memoria in `docker-compose.local-ai.yml`:

```yaml
mem_limit: 1600m
```

e valuta `LOCAL_AI_THREADS=4` se hai core liberi. Su 2 GB totali è al limite: monitora con `docker stats`.

L’alias del modello resta `ghibiri-local`, quindi l’app non va riconfigurata.

---

## Tornare a un provider esterno

Avvia senza il file di override:

```bash
docker compose up -d
```

e imposta nel `.env`:

```dotenv
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-...
AI_JSON_MODE=object
AI_TIMEOUT_MS=45000
```

Poi riavvia: `docker compose up -d`.

Esempi:

| Provider | `AI_BASE_URL` | Modello di esempio |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama su LAN | `http://192.168.1.10:11434/v1` | `qwen2.5:1.5b` |

La chiave resta nel `.env`, non viene mai inviata al browser e non viene inclusa nei backup.

---

## Privacy

Con il modello locale:

- la richiesta e la ricetta **non escono dal server**;
- non servono account, chiavi o quote;
- la prima build scarica il modello da Hugging Face, poi funziona offline;
- il container non pubblica porte: è raggiungibile solo dalla rete Docker.

Con un provider esterno, il testo della richiesta viene inviato a quel provider. Non inserire dati personali sensibili.

---

## Licenze e attribuzioni

- **llama.cpp** — MIT, <https://github.com/ggml-org/llama.cpp>.
- **Qwen2.5 0.5B Instruct GGUF** — Apache 2.0, © Alibaba Cloud, <https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF>.

I modelli citati appartengono ai rispettivi autori. Se cambi modello, verifica la licenza.

---

## Problemi comuni

| Sintomo | Cosa controllare |
| --- | --- |
| `502` alla prima generazione | Il modello è ancora in caricamento: guarda `logs -f local-ai` e riprova tra 10–30 secondi. |
| Generazione lentissima | Riduci `LOCAL_AI_THREADS` se la CPU è satura, o aumenta se hai core liberi. Con 0,5B su ARM è normale impiegare decine di secondi. |
| Container AI riavviato / OOM | Abbassa `--ctx-size` (da 4096 a 3072), usa un modello più piccolo o alza `mem_limit` se il server ha più RAM. |
| `Endpoint AI non trovato` | `AI_BASE_URL` deve terminare con `/v1` (locale: `http://local-ai:8080/v1`). |
| `Generazione non configurata` | Manca `AI_BASE_URL` o `AI_MODEL`: avvia con il file `docker-compose.local-ai.yml` oppure compila il `.env`. |
| Il modello risponde in inglese | I modelli piccoli a volte deragliano: rigenera, oppure passa a un modello più grande/provider esterno. |
| Build fallita per download | Serve Internet la prima volta; riprova o scarica il GGUF manualmente e cambia `LOCAL_AI_MODEL_URL` con un percorso/URL raggiungibile. |
