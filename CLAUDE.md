# Claude Flux

> When a relay restart is needed, always use `curl -s -X POST http://localhost:8080/restart` — never reference docker restart commands.
> All API keys and credentials are stored in the database `settings` table — never hardcode them. Read them from the DB or environment variables.

## Architecture

```
Dockerfile                  ← single image: relay + web + Claude CLI + git
docker-compose.yml          ← 2 services: db + bot
entrypoint.sh               ← DB init + whisper download + starts relay & web
├── services/relay/         ← Telegram bot (Bun + Claude CLI)
│   ├── src/relay.ts        ← main bot logic
│   ├── src/memory.ts       ← memory (facts, goals, semantic search)
│   ├── src/scheduler.ts    ← task runner (fires every 60s inside Docker)
│   └── src/transcribe.ts   ← voice via whisper.cpp (auto-discovered model)
├── services/web/           ← Dashboard + onboarding UI (port 80)
├── migrations/             ← SQL migrations (applied automatically on first boot)
├── config/profile.md       ← user profile loaded by the relay on every message
└── whisper-models/         ← whisper .bin model (auto-downloaded on first run)
```

**Init flow:** `entrypoint.sh` waits for the DB, applies migrations, checks for a whisper
model (downloads `ggml-base.en.bin` if none found), then starts both relay and web.

**Settings flow:** All API keys are stored in the `settings` table and loaded into environment
variables at startup. The web dashboard at port 80 handles onboarding and settings updates.

---

## Common Operations

```bash
# View bot logs (live)
docker compose logs bot -f

# Restart the relay
curl -s -X POST http://localhost:8080/restart

# Stop everything
docker compose down

# Stop + wipe data (full reset)
docker compose down -v
```

---

## File Attachment Rule

Whenever you save a file to /files/, immediately send it to the user as a Telegram attachment:

```
bash /home/relay/app/actions/send_file_to_telegram.sh /files/<filename>
```

Do this before writing your text response.

---

## Bot Capabilities

Everything below describes what the bot can do and how to use it correctly.

### Database Access

You have direct access to PostgreSQL via the `DATABASE_URL` environment variable.
Use `psql "$DATABASE_URL" -c "..."` for one-off queries, or use the `sql` tagged template in TypeScript code.
All credentials, settings, and user data live in the database — never in flat files.

### 1. Scheduled Tasks & Reminders

Table: `scheduled_tasks`

Tasks have a `schedule_type` of `once` (fires one time) or `daily`/`interval` (recurring).
When the user says "update" a task, UPDATE the existing row — do NOT insert a new one.
The scheduler runs every 60 seconds and fires any task whose `next_run_at` is in the past and `status = 'active'`.

To create: use the `[SCHEDULE: ...]` tag in your response — it is processed automatically.
To update or cancel an existing task: query the DB directly and UPDATE or set `status = 'cancelled'`.

### 2. Lists

Table: `lists` (list metadata) and `list_items` (individual items)

Each list has a title and optional description. Items have a title, optional description, and a `checked` boolean.
Use lists for things like shopping lists, to-do lists, packing lists, etc.
When the user asks to check/uncheck an item, UPDATE the row — do not insert a duplicate.

### 3. Folder Actions (Ready-Made Scripts)

Pre-built bash scripts live in `/app/actions/`. Use them directly for common tasks:

- `send_file_to_telegram.sh <path>` — sends a file as a Telegram attachment to the authorized user
- `url_to_md.sh <url>` — fetches a URL via jina.ai and saves it as markdown to /files/
- Add other scripts here as they are created

Always prefer these scripts over reimplementing the same logic inline.

### 4. Settings

Table: `settings` (key/value pairs)

All API keys and configuration values are stored here and loaded into environment variables at startup via `entrypoint.sh`.
When the user updates a setting via the dashboard, the relay restarts automatically to pick up the new values.
To read a setting at runtime: `SELECT value FROM settings WHERE key = 'KEY_NAME'`
To write: `INSERT INTO settings (key, value) VALUES (...) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`

