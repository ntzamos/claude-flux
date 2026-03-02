#!/bin/bash
set -e

echo "[init] Ensuring /files is writable..."
mkdir -p /files
if [ ! -w /files ]; then
  sudo chown relay:relay /files 2>/dev/null || true
fi

echo "[init] Waiting for database..."
until pg_isready -h db -p 5432 -U postgres >/dev/null 2>&1; do
  sleep 2
done
echo "[init] Database is ready."

echo "[init] Applying migrations..."
APPLIED=0
for f in /home/relay/app/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f" >/dev/null 2>&1 && APPLIED=$((APPLIED + 1)) || true
done
echo "[init] Migrations done ($APPLIED files processed)."

echo "[init] Checking whisper model..."
WHISPER_DIR="/whisper-models"
WHISPER_MODEL="${WHISPER_MODEL_PATH:-}"
if [ -z "$WHISPER_MODEL" ]; then
  WHISPER_MODEL=$(find "$WHISPER_DIR" -name "*.bin" -type f 2>/dev/null | head -1)
fi
if [ -z "$WHISPER_MODEL" ]; then
  echo "[init] No whisper model found — downloading ggml-base.en.bin (~141 MB)..."
  mkdir -p "$WHISPER_DIR"
  if curl -fsSL -o "$WHISPER_DIR/ggml-base.en.bin" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"; then
    echo "[init] Whisper model downloaded."
    WHISPER_MODEL="$WHISPER_DIR/ggml-base.en.bin"
  else
    echo "[init] WARNING: Failed to download whisper model. Voice transcription will be unavailable."
  fi
else
  echo "[init] Whisper model found: $WHISPER_MODEL"
fi

if [ -n "$WHISPER_MODEL" ]; then
  psql "$DATABASE_URL" -c \
    "INSERT INTO settings (key, value, updated_at) VALUES ('WHISPER_MODEL_PATH', '$WHISPER_MODEL', NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();" \
    >/dev/null 2>&1 || true
fi

# Start web dashboard on port 3000 (docker-compose maps this to host port 80)
echo "[init] Starting web dashboard..."
cd /home/relay/app/services/web
PORT=3000 bun run src/server.ts &
WEB_PID=$!

# Start relay
echo "[init] Starting relay..."
cd /home/relay/app/services/relay
bun run src/relay.ts &
RELAY_PID=$!

echo "[init] Both services started (web PID=$WEB_PID, relay PID=$RELAY_PID)."

# Exit container if either process dies so Docker restarts cleanly
wait -n $WEB_PID $RELAY_PID
EXIT_CODE=$?
echo "[init] A process exited (code $EXIT_CODE) — shutting down."
kill $WEB_PID $RELAY_PID 2>/dev/null || true
exit $EXIT_CODE
