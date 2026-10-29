#!/bin/sh
# Prepara la cartella dati (anche se montata da host) e lascia il processo
# al utente non privilegiato "node".
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/tmp"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec gosu node "$@"
fi

exec "$@"
