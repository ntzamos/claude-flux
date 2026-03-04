/**
 * Claude Code Telegram Relay
 *
 * Minimal relay that connects Telegram to Claude Code CLI.
 * Customize this for your own needs.
 *
 * Run: bun run src/relay.ts
 */

import { Bot, Context, InlineKeyboard, InputFile } from "grammy";
import { spawn } from "bun";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { sql, embedContent } from "./db.ts";
import { transcribe } from "./transcribe.ts";
import { textToSpeech } from "./speak.ts";
import {
  processMemoryIntents,
  processScheduleIntents,
  getMemoryContext,
  getRelevantContext,
} from "./memory.ts";
import { loadSettings } from "./config.ts";

// ============================================================
// SETTINGS BOOTSTRAP (Docker mode)
// Load credentials from DB before reading any env vars.
// DATABASE_URL is always set in docker-compose env.
// ============================================================

if (process.env.DATABASE_URL) {
  await loadSettings();
}

// ngrok tunnel is started by the web server if NGROK_AUTH_TOKEN is set and TUNNEL_ENABLED != "false"

// ============================================================
// MCP CONFIG SYNC — writes enabled servers to ~/.claude.json
// Called at startup so Claude CLI picks up the latest config.
// ============================================================

async function syncMcpConfig(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const claudeJsonPath = join(process.env.HOME || "/home/relay", ".claude.json");

    // Read existing ~/.claude.json (may have servers added directly by Claude CLI)
    let existing: Record<string, unknown> = {};
    try {
      const content = await readFile(claudeJsonPath, "utf-8");
      existing = JSON.parse(content);
    } catch {}

    // Import servers from ~/.claude.json that aren't in the DB yet.
    // Reads from both global mcpServers and all project-scoped mcpServers,
    // because `claude mcp add` (without --scope global) writes to the project scope.
    const fileServers: Record<string, any> = {
      ...(existing.mcpServers ?? {}) as Record<string, any>,
    };
    const projectsMap = (existing.projects ?? {}) as Record<string, any>;
    for (const projData of Object.values(projectsMap)) {
      for (const [n, v] of Object.entries((projData?.mcpServers ?? {}) as Record<string, any>)) {
        if (!fileServers[n]) fileServers[n] = v;
      }
    }
    let imported = 0;
    for (const [name, cfg] of Object.entries(fileServers)) {
      try {
        const type    = cfg.type === "sse" ? "sse" : "stdio";
        const command = cfg.command ?? null;
        const args    = JSON.stringify(Array.isArray(cfg.args) ? cfg.args : []);
        const env     = JSON.stringify(cfg.env && typeof cfg.env === "object" ? cfg.env : {});
        const url     = cfg.url ?? null;
        await sql`
          INSERT INTO mcp_servers (name, type, command, args, env, url)
          VALUES (${name}, ${type}, ${command}, ${args}, ${env}, ${url})
          ON CONFLICT (name) DO NOTHING
        `;
        imported++;
      } catch {}
    }
    if (imported > 0) {
      console.log(`[mcp] Imported ${imported} server(s) from ~/.claude.json into DB`);
    }

    // Write all enabled DB servers back to ~/.claude.json (merged source of truth)
    const servers = await sql`
      SELECT name, type, command, args, env, url
      FROM mcp_servers
      WHERE enabled = true
      ORDER BY name
    `;

    const mcpServers: Record<string, unknown> = {};
    for (const s of servers) {
      if (s.type === "sse") {
        mcpServers[s.name] = { type: "sse", url: s.url };
      } else {
        mcpServers[s.name] = {
          command: s.command,
          args: Array.isArray(s.args) ? s.args : [],
          ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
        };
      }
    }

    existing.mcpServers = mcpServers;

    // Clear all project-scoped mcpServers — DB + global is the source of truth.
    // Prevents duplicates when Claude CLI previously wrote to project scope.
    for (const projPath of Object.keys(projectsMap)) {
      if (projectsMap[projPath]?.mcpServers) {
        delete projectsMap[projPath].mcpServers;
      }
    }
    existing.projects = projectsMap;

    await writeFile(claudeJsonPath, JSON.stringify(existing, null, 2));
    if (servers.length > 0) {
      console.log(`[mcp] Synced ${servers.length} server(s) to ~/.claude.json`);
    }
  } catch (err) {
    console.error("[mcp] Failed to sync MCP config:", err);
  }
}

await syncMcpConfig();

const PROJECT_ROOT = dirname(dirname(import.meta.path));

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ALLOWED_USER_ID = process.env.TELEGRAM_USER_ID || "";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const PROJECT_DIR = process.env.PROJECT_DIR || "";
const RELAY_DIR = process.env.RELAY_DIR || join(process.env.HOME || "/home/relay", ".claude-relay");

// Directories
const TEMP_DIR = join(RELAY_DIR, "temp");
const UPLOADS_DIR = join(RELAY_DIR, "uploads");

// Session tracking for conversation continuity
const SESSION_FILE = join(RELAY_DIR, "session.json");

