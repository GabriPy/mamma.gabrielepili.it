# Cloudflare Tunnel per `mamma.gabrielepili.it`

Obiettivo: raggiungere Ghibiri Home da Internet **senza aprire porte sul router**, con HTTPS gestito da Cloudflare.

Il tunnel si configura dalla **dashboard Cloudflare**, ma il connettore `cloudflared` deve girare sul server. In questo progetto **non c’è un container cloudflared**: l’app pubblica solo la porta `3080` e il connettore la raggiunge su `http://localhost:3080`.

---

## 1. Prerequisiti

- Dominio `gabrielepili.it` con DNS gestito da Cloudflare (nameserver Cloudflare).
- Account Cloudflare gratuito.
- App avviata e sana:

```bash
cd /percorso/ghibiri-home
docker compose ps
curl -fsS http://localhost:3080/api/health
```

---

## 2. Creare il tunnel dalla dashboard

1. Vai su **Cloudflare Zero Trust → Networks → Tunnels**.
2. **Create a tunnel** → tipo **Cloudflared** → nome `ghibiri-home`.
3. Copia il **token** (stringa lunga che inizia con `eyJ...`).

### Public hostname

Nella scheda **Public Hostname** del tunnel:

| Campo | Valore |
| --- | --- |
| Subdomain | `mamma` |
| Domain | `gabrielepili.it` |
| Path | *(vuoto)* |
| Service type | `HTTP` |
| URL | `localhost:3080` |

Cloudflare crea automaticamente il record DNS `mamma.gabrielepili.it` (CNAME del tunnel). Non creare un record A.

---

## 3. Installare il connettore sul server

Scegli **una** delle due strade. In entrambi i casi il connettore deve poter raggiungere `localhost:3080`.

### Opzione A — servizio di sistema (consigliata)

Installa cloudflared sul server (se non c’è già) e registra il servizio con il token:

```bash
sudo cloudflared service install <TOKEN>
sudo systemctl status cloudflared
```

Cloudflare fornisce il comando esatto nella pagina di creazione del tunnel. Il servizio parte al boot e si aggiorna con il pacchetto.

### Opzione B — container separato con rete host

```bash
docker run -d --name ghibiri-tunnel --restart unless-stopped \
  --network host cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token <TOKEN>
```

Con `--network host` il connettore vede `localhost:3080` esattamente come l’host. Su Linux è la soluzione più semplice; non pubblicare altre porte.

> Se non usi `--network host`, il public hostname deve puntare a un indirizzo raggiungibile dal container del tunnel, non a `localhost`. Evita configurazioni ibride: il servizio di sistema è più prevedibile.

---

## 4. Configurare l’app

Nel `.env`:

```dotenv
APP_URL=https://mamma.gabrielepili.it
COOKIE_SECURE=
```

`COOKIE_SECURE` vuoto lascia che il cookie diventi `Secure` automaticamente quando la richiesta arriva in HTTPS. Poi:

```bash
docker compose up -d
```

Non c’è nessun `TUNNEL_TOKEN` da mettere nel `.env` dell’app: il token serve solo al connettore.

---

## 5. Verifica

Dalla dashboard il tunnel deve risultare **Healthy**. Poi:

```bash
curl -I https://mamma.gabrielepili.it/api/health
```

Deve rispondere `200` con `{"status":"ok",...}`. Apri `https://mamma.gabrielepili.it`: vedi la schermata “Chi sei?”.

Se il sito non risponde:

- `docker compose ps` → il container app è `healthy`?
- `curl http://localhost:3080/api/health` → risponde in locale?
- `sudo systemctl status cloudflared` oppure `docker logs ghibiri-tunnel` → il connettore è connesso?
- il public hostname punta a `localhost:3080`?

---

## 6. Cloudflare Access (consigliato)

Un PIN di 4 cifre è comodo, non è una password forte. Cloudflare Access aggiunge un secondo strato prima ancora di raggiungere l’app.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Nome: `Ghibiri Home`; dominio: `mamma.gabrielepili.it`.
3. Policy **Allow** con gli indirizzi email della famiglia.
4. Session duration: 1 mese (o quella che preferisci).

Chi non è nella lista non vede nemmeno il login. L’app continua a chiedere il PIN.

---

## 7. Aggiornamenti

L’app:

```bash
cd /percorso/ghibiri-home
git pull
docker compose up -d --build
```

Il connettore:

```bash
# servizio di sistema
sudo apt update && sudo apt install --only-upgrade cloudflared

# oppure container
docker pull cloudflare/cloudflared:latest
docker rm -f ghibiri-tunnel
docker run -d --name ghibiri-tunnel --restart unless-stopped \
  --network host cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token <TOKEN>
```

Il tunnel e il DNS restano configurati anche mentre l’app è spenta; in quel caso il sito risponde `502` finché non riavvii `ghibiri-home`.

---

## 8. Se cambi dominio o sottodominio

1. Aggiungi il nuovo public hostname al tunnel.
2. Aggiorna `APP_URL` nel `.env`.
3. Riavvia l’app.
4. Le sessioni esistenti restano valide sul vecchio host; gli utenti del nuovo dominio dovranno rientrare.
