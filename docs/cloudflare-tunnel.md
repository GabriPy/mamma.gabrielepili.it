# Cloudflare Tunnel per `mamma.gabrielepili.it`

Obiettivo: raggiungere Ghibiri Home da Internet **senza aprire porte sul router**, con HTTPS gestito da Cloudflare.

Il servizio ascolta sulla porta `3080` dell’host (o sulla `3000` del container, se il tunnel gira nello stesso network Docker).

---

## 1. Prerequisiti

- Dominio `gabrielepili.it` con DNS gestito da Cloudflare (nameserver Cloudflare).
- Account Cloudflare gratuito.
- Il container `ghibiri-home` avviato e `healthy`:

```bash
docker compose ps
```

---

## 2. Creare il tunnel (dashboard)

1. Vai su **Cloudflare Zero Trust → Networks → Tunnels**.
2. **Create a tunnel** → tipo **Cloudflared** → nome `ghibiri-home`.
3. Copia il **token** che aparece nella pagina di installazione (una stringa lunga che inizia con `eyJ...`).
4. Non installare subito il connettore: prima aggiungi il public hostname.

### Public hostname

Nella scheda **Public Hostname** del tunnel:

| Campo | Valore |
| --- | --- |
| Subdomain | `mamma` |
| Domain | `gabrielepili.it` |
| Path | *(vuoto)* |
| Service type | `HTTP` |
| URL | `ghibiri-home:3000` se cloudflared è in Compose, altrimenti `localhost:3080` |

Cloudflare crea automaticamente il record DNS `mamma.gabrielepili.it` (CNAME del tunnel). Non creare un record A: il traffico passa dal tunnel.

---

## 3. Avviare il connettore

### Opzione A — cloudflared dentro Docker Compose (consigliata)

Aggiungi il token al `.env`:

```dotenv
TUNNEL_TOKEN=eyJhIjoi...
APP_URL=https://mamma.gabrielepili.it
COOKIE_SECURE=true
```

Avvia entrambi i servizi:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
docker compose ps
```

Il file `docker-compose.tunnel.yml` avvia `cloudflare/cloudflared` con `tunnel run`, in attesa che `ghibiri-home` sia sano. I due container condividono la rete del progetto: per questo il public hostname usa `http://ghibiri-home:3000`.

### Opzione B — cloudflared sull’host

Se hai già cloudflared installato sul server:

```bash
cloudflared tunnel login
cloudflared tunnel create ghibiri-home
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <UUID-del-tunnel>
credentials-file: /root/.cloudflared/<UUID-del-tunnel>.json

ingress:
  - hostname: mamma.gabrielepili.it
    service: http://localhost:3080
  - service: http_status:404
```

```bash
cloudflared tunnel route dns ghibiri-home mamma.gabrielepili.it
sudo systemctl enable --now cloudflared
```

In questo caso il public hostname nella dashboard non serve (la configurazione è locale), ma puoi gestirlo ugualmente da lì.

---

## 4. Verifica

```bash
curl -I https://mamma.gabrielepili.it/api/health
```

Deve rispondere `200` con `{"status":"ok",...}`.

Poi apri `https://mamma.gabrielepili.it`: dovresti vedere la schermata “Chi sei?”.

Se il browser mostra un errore 502/1033:

- `docker compose ps` → il container è `healthy`?
- il public hostname punta alla porta giusta? (`ghibiri-home:3000` oppure `localhost:3080`)
- i log di cloudflared: `docker compose logs -f cloudflared`
- il container e cloudflared sono nella stessa rete? Se hai avviato solo `docker-compose.tunnel.yml`, avvia anche il servizio principale.

---

## 5. Impostazioni consigliate su Cloudflare

- **SSL/TLS → Overview**: modalità **Full (strict)**. Il certificato di origine è gestito dal tunnel.
- **SSL/TLS → Edge Certificates**: *Always Use HTTPS* attivo; TLS minimo 1.2; HSTS opzionale (l’app lo invia già quando `COOKIE_SECURE=true`).
- **Speed → Brotli**: attivo.
- **Caching**: non mettere in cache `/api/*`; le regole di default di Cloudflare non lo fanno, ma evita Page Rules aggressive.
- **Limite upload**: il piano gratuito Cloudflare accetta richieste fino a 100 MB. Il limite dell’app è 15 MB per file (`MAX_UPLOAD_MB`), quindi sei coperto.

---

## 6. Secondo strato di sicurezza con Cloudflare Access (consigliato)

Un PIN di 4 cifre è comodo ma non è una password. Cloudflare Access aggiunge un’autenticazione (es. codice via email) prima ancora di raggiungere l’app.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Nome: `Ghibiri Home`; dominio: `mamma.gabrielepili.it`.
3. Policy: **Allow**, include → *Emails* → gli indirizzi di Gabriele e mamma.
4. Session duration: 1 mese (o quella che preferisci).

Chi non è nella lista non vede nemmeno la schermata di login. L’app continua a chiedere il PIN: due strati indipendenti.

Nota: Access può interferire con le shortcut PWA e con i link nelle email se la sessione Access è scaduta; è il compromesso per la sicurezza aggiuntiva.

---

## 7. Aggiornamenti e manutenzione

```bash
# aggiorna l'app
git pull
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build

# aggiorna cloudflared
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml pull cloudflared
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
```

Il token del tunnel non scade; se lo revochi dalla dashboard, aggiorna `TUNNEL_TOKEN` e riavvia.

---

## 8. Se cambi dominio o sottodominio

1. Aggiungi il nuovo public hostname al tunnel.
2. Aggiorna `APP_URL` nel `.env` (usato nei link delle email).
3. Se passi da HTTP a HTTPS, imposta `COOKIE_SECURE=true` e riavvia.
4. Le sessioni esistenti restano valide (il cookie è per host): gli utenti del vecchio dominio dovranno rientrare.