interface SessionState {
  sessionId: string | null;
  lastActivity: string;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

async function loadSession(): Promise<SessionState> {
  try {
    const content = await readFile(SESSION_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { sessionId: null, lastActivity: new Date().toISOString() };
  }
}

async function saveSession(state: SessionState): Promise<void> {
  await writeFile(SESSION_FILE, JSON.stringify(state, null, 2));
}

let session = await loadSession();

// ============================================================
// PROCESSING QUEUE — track active state and pending messages
// ============================================================

let isActive = false;
let pendingCount = 0;
let pendingRestart = false;
let processingChain: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>, queueId?: string): void {
  pendingCount++;
  processingChain = processingChain.then(async () => {
    pendingCount--;
    isActive = true;
    if (queueId) await updateQueueStatus(queueId, "processing");
    try {
      await fn();
      if (queueId) await updateQueueStatus(queueId, "done");
    } catch (err) {
      if (queueId) await updateQueueStatus(queueId, "failed");
      throw err;
    } finally {
      isActive = false;
      if (pendingRestart) process.exit(0);
    }
  });
}

// ============================================================
// LOCK FILE (prevent multiple instances)
// ============================================================

const LOCK_FILE = join(RELAY_DIR, "bot.lock");

async function acquireLock(): Promise<boolean> {
  try {
    const existingLock = await readFile(LOCK_FILE, "utf-8").catch(() => null);

    if (existingLock) {
      const pid = parseInt(existingLock);
      try {
        process.kill(pid, 0); // Check if process exists
        console.log(`Another instance running (PID: ${pid})`);
        return false;
      } catch {
        console.log("Stale lock found, taking over...");
      }
    }

    await writeFile(LOCK_FILE, process.pid.toString());
    return true;
  } catch (error) {
    console.error("Lock error:", error);
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await unlink(LOCK_FILE).catch(() => {});
}

// Cleanup on exit
process.on("exit", () => {
  try {
    require("fs").unlinkSync(LOCK_FILE);
  } catch {}
});
process.on("SIGINT", async () => {
  await releaseLock();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await releaseLock();
  process.exit(0);
});

// ============================================================
// SETUP
// ============================================================

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set! Open http://localhost to configure via the web dashboard.");

  // Start a minimal HTTP server so the web dashboard can trigger a restart
  // after the user saves their settings via the onboarding wizard.
  Bun.serve({
    port: 8080,
    fetch(req: Request) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/restart") {
        setTimeout(() => process.exit(0), 300);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      // Status endpoint — dashboard uses this
      return new Response(JSON.stringify({ active: false, queue: 0 }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    },
  });

  // Poll the DB every 10 s — exit cleanly when the token appears so
  // Docker restarts the container and the relay picks it up from DB.
  setInterval(async () => {
    try {
      await loadSettings();
      if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log("[config] TELEGRAM_BOT_TOKEN found — restarting relay...");
        process.exit(0);
      }
    } catch { /* ignore DB errors during poll */ }
  }, 10000);

  // Block top-level execution so bot initialisation below never runs.
  // The Bun.serve + setInterval above keep the event loop alive.
  await new Promise(() => {});
}

// Create directories
await mkdir(TEMP_DIR, { recursive: true });
await mkdir(UPLOADS_DIR, { recursive: true });

// ============================================================
// DATABASE — save messages + fire-and-forget embeddings
// ============================================================

async function getRecentHistory(limit = 4): Promise<string> {
  if (!process.env.DATABASE_URL) return "";
  try {
    const rows = await sql`
      SELECT role, content
      FROM messages
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    if (!rows.length) return "";
    const lines = [...rows].reverse().map((r: any) =>
      `${r.role === "user" ? "User" : "Assistant"}: ${r.content.substring(0, 600)}`
    );
    return "Recent conversation:\n" + lines.join("\n");
  } catch {
    return "";
  }
}

async function saveMessage(
  role: string,
  content: string,
  channel = "telegram",
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const rows = await sql`
      INSERT INTO messages (role, content, channel, metadata)
      VALUES (${role}, ${content}, ${channel}, ${metadata || {}})
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (id) embedContent("messages", id, content); // fire-and-forget
  } catch (error) {
    console.error("DB save error:", error);
  }
}

async function saveToQueue(chatId: number, payload: Record<string, unknown>): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await sql`
      INSERT INTO message_queue (chat_id, payload) VALUES (${chatId}, ${sql.json(payload)}) RETURNING id
    `;
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("[queue] Failed to save:", e);
    return null;
  }
}

async function updateQueueStatus(id: string, status: "processing" | "done" | "failed"): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`UPDATE message_queue SET status = ${status}, processed_at = NOW() WHERE id = ${id}`;
  } catch (e) {
    console.error("[queue] Failed to update status:", e);
  }
}

// Acquire lock
if (!(await acquireLock())) {
  console.error("Could not acquire lock. Another instance may be running.");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// ============================================================
// SECURITY: Only respond to authorized user
// ============================================================

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id.toString();

  // If ALLOWED_USER_ID is set, enforce it
  if (ALLOWED_USER_ID && userId !== ALLOWED_USER_ID) {
    console.log(`Unauthorized: ${userId}`);
    await ctx.reply("This bot is private.");
    return;
  }

  await next();
});

// ============================================================
// CORE: Call Claude CLI
// ============================================================

function cleanErrorDetail(detail: string): string {
  // Strip raw HTML (e.g. Cloudflare challenge pages for 403 errors)
  if (/<html|<!DOCTYPE/i.test(detail)) {
    const m = detail.match(/(\d{3})/);
    const code = m ? m[1] : "";
    if (code === "403") return "Authentication failed (HTTP 403). The Anthropic API request was blocked.";
    if (code === "429") return "Rate limited (HTTP 429). Too many requests — please wait a moment.";
    if (code === "500" || code === "502" || code === "503") return `Server error (HTTP ${code}). The API is temporarily unavailable.`;
    return code ? `API error (HTTP ${code})` : "API request was blocked by the server";
  }
  return detail.substring(0, 300).trim();
}

async function callClaude(
  prompt: string,
  options?: { resume?: boolean; imagePath?: string }
): Promise<string> {
  const args = [CLAUDE_PATH, "-p", prompt];

  // Expire session after 2 hours of inactivity
  if (session.sessionId && session.lastActivity) {
    const elapsed = Date.now() - new Date(session.lastActivity).getTime();
    if (elapsed > 2 * 60 * 60 * 1000) {
      console.log("[session] Expired after 2h inactivity — starting fresh");
      session.sessionId = null;
      await saveSession(session);
    }
  }

  // Resume previous session if available and requested
  if (options?.resume && session.sessionId) {
    args.push("--resume", session.sessionId);
  }

  args.push("--output-format", "json");
  args.push("--dangerously-skip-permissions");

  console.log(`Calling Claude: ${prompt.substring(0, 50)}...`);

  try {
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: PROJECT_DIR || undefined,
      env: {
        ...process.env,
        CLAUDECODE: undefined, // Allow nested Claude CLI calls
      },
    });

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const detail = stderr || output || `exit code ${exitCode}`;
      console.error("Claude error (stderr):", stderr);
      console.error("Claude error (stdout):", output);
      return `Error: ${cleanErrorDetail(detail.trim())}`;
    }

    // Parse JSON output to extract session_id and result text
    try {
      const parsed = JSON.parse(output);
      if (parsed.session_id) {
        session.sessionId = parsed.session_id;
        session.lastActivity = new Date().toISOString();
        await saveSession(session);
      }
      return (parsed.result ?? output).trim();
    } catch {
      // Fallback if JSON parsing fails
      return output.trim();
    }
  } catch (error) {
    console.error("Spawn error:", error);
    return `Error: Could not run Claude CLI`;
  }
}

// ============================================================
// HUMAN-IN-THE-LOOP
// Maps a short random key → { action, payload } for pending confirmations.
// Telegram callback data is capped at 64 bytes, so we can't embed full payloads.
// ============================================================

const pendingActions = new Map<string, { action: string; payload: string }>();
const pendingRetries = new Map<string, { prompt: string; options: { resume?: boolean } }>();

async function sendErrorWithRetry(
  ctx: Context,
  errorMsg: string,
  prompt: string,
  opts: { resume?: boolean },
  thinkingMsgId?: number
): Promise<void> {
  if (thinkingMsgId) {
    await ctx.api.deleteMessage(ctx.chat!.id, thinkingMsgId).catch(() => {});
  }
  const key = Math.random().toString(36).substring(2, 10);
  pendingRetries.set(key, { prompt, options: opts });
  setTimeout(() => pendingRetries.delete(key), 10 * 60 * 1000);
  const keyboard = new InlineKeyboard()
    .text("Retry", `retry:${key}`)
    .text("Restart bot", "error:restart");
  await ctx.reply(`${errorMsg}\n\nWhat would you like to do?`, { reply_markup: keyboard });
}

