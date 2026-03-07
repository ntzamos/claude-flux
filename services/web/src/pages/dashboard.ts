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
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span>Weather</span>
          <span id="weather-location" style="color:var(--muted);font-size:0.8rem;font-weight:400;"></span>
        </div>
        <button onclick="toggleWeatherEdit()" title="Edit location" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:2px;display:flex;align-items:center;opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div id="weather-body" style="display:flex;align-items:center;gap:1.5rem;min-height:64px;">
        <div style="color:var(--muted);font-size:0.85rem;">Loading...</div>
      </div>
      <div id="weather-edit-panel" style="display:none;border-top:1px solid var(--border);margin-top:0.75rem;padding-top:0.75rem;">
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
          <input id="location-input" type="text" placeholder="City name, e.g. Athens, GR" style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--fg);font-size:0.82rem;outline:none;" onkeydown="if(event.key==='Enter')searchLocation()" />
          <button onclick="searchLocation()" style="padding:6px 12px;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--fg);font-size:0.82rem;">Search</button>
        </div>
        <div id="location-results" style="margin-bottom:0.5rem;font-size:0.82rem;"></div>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="saveWeatherLocation()" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.82rem;">Save</button>
          <button onclick="toggleWeatherEdit()" style="padding:6px 14px;background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--muted);font-size:0.82rem;">Cancel</button>
        </div>
      </div>
    </div>
    <div class="card" id="market-card">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Markets</span>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <span id="market-updated" style="color:var(--muted);font-size:0.75rem;font-weight:400;"></span>
          <button onclick="toggleMarketEdit()" title="Edit markets" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:2px;display:flex;align-items:center;opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </div>
      <div id="market-body" style="min-height:64px;">
        <div style="color:var(--muted);font-size:0.85rem;">Loading...</div>
      </div>
      <div id="market-edit-panel" style="display:none;border-top:1px solid var(--border);margin-top:0.75rem;padding-top:0.75rem;">
        <div id="market-chips" style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.75rem;min-height:28px;"></div>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
          <input id="symbol-input" type="text" placeholder="Search stock or crypto, e.g. AAPL, ETH" style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--fg);font-size:0.82rem;outline:none;" onkeydown="if(event.key==='Enter')searchSymbol()" />
          <button onclick="searchSymbol()" style="padding:6px 12px;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--fg);font-size:0.82rem;">Search</button>
        </div>
        <div id="symbol-results" style="margin-bottom:0.5rem;font-size:0.82rem;"></div>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="saveMarketSymbols()" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.82rem;">Save</button>
          <button onclick="toggleMarketEdit()" style="padding:6px 14px;background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--muted);font-size:0.82rem;">Cancel</button>
        </div>
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
    var currentSymbols = [];
    var pendingSymbols = [];
    var weatherIcons = {
      "Sunny":"☀️","Clear":"🌙","Partly cloudy":"⛅","Cloudy":"☁️","Overcast":"☁️",
      "Mist":"🌫️","Fog":"🌫️","Freezing fog":"🌫️","Light rain":"🌦️","Moderate rain":"🌧️",
      "Heavy rain":"🌧️","Light snow":"🌨️","Moderate snow":"❄️","Heavy snow":"❄️",
      "Blizzard":"🌨️","Thundery outbreaks":"⛈️","Patchy rain":"🌦️","Drizzle":"🌦️",
      "Light sleet":"🌨️","Thunder":"⛈️"
    };
    function weatherIcon(desc) {
      if (!desc) return "🌡️";
      for (var k in weatherIcons) { if (desc.toLowerCase().indexOf(k.toLowerCase()) !== -1) return weatherIcons[k]; }
      return "🌡️";
    }
    function fmt(n, d) {
      if (n == null) return "—";
      return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    function changeHtml(pct) {
      if (pct == null) return "";
      var color = pct >= 0 ? "#4caf82" : "#ff7070";
      var arrow = pct >= 0 ? "▲" : "▼";
      return "<span style=\\"color:" + color + ";font-size:0.78rem;\\">" + arrow + " " + Math.abs(pct).toFixed(2) + "%</span>";
    }
    function renderWidgets(data) {
      var w = data.weather;
      var m = data.market || [];
      currentSymbols = data.symbols || [];
      if (w) {
        document.getElementById("weather-location").textContent = w.city || "";
        document.getElementById("weather-body").innerHTML =
          "<div style=\\"font-size:2.8rem;line-height:1;\\">" + weatherIcon(w.desc) + "</div>" +
          "<div>" +
            "<div style=\\"font-size:1.8rem;font-weight:700;line-height:1;\\">" + w.temp_c + "°C</div>" +
            "<div style=\\"color:var(--muted);font-size:0.82rem;margin-top:2px;\\">" + w.desc + "</div>" +
            "<div style=\\"color:var(--muted);font-size:0.78rem;margin-top:4px;\\">" +
              "Feels " + w.feels_c + "°C &nbsp;·&nbsp; Humidity " + w.humidity + "% &nbsp;·&nbsp; Wind " + w.wind_kmph + " km/h" +
            "</div>" +
          "</div>";
      } else {
        document.getElementById("weather-body").innerHTML = "<div style=\\"color:var(--muted);font-size:0.85rem;\\">Weather unavailable</div>";
      }
      if (m.length) {
        var html = "<table style=\\"width:100%;border-collapse:collapse;\\">";
        m.forEach(function(item) {
          var d = (item.price != null && item.price > 1000) ? 0 : 2;
          html += "<tr>" +
            "<td style=\\"color:var(--muted);font-size:0.82rem;padding:4px 8px 4px 0;width:60px;\\">" + item.label + "</td>" +
            "<td style=\\"font-weight:600;font-size:0.95rem;padding:4px 8px 4px 0;\\">" + (item.price != null ? "$" + fmt(item.price, d) : "—") + "</td>" +
            "<td style=\\"padding:4px 0;\\">" + changeHtml(item.change) + "</td>" +
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

    // --- Weather edit ---
    window.toggleWeatherEdit = function() {
      var p = document.getElementById("weather-edit-panel");
      var open = p.style.display !== "none";
      p.style.display = open ? "none" : "block";
      if (!open) {
        document.getElementById("location-input").value = document.getElementById("weather-location").textContent || "";
        document.getElementById("location-results").innerHTML = "";
      }
    };
    window.searchLocation = function() {
      var q = document.getElementById("location-input").value.trim();
      if (!q) return;
      var el = document.getElementById("location-results");
      el.innerHTML = "<span style=\\"color:var(--muted);\\">Searching...</span>";
      fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(q) + "&format=json&limit=5&addressdetails=1", { headers: { "Accept-Language": "en-US,en" } })
        .then(function(r) { return r.json(); })
        .then(function(results) {
          if (!results.length) { el.innerHTML = "<span style=\\"color:var(--muted);\\">No results</span>"; return; }
          var html = "";
          results.forEach(function(r) {
            var city = (r.address && (r.address.city || r.address.town || r.address.village || r.address.state)) || r.display_name.split(",")[0];
            var cc = (r.address && r.address.country_code) ? r.address.country_code.toUpperCase() : "";
            var loc = (cc ? city + ", " + cc : city).replace(/"/g, "&quot;");
            var display = r.display_name.split(",").slice(0, 3).join(", ");
            html += "<div data-loc=\\"" + loc + "\\" onclick=\\"selectLocation(this)\\" style=\\"cursor:pointer;padding:5px 8px;border-radius:4px;\\" onmouseover=\\"this.style.background='var(--hover)'\\" onmouseout=\\"this.style.background=''\\">"+display+"</div>";
          });
          el.innerHTML = html;
        }).catch(function() { el.innerHTML = "<span style=\\"color:var(--muted);\\">Search failed</span>"; });
    };
    window.selectLocation = function(el) {
      document.getElementById("location-input").value = el.dataset.loc;
      document.getElementById("location-results").innerHTML = "";
    };
    window.saveWeatherLocation = function() {
      var loc = document.getElementById("location-input").value.trim();
      fetch("/api/widgets/weather", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: loc }) })
        .then(function(r) { return r.json(); }).then(function(d) {
          if (d.ok) {
            document.getElementById("weather-edit-panel").style.display = "none";
            document.getElementById("weather-body").innerHTML = "<div style=\\"color:var(--muted);font-size:0.85rem;\\">Loading...</div>";
            document.getElementById("weather-location").textContent = loc ? "· " + loc : "";
            loadWidgets();
          }
        });
    };

    // --- Market edit ---
    window.toggleMarketEdit = function() {
      var p = document.getElementById("market-edit-panel");
      var open = p.style.display !== "none";
      p.style.display = open ? "none" : "block";
      if (!open) {
        pendingSymbols = currentSymbols.map(function(s) { return { symbol: s.symbol, source: s.source, label: s.label }; });
        renderChips();
        document.getElementById("symbol-results").innerHTML = "";
        document.getElementById("symbol-input").value = "";
      }
    };
    function renderChips() {
      var el = document.getElementById("market-chips");
      if (!el) return;
      var html = "";
      pendingSymbols.forEach(function(s, i) {
        html += "<span style=\\"display:inline-flex;align-items:center;gap:4px;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:3px 8px 3px 12px;font-size:0.8rem;\\">" +
          s.label +
          "<button data-idx=\\"" + i + "\\" onclick=\\"removeSymbol(this)\\" style=\\"background:none;border:none;cursor:pointer;color:var(--muted);font-size:1rem;padding:0 0 0 4px;line-height:1;\\">×</button></span>";
      });
      el.innerHTML = html || "<span style=\\"color:var(--muted);\\">No symbols — add below</span>";
    }
    window.removeSymbol = function(btn) {
      pendingSymbols.splice(parseInt(btn.dataset.idx, 10), 1);
      renderChips();
    };
    window.searchSymbol = function() {
      var q = document.getElementById("symbol-input").value.trim();
      if (!q) return;
      var el = document.getElementById("symbol-results");
      el.innerHTML = "<span style=\\"color:var(--muted);\\">Searching...</span>";
      fetch("/api/widgets/search-symbol?q=" + encodeURIComponent(q))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var results = data.results || [];
          if (!results.length) { el.innerHTML = "<span style=\\"color:var(--muted);\\">No results</span>"; return; }
          var html = "";
          results.forEach(function(r) {
            var added = pendingSymbols.some(function(s) { return s.symbol === r.symbol; });
            html += "<div data-symbol=\\"" + r.symbol + "\\" data-source=\\"" + r.source + "\\" data-label=\\"" + r.label + "\\" " +
              (added ? "style=\\"opacity:0.45;padding:5px 8px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;\\"" :
                "onclick=\\"addSymbol(this)\\" style=\\"cursor:pointer;padding:5px 8px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;\\" onmouseover=\\"this.style.background='var(--hover)'\\" onmouseout=\\"this.style.background=''\\"")+
              "><span><strong>" + r.label + "</strong> <span style=\\"color:var(--muted);font-size:0.78rem;\\">" + (r.name || "") + "</span></span>" +
              "<span style=\\"color:var(--muted);font-size:0.75rem;margin-left:8px;\\">" + (added ? "added" : r.type || r.source) + "</span></div>";
          });
          el.innerHTML = html;
        }).catch(function() { el.innerHTML = "<span style=\\"color:var(--muted);\\">Search failed</span>"; });
    };
    window.addSymbol = function(el) {
      if (pendingSymbols.some(function(s) { return s.symbol === el.dataset.symbol; })) return;
      pendingSymbols.push({ symbol: el.dataset.symbol, source: el.dataset.source, label: el.dataset.label });
      renderChips();
      document.getElementById("symbol-results").innerHTML = "";
      document.getElementById("symbol-input").value = "";
    };
    window.saveMarketSymbols = function() {
      fetch("/api/widgets/markets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: pendingSymbols }) })
        .then(function(r) { return r.json(); }).then(function(d) {
          if (d.ok) {
            document.getElementById("market-edit-panel").style.display = "none";
            document.getElementById("market-body").innerHTML = "<div style=\\"color:var(--muted);font-size:0.85rem;\\">Loading...</div>";
            document.getElementById("market-updated").textContent = "";
            loadWidgets();
          }
        });
    };
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
