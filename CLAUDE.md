# Claude Flux — Setup Guide

> Claude Code reads this file automatically. Walk the user through setup one phase at a time.
> Ask for what you need, do everything yourself, confirm each step works before moving on.
> When a relay restart is needed, always use `curl -s -X POST http://localhost:8080/restart` — never reference docker restart commands.

## How This Works

This project runs a personal AI assistant on Telegram, powered by Claude Code CLI.
Everything runs locally via Docker — no cloud account needed except for API keys.

**Stack:** 2 Docker services. PostgreSQL (with pgvector) handles the database.
One `bot` service runs both the Telegram relay and the web dashboard.

The user cloned this repo. Your job: get them from zero to a working bot, one phase at a time.
Do not dump all phases at once. Start with Phase 1, confirm it works, move on.

---

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

**Settings flow:** The web UI at port 80 checks if required keys are in the database.
If not, it shows the onboarding wizard. Once configured, it shows the dashboard.

---

## Phase 1: Start the Stack (~3 min)

**What you do:**

1. Check Docker is installed: `docker --version`
   - If missing: tell them to install Docker Desktop from docker.com
2. Copy the env file: `cp .env.example .env`
3. Open `.env` — set `POSTGRES_PASSWORD` to any strong password
4. Build and start: `docker compose up -d --build`
5. Wait ~30 seconds. The relay will auto-download the whisper model (~141 MB) on first run.
6. Open http://localhost

**Done when:** Browser shows the onboarding wizard at http://localhost.

---

## Phase 2: Onboarding Wizard (~5 min)

The web UI at http://localhost walks the user through setup.
Each step saves to the database — no `.env` editing needed after the initial copy.

### Step 1: Telegram

**What to tell them:**

1. Open Telegram, search for **@BotFather**, send `/newbot`
2. Pick a display name and a username ending in "bot"
3. Copy the token BotFather gives them
4. Get their user ID by messaging **@userinfobot**

### Step 2: AI

**What to tell them:**

1. Go to console.anthropic.com, create an API key
2. Enter it in the form

### Step 3: Voice (optional)

whisper.cpp is already compiled into the bot image. The model is auto-downloaded.
No API key needed. They can skip this step entirely.

### Step 4: Personalize (optional)

Their name and timezone. Makes the bot more personal. Skippable.

**Done when:** They click Finish and the dashboard loads.

---

## Phase 3: Verify the Bot (~2 min)

**What you do:**

1. Check the bot logs: `docker compose logs bot --tail=20`
   - Should see: `[init] Whisper model downloaded.` or `[init] Whisper model found`
   - Should see: `Bot is running!`
2. Tell them to open Telegram and send a message to their bot
3. Wait for it to reply

**Troubleshooting:**

- Bot not responding → check `docker compose logs bot` for errors
- "TELEGRAM_BOT_TOKEN not set" → settings weren't saved; go back to http://localhost
- Claude CLI auth error → set `ANTHROPIC_API_KEY` in Settings → AI
- DB errors → check `docker compose logs db`

**Done when:** User confirms the bot replied on Telegram.

---

## Phase 4: Personalize (~3 min)

**Ask the user:**

- What they do for work (one sentence)
- Any time constraints (e.g., "I pick up my kid at 3pm on weekdays")
- How they like to be communicated with (brief/detailed, casual/formal)

**What you do:**

1. Copy `config/profile.example.md` to `config/profile.md`
2. Fill in `config/profile.md` with their answers — the relay loads this on every message

**Done when:** `config/profile.md` exists with their details.

---

## Phase 5: Semantic Memory (~2 min)

This gives the bot real memory — it finds relevant past conversations automatically.

**You need from the user:** An OpenAI API key (for text embeddings).

**What to tell them:**

1. Go to platform.openai.com → API keys → create key
2. Enter it in Settings → Semantic Memory

The relay picks it up immediately (settings saved → relay auto-restarts).

**Done when:** Subsequent messages show relevant past context being pulled in.

---

## Phase 6: Dashboard & Monitoring

The web UI at http://localhost provides:

- **Status** — bot health, active task count, last message time
- **Tasks** — scheduled tasks (add, pause/resume, delete; click a task for details)
- **Chat** — full conversation history with live chat input
- **Memory** — facts, goals, preferences (add, edit, delete)
- **Files** — files generated by Claude (open, download, delete)
- **Settings** — update any API key or preference (bot restarts automatically on save)

---

## Common Operations

```bash
# View all service status
docker compose ps

# View bot logs (live)
docker compose logs bot -f

# Restart the relay (also triggered automatically when settings are saved)
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