function parseAskIntent(
  response: string
): { clean: string; ask?: { action: string; payload: string } } {
  // Bracket-aware parser — handles ] and newlines inside the payload
  const startMarker = "[ASK:";
  const startIdx = response.toUpperCase().indexOf(startMarker.toUpperCase());
  if (startIdx === -1) return { clean: response };

  // Walk forward tracking bracket depth to find the closing ]
  let depth = 1;
  let i = startIdx + 1;
  while (i < response.length && depth > 0) {
    if (response[i] === "[") depth++;
    else if (response[i] === "]") depth--;
    i++;
  }

  if (depth !== 0) return { clean: response }; // unclosed tag

  // Content between [ASK: and the matching ]
  const tagContent = response.slice(startIdx + startMarker.length, i - 1);

  // Split on the FIRST occurrence of "| PAYLOAD:" (case-insensitive)
  const pipeIdx = tagContent.toUpperCase().indexOf("| PAYLOAD:");
  if (pipeIdx === -1) return { clean: response };

  const action = tagContent.slice(0, pipeIdx).trim();
  const payload = tagContent.slice(pipeIdx + "| PAYLOAD:".length).trim();

  const clean = (response.slice(0, startIdx) + response.slice(i)).trim();
  console.log("[relay] ASK parsed — action:", action, "| payload:", payload.substring(0, 80));
  return { clean, ask: { action, payload } };
}

function extractFileTag(response: string): { clean: string; fileName: string | null } {
  const match = response.match(/\[FILE:\s*([^\]]+)\]/i);
  if (!match) return { clean: response, fileName: null };
  const fileName = match[1].trim();
  const clean = response.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { clean, fileName };
}

async function handleClaudeResponse(
  ctx: Context,
  rawResponse: string,
  opts?: { voiceReply?: boolean; thinkingMsgId?: number; replyToMessageId?: number }
): Promise<void> {
  console.log("[relay] Raw Claude response:", rawResponse.substring(0, 500));
  const afterMemory = await processMemoryIntents(rawResponse);
  const afterSchedule = await processScheduleIntents(afterMemory);
  const { clean: afterFile, fileName } = extractFileTag(afterSchedule);
  const { clean, ask } = parseAskIntent(afterFile);

  if (ask) {
    const key = Math.random().toString(36).substring(2, 10);
    pendingActions.set(key, ask);
    const keyboard = new InlineKeyboard()
      .text("✅ Yes", `confirm:${key}`)
      .text("❌ No", `cancel:${key}`);
    if (clean) await sendResponse(ctx, clean, opts?.thinkingMsgId, opts?.replyToMessageId);
    else if (opts?.thinkingMsgId) await ctx.api.deleteMessage(ctx.chat!.id, opts.thinkingMsgId).catch(() => {});
    if (fileName) await ctx.reply(`File saved: ${fileName}\nView: ${process.env.WEB_HOST || ""}/dashboard?tab=files`);
    await ctx.reply(`Allow: ${ask.action}?`, { reply_markup: keyboard });
  } else {
    await sendResponse(ctx, clean, opts?.thinkingMsgId, opts?.replyToMessageId);
    if (fileName) {
      await ctx.reply(`File saved: ${fileName}\nView at: ${process.env.WEB_HOST || ""}/dashboard?tab=files`);
    }

    // Voice reply — send ElevenLabs TTS audio back
    if (opts?.voiceReply && process.env.ELEVENLABS_API_KEY && clean) {
      try {
        const voicePath = join(TEMP_DIR, `voice_reply_${Date.now()}.ogg`);
        const ok = await textToSpeech(clean, voicePath);
        if (ok) {
          await ctx.replyWithVoice(new InputFile(voicePath));
          await unlink(voicePath).catch(() => {});
        }
      } catch (e) {
        console.error("[speak] Voice reply failed:", e);
      }
    }
  }

  // Re-sync MCP config in case Claude registered new servers during this response
  if (process.env.DATABASE_URL) syncMcpConfig().catch(() => {});
}

// Callback query handler — processes confirm/cancel button taps
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith("confirm:")) {
    const key = data.replace("confirm:", "");
    const pending = pendingActions.get(key);

    if (!pending) {
      await ctx.answerCallbackQuery("Action expired");
      return;
    }

    pendingActions.delete(key);
    await ctx.answerCallbackQuery("Confirmed ✅");

    // Remove inline keyboard — wrap to avoid aborting the rest on API hiccup
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch (e) {
      console.warn("[relay] editMessageReplyMarkup failed (non-fatal):", e);
    }

    await ctx.replyWithChatAction("typing");

    try {
      console.log("[relay] Running confirmed action:", pending.payload.substring(0, 80));
      const rawResult = await callClaude(pending.payload, { resume: true });
      if (rawResult.startsWith("Error:")) {
        await sendErrorWithRetry(ctx, rawResult, pending.payload, { resume: true });
      } else {
        await saveMessage("assistant", rawResult);
        await handleClaudeResponse(ctx, rawResult);
      }
    } catch (error) {
      console.error("[relay] Confirmed action failed:", error);
      await ctx.reply("Something went wrong running that action. Check the logs.");
    }
  } else if (data.startsWith("cancel:")) {
    const key = data.replace("cancel:", "");
    pendingActions.delete(key);
    await ctx.answerCallbackQuery("Cancelled ❌");
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch (e) {
      console.warn("[relay] editMessageReplyMarkup failed (non-fatal):", e);
    }
    await ctx.reply("Cancelled.");
  } else if (data === "tunnel:on") {
    const tokenRows = await sql`SELECT value FROM settings WHERE key = 'NGROK_AUTH_TOKEN'`;
    const token = tokenRows[0]?.value?.trim();
    if (!token) {
      await ctx.answerCallbackQuery("No ngrok token configured");
      await ctx.reply("No ngrok auth token configured. Add NGROK_AUTH_TOKEN in Settings first.");
      return;
    }
    await sql`INSERT INTO settings (key, value) VALUES ('TUNNEL_ENABLED', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`;
    await ctx.answerCallbackQuery("Enabling tunnel...");
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    await ctx.reply("Public URL enabled. Restarting...");
    setTimeout(() => process.exit(0), 500);
  } else if (data === "tunnel:off") {
    await sql`INSERT INTO settings (key, value) VALUES ('TUNNEL_ENABLED', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`;
    await ctx.answerCallbackQuery("Disabling tunnel...");
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    await ctx.reply("Public URL disabled. Restarting...");
    setTimeout(() => process.exit(0), 500);
  } else if (data.startsWith("retry:")) {
    const key = data.replace("retry:", "");
    const pending = pendingRetries.get(key);
    if (!pending) {
      await ctx.answerCallbackQuery("Retry expired");
      return;
    }
    pendingRetries.delete(key);
    await ctx.answerCallbackQuery("Retrying...");
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    const thinkingMsg = await ctx.reply("Retrying...");
    await ctx.replyWithChatAction("typing");
    const rawResult = await callClaude(pending.prompt, pending.options);
    if (rawResult.startsWith("Error:")) {
      await sendErrorWithRetry(ctx, rawResult, pending.prompt, pending.options, thinkingMsg.message_id);
    } else {
      await ctx.api.deleteMessage(ctx.chat!.id, thinkingMsg.message_id).catch(() => {});
      await saveMessage("assistant", rawResult);
      await handleClaudeResponse(ctx, rawResult);
    }
  } else if (data === "error:restart") {
    await ctx.answerCallbackQuery("Restarting...");
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    await ctx.reply("Restarting bot...");
    setTimeout(() => process.exit(0), 500);
  }
});

// Global error handler — surfaces unexpected errors instead of swallowing them
bot.catch((err) => {
  console.error("[relay] Unhandled bot error:", err.error);
});

