import { layout } from "../components/layout.ts";
import { renderSettingsForm } from "../components/settings.ts";
import { renderTasks } from "../components/tasks.ts";
import { renderChat } from "../components/chat.ts";
import { renderMemory } from "../components/memory.ts";
import { renderFiles } from "../components/files.ts";
import { renderCommands } from "../components/commands.ts";
import { renderMcp } from "../components/mcp.ts";
import { renderLists } from "../components/lists.ts";
import { renderHue } from "../components/hue.ts";
import { readdir } from "fs/promises";
import { sql, getSettings } from "../db.ts";

async function renderStatus(): Promise<string> {
  const [msgResult, taskResult, memResult, lastMsgResult] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM messages`,
    sql`SELECT COUNT(*)::int AS count FROM scheduled_tasks WHERE status = 'active'`,
    sql`SELECT COUNT(*)::int AS count FROM memory`,
    sql`SELECT created_at FROM messages ORDER BY created_at DESC LIMIT 1`,
  ]);

  const msgCount = msgResult[0]?.count ?? 0;
  const taskCount = taskResult[0]?.count ?? 0;
  const memCount = memResult[0]?.count ?? 0;

  const lastMsgTime = lastMsgResult[0]?.created_at
    ? new Date(lastMsgResult[0].created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "never";

  const settings = await getSettings();
  const hasToken       = !!settings.TELEGRAM_BOT_TOKEN;
  const hasAI          = !!settings.ANTHROPIC_API_KEY;
  const hasName        = !!settings.USER_NAME;
  const hasVoiceReply  = !!settings.ELEVENLABS_API_KEY;
  const hasMemory      = !!settings.OPENAI_API_KEY;
  // Resolve public URL: Railway > ngrok custom domain > ngrok agent
  let tunnelUrl = "";
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    tunnelUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  } else if (settings.NGROK_DOMAIN?.trim()) {
    tunnelUrl = `https://${settings.NGROK_DOMAIN.trim().replace(/^https?:\/\//, "")}`;
  } else {
    try {
      const r = await fetch("http://localhost:4040/api/tunnels", { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const data = await r.json() as any;
        tunnelUrl = (data.tunnels as any[])?.find((t: any) => t.proto === "https")?.public_url ?? "";
      }
    } catch {}
  }
  const hasNgrok = !!tunnelUrl;

  // Auto-discover whisper model the same way the relay does
  const whisperModel = settings.WHISPER_MODEL_PATH?.trim() ||
    await readdir("/whisper-models").then(
      (files: string[]) => { const bin = files.find((f: string) => f.endsWith(".bin")); return bin ? `/whisper-models/${bin}` : ""; },
      () => ""
    );
  const hasVoice = !!whisperModel;

  function statusRow(label: string, ok: boolean, detail: string) {
    const badge = ok
      ? `<span class="badge badge-green">ok</span>`
      : `<span class="badge badge-red">not set</span>`;
    return `
    <tr>
      <td style="color:var(--muted)">${label}</td>
      <td>${badge}</td>
      <td style="color:var(--muted);font-size:0.78rem">${detail}</td>
    </tr>`;
  }

  return `
  <div class="grid-3" style="margin-bottom:1rem;">
    <div class="card">
      <div class="stat-value">${msgCount}</div>
      <div class="stat-label">Total messages</div>
    </div>
    <div class="card">
      <div class="stat-value">${taskCount}</div>
      <div class="stat-label">Active scheduled tasks</div>
    </div>
    <div class="card">
      <div class="stat-value">${memCount}</div>
      <div class="stat-label">Memory items</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Configuration</div>
      <div style="overflow-x:auto">
        <table style="white-space:nowrap">
          <tbody>
            ${statusRow("Telegram bot token",  hasToken,      hasToken      ? settings.TELEGRAM_BOT_TOKEN.slice(0, 12) + "..." : "go to Settings")}
            ${statusRow("Anthropic API key",   hasAI,         hasAI         ? "sk-ant-..." : "go to Settings")}
            ${statusRow("Voice transcription", hasVoice,      hasVoice      ? whisperModel : "no model found")}
            ${statusRow("Voice replies",       hasVoiceReply, hasVoiceReply ? "ElevenLabs configured" : "optional — go to Settings")}
            ${statusRow("Semantic memory",     hasMemory,     hasMemory     ? "OpenAI embeddings configured" : "optional — go to Settings")}
            ${statusRow("Public URL",           hasNgrok,      hasNgrok      ? `<a href="${tunnelUrl}" target="_blank" style="color:var(--accent)">${tunnelUrl}</a>` : "starting… check back in ~10s")}
            ${statusRow("User name",           hasName,       hasName       ? settings.USER_NAME : "optional")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Activity</div>
      <div style="overflow-x:auto">
        <table style="white-space:nowrap">
          <tbody>
            <tr><td style="color:var(--muted)">Last message</td><td>${lastMsgTime}</td></tr>
            <tr><td style="color:var(--muted)">Timezone</td><td>${settings.USER_TIMEZONE || "system default"}</td></tr>
            <tr><td style="color:var(--muted)">User ID</td><td>${settings.TELEGRAM_USER_ID || "—"}</td></tr>
          </tbody>
        </table>
      </div>
      <div style="margin-top:1rem;">
        <a href="/onboarding?step=telegram" class="btn btn-outline btn-sm">Re-run setup wizard</a>
      </div>
    </div>
  </div>`;
}

export async function renderDashboard(
  tab: string,
  page: number,
  toast?: { type: "success" | "error"; text: string },
  filePath?: string,
  listId?: string
): Promise<string> {
  const settings = await getSettings();
  let tabContent: string;

  switch (tab) {
    case "tasks":
      tabContent = await renderTasks();
      break;
    case "chat":
      tabContent = await renderChat(page);
      break;
    case "memory":
      tabContent = await renderMemory();
      break;
    case "lists":
      tabContent = await renderLists(listId);
      break;
    case "files":
      tabContent = await renderFiles(filePath ?? "");
      break;
    case "mcp":
      tabContent = await renderMcp();
      break;
    case "hue":
      tabContent = await renderHue();
      break;
    case "commands":
      tabContent = await renderCommands();
      break;
    case "settings":
      tabContent = renderSettingsForm(settings, toast);
      break;
    default:
      tabContent = await renderStatus();
  }

  const toastHtml = toast && tab !== "settings"
    ? `<div class="toast toast-${toast.type}">${toast.text}</div>`
    : "";

  return layout("Dashboard", toastHtml + tabContent, tab || "status", settings);
}
