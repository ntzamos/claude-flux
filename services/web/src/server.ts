/**
 * Claude Flux — Web Dashboard
 *
 * Routes:
 *   GET  /                       → redirect based on onboarding state
 *   GET  /onboarding             → setup wizard
 *   GET  /dashboard              → main dashboard (?tab=status|tasks|chat|memory|settings)
 *   POST /api/onboarding-step    → save onboarding step fields → redirect to next step
 *   POST /api/settings           → upsert all settings → restart relay → redirect
 *   GET  /api/status             → JSON health status
 *   GET  /api/tasks              → JSON scheduled tasks
 *   POST /api/tasks              → create task
 *   POST /api/tasks/:id/status   → update task status
 *   POST /api/tasks/:id/delete   → delete task
 *   GET  /api/messages           → JSON messages (paginated)
 *   GET  /api/memory             → JSON memory items
 *   POST /api/memory             → create memory item
 *   POST /api/memory/:id/edit    → update memory item
 *   POST /api/memory/:id/delete  → delete memory item
 *   POST /api/chat               → proxy to relay internal chat API
 *   GET  /files/:name            → serve a generated file
 *   POST /api/files/:name/delete → delete a generated file
 *   GET  /health                 → 200 ok
 */

import { unlink } from "fs/promises";
import { spawn } from "bun";
import { sql, isOnboarded, getSettings, embedContent } from "./db.ts";
import { renderOnboarding } from "./pages/onboarding.ts";
import { renderDashboard } from "./pages/dashboard.ts";
import { renderLoginPage } from "./pages/login.ts";
import {
  isAuthenticated, requireAuth, createSession, clearSession,
  sendOtpViaTelegram, generateOtp, setOtp, clearOtp, getSessionToken,
  otpState, OTP_COOLDOWN,
} from "./auth.ts";

// ── Tunnel startup ────────────────────────────────────────────
// Starts ngrok if the user has configured an auth token and public networking is enabled.
// Retries settings load in case migrations haven't run yet on first boot.
async function startTunnel(): Promise<void> {
  // Retry getSettings up to 10×3s = 30s to handle first-boot race with relay migrations
  let settings: Record<string, string> = {};
  for (let i = 0; i < 10; i++) {
    try {
      settings = await getSettings();
      break;
    } catch {
      if (i === 9) {
        console.error("[tunnel] Could not read settings after 30s — skipping tunnel.");
        return;
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  if (settings.TUNNEL_ENABLED === "false") {
    console.log("[tunnel] Disabled via settings.");
    return;
  }

  const token = settings.NGROK_AUTH_TOKEN?.trim();
  if (!token) {
    console.log("[tunnel] No ngrok auth token configured — public networking disabled.");
    return;
  }

  try {
    await spawn(["ngrok", "config", "add-authtoken", token], { stdout: "pipe", stderr: "pipe" }).exited;
    const domain = settings.NGROK_DOMAIN?.trim();
    const args = ["ngrok", "http", "localhost:3000", "--log=stdout"];
    if (domain) args.splice(2, 0, `--url=${domain}`);
    spawn(args, { stdout: "pipe", stderr: "pipe" });
    console.log(`[tunnel] ngrok starting → localhost:3000${domain ? ` (${domain})` : ""}`);
  } catch (err) {
    console.error("[tunnel] ngrok failed:", err);
  }
}

startTunnel().catch(err => console.error("[tunnel] startTunnel error:", err));

async function sendWelcomeMessage(): Promise<void> {
  try {
    const settings = await getSettings();
    const token = settings.TELEGRAM_BOT_TOKEN?.trim();
    const userId = settings.TELEGRAM_USER_ID?.trim();
    if (!token || !userId) return;

    const text = [
      "✅ *Your bot is set up and ready\\!*",
      "",
      "Just send me any message and I'll respond using Claude\\.",
      "",
      "*What I can do:*",
      "• Answer questions and help with tasks",
      "• Remember things you tell me",
      "• Transcribe voice messages",
      "• Run scheduled tasks on your behalf",
      "• Generate files \\(PDFs, CSVs, etc\\.\\)",
      "",
      "*Tips:*",
      "• Send a voice message to try transcription",
      "• Tell me facts about yourself — I'll remember them",
      "• Ask me to remind you of something at a specific time",
      "",
      `📊 /help`,
    ].join("\n");

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: userId, text, parse_mode: "MarkdownV2" }),
    });

    // Send a welcome voice note if ElevenLabs is configured
    if (settings.ELEVENLABS_API_KEY) {
      fetch("http://localhost:8080/welcome-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Your bot is set up and ready! Just send me any message and I'll respond using Claude. I can transcribe your voice messages, remember things you tell me, and run scheduled tasks on your behalf.",
        }),
        signal: AbortSignal.timeout(25000),
      }).catch(() => {});
    }
  } catch {
    // Non-critical — don't block the redirect
  }
}