// ============================================================
// COMMANDS
// ============================================================

const BOT_COMMANDS = [
  { command: "start", description: "Welcome message and quick-start guide" },
  { command: "help", description: "Show all available commands" },
  { command: "callme", description: "Start an AI phone call (e.g. /callme check in on my goals)" },
  { command: "tasks", description: "List scheduled tasks" },
  { command: "memory", description: "List all memory items" },
  { command: "mcps", description: "List all installed MCP servers" },
  { command: "session", description: "Current session info" },
  { command: "botinfo", description: "Bot configuration & status" },
  { command: "userinfo", description: "Your user info" },
  { command: "restart", description: "Restart the bot" },
  { command: "tunnel", description: "Enable/disable remote dashboard access (/tunnel on|off|status)" },
  { command: "detect", description: "Detect defects in an image — send as caption with a photo" },
  { command: "newsession", description: "Clear current Claude session and start fresh" },
];

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "there";
  const msg = [
    `Hey ${name} 👋 I'm your personal AI assistant, powered by Claude.`,
    "",
    "Here's what I can do for you:",
    "",
    "🧠 Answer questions, brainstorm ideas, write and review code",
    "📋 Remember facts, goals, and preferences across conversations",
    "⏰ Set reminders and schedule recurring tasks",
    "📎 Analyse images and documents you send me",
    "🎙 Transcribe voice messages",
    "🌐 Browse the web, run code, and use connected tools",
    "",
    "Just send me a message to get started — no commands needed.",
    "Use /help to see all available commands.",
  ].join("\n");
  await ctx.reply(msg);
});

bot.command("help", async (ctx) => {
  const lines = ["Commands:", ""];
  for (const cmd of BOT_COMMANDS) {
    lines.push(`/${cmd.command} — ${cmd.description}`);
  }
  await ctx.reply(lines.join("\n"));
});

bot.command("tasks", async (ctx) => {
  try {
    const tasks = await sql`
      SELECT description, schedule_type, next_run_at, interval_minutes, run_count
      FROM scheduled_tasks
      WHERE status = 'active'
      ORDER BY next_run_at ASC
    `;
    if (!tasks || tasks.length === 0) {
      await ctx.reply("No active scheduled tasks.");
      return;
    }
    const lines = [`${tasks.length} active task(s):`, ""];
    for (const t of tasks) {
      const next = new Date(t.next_run_at).toLocaleString("en-US", {
        timeZone: USER_TIMEZONE,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const typeLabel =
        t.schedule_type === "interval" ? `every ${t.interval_minutes}min` : t.schedule_type;
      lines.push(`• ${t.description}`);
      lines.push(`  ${typeLabel} · next: ${next} · runs: ${t.run_count}`);
    }
    await ctx.reply(lines.join("\n"));
  } catch (err: any) {
    await ctx.reply(`Error: ${err.message}`);
  }
});

bot.command("session", async (ctx) => {
  const s = await loadSession();
  const lines = ["Session:", ""];
  lines.push(`ID: ${s.sessionId || "none"}`);
  if (s.lastActivity) {
    const last = new Date(s.lastActivity).toLocaleString("en-US", {
      timeZone: USER_TIMEZONE,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`Last activity: ${last}`);
  }
  await ctx.reply(lines.join("\n"));
});

bot.command("newsession", async (ctx) => {
  session.sessionId = null;
  session.lastActivity = new Date().toISOString();
  await saveSession(session);
  await ctx.reply("Session cleared. Next message will start a fresh Claude session.");
});

bot.command("botinfo", async (ctx) => {
  const status = await checkStartupStatus();
  const lines = ["Bot info:", ""];
  lines.push(`Claude: ${CLAUDE_PATH}`);
  lines.push(`Project dir: ${PROJECT_DIR || "(relay dir)"}`);
  lines.push(`Relay dir: ${RELAY_DIR}`);
  lines.push("");
  lines.push(status);
  await ctx.reply(lines.join("\n"));
});

bot.command("userinfo", async (ctx) => {
  const lines = ["You:", ""];
  lines.push(`ID: ${ctx.from?.id}`);
  lines.push(`Name: ${USER_NAME || ctx.from?.first_name || "not set"}`);
  lines.push(`Timezone: ${USER_TIMEZONE}`);
  if (ctx.from?.username) lines.push(`Username: @${ctx.from.username}`);
  await ctx.reply(lines.join("\n"));
});

bot.command("restart", async (ctx) => {
  await ctx.reply("Restarting...");
  setTimeout(() => process.exit(0), 500);
});

const getTunnelStatus = async (): Promise<{ enabled: boolean; url: string | null }> => {
  const rows = await sql`SELECT value FROM settings WHERE key = 'TUNNEL_ENABLED'`;
  const enabled = rows[0]?.value === "true";
  let url: string | null = null;
  if (enabled) {
    try {
      const res = await fetch("http://localhost:4040/api/tunnels", { signal: AbortSignal.timeout(2000) });
      const data = (await res.json()) as { tunnels?: Array<{ proto: string; public_url: string }> };
      url = data.tunnels?.find((t) => t.proto === "https")?.public_url ?? null;
    } catch {
      // ngrok not running yet
    }
  }
  return { enabled, url };
};

const sendTunnelStatus = async (ctx: Context) => {
  const { enabled, url } = await getTunnelStatus();
  let statusText: string;
  if (enabled && url) {
    statusText = `Public URL is ON\n${url}`;
  } else if (enabled) {
    statusText = "Public URL is ON (ngrok starting up...)";
  } else {
    statusText = "Public URL is OFF — dashboard is only accessible locally.";
  }
  const keyboard = new InlineKeyboard()
    .text("Enable", "tunnel:on")
    .text("Disable", "tunnel:off");
  await ctx.reply(statusText, { reply_markup: keyboard });
};

bot.command("tunnel", async (ctx) => {
  await sendTunnelStatus(ctx);
});

bot.command("memory", async (ctx) => {
  try {
    const items = await sql`
      SELECT type, content, priority
      FROM memory
      WHERE type != 'completed_goal'
      ORDER BY type, priority DESC, created_at ASC
    `;
    if (!items || items.length === 0) {
      await ctx.reply("No memory items stored.");
      return;
    }
    const grouped: Record<string, string[]> = {};
    for (const item of items) {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(`• ${item.content}`);
    }
    const lines: string[] = [`${items.length} memory item(s):`, ""];
    for (const [type, entries] of Object.entries(grouped)) {
      lines.push(type.toUpperCase());
      lines.push(...entries);
      lines.push("");
    }
    await ctx.reply(lines.join("\n").trim());
  } catch (err: any) {
    await ctx.reply(`Error: ${err.message}`);
  }
});

bot.command("mcps", async (ctx) => {
  try {
    const servers = await sql`
      SELECT name, type, command, args, url, enabled
      FROM mcp_servers
      ORDER BY name
    `;
    if (!servers || servers.length === 0) {
      await ctx.reply("No MCP servers configured.");
      return;
    }
    const lines = [`${servers.length} MCP server(s):`, ""];
    for (const s of servers) {
      const status = s.enabled ? "✓" : "✗";
      const detail = s.type === "sse"
        ? s.url
        : [s.command, ...(s.args ?? [])].join(" ");
      lines.push(`${status} ${s.name} (${s.type})`);
      lines.push(`  ${detail}`);
    }
    await ctx.reply(lines.join("\n"));
  } catch (err: any) {
    await ctx.reply(`Error: ${err.message}`);
  }
});

// ============================================================
// CUSTOM COMMANDS (loaded from DB)
// ============================================================

if (process.env.DATABASE_URL) {
  try {
    const customCmds = await sql`
      SELECT command, description, action_prompt
      FROM telegram_commands
      WHERE enabled = true
      ORDER BY command
    `;
    for (const cmd of customCmds) {
      BOT_COMMANDS.push({ command: cmd.command, description: cmd.description });
      bot.command(cmd.command, async (ctx) => {
        const thinkingMsg = await ctx.reply("Thinking…");
        await ctx.replyWithChatAction("typing");
        const [relevantContext, memoryContext, recentHistory] = await Promise.all([
          getRelevantContext(cmd.action_prompt),
          getMemoryContext(),
          getRecentHistory(),
        ]);
        await saveMessage("user", `/${cmd.command}`, "telegram");
        const enrichedPrompt = buildPrompt(cmd.action_prompt, relevantContext, memoryContext, recentHistory);
        const rawResponse = await callClaude(enrichedPrompt, { resume: true });
        await saveMessage("assistant", rawResponse);
        await handleClaudeResponse(ctx, rawResponse, { thinkingMsgId: thinkingMsg.message_id });
      });
    }
    if (customCmds.length > 0) {
      console.log(`[commands] Registered ${customCmds.length} custom command(s): ${customCmds.map((c: any) => "/" + c.command).join(", ")}`);
    }
  } catch (err) {
    console.error("[commands] Failed to load custom commands:", err);
  }
}

bot.command("callme", async (ctx) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  const toNumber = process.env.MY_PHONE_NUMBER;

  if (!agentId || !phoneNumberId || !toNumber) {
    await ctx.reply("Call feature not configured. Missing ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID, or MY_PHONE_NUMBER in .env");
    return;
  }

  const reason = ctx.match?.trim() || "";

  await ctx.reply(`Calling you now on ${toNumber}... 📞`);

  try {
    const body: Record<string, unknown> = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: toNumber,
    };

    body.conversation_initiation_client_data = {
      dynamic_variables: { reason: reason || "just checking in" },
    };

    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      console.error("[callme] ElevenLabs error:", data);
      await ctx.reply(`Call failed: ${(data.detail as string) || res.statusText}`);
      return;
    }

    console.log("[callme] Call initiated:", data.conversation_id);
    if (reason) {
      await ctx.reply(`Calling about: "${reason}"`);
    }
  } catch (err) {
    console.error("[callme] Error:", err);
    await ctx.reply("Could not initiate call. Check logs.");
  }
});

