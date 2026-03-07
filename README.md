# Claude Flux

<div align="center">

![Claude Flux](https://i.ibb.co/3mDdYzDn/claude-flux.jpg)

**Your personal AI on Telegram — powered by Claude, running on your own machine.**

[![Stars](https://img.shields.io/github/stars/ntzamos/claude-flux?style=flat-square&color=yellow)](https://github.com/ntzamos/claude-flux/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://hub.docker.com)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/claude-flux?referralCode=mlspxp&utm_medium=integration&utm_source=template&utm_campaign=generic)

</div>

---

<!-- Add a GIF here showing the bot in action: chat, voice message, scheduled task, file generation -->

Claude Flux turns Telegram into a fully capable AI assistant — one that remembers you, schedules tasks, generates files, and can even modify its own code. Two Docker containers. Five minutes to set up.

---

## What You Get

| | |
|---|---|
| 💬 **Chat** | Send text, photos, voice, or documents — Claude handles all of it |
| 🧠 **Memory** | Remembers facts, tracks goals, surfaces relevant context automatically |
| ⏰ **Scheduler** | "Remind me every morning at 8" — it just works |
| 🛡️ **Human-in-the-loop** | Claude asks before taking actions on your behalf |
| 🎤 **Voice** | Transcribed locally via whisper.cpp, replies via ElevenLabs (optional) |
| 🖥️ **Dashboard** | Web UI to manage chat, memory, tasks, files, and settings |
| 🔧 **Self-modifying** | Claude can edit its own source and push to your GitHub fork |

---

## Get Started in 5 Minutes

**Option 1 — One-click on Railway:**

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/claude-flux?referralCode=mlspxp&utm_medium=integration&utm_source=template&utm_campaign=generic)

**Option 2 — Run locally with Docker:**

```bash
git clone https://github.com/ntzamos/claude-flux
cd claude-flux
cp .env.example .env      # set POSTGRES_PASSWORD to anything
docker compose up -d
open http://localhost      # complete setup in < 5 min
```

The onboarding wizard at `http://localhost` walks you through connecting Telegram and Claude. That's it — your bot is live.

> **Want Claude to push code to your repo?** Fork first, then clone your fork. The bot can modify its own code and push updates — but only if it has write access, which requires your own fork.

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An [Anthropic API key](https://console.anthropic.com/)
- A Telegram bot token (from [@BotFather](https://t.me/botfather))

Everything else (ElevenLabs, OpenAI for embeddings, GitHub token) is optional and added through the dashboard.

---

## Dashboard

`http://localhost` gives you a full control panel:

- **Status** — bot health, last message, active task count
- **Chat** — full conversation history + send messages from the browser
- **Tasks** — view, pause, or delete scheduled reminders
- **Memory** — everything the bot has remembered about you
- **Files** — files Claude has generated (download or delete)
- **Settings** — update any API key live (relay restarts automatically)

---

## ⭐ Star History

If Claude Flux is useful to you, a star helps others find it.

[![Star History Chart](https://api.star-history.com/svg?repos=ntzamos/claude-flux&type=Date)](https://star-history.com/#ntzamos/claude-flux&Date)

---

## License

MIT
