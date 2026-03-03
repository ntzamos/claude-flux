/**
 * Scheduler — runs every minute via launchd (macOS) or cron (Linux).
 *
 * Queries scheduled_tasks for due items, calls Claude for each,
 * sends the result as a Telegram message, then updates the task.
 *
 * Schedule types:
 *   once     — run once at next_run_at, then mark done
 *   interval — run every interval_minutes, advance next_run_at
 *   daily    — run once per day, advance next_run_at by 24 hours
 */

import { sql } from "./db.ts";
import { loadSettings } from "./config.ts";
import { Bot } from "grammy";
import { spawn } from "bun";
import { readFile } from "fs/promises";
import { join, dirname } from "path";

const PROJECT_ROOT = dirname(dirname(import.meta.path));

const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  console.log("DATABASE_URL not configured — skipping scheduler");
  process.exit(0);
}

// Load settings from DB (BOT_TOKEN, USER_ID, etc.)
await loadSettings();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_USER_ID || "";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Europe/Athens";
const USER_NAME = process.env.USER_NAME || "";

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// ============================================================
// HELPERS
// ============================================================

async function sendTelegram(text: string): Promise<void> {
  const MAX = 4000;
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      chunks.push(remaining);
      break;
    }
    let split = remaining.lastIndexOf("\n\n", MAX);
    if (split === -1) split = remaining.lastIndexOf("\n", MAX);
    if (split === -1) split = remaining.lastIndexOf(" ", MAX);
    if (split === -1) split = MAX;
    chunks.push(remaining.substring(0, split));
    remaining = remaining.substring(split).trim();
  }

  for (const chunk of chunks) {
    await bot.api.sendMessage(CHAT_ID, chunk);
  }
}

async function callClaude(prompt: string): Promise<string> {
  try {
    const proc = spawn([CLAUDE_PATH, "-p", prompt, "--output-format", "text", "--dangerously-skip-permissions"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        CLAUDECODE: undefined, // allow nested calls
      },
    });

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error("Claude error:", stderr);
      return "";
    }

    return output.trim();
  } catch (err) {
    console.error("Claude spawn error:", err);
    return "";
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const now = new Date();
  console.log(`[scheduler] ${now.toISOString()} — checking due tasks`);

  // Update bot short description with current time so it's visible in Telegram
  try {
    const timeStr = now.toLocaleString("en-US", {
      timeZone: USER_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    await bot.api.setMyShortDescription(`Online — last seen ${timeStr}`);
  } catch (_) {
    // Non-fatal — don't let status update failures kill the scheduler
  }

  let tasks: any[];
  try {
    tasks = await sql`
      SELECT * FROM scheduled_tasks
      WHERE status = 'active'
      AND next_run_at <= ${now.toISOString()}
    `;
  } catch (err: any) {
    console.error("[scheduler] DB error:", err.message);
    process.exit(1);
  }

  if (!tasks || tasks.length === 0) {
    console.log("[scheduler] No due tasks");
    process.exit(0);
  }

  console.log(`[scheduler] ${tasks.length} task(s) due`);

  // Load profile once for all tasks
  let profileContext = "";
  try {
    profileContext = await readFile(join(PROJECT_ROOT, "config", "profile.md"), "utf-8");
  } catch {}

  for (const task of tasks) {
    console.log(`[scheduler] Running: ${task.description}`);

    const timeStr = now.toLocaleString("en-US", {
      timeZone: USER_TIMEZONE,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const prompt = [
      "You are a personal AI assistant sending a scheduled message via Telegram.",
      "Keep the response concise and conversational. No fluff. No pleasantries.",
      ...(USER_NAME ? [`You are speaking with ${USER_NAME}.`] : []),
      `Current time: ${timeStr}`,
      ...(profileContext ? [`\nProfile:\n${profileContext}`] : []),
      `\nTask: ${task.action_prompt}`,
    ].join("\n");

    const result = await callClaude(prompt);

    if (result) {
      try {
        await sendTelegram(result);
        console.log(`[scheduler] Sent: ${result.substring(0, 80)}...`);
      } catch (err) {
        console.error(`[scheduler] Telegram send failed for task ${task.id}:`, err);
      }
    } else {
      console.error(`[scheduler] No output from Claude for task ${task.id}`);
    }

    // Advance the task
    try {
      if (task.schedule_type === "once") {
        await sql`
          UPDATE scheduled_tasks
          SET run_count = ${task.run_count + 1}, last_run_at = ${now.toISOString()}, status = 'done'
          WHERE id = ${task.id}
        `;
      } else if (task.schedule_type === "interval" && task.interval_minutes) {
        const next = new Date(now.getTime() + task.interval_minutes * 60 * 1000).toISOString();
        await sql`
          UPDATE scheduled_tasks
          SET run_count = ${task.run_count + 1}, last_run_at = ${now.toISOString()}, next_run_at = ${next}
          WHERE id = ${task.id}
        `;
      } else if (task.schedule_type === "daily") {
        const prev = new Date(task.next_run_at);
        const next = new Date(prev.getTime() + 24 * 60 * 60 * 1000).toISOString();
        await sql`
          UPDATE scheduled_tasks
          SET run_count = ${task.run_count + 1}, last_run_at = ${now.toISOString()}, next_run_at = ${next}
          WHERE id = ${task.id}
        `;
      }
    } catch (err: any) {
      console.error(`[scheduler] Update error for ${task.id}:`, err.message);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[scheduler] Fatal:", err);
  process.exit(1);
});