// ============================================================
// QUEUE RECOVERY — replays pending text messages after restart
// ============================================================

function buildFakeCtx(chatId: number): any {
  return {
    chat: { id: chatId },
    reply: (text: string, opts?: any) => bot.api.sendMessage(chatId, text, opts),
    replyWithChatAction: (action: string) => bot.api.sendChatAction(chatId, action as any),
    replyWithVoice: (file: InputFile) => bot.api.sendVoice(chatId, file),
    api: bot.api,
  };
}

async function recoverPendingMessages(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    // Reset any items stuck in 'processing' from a previous interrupted run.
    // These were never completed and should not be retried — they may have
    // triggered the restart themselves (e.g. Claude called /restart mid-task),
    // and retrying them would cause an infinite restart loop.
    await sql`
      UPDATE message_queue SET status = 'failed', processed_at = NOW()
      WHERE status = 'processing'
    `;

    const rows = await sql`
      SELECT id, chat_id, payload FROM message_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `;
    if (!rows.length) return;
    console.log(`[queue] Recovering ${rows.length} pending message(s)...`);
    for (const row of rows) {
      const { id, chat_id, payload } = row;
      if (payload.type !== "text") {
        await updateQueueStatus(id, "failed");
        continue;
      }
      const ctx = buildFakeCtx(Number(chat_id));
      enqueue(async () => {
        const text = payload.text as string;
        const thinkingMsg = await ctx.reply("Thinking…");
        await ctx.replyWithChatAction("typing");
        const [relevantContext, memoryContext, recentHistory] = await Promise.all([
          getRelevantContext(text),
          getMemoryContext(),
          getRecentHistory(),
        ]);
        await saveMessage("user", text);
        const enrichedPrompt = buildPrompt(text, relevantContext, memoryContext, recentHistory);
        const rawResponse = await callClaude(enrichedPrompt, { resume: true });
        await saveMessage("assistant", rawResponse);
        await handleClaudeResponse(ctx, rawResponse, { thinkingMsgId: thinkingMsg.message_id });
      }, id);
    }
  } catch (e) {
    console.error("[queue] Recovery failed:", e);
  }
}

// ============================================================
// MESSAGE HANDLERS
// ============================================================

// Text messages
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  // Skip commands — handled above
  if (text.startsWith("/")) return;

  console.log(`Message: ${text.substring(0, 50)}...`);

  const originalMessageId = ctx.message.message_id;
  const queueId = await saveToQueue(ctx.chat!.id, { type: "text", text });

  enqueue(async () => {
    const thinkingMsg = await ctx.reply("Thinking…");
    await ctx.replyWithChatAction("typing");

    // Fetch context before saving so current message isn't in its own history
    const [relevantContext, memoryContext, recentHistory] = await Promise.all([
      getRelevantContext(text),
      getMemoryContext(),
      getRecentHistory(),
    ]);

    await saveMessage("user", text);

    const enrichedPrompt = buildPrompt(text, relevantContext, memoryContext, recentHistory);
    const rawResponse = await callClaude(enrichedPrompt, { resume: true });

    if (rawResponse.startsWith("Error:")) {
      await sendErrorWithRetry(ctx, rawResponse, enrichedPrompt, { resume: true }, thinkingMsg.message_id);
    } else {
      await saveMessage("assistant", rawResponse);
      await handleClaudeResponse(ctx, rawResponse, { thinkingMsgId: thinkingMsg.message_id, replyToMessageId: originalMessageId });
    }
  }, queueId ?? undefined);
});

// Voice messages
bot.on("message:voice", async (ctx) => {
  const voice = ctx.message.voice;
  console.log(`Voice message: ${voice.duration}s`);

  const originalMessageId = ctx.message.message_id;
  enqueue(async () => {
    const thinkingMsg = await ctx.reply("Thinking…");
    await ctx.replyWithChatAction("typing");

    try {
      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());

      const transcription = await transcribe(buffer);
      if (!transcription) {
        await ctx.api.deleteMessage(ctx.chat!.id, thinkingMsg.message_id).catch(() => {});
        await ctx.reply(
          "No whisper model found. Download one into the whisper-models/ folder:\n" +
          "curl -L -o whisper-models/ggml-base.bin \\\n" +
          "  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
        );
        return;
      }

      const [relevantContext, memoryContext, recentHistory] = await Promise.all([
        getRelevantContext(transcription),
        getMemoryContext(),
        getRecentHistory(),
      ]);

      await saveMessage("user", `[Voice ${voice.duration}s]: ${transcription}`);

      const enrichedPrompt = buildPrompt(
        `[Voice message transcribed]: ${transcription}`,
        relevantContext,
        memoryContext,
        recentHistory
      );
      const rawResponse = await callClaude(enrichedPrompt, { resume: true });

      await saveMessage("assistant", rawResponse);
      await handleClaudeResponse(ctx, rawResponse, { voiceReply: true, thinkingMsgId: thinkingMsg.message_id, replyToMessageId: originalMessageId });
    } catch (error) {
      console.error("Voice error:", error);
      await ctx.reply("Could not process voice message. Check logs for details.");
    }
  });
});