function redirect(to: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: to } });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function resolveNgrokUrl(settings: Record<string, string>): Promise<string> {
  // 1. Fixed custom domain — no API call needed
  if (settings.NGROK_DOMAIN?.trim()) {
    const domain = settings.NGROK_DOMAIN.trim().replace(/^https?:\/\//, "");
    return `https://${domain}`;
  }
  // 2. ngrok agent running inside the relay container (relay:4040)
  try {
    const res = await fetch("http://localhost:4040/api/tunnels", {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json() as any;
      const tunnel = (data.tunnels as any[])?.find((t: any) => t.proto === "https");
      if (tunnel?.public_url) return tunnel.public_url;
    }
  } catch {}
  return "";
}

let _webHostCache: { url: string; ts: number } | null = null;
const WEB_HOST_TTL = 2 * 60 * 1000; // re-resolve at most every 2 min

function saveWebHost(req: Request): void {
  if (_webHostCache && Date.now() - _webHostCache.ts < WEB_HOST_TTL) return;
  resolveAndSaveWebHost(req).catch(() => {});
}

async function resolveAndSaveWebHost(req: Request): Promise<void> {
  const settings = await getSettings();
  let webHost = await resolveNgrokUrl(settings);

  if (!webHost) {
    // Only treat as public if accessed through a real tunnel (x-forwarded-proto = https)
    const host = req.headers.get("host");
    const scheme = req.headers.get("x-forwarded-proto") || "http";
    if (host && scheme === "https") {
      webHost = `https://${host}`;
    }
  }

  // Never overwrite a tunnel URL with a local http:// address
  if (!webHost?.startsWith("https://")) return;

  _webHostCache = { url: webHost, ts: Date.now() };
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('WEB_HOST', ${webHost}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

async function upsertSettings(form: FormData): Promise<{ error?: string }> {
  try {
    for (const [key, value] of form.entries()) {
      if (typeof value === "string" && !key.startsWith("_")) {
        await sql`
          INSERT INTO settings (key, value, updated_at)
          VALUES (${key}, ${value}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }
    }
    return {};
  } catch (err: any) {
    return { error: err.message };
  }
}

async function restartRelay(): Promise<void> {
  try {
    await fetch("http://localhost:8080/restart", { method: "POST" });
  } catch {
    // Relay may have already exited — that's fine
  }
}

const server = Bun.serve({
  port: parseInt(process.env.PORT || "80"),

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // ── Health ──────────────────────────────────────────────
    if (pathname === "/health") {
      return new Response("ok");
    }

    // ── Landing page ─────────────────────────────────────────
    if (pathname === "/landing") {
      // @ts-ignore
      const file = Bun.file("/app/docs/index.html");
      return new Response(file, { headers: { "Content-Type": "text/html" } });
    }

    // ── Static fonts ─────────────────────────────────────────
    if (pathname.startsWith("/fonts/")) {
      const name = pathname.slice(7).replace(/[^a-zA-Z0-9._-]/g, "");
      // @ts-ignore
      const file = Bun.file(`/app/public/fonts/${name}`);
      // @ts-ignore
      if (!await file.exists()) return new Response("Not found", { status: 404 });
      return new Response(file, {
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }

    // ── Root: redirect based on setup state ─────────────────
    if (pathname === "/") {
      saveWebHost(req);
      try {
        const onboarded = await isOnboarded();
        if (!onboarded) return redirect("/onboarding");
        if (!isAuthenticated(req)) return redirect("/login");
        return redirect("/dashboard");
      } catch {
        return redirect("/onboarding");
      }
    }

    // ── Login page ───────────────────────────────────────────
    if (pathname === "/login" && req.method === "GET") {
      if (isAuthenticated(req)) return redirect("/dashboard");
      const sent  = url.searchParams.get("sent") === "1";
      const error = url.searchParams.get("error") ?? undefined;
      let cooldownSecs: number | undefined;
      if (otpState) {
        const rem = Math.ceil((otpState.sentAt + OTP_COOLDOWN - Date.now()) / 1000);
        if (rem > 0) cooldownSecs = rem;
      }
      return html(renderLoginPage({ sent, error, cooldownSecs }));
    }

    // ── Request OTP ──────────────────────────────────────────
    if (pathname === "/api/auth/request-otp" && req.method === "POST") {
      const onboarded = await isOnboarded().catch(() => false);
      if (!onboarded) return redirect("/onboarding");
      if (otpState && Date.now() - otpState.sentAt < OTP_COOLDOWN) {
        const rem = Math.ceil((otpState.sentAt + OTP_COOLDOWN - Date.now()) / 1000);
        return redirect("/login?sent=1&error=" + encodeURIComponent("Please wait " + rem + "s before requesting a new code."));
      }
      const code = generateOtp();
      setOtp(code);
      const ok = await sendOtpViaTelegram(code).catch(() => false);
      if (!ok) {
        clearOtp();
        return redirect("/login?error=" + encodeURIComponent("Could not send Telegram message. Check bot token and user ID in Settings."));
      }
      return redirect("/login?sent=1");
    }

    // ── Verify OTP ───────────────────────────────────────────
    if (pathname === "/api/auth/verify-otp" && req.method === "POST") {
      const form    = await req.formData();
      const entered = (form.get("otp") as string)?.trim();
      if (!otpState || Date.now() > otpState.expiresAt) {
        clearOtp();
        return redirect("/login?error=" + encodeURIComponent("Code expired. Request a new one."));
      }
      if (entered !== otpState.code) {
        return redirect("/login?sent=1&error=" + encodeURIComponent("Invalid code. Try again."));
      }
      clearOtp();
      const { cookie } = createSession();
      return new Response(null, { status: 302, headers: { Location: "/dashboard", "Set-Cookie": cookie } });
    }

    // ── Logout ───────────────────────────────────────────────
    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const clearCookie = clearSession(req);
      return new Response(null, { status: 302, headers: { Location: "/login", "Set-Cookie": clearCookie } });
    }

    // ── Onboarding wizard ───────────────────────────────────
    if (pathname === "/onboarding" && req.method === "GET") {
      saveWebHost(req);
      const step = url.searchParams.get("step") ?? undefined;
      if (step === "done") {
        sendWelcomeMessage(); // fire-and-forget
        return redirect("/dashboard");
      }
      const toastType = url.searchParams.get("toast");
      const toastMsg  = url.searchParams.get("msg");
      const toast = toastType && toastMsg
        ? { type: toastType as "success" | "error", text: decodeURIComponent(toastMsg) }
        : undefined;
      return html(await renderOnboarding(step, toast));
    }

    // ── Test Telegram connection ─────────────────────────────
    if (pathname === "/api/test-telegram" && req.method === "POST") {
      try {
        const { token, user_id } = await req.json() as { token?: string; user_id?: string };
        if (!token?.trim() || !user_id?.trim()) {
          return json({ ok: false, error: "token and user_id are required" }, 400);
        }
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: user_id, text: "✅ It works! Your bot is connected." }),
        });
        const data = await res.json() as any;
        if (!res.ok) return json({ ok: false, error: data.description || res.statusText });
        return json({ ok: true });
      } catch (err: any) {
        return json({ ok: false, error: err.message }, 500);
      }
    }

    // ── Save onboarding step ─────────────────────────────────
    if (pathname === "/api/onboarding-step" && req.method === "POST") {
      const form = await req.formData();
      const next = form.get("_next") as string ?? "done";
      const { error } = await upsertSettings(form);
      if (error) {
        return redirect(`/onboarding?step=${form.get("_step")}&toast=error&msg=${encodeURIComponent("Save failed: " + error)}`);
      }
      return redirect(`/onboarding?step=${next}`);
    }

    // ── Auth guard ───────────────────────────────────────────
    {
      const PUBLIC = ["/onboarding", "/api/onboarding-step", "/api/test-telegram"];
      if (!PUBLIC.includes(pathname)) {
        const authResp = await requireAuth(req);
        if (authResp) {
          // Return JSON 401 for API routes so fetch() callers can handle it
          if (pathname.startsWith("/api/")) {
            return json({ error: "session_expired", redirect: "/login" }, 401);
          }
          return authResp;
        }
      }
    }

    // ── Dashboard ────────────────────────────────────────────
    if (pathname === "/dashboard" && req.method === "GET") {
      saveWebHost(req);
      const tab      = url.searchParams.get("tab") || "status";
      const page     = parseInt(url.searchParams.get("page") ?? "1", 10);
      const filePath = url.searchParams.get("path") ?? "";
      const listId   = url.searchParams.get("lid") ?? undefined;
      const toastType = url.searchParams.get("toast");
      const toastMsg  = url.searchParams.get("msg");
      const toast = toastType && toastMsg
        ? { type: toastType as "success" | "error", text: decodeURIComponent(toastMsg) }
        : undefined;
      return html(await renderDashboard(tab, page, toast, filePath, listId));
    }

    // ── Save theme (no relay restart needed) ─────────────────
    if (pathname === "/api/theme" && req.method === "POST") {
      const form = await req.formData();
      const { error } = await upsertSettings(form);
      if (error) {
        return redirect(`/dashboard?tab=settings&toast=error&msg=${encodeURIComponent("Theme save failed: " + error)}`);
      }
      return redirect(`/dashboard?tab=settings&toast=success&msg=${encodeURIComponent("Theme applied.")}`);
    }

    // ── Save settings → restart relay ────────────────────────
    if (pathname === "/api/settings" && req.method === "POST") {
      const form = await req.formData();
      const { error } = await upsertSettings(form);
      if (error) {
        return redirect(`/dashboard?tab=settings&toast=error&msg=${encodeURIComponent("Save failed: " + error)}`);
      }
      restartRelay(); // fire-and-forget
      return redirect(`/dashboard?tab=settings&toast=success&msg=${encodeURIComponent("Settings saved — relay is restarting.")}`);
    }

    // ── JSON APIs ────────────────────────────────────────────

    if (pathname === "/api/status") {
      try {
        const [msgResult, taskResult, memResult] = await Promise.all([
          sql`SELECT COUNT(*)::int AS count FROM messages`,
          sql`SELECT COUNT(*)::int AS count FROM scheduled_tasks WHERE status = 'active'`,
          sql`SELECT COUNT(*)::int AS count FROM memory`,
        ]);
        return json({
          messages: msgResult[0].count,
          activeTasks: taskResult[0].count,
          memoryItems: memResult[0].count,
        });
      } catch (err: any) {
        return json({ error: err.message }, 500);
      }
    }

    // ── Relay processing state ───────────────────────────────
    if (pathname === "/api/relay-status" && req.method === "GET") {
      try {
        const res = await fetch("http://localhost:8080/status", { signal: AbortSignal.timeout(1000) });
        const data = await res.json();
        return json(data);
      } catch {
        return json({ active: false, queue: 0 });
      }
    }

    // ── Tasks ────────────────────────────────────────────────

    if (pathname === "/api/tasks" && req.method === "GET") {
      try {
        const data = await sql`SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC LIMIT 100`;
        return json(data);
      } catch (err: any) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/api/tasks" && req.method === "POST") {
      const form = await req.formData();
      const description     = (form.get("description") as string)?.trim();
      const schedule_type   = (form.get("schedule_type") as string) || "once";
      const when            = (form.get("when") as string)?.trim();
      const interval_minutes = parseInt(form.get("interval_minutes") as string || "0", 10);
      const action_prompt   = (form.get("action_prompt") as string)?.trim();
      if (!description || !action_prompt) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent("Description and action are required.")}`);
      }
      const next_run_at = when || new Date().toISOString();
      try {
        await sql`
          INSERT INTO scheduled_tasks (description, schedule_type, next_run_at, interval_minutes, action_prompt, status)
          VALUES (${description}, ${schedule_type}, ${next_run_at}, ${interval_minutes || null}, ${action_prompt}, 'active')
        `;
        return redirect(`/dashboard?tab=tasks&toast=success&msg=${encodeURIComponent("Task created.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const taskStatusMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
    if (taskStatusMatch && req.method === "POST") {
      const id = taskStatusMatch[1];
      const form = await req.formData();
      const status = form.get("status") as string;
      try {
        await sql`UPDATE scheduled_tasks SET status = ${status} WHERE id = ${id}`;
        return redirect(`/dashboard?tab=tasks&toast=success&msg=${encodeURIComponent("Task updated.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const taskRunMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/);
    if (taskRunMatch && req.method === "POST") {
      const id = taskRunMatch[1];
      try {
        await sql`UPDATE scheduled_tasks SET next_run_at = NOW() WHERE id = ${id} AND status = 'active'`;
        return redirect(`/dashboard?tab=tasks&toast=success&msg=${encodeURIComponent("Task queued to run now.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const taskDeleteMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/delete$/);
    if (taskDeleteMatch && req.method === "POST") {
      const id = taskDeleteMatch[1];
      try {
        await sql`DELETE FROM scheduled_tasks WHERE id = ${id}`;
        return redirect(`/dashboard?tab=tasks&toast=success&msg=${encodeURIComponent("Task deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const taskEditMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/edit$/);
    if (taskEditMatch && req.method === "POST") {
      const id = taskEditMatch[1];
      const form = await req.formData();
      const description      = (form.get("description") as string)?.trim();
      const schedule_type    = (form.get("schedule_type") as string) || "once";
      const when             = (form.get("when") as string)?.trim();
      const interval_minutes = parseInt(form.get("interval_minutes") as string || "0", 10);
      const action_prompt    = (form.get("action_prompt") as string)?.trim();
      if (!description || !action_prompt) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent("Description and action are required.")}`);
      }
      try {
        await sql`
          UPDATE scheduled_tasks SET
            description = ${description},
            schedule_type = ${schedule_type},
            next_run_at = COALESCE(${when || null}::timestamptz, next_run_at),
            interval_minutes = ${interval_minutes || null},
            action_prompt = ${action_prompt}
          WHERE id = ${id}
        `;
        return redirect(`/dashboard?tab=tasks&toast=success&msg=${encodeURIComponent("Task updated.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=tasks&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // ── Messages ─────────────────────────────────────────────

    if (pathname === "/api/messages") {
      const page = parseInt(url.searchParams.get("page") ?? "1", 10);
      const since = url.searchParams.get("since");
      const size = 50;
      const offset = (page - 1) * size;
      try {
        if (since !== null) {
          const sinceDate = new Date(since);
          const data = await sql`
            SELECT id, created_at, role, content, channel
            FROM messages
            WHERE created_at > ${sinceDate}
            ORDER BY created_at ASC
            LIMIT 100
          `;
          return json({ data, total: data.length, page: 1 });
        }
        const [data, countResult] = await Promise.all([
          sql`
            SELECT id, created_at, role, content, channel
            FROM messages
            ORDER BY created_at DESC
            LIMIT ${size} OFFSET ${offset}
          `,
          sql`SELECT COUNT(*)::int AS count FROM messages`,
        ]);
        return json({ data, total: countResult[0].count, page });
      } catch (err: any) {
        return json({ error: err.message }, 500);
      }
    }

    // ── Memory ────────────────────────────────────────────────

    if (pathname === "/api/memory" && req.method === "GET") {
      try {
        const data = await sql`
          SELECT id, type, content, deadline, priority, created_at
          FROM memory
          ORDER BY created_at DESC
          LIMIT 200
        `;
        return json(data);
      } catch (err: any) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/api/memory" && req.method === "POST") {
      const form = await req.formData();
      const type     = (form.get("type") as string) || "fact";
      const content  = (form.get("content") as string)?.trim();
      const deadline = (form.get("deadline") as string)?.trim() || null;
      const priority = (form.get("priority") as string)?.trim() || null;
      if (!content) {
        return redirect(`/dashboard?tab=memory&toast=error&msg=${encodeURIComponent("Content is required.")}`);
      }
      try {
        const [row] = await sql`
          INSERT INTO memory (type, content, deadline, priority)
          VALUES (${type}, ${content}, ${deadline}, ${priority})
          RETURNING id
        `;
        embedContent("memory", row.id, content).catch(() => {});
        return redirect(`/dashboard?tab=memory&toast=success&msg=${encodeURIComponent("Memory added.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=memory&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const memEditMatch = pathname.match(/^\/api\/memory\/([^/]+)\/edit$/);
    if (memEditMatch && req.method === "POST") {
      const id = memEditMatch[1];
      const form = await req.formData();
      const type     = form.get("type") as string;
      const content  = (form.get("content") as string)?.trim();
      const deadline = (form.get("deadline") as string)?.trim() || null;
      const priority = (form.get("priority") as string)?.trim() || null;
      try {
        await sql`
          UPDATE memory SET type = ${type}, content = ${content}, deadline = ${deadline}, priority = ${priority}
          WHERE id = ${id}
        `;
        embedContent("memory", id, content).catch(() => {});
        return redirect(`/dashboard?tab=memory&toast=success&msg=${encodeURIComponent("Memory updated.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=memory&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const memDeleteMatch = pathname.match(/^\/api\/memory\/([^/]+)\/delete$/);
    if (memDeleteMatch && req.method === "POST") {
      const id = memDeleteMatch[1];
      try {
        await sql`DELETE FROM memory WHERE id = ${id}`;
        return redirect(`/dashboard?tab=memory&toast=success&msg=${encodeURIComponent("Memory deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=memory&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // ── Files ─────────────────────────────────────────────────

    // Serve a generated file (supports subdirectories)
    if (pathname.startsWith("/files/") && req.method === "GET") {
      const rawPath = pathname.slice("/files/".length);
      const parts   = rawPath.split("/").map(p => decodeURIComponent(p));
      if (parts.some(p => p === ".." || p === "")) {
        return new Response("Forbidden", { status: 403 });
      }
      const filePath = parts.join("/");
      try {
        // @ts-ignore — Bun.file is available at runtime
        const file = Bun.file(`/files/${filePath}`);
        // @ts-ignore
        if (!await file.exists()) return new Response("Not found", { status: 404 });
        const basename = parts[parts.length - 1];
        const disposition = req.headers.get("purpose") === "download"
          ? `attachment; filename="${basename}"`
          : `inline; filename="${basename}"`;
        return new Response(file, { headers: { "Content-Disposition": disposition } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // Delete a file (form field: path, parentPath)
    if (pathname === "/api/files/delete" && req.method === "POST") {
      const form = await req.formData();
      const rawPath    = (form.get("path") as string) ?? "";
      const parentPath = (form.get("parentPath") as string) ?? "";
      const parts = rawPath.split("/").filter(Boolean);
      if (parts.some(p => p === "..") || parts.length === 0) {
        return redirect(`/dashboard?tab=files&path=${encodeURIComponent(parentPath)}&toast=error&msg=${encodeURIComponent("Invalid path.")}`);
      }
      try {
        await unlink(`/files/${parts.join("/")}`);
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=success&msg=${encodeURIComponent("File deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // Create a folder (form field: name, parentPath)
    if (pathname === "/api/files/mkdir" && req.method === "POST") {
      const form = await req.formData();
      const name       = ((form.get("name") as string) ?? "").trim();
      const parentPath = (form.get("parentPath") as string) ?? "";
      const parentParts = parentPath.split("/").filter(Boolean);
      if (!name || name.includes("/") || name.includes("..") || name === ".") {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent("Invalid folder name.")}`);
      }
      if (parentParts.some(p => p === "..")) {
        return redirect(`/dashboard?tab=files&toast=error&msg=${encodeURIComponent("Invalid path.")}`);
      }
      const { mkdir: mkdirFn } = await import("fs/promises");
      const fullPath = parentParts.length > 0
        ? `/files/${parentParts.join("/")}/${name}`
        : `/files/${name}`;
      try {
        await mkdirFn(fullPath, { recursive: true });
        const newPath = parentParts.length > 0 ? `${parentParts.join("/")}/${name}` : name;
        return redirect(`/dashboard?tab=files&path=${encodeURIComponent(newPath)}&toast=success&msg=${encodeURIComponent("Folder created.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // Delete a folder recursively (form field: path, parentPath)
    if (pathname === "/api/files/rmdir" && req.method === "POST") {
      const form = await req.formData();
      const rawPath    = (form.get("path") as string) ?? "";
      const parentPath = (form.get("parentPath") as string) ?? "";
      const parts = rawPath.split("/").filter(Boolean);
      if (parts.some(p => p === "..") || parts.length === 0) {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent("Invalid path.")}`);
      }
      const { rm: rmFn } = await import("fs/promises");
      try {
        await rmFn(`/files/${parts.join("/")}`, { recursive: true, force: true });
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=success&msg=${encodeURIComponent("Folder deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // Rename a file or folder (form fields: oldPath, newName, parentPath)
    if (pathname === "/api/files/rename" && req.method === "POST") {
      const form = await req.formData();
      const oldPath    = (form.get("oldPath") as string) ?? "";
      const newName    = ((form.get("newName") as string) ?? "").trim();
      const parentPath = (form.get("parentPath") as string) ?? "";
      const oldParts   = oldPath.split("/").filter(Boolean);
      if (oldParts.some(p => p === "..") || oldParts.length === 0) {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent("Invalid path.")}`);
      }
      if (!newName || newName.includes("/") || newName.includes("..") || newName === ".") {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent("Invalid name.")}`);
      }
      const { rename: renameFn } = await import("fs/promises");
      const dir     = oldParts.slice(0, -1).join("/");
      const newPath = dir ? `${dir}/${newName}` : newName;
      try {
        await renameFn(`/files/${oldParts.join("/")}`, `/files/${newPath}`);
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=success&msg=${encodeURIComponent("Renamed successfully.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // Move a file or folder (JSON body: sourcePath, destFolder)
    if (pathname === "/api/files/move" && req.method === "POST") {
      let body: any;
      try { body = await req.json(); } catch { body = {}; }
      const sourcePath = (body.sourcePath ?? "") as string;
      const destFolder = (body.destFolder ?? "") as string;
      const srcParts   = sourcePath.split("/").filter(Boolean);
      const dstParts   = destFolder.split("/").filter(Boolean);
      if (srcParts.some(p => p === "..") || srcParts.length === 0) {
        return new Response(JSON.stringify({ error: "Invalid source path." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      if (dstParts.some(p => p === "..")) {
        return new Response(JSON.stringify({ error: "Invalid destination." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const name     = srcParts.at(-1)!;
      const destPath = dstParts.length > 0 ? `${dstParts.join("/")}/${name}` : name;
      if (srcParts.join("/") === destPath) {
        return new Response(JSON.stringify({ error: "Already in that location." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      if (destPath.startsWith(srcParts.join("/") + "/")) {
        return new Response(JSON.stringify({ error: "Cannot move a folder into itself." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      try {
        const { rename: renameFn } = await import("fs/promises");
        await renameFn(`/files/${srcParts.join("/")}`, `/files/${destPath}`);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Legacy single-file delete route (kept for compatibility)
    const fileDeleteMatch = pathname.match(/^\/api\/files\/([^/]+)\/delete$/);
    if (fileDeleteMatch && req.method === "POST") {
      const name = decodeURIComponent(fileDeleteMatch[1]);
      if (name.includes("..") || name.includes("/")) {
        return redirect(`/dashboard?tab=files&toast=error&msg=${encodeURIComponent("Invalid filename.")}`);
      }
      try {
        await unlink(`/files/${name}`);
        return redirect(`/dashboard?tab=files&toast=success&msg=${encodeURIComponent("File deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=files&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // ── Danger zone — bulk clear actions ─────────────────────

    if (pathname === "/api/clear/messages" && req.method === "POST") {
      try {
        await sql`DELETE FROM messages`;
        return redirect(`/dashboard?tab=settings&toast=success&msg=${encodeURIComponent("All chat messages deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=settings&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    if (pathname === "/api/clear/tasks" && req.method === "POST") {
      try {
        await sql`DELETE FROM scheduled_tasks`;
        return redirect(`/dashboard?tab=settings&toast=success&msg=${encodeURIComponent("All tasks deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=settings&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    if (pathname === "/api/clear/memory" && req.method === "POST") {
      try {
        await sql`DELETE FROM memory`;
        return redirect(`/dashboard?tab=settings&toast=success&msg=${encodeURIComponent("All memory deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=settings&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    if (pathname === "/api/clear/files" && req.method === "POST") {
      try {
        const { readdir: rd } = await import("fs/promises");
        const files = await rd("/files").catch(() => [] as string[]);
        await Promise.all(
          (files as string[])
            .filter(f => !f.startsWith("."))
            .map(f => unlink(`/files/${f}`).catch(() => {}))
        );
        return redirect(`/dashboard?tab=settings&toast=success&msg=${encodeURIComponent("All files deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=settings&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // ── MCP Servers ───────────────────────────────────────────

    if (pathname === "/api/mcp" && req.method === "POST") {
      const form = await req.formData();
      const name    = (form.get("name") as string)?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const type    = (form.get("type") as string) || "stdio";
      const command = (form.get("command") as string)?.trim() || null;
      const url     = (form.get("url") as string)?.trim() || null;
      const args    = JSON.parse((form.get("args_json") as string) || "[]");
      const env     = JSON.parse((form.get("env_json")  as string) || "{}");
      if (!name) return redirect(`/dashboard?tab=mcp&toast=error&msg=${encodeURIComponent("Name is required.")}`);
      try {
        await sql`INSERT INTO mcp_servers (name, type, command, args, env, url) VALUES (${name}, ${type}, ${command}, ${JSON.stringify(args)}, ${JSON.stringify(env)}, ${url})`;
        restartRelay();
        return redirect(`/dashboard?tab=mcp&toast=success&msg=${encodeURIComponent("MCP server added — relay restarting.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=mcp&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const mcpEditMatch = pathname.match(/^\/api\/mcp\/([^/]+)\/edit$/);
    if (mcpEditMatch && req.method === "POST") {
      const id = mcpEditMatch[1];
      const form = await req.formData();
      const name    = (form.get("name") as string)?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const type    = (form.get("type") as string) || "stdio";
      const command = (form.get("command") as string)?.trim() || null;
      const url     = (form.get("url") as string)?.trim() || null;
      const args    = JSON.parse((form.get("args_json") as string) || "[]");
      const env     = JSON.parse((form.get("env_json")  as string) || "{}");
      const enabled = form.get("enabled") === "true";
      try {
        await sql`UPDATE mcp_servers SET name=${name}, type=${type}, command=${command}, args=${JSON.stringify(args)}, env=${JSON.stringify(env)}, url=${url}, enabled=${enabled} WHERE id=${id}`;
        restartRelay();
        return redirect(`/dashboard?tab=mcp&toast=success&msg=${encodeURIComponent("MCP server updated — relay restarting.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=mcp&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const mcpDeleteMatch = pathname.match(/^\/api\/mcp\/([^/]+)\/delete$/);
    if (mcpDeleteMatch && req.method === "POST") {
      const id = mcpDeleteMatch[1];
      try {
        await sql`DELETE FROM mcp_servers WHERE id=${id}`;
        restartRelay();
        return redirect(`/dashboard?tab=mcp&toast=success&msg=${encodeURIComponent("MCP server deleted — relay restarting.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=mcp&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const mcpTestMatch = pathname.match(/^\/api\/mcp\/([^/]+)\/test$/);
    if (mcpTestMatch && req.method === "POST") {
      const id = mcpTestMatch[1];
      try {
        const res = await fetch(`http://localhost:8080/mcp-test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        return json(data, res.status);
      } catch (err: any) {
        return json({ error: "Relay unavailable: " + err.message }, 502);
      }
    }

    // ── Commands ──────────────────────────────────────────────

    if (pathname === "/api/commands" && req.method === "POST") {
      const form = await req.formData();
      const command      = (form.get("command") as string)?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const description  = (form.get("description") as string)?.trim();
      const action_prompt = (form.get("action_prompt") as string)?.trim();
      if (!command || !description || !action_prompt) {
        return redirect(`/dashboard?tab=commands&toast=error&msg=${encodeURIComponent("All fields are required.")}`);
      }
      try {
        await sql`INSERT INTO telegram_commands (command, description, action_prompt) VALUES (${command}, ${description}, ${action_prompt})`;
        restartRelay();
        return redirect(`/dashboard?tab=commands&toast=success&msg=${encodeURIComponent("Command created — relay restarting.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=commands&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const cmdEditMatch = pathname.match(/^\/api\/commands\/([^/]+)\/edit$/);
    if (cmdEditMatch && req.method === "POST") {
      const id = cmdEditMatch[1];
      const form = await req.formData();
      const command      = (form.get("command") as string)?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const description  = (form.get("description") as string)?.trim();
      const action_prompt = (form.get("action_prompt") as string)?.trim();
      const enabled      = form.get("enabled") === "true";
      try {
        await sql`UPDATE telegram_commands SET command=${command}, description=${description}, action_prompt=${action_prompt}, enabled=${enabled} WHERE id=${id}`;
        restartRelay();
        return redirect(`/dashboard?tab=commands&toast=success&msg=${encodeURIComponent("Command updated — relay restarting.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=commands&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const cmdDeleteMatch = pathname.match(/^\/api\/commands\/([^/]+)\/delete$/);
    if (cmdDeleteMatch && req.method === "POST") {
      const id = cmdDeleteMatch[1];
      try {
        await sql`DELETE FROM telegram_commands WHERE id=${id}`;
        restartRelay();
        return redirect(`/dashboard?tab=commands&toast=success&msg=${encodeURIComponent("Command deleted — relay restarting.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=commands&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // ── Lists ─────────────────────────────────────────────────

    if (pathname === "/api/lists" && req.method === "POST") {
      const form = await req.formData();
      const name        = (form.get("name") as string)?.trim();
      const description = (form.get("description") as string)?.trim() || null;
      if (!name) {
        return redirect(`/dashboard?tab=lists&toast=error&msg=${encodeURIComponent("Name is required.")}`);
      }
      try {
        const [row] = await sql`
          INSERT INTO lists (name, description) VALUES (${name}, ${description}) RETURNING id
        `;
        return redirect(`/dashboard?tab=lists&lid=${row.id}&toast=success&msg=${encodeURIComponent("List created.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const listEditMatch = pathname.match(/^\/api\/lists\/([^/]+)\/edit$/);
    if (listEditMatch && req.method === "POST") {
      const id   = listEditMatch[1];
      const form = await req.formData();
      const name        = (form.get("name") as string)?.trim();
      const description = (form.get("description") as string)?.trim() || null;
      if (!name) {
        return redirect(`/dashboard?tab=lists&lid=${id}&toast=error&msg=${encodeURIComponent("Name is required.")}`);
      }
      try {
        await sql`UPDATE lists SET name=${name}, description=${description}, updated_at=NOW() WHERE id=${id}`;
        return redirect(`/dashboard?tab=lists&lid=${id}&toast=success&msg=${encodeURIComponent("List updated.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists&lid=${id}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const listDeleteMatch = pathname.match(/^\/api\/lists\/([^/]+)\/delete$/);
    if (listDeleteMatch && req.method === "POST") {
      const id = listDeleteMatch[1];
      try {
        await sql`DELETE FROM lists WHERE id=${id}`;
        return redirect(`/dashboard?tab=lists&toast=success&msg=${encodeURIComponent("List deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists&lid=${id}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const listItemsMatch = pathname.match(/^\/api\/lists\/([^/]+)\/items$/);
    if (listItemsMatch && req.method === "POST") {
      const listId = listItemsMatch[1];
      const form   = await req.formData();
      const title       = (form.get("title") as string)?.trim();
      const description = (form.get("description") as string)?.trim() || null;
      const deadline    = (form.get("deadline") as string)?.trim() || null;
      if (!title) {
        return redirect(`/dashboard?tab=lists&lid=${listId}&toast=error&msg=${encodeURIComponent("Title is required.")}`);
      }
      try {
        await sql`
          INSERT INTO list_items (list_id, title, description, deadline)
          VALUES (${listId}, ${title}, ${description}, ${deadline})
        `;
        return redirect(`/dashboard?tab=lists&lid=${listId}&toast=success&msg=${encodeURIComponent("Item added.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists&lid=${listId}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const itemEditMatch = pathname.match(/^\/api\/list-items\/([^/]+)\/edit$/);
    if (itemEditMatch && req.method === "POST") {
      const id   = itemEditMatch[1];
      const form = await req.formData();
      const title       = (form.get("title") as string)?.trim();
      const description = (form.get("description") as string)?.trim() || null;
      const deadline    = (form.get("deadline") as string)?.trim() || null;
      if (!title) {
        return redirect(`/dashboard?tab=lists&toast=error&msg=${encodeURIComponent("Title is required.")}`);
      }
      try {
        const [item] = await sql`
          UPDATE list_items SET title=${title}, description=${description}, deadline=${deadline}, updated_at=NOW()
          WHERE id=${id} RETURNING list_id
        `;
        return redirect(`/dashboard?tab=lists&lid=${item.list_id}&toast=success&msg=${encodeURIComponent("Item updated.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const itemDeleteMatch = pathname.match(/^\/api\/list-items\/([^/]+)\/delete$/);
    if (itemDeleteMatch && req.method === "POST") {
      const id   = itemDeleteMatch[1];
      const form = await req.formData();
      const listId = (form.get("list_id") as string)?.trim();
      try {
        await sql`DELETE FROM list_items WHERE id=${id}`;
        return redirect(`/dashboard?tab=lists${listId ? "&lid=" + listId : ""}&toast=success&msg=${encodeURIComponent("Item deleted.")}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists${listId ? "&lid=" + listId : ""}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    const itemToggleMatch = pathname.match(/^\/api\/list-items\/([^/]+)\/toggle$/);
    if (itemToggleMatch && req.method === "POST") {
      const id   = itemToggleMatch[1];
      const form = await req.formData();
      const listId = (form.get("list_id") as string)?.trim();
      try {
        await sql`
          UPDATE list_items
          SET completed    = NOT completed,
              completed_at = CASE WHEN NOT completed THEN NOW() ELSE NULL END,
              updated_at   = NOW()
          WHERE id = ${id}
        `;
        return redirect(`/dashboard?tab=lists${listId ? "&lid=" + listId : ""}`);
      } catch (err: any) {
        return redirect(`/dashboard?tab=lists${listId ? "&lid=" + listId : ""}&toast=error&msg=${encodeURIComponent(err.message)}`);
      }
    }

    // ── Web chat (proxies to relay internal chat API) ─────────
    if (pathname === "/api/chat" && req.method === "POST") {
      try {
        const body = await req.json() as { message?: string };
        if (!body.message?.trim()) {
          return json({ error: "message required" }, 400);
        }
        const res = await fetch("http://localhost:8080/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: body.message }),
        });
        const data = await res.json();
        return json(data, res.status);
      } catch (err: any) {
        return json({ error: "Relay unavailable: " + err.message }, 502);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Web dashboard → http://localhost:${server.port}`);