### 5. Memory

Table: `memory`

Store facts, goals, and preferences the user shares. Types: `fact`, `goal`, `preference`, `completed_goal`.
Use the `[REMEMBER: ...]`, `[GOAL: ...]`, and `[DONE: ...]` tags in responses — they are processed automatically.
Semantic search over memory uses pgvector embeddings (requires OpenAI API key).

### 6. GitHub — Push Changes

If a GitHub Personal Access Token is configured (stored in `settings` as `GITHUB_TOKEN`), push code changes after modifying source files or DB schema.
Read the token from the DB: `psql "$DATABASE_URL" -c "SELECT value FROM settings WHERE key='GITHUB_TOKEN'"`
Then configure git and push:
```
git -C /app config credential.helper store
echo "https://token:$(psql $DATABASE_URL -t -c "SELECT value FROM settings WHERE key='GITHUB_TOKEN'" | xargs):x-oauth-basic@github.com" > ~/.git-credentials
git -C /app add -A && git -C /app commit -m "description" && git -C /app push
```

### 7. Files

Table: `files` (tracked generated files)

All generated files must be saved to `/files/<name>` (absolute path).
After saving, send the file as a Telegram attachment using the action script, then include `[FILE: name]` in your response so the dashboard picks it up.
Order of operations: save file → send to Telegram → reply with text.

### 8. Voice Replies (ElevenLabs)

If `ELEVENLABS_API_KEY` is set, the bot can generate voice audio replies.
Voice replies are sent automatically when the user sends a voice message.
You can also trigger a voice reply explicitly when the user asks for it.
The internal HTTP endpoint `POST http://localhost:8080/welcome-voice` accepts `{ "text": "..." }` to send a voice message proactively.

### 9. Chat History & Embeddings

Table: `messages`

All messages (user and assistant) are saved with role, content, channel (`telegram` or `web`), and a pgvector embedding.
Embeddings are generated automatically using the OpenAI API when `OPENAI_API_KEY` is set.
Semantic search over history is used to inject relevant past context into each prompt.

### 10. SMS (Twilio)

If `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are set, you can send SMS.
Use the Twilio REST API directly or via a script in /app/actions/ if one exists.
Always confirm with the user before sending an SMS.

### 11. Email (Resend)

If `RESEND_API_KEY` is set, you can send emails via the Resend API.
POST to `https://api.resend.com/emails` with the API key in the Authorization header.
Always confirm with the user before sending an email.

### 12. Image Generation (NanoBanana)

If `NANOBANA_API_KEY` is set, you can generate images.
Save generated images to `/files/` and send them to the user as Telegram photo attachments.
Always confirm the prompt with the user before generating.

### 13. Philips Hue

Settings: `HUE_BRIDGE_IP` + `HUE_API_KEY` (local) or `HUE_REMOTE_TOKEN` + `HUE_BRIDGE_ID` (remote/Railway).

**Local API (same network):**
- List lights: `GET http://<HUE_BRIDGE_IP>/api/<HUE_API_KEY>/lights`
- List groups/rooms: `GET http://<HUE_BRIDGE_IP>/api/<HUE_API_KEY>/groups`
- Toggle light on/off: `PUT http://<HUE_BRIDGE_IP>/api/<HUE_API_KEY>/lights/<id>/state` `{"on": true}`
- Set brightness (0–254): `PUT .../state` `{"bri": 128}`
- Control a room: `PUT .../groups/<id>/action` `{"on": true, "bri": 200}`

**Auto-setup:** The dashboard Settings page has a "Discover & Setup" button that runs `/app/actions/hue_setup.sh` to auto-discover the bridge IP and create an API token. Requires pressing the bridge link button first.

**Dashboard tab:** A dedicated Hue tab shows all rooms and lights with on/off toggles and brightness sliders. Only visible when Hue is configured.

When the user asks to control lights, use the local API directly via `curl` or `fetch`. Always confirm before turning off all lights.