// Photos/Images
bot.on("message:photo", async (ctx) => {
  console.log("Image received");

  const originalMessageId = ctx.message.message_id;
  enqueue(async () => {
    const thinkingMsg = await ctx.reply("Thinking…");
    await ctx.replyWithChatAction("typing");

    try {
      // Get highest resolution photo
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const file = await ctx.api.getFile(photo.file_id);

      // Save to /files/ so it appears in the dashboard
      const timestamp = Date.now();
      const fileName = `photo_${timestamp}.jpg`;
      const filePath = `/files/${fileName}`;

      const response = await fetch(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
      );
      const buffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      // Claude Code can see images via file path
      const rawCaption = ctx.message.caption || "";
      const isDetect = rawCaption.trim().toLowerCase().startsWith("/detect");
      const caption = isDetect
        ? `/detect ${filePath}`
        : rawCaption || "Analyze this image.";
      const prompt = `[Image: ${filePath}]\n\n${caption}`;

      const [memoryContext, recentHistory] = await Promise.all([
        isDetect ? Promise.resolve("") : getMemoryContext(),
        isDetect ? Promise.resolve("") : getRecentHistory(),
      ]);

      await saveMessage("user", `[Image]: ${caption}`);

      const claudeResponse = await callClaude(
        buildPrompt(prompt, undefined, memoryContext, recentHistory),
        { resume: true }
      );

      await saveMessage("assistant", claudeResponse);
      await handleClaudeResponse(ctx, claudeResponse, { thinkingMsgId: thinkingMsg.message_id, replyToMessageId: originalMessageId });
      await ctx.reply(`Photo saved: ${fileName}\nView at: ${process.env.WEB_HOST || ""}/dashboard?tab=files`);
    } catch (error) {
      console.error("Image error:", error);
      await ctx.reply("Could not process image.");
    }
  });
});

// Documents
bot.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  console.log(`Document: ${doc.file_name}`);

  const originalMessageId = ctx.message.message_id;
  enqueue(async () => {
    const thinkingMsg = await ctx.reply("Thinking…");
    await ctx.replyWithChatAction("typing");

    try {
      const file = await ctx.getFile();
      const timestamp = Date.now();
      const fileName = doc.file_name ? `${timestamp}_${doc.file_name}` : `file_${timestamp}`;
      const filePath = `/files/${fileName}`;

      const response = await fetch(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
      );
      const buffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      const caption = ctx.message.caption || `Analyze: ${doc.file_name}`;
      const prompt = `[File: ${filePath}]\n\n${caption}`;

      const [memoryContext, recentHistory] = await Promise.all([
        getMemoryContext(),
        getRecentHistory(),
      ]);

      await saveMessage("user", `[Document: ${doc.file_name}]: ${caption}`);

      const claudeResponse = await callClaude(
        buildPrompt(prompt, undefined, memoryContext, recentHistory),
        { resume: true }
      );

      await saveMessage("assistant", claudeResponse);
      await handleClaudeResponse(ctx, claudeResponse, { thinkingMsgId: thinkingMsg.message_id, replyToMessageId: originalMessageId });
      await ctx.reply(`File saved: ${fileName}\nView at: ${process.env.WEB_HOST || ""}/dashboard?tab=files`);
    } catch (error) {
      console.error("Document error:", error);
      await ctx.reply("Could not process document.");
    }
  });
});

// ============================================================
// HELPERS
// ============================================================

// Load profile once at startup
let profileContext = "";
try {
  profileContext = await readFile(join(PROJECT_ROOT, "config", "profile.md"), "utf-8");
} catch {
  // No profile yet — that's fine
}

const USER_NAME = process.env.USER_NAME || "";
const USER_TIMEZONE = process.env.USER_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

