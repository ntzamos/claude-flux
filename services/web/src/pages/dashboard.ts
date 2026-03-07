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
  // Resolve public URL: Railway env (always reliable) or verify ngrok is actually running
  const isRailway = !!process.env.RAILWAY_PUBLIC_DOMAIN;
  const ngrokDomainSet = !!settings.NGROK_DOMAIN?.trim();
  let tunnelUrl = "";
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    tunnelUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  } else {
    // Always verify ngrok is live — never trust the domain setting alone
    try {
      const r = await fetch("http://localhost:4040/api/tunnels", { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const data = await r.json() as any;
        const activeTunnel = (data.tunnels as any[])?.find((t: any) => t.proto === "https");
        if (activeTunnel) {
          // Prefer configured domain if it matches, else use whatever ngrok reports
          tunnelUrl = ngrokDomainSet
            ? `https://${settings.NGROK_DOMAIN!.trim().replace(/^https?:\/\//, "")}`
            : activeTunnel.public_url;
        }
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

  function statusRow(label: string, ok: boolean, detail: string, state: "ok" | "error" | "info" = ok ? "ok" : "error") {
    const badge = state === "ok"
      ? `<span class="badge badge-green">ok</span>`
      : state === "info"
        ? `<span class="badge badge-gray">off</span>`
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

  <div class="grid-2" style="margin-bottom:1rem;">
    <div class="card" id="weather-card">
      <div class="card-title" style="display:flex;align-items:center;gap:0.5rem;">
        <span>Weather</span>
        <span id="weather-location" style="color:var(--muted);font-size:0.8rem;font-weight:400;"></span>
      </div>
      <div id="weather-body" style="display:flex;align-items:center;gap:1.5rem;min-height:64px;">
        <div style="color:var(--muted);font-size:0.85rem;">Loading...</div>
      </div>
    </div>
    <div class="card" id="market-card">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Markets</span>
        <span id="market-updated" style="color:var(--muted);font-size:0.75rem;font-weight:400;"></span>
      </div>
      <div id="market-body" style="min-height:64px;">
        <div style="color:var(--muted);font-size:0.85rem;">Loading...</div>
      </div>
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
            ${statusRow("Public URL", hasNgrok, hasNgrok ? `<a href="${tunnelUrl}" target="_blank" style="color:var(--accent)">${tunnelUrl}</a>` : isRailway ? "Railway domain not found" : ngrokDomainSet ? "ngrok domain set but tunnel not active" : "not enabled — configure ngrok in Settings to access remotely", hasNgrok ? "ok" : isRailway || ngrokDomainSet ? "error" : "info")}
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
  </div>

  <script>
  (function() {
    var weatherIcons = {
      "Sunny": "☀️", "Clear": "🌙", "Partly cloudy": "⛅", "Cloudy": "☁️",
      "Overcast": "☁️", "Mist": "🌫️", "Fog": "🌫️", "Freezing fog": "🌫️",
      "Light rain": "🌦️", "Moderate rain": "🌧️", "Heavy rain": "🌧️",
      "Light snow": "🌨️", "Moderate snow": "❄️", "Heavy snow": "❄️",
      "Blizzard": "🌨️", "Thundery outbreaks": "⛈️", "Patchy rain": "🌦️",
      "Drizzle": "🌦️", "Light sleet": "🌨️", "Thunder": "⛈️",
    };
    function weatherIcon(desc) {
      if (!desc) return "🌡️";
      for (var k in weatherIcons) {
        if (desc.toLowerCase().indexOf(k.toLowerCase()) !== -1) return weatherIcons[k];
      }
      return "🌡️";
    }
    function fmt(n, decimals) {
      if (n == null) return "—";
      return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    function changeHtml(pct) {
      if (pct == null) return "";
      var color = pct >= 0 ? "#4caf82" : "#ff7070";
      var arrow = pct >= 0 ? "▲" : "▼";
      return "<span style=\\"color:" + color + ";font-size:0.78rem;\\">" + arrow + " " + Math.abs(pct).toFixed(2) + "%</span>";
    }
    function renderWidgets(data) {
      var w = data.weather;
      var m = data.market;
      if (w) {
        document.getElementById("weather-location").textContent = w.city || "";
        document.getElementById("weather-body").innerHTML =
          "<div style=\\"font-size:2.8rem;line-height:1;\\">" + weatherIcon(w.desc) + "</div>" +
          "<div>" +
            "<div style=\\"font-size:1.8rem;font-weight:700;line-height:1;\\">" + w.temp_c + "°C</div>" +
            "<div style=\\"color:var(--muted);font-size:0.82rem;margin-top:2px;\\">" + w.desc + "</div>" +
            "<div style=\\"color:var(--muted);font-size:0.78rem;margin-top:4px;\\">" +
              "Feels " + w.feels_c + "°C &nbsp;·&nbsp; " +
              "Humidity " + w.humidity + "% &nbsp;·&nbsp; " +
              "Wind " + w.wind_kmph + " km/h" +
            "</div>" +
          "</div>";
      } else {
        document.getElementById("weather-body").innerHTML = "<div style=\\"color:var(--muted);font-size:0.85rem;\\">Weather unavailable</div>";
      }
      if (m) {
        var rows = [
          { label: "BTC", data: m.btc, decimals: 0, prefix: "$" },
          { label: "TSLA", data: m.tsla, decimals: 2, prefix: "$" },
          { label: "NVDA", data: m.nvda, decimals: 2, prefix: "$" },
        ];
        var html = "<table style=\\"width:100%;border-collapse:collapse;\\">";
        rows.forEach(function(r) {
          html += "<tr>" +
            "<td style=\\"color:var(--muted);font-size:0.82rem;padding:4px 8px 4px 0;width:52px;\\">" + r.label + "</td>" +
            "<td style=\\"font-weight:600;font-size:0.95rem;padding:4px 8px 4px 0;\\">" +
              (r.data ? r.prefix + fmt(r.data.price, r.decimals) : "—") +
            "</td>" +
            "<td style=\\"padding:4px 0;\\">" + (r.data ? changeHtml(r.data.change) : "") + "</td>" +
          "</tr>";
        });
        html += "</table>";
        document.getElementById("market-body").innerHTML = html;
        var now = new Date();
        document.getElementById("market-updated").textContent = "updated " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else {
        document.getElementById("market-body").innerHTML = "<div style=\\"color:var(--muted);font-size:0.85rem;\\">Market data unavailable</div>";
      }
    }
    function loadWidgets() {
      fetch("/api/widgets").then(function(r) { return r.json(); }).then(renderWidgets).catch(function() {});
    }
    loadWidgets();
    setInterval(loadWidgets, 30000);
  })();
  </script>`;
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
      tabContent = await renderChat();
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
