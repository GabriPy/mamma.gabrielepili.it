# syntax=docker/dockerfile:1.7

# Immagine AI locale opzionale: llama.cpp + Qwen2.5 0.5B Instruct (Q4_K_M).
# Il modello viene scaricato una volta durante la build (~400 MB) e resta
# nell'immagine: dopo la build funziona anche senza Internet.

FROM alpine:3.21 AS model

ARG MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"

RUN apk add --no-cache curl ca-certificates \
    && mkdir -p /models \
    && curl -fL --retry 5 --retry-delay 3 --retry-all-errors "$MODEL_URL" -o /models/model.gguf \
    && test -s /models/model.gguf

FROM ghcr.io/ggml-org/llama.cpp:server

LABEL org.opencontainers.image.title="Ghibiri Local AI"
LABEL org.opencontainers.image.description="llama.cpp server con Qwen2.5 0.5B Instruct per le ricette di Ghibiri Home"

COPY --from=model /models/model.gguf /models/model.gguf

EXPOSE 8080

# I parametri di avvio sono in docker-compose.local-ai.yml