function buildPrompt(
  userMessage: string,
  relevantContext?: string,
  memoryContext?: string,
  recentHistory?: string
): string {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = [
    "You are a personal AI assistant responding via Telegram. Keep responses concise and conversational. Do not use markdown formatting — no bold, italics, headers, bullet symbols, or code blocks. Plain text only.",
  ];

  if (USER_NAME) parts.push(`You are speaking with ${USER_NAME}.`);
  parts.push(`Current time: ${timeStr}`);
  if (profileContext) parts.push(`\nProfile:\n${profileContext}`);
  if (memoryContext) parts.push(`\n${memoryContext}`);
  if (recentHistory) parts.push(`\n${recentHistory}`);
  if (relevantContext) parts.push(`\n${relevantContext}`);

  parts.push(
    "\nFILES:" +
    "\nWhen generating any file (PDF, CSV, report, chart, analysis, etc.) you MUST:" +
    "\n1. Save it using an ABSOLUTE path: /files/<descriptive-name.ext>" +
    "\n   CORRECT:   Write('/files/report-2026-02.pdf', ...)" +
    "\n   INCORRECT: Write('uploads/report.pdf', ...)  ← never use relative paths or uploads/" +
    "\n2. Add this tag on its own line so the dashboard picks it up:" +
    "\n   [FILE: descriptive-name.ext]" +
    "\nThe /files/ directory is a shared volume visible to the web dashboard." +
    "\nNever save generated files anywhere else."
  );

  parts.push(
    "\nMEMORY MANAGEMENT:" +
      "\nWhen the user shares something worth remembering, sets goals, or completes goals, " +
      "include these tags in your response (they are processed automatically and hidden from the user):" +
      "\n[REMEMBER: fact to store]" +
      "\n[GOAL: goal text | DEADLINE: optional date]" +
      "\n[DONE: search text for completed goal]" +
      "\n\nSCHEDULING:" +
      "\nWhen the user asks to be reminded, sets a timer, or wants a recurring action, include a SCHEDULE tag." +
      "\nThe tag is hidden and processed automatically — confirm to the user what was scheduled." +
      "\nFormats (pick the right TYPE):" +
      "\n  One-time:  [SCHEDULE: description | TYPE: once     | WHEN: <ISO UTC datetime>       | ACTION: <exact prompt Claude runs when triggered>]" +
      "\n  Timer:     [SCHEDULE: description | TYPE: interval | MINUTES: <N>                   | ACTION: <prompt>]" +
      "\n  Daily:     [SCHEDULE: description | TYPE: daily    | WHEN: <ISO UTC first occurrence> | ACTION: <prompt>]" +
      "\nRules:" +
      "\n- WHEN must be a valid ISO 8601 UTC datetime (e.g. 2026-02-27T06:00:00Z)." +
      `\n- User timezone is ${USER_TIMEZONE}. Convert local times to UTC before writing WHEN.` +
      "\n- For TYPE=interval, MINUTES is time from now until first (and subsequent) runs." +
      "\n- ACTION is the exact prompt sent to Claude when the task fires. Be specific — include context and what to say." +
      "\n- 'tomorrow morning' means tomorrow at 08:00 local time. 'morning briefing' means 08:00 local." +
      "\n\nHUMAN-IN-THE-LOOP:" +
      "\nBefore taking any action on the user's behalf (sending an email, updating a file, running a command, etc.), " +
      "ask for confirmation using this tag (also hidden from the user — the relay shows a Yes/No button instead):" +
      "\n[ASK: plain-English description of the action | PAYLOAD: the exact prompt to execute if confirmed]" +
      "\nOnly one [ASK:] tag per response. Include any relevant commentary before the tag."
  );

  parts.push(
    "\nMCP SERVERS:" +
    "\nWhen the user asks to add, remove, or manage MCP servers, always operate on the database directly." +
    "\nThe database is the source of truth — the relay syncs ~/.claude.json from it on every restart." +
    "\n" +
    "\nTo ADD an MCP server:" +
    "\n  SSE/HTTP: psql \"$DATABASE_URL\" -c \"INSERT INTO mcp_servers (name, type, url, args, env) VALUES ('<name>', 'sse', '<url>', '[]', '{}') ON CONFLICT (name) DO UPDATE SET url=EXCLUDED.url, enabled=true\"" +
    "\n  stdio:    psql \"$DATABASE_URL\" -c \"INSERT INTO mcp_servers (name, type, command, args, env) VALUES ('<name>', 'stdio', '<command>', '[\\\"arg1\\\",\\\"arg2\\\"]', '{}') ON CONFLICT (name) DO UPDATE SET command=EXCLUDED.command, enabled=true\"" +
    "\n" +
    "\nTo REMOVE an MCP server:" +
    "\n  psql \"$DATABASE_URL\" -c \"DELETE FROM mcp_servers WHERE name='<name>'\"" +
    "\n" +
    "\nTo LIST MCP servers:" +
    "\n  psql \"$DATABASE_URL\" -c \"SELECT name, type, url, command, enabled FROM mcp_servers ORDER BY name\"" +
    "\n" +
    "\nAfter any add/remove, restart the relay so it syncs ~/.claude.json:" +
    "\n  curl -s -X POST http://localhost:8080/restart" +
    "\n" +
    "\nNEVER use 'claude mcp add' — it writes to a project-scoped file that is not visible to the dashboard."
  );

  if (userMessage.startsWith("/detect ")) {
    const imgPath = userMessage.slice(8).trim();
    parts.push(
      "\nDEFECT DETECTION TASK:" +
      `\nImage: ${imgPath}` +
      "\n" +
      "\nSTEP 1 — VISUAL INSPECTION (do this first, in your head):" +
      "\n- Analyze only what is visible in this photo. Do not speculate about sides not shown." +
      "\n- Inspect systematically: screen, back panel, each individual camera lens, camera module glass, frame, corners." +
      "\n- For each camera lens: explicitly decide — intact, scratched, or cracked. Cracks are asymmetric and branch; scratches are linear. When in doubt, assume crack." +
      "\n- A cracked lens = Grade D regardless of anything else." +
      "\n- List every defect with its pixel location (approximate x,y,w,h) before moving on." +
      "\n" +
      "\nSTEP 2 — ANNOTATE WITH SELF-VERIFICATION (mandatory — iterate until accurate):" +
      "\nYou must write and run a Bun script at /tmp/annotate.ts using canvas from /home/relay/app/services/relay/node_modules/canvas/index.js." +
      "\nThe script must:" +
      "\n  a) Load the image from the path above" +
      "\n  b) For each defect found, draw a red rectangle (lineWidth=4) and a red label above it (font: bold 28px sans-serif, white text on red background)" +
      "\n  c) Save the result as JPEG to /files/defect-annotated.jpg" +
      "\nAfter running the script, you MUST use the Read tool to open /files/defect-annotated.jpg and visually verify:" +
      "\n  - Is the red bounding box correctly placed over the defect?" +
      "\nIf the bbox is off or misses the defect, adjust the x/y/w/h coordinates and re-run. Repeat up to 3 times until the annotation is visually accurate." +
      "\nOnly proceed to Step 3 once you are confident the bbox is correctly placed." +
      "\n" +
      "\nSTEP 3 — SEND THE ANNOTATED IMAGE:" +
      "\nRun: bash /home/relay/app/actions/send_file_to_telegram.sh /files/defect-annotated.jpg" +
      "\n" +
      "\nSTEP 4 — TEXT REPLY:" +
      "\nReply plain text only: list each defect with location, then Grade A/B/C/D + one sentence reason." +
      "\nGrading: A=like new, B=one or more light scratches, C=heavy/deep or multiple scratches, D=at least one crack."
    );
    parts.push(`\nUser: [Image: ${imgPath}]\n\nRun the defect detection task above.`);
  } else {
    parts.push(`\nUser: ${userMessage}`);
  }

  return parts.join("\n");
}

async function sendResponse(ctx: Context, response: string, thinkingMsgId?: number, replyToMessageId?: number): Promise<void> {
  // Delete the "Thinking…" placeholder before sending the real reply
  if (thinkingMsgId) {
    await ctx.api.deleteMessage(ctx.chat!.id, thinkingMsgId).catch(() => {});
  }

  // If more messages are queued, reply to the original message so the user knows which response is which
  const replyOpts = (pendingCount > 0 && replyToMessageId)
    ? { reply_parameters: { message_id: replyToMessageId } }
    : undefined;

  // Telegram has a 4096 character limit
  const MAX_LENGTH = 4000;

  if (response.length <= MAX_LENGTH) {
    await ctx.reply(response, replyOpts);
    return;
  }

  // Split long responses
  const chunks = [];
  let remaining = response;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a natural boundary
    let splitIndex = remaining.lastIndexOf("\n\n", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf(" ", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = MAX_LENGTH;

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  for (const chunk of chunks) {
    await ctx.reply(chunk, replyOpts);
  }
}

// ============================================================
// STARTUP STATUS CHECK
// ============================================================

async function checkStartupStatus(): Promise<string> {
  const lines: string[] = ["Bot started successfully! 🤖"];
  // Only show dashboard URL if tunneling is enabled
  try {
    const tunnelRows = await sql`SELECT value FROM settings WHERE key = 'TUNNEL_ENABLED'`;
    const tunnelEnabled = tunnelRows[0]?.value === "true";
    if (tunnelEnabled) {
      // Try to get the live ngrok URL
      try {
        const res = await fetch("http://localhost:4040/api/tunnels");
        const data = (await res.json()) as { tunnels?: Array<{ proto: string; public_url: string }> };
        const ngrokUrl = data.tunnels?.find((t) => t.proto === "https")?.public_url;
        if (ngrokUrl) lines.push(`Dashboard: ${ngrokUrl}`);
      } catch {
        // ngrok not ready yet, skip URL
      }
    }
  } catch {
    if (process.env.WEB_HOST) lines.push(`Dashboard: ${process.env.WEB_HOST}`);
  }

  lines.push("");
  lines.push("You can always use");
  lines.push("/help for available commands");

  return lines.join("\n");
}

// ============================================================
// INTERNAL HTTP API — used by web dashboard chat
// Not exposed publicly; only reachable inside the Docker network.
// ============================================================

// @ts-ignore — Bun global is available at runtime
Bun.serve({
  port: 8080,
  async fetch(req: Request) {
    const url = new URL(req.url);

    // Graceful restart — Docker will bring the container back up automatically
    if (req.method === "POST" && url.pathname === "/restart") {
      if (isActive) {
        // Defer restart until the current message finishes processing,
        // so the queue item gets marked done/failed before we exit.
        pendingRestart = true;
      } else {
        setTimeout(() => process.exit(0), 300);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Processing state — used by dashboard floating indicator
    if (req.method === "GET" && url.pathname === "/status") {
      return new Response(JSON.stringify({ active: isActive, queue: pendingCount }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // MCP server test — spawns the server, JSON-RPC tools/list, returns results
    if (req.method === "POST" && url.pathname === "/mcp-test") {
      try {
        const { id } = (await req.json()) as { id?: string | number };
        const rows = await sql`SELECT * FROM mcp_servers WHERE id = ${id}`;
        const srv = rows[0];
        if (!srv) return new Response(JSON.stringify({ error: "Server not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        let tools: unknown[] = [];
        let testError: string | null = null;

        if (srv.type === "sse") {
          // MCP streamable HTTP transport:
          // 1. POST initialize → server returns Mcp-Session-Id header
          // 2. POST tools/list with that session ID → server returns tool list
          try {
            const initRes = await fetch(srv.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "relay-test", version: "1.0" } } }),
              signal: AbortSignal.timeout(5000),
            });
            if (!initRes.ok) throw new Error(`HTTP ${initRes.status}`);
            const sessionId = initRes.headers.get("mcp-session-id");
            const listHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
            if (sessionId) listHeaders["mcp-session-id"] = sessionId;
            const r2 = await fetch(srv.url, {
              method: "POST",
              headers: listHeaders,
              body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
              signal: AbortSignal.timeout(8000),
            });
            if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
            const text = await r2.text();
            for (const line of text.split("\n")) {
              const s = line.startsWith("data: ") ? line.slice(6) : line;
              try {
                const msg = JSON.parse(s.trim());
                if (msg.result?.tools) { tools = msg.result.tools; break; }
              } catch {}
            }
          } catch (e: any) {
            testError = e.message;
          }
        } else {
          // stdio: spawn, send JSON-RPC initialize + tools/list, read response
          try {
            const serverEnv = (srv.env && typeof srv.env === "object") ? srv.env as Record<string,string> : {};
            const serverArgs = Array.isArray(srv.args) ? srv.args as string[] : [];
            const proc = spawn([srv.command, ...serverArgs], {
              stdin: "pipe", stdout: "pipe", stderr: "pipe",
              env: { ...process.env, ...serverEnv },
            });

            const initMsg = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "relay", version: "1.0" } } }) + "\n";
            const notifyMsg = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
            const listMsg   = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n";

            // @ts-ignore
            const writer = proc.stdin.getWriter();
            await writer.write(new TextEncoder().encode(initMsg + notifyMsg + listMsg));
            await writer.close();

            const stdout = await Promise.race([
              new Response(proc.stdout).text(),
              new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
            ]) as string;

            proc.kill();

            for (const line of stdout.split("\n").filter(Boolean)) {
              try {
                const msg = JSON.parse(line);
                if (msg.id === 2 && msg.result?.tools) { tools = msg.result.tools; break; }
              } catch {}
            }
          } catch (e: any) {
            testError = e.message;
          }
        }

        return new Response(JSON.stringify(testError ? { error: testError } : { tools }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Welcome voice — send TTS audio to the authorized user via bot
    if (req.method === "POST" && url.pathname === "/welcome-voice") {
      try {
        const { text } = (await req.json()) as { text?: string };
        if (!text?.trim() || !ALLOWED_USER_ID) {
          return new Response(JSON.stringify({ ok: false, error: "text or user_id missing" }), { headers: { "Content-Type": "application/json" } });
        }
        const voicePath = join(TEMP_DIR, `welcome_${Date.now()}.ogg`);
        const ok = await textToSpeech(text.slice(0, 1000), voicePath);
        if (ok) {
          await bot.api.sendVoice(ALLOWED_USER_ID, new InputFile(voicePath));
          await unlink(voicePath).catch(() => {});
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: false, error: "TTS not configured or failed" }), { headers: { "Content-Type": "application/json" } });
      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (req.method !== "POST" || url.pathname !== "/chat") {
      return new Response("Not Found", { status: 404 });
    }
    try {
      const { message } = (await req.json()) as { message?: string };
      if (!message?.trim()) {
        return new Response(JSON.stringify({ error: "message required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Enqueue and return immediately — response arrives via polling
      enqueue(async () => {
        try {
          const [relevantContext, memoryContext, recentHistory] = await Promise.all([
            getRelevantContext(message),
            getMemoryContext(),
            getRecentHistory(),
          ]);

          await saveMessage("user", message, "web");

          const enrichedPrompt = buildPrompt(message, relevantContext, memoryContext, recentHistory);
          const rawResponse = await callClaude(enrichedPrompt, { resume: true });

          const afterMemory = await processMemoryIntents(rawResponse);
          const afterSchedule = await processScheduleIntents(afterMemory);
          const { clean } = parseAskIntent(afterSchedule);
          const reply = clean || rawResponse;

          await saveMessage("assistant", reply, "web");
        } catch (err: any) {
          console.error("[http] Chat error:", err);
        }
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.error("[http] Chat error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});

console.log("[http] Internal chat API listening on :8080");

// ============================================================
// SCHEDULER — run every minute inside Docker
// ============================================================

async function runScheduler(): Promise<void> {
  const proc = spawn(["bun", "run", "src/scheduler.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (out.trim()) console.log(out.trim());
  if (err.trim()) console.error("[scheduler]", err.trim());
}

// Run once on startup (catch overdue tasks), then every 60 seconds
runScheduler().catch(console.error);
setInterval(() => runScheduler().catch(console.error), 60_000);

// ============================================================
// START
// ============================================================

console.log("Starting Claude Flux...");
console.log(`Authorized user: ${ALLOWED_USER_ID || "ANY (not recommended)"}`);
console.log(`Project directory: ${PROJECT_DIR || "(relay working directory)"}`);

bot.start({
  drop_pending_updates: true,
  onStart: async () => {
    console.log("Bot is running!");
    // Register commands in Telegram menu
    await bot.api.setMyCommands(BOT_COMMANDS).catch(() => {});
    // Replay any messages that were queued before the last restart
    recoverPendingMessages().catch((e) => console.error("[queue] Recovery error:", e));
    if (ALLOWED_USER_ID) {
      // Delay 3s to let ngrok register its URL before we send the dashboard link
      setTimeout(async () => {
        try {
          const status = await checkStartupStatus();
          await bot.api.sendMessage(ALLOWED_USER_ID, status);
        } catch (err) {
          console.error("Startup message failed:", err);
        }
      }, 3_000);
    }
  },
});
