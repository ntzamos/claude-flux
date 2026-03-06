interface ThemeVars {
  bg: string; surface: string; surface2: string; surface3: string;
  border: string; border2: string; text: string; muted: string; muted2: string;
  accent: string; accentR: number; accentG: number; accentB: number;
  accentText: string; btnHover: string; gridLineOpacity: number;
}

function getThemeVars(theme: string, accent: string, mode: string): ThemeVars {
  const presets: Record<string, ThemeVars> = {
    flux: {
      bg: "#090d09", surface: "#0d130d", surface2: "#121a12", surface3: "#172017",
      border: "#1a2a1a", border2: "#243624", text: "#d8edd8", muted: "#4a674a", muted2: "#2e452e",
      accent: "#00e676", accentR: 0, accentG: 230, accentB: 118,
      accentText: "#030f07", btnHover: "#1ffb8a", gridLineOpacity: 0.022,
    },
    midnight: {
      bg: "#08090f", surface: "#0c1018", surface2: "#111520", surface3: "#161d2c",
      border: "#1c2540", border2: "#263660", text: "#c8d8f0", muted: "#4a5d80", muted2: "#2a3555",
      accent: "#38bdf8", accentR: 56, accentG: 189, accentB: 248,
      accentText: "#030c18", btnHover: "#7dd3fc", gridLineOpacity: 0.022,
    },
    ember: {
      bg: "#0f0a06", surface: "#160d08", surface2: "#1d1209", surface3: "#24180c",
      border: "#2e1c0a", border2: "#3c2510", text: "#f0dcc8", muted: "#7a5835", muted2: "#4a3018",
      accent: "#f59e0b", accentR: 245, accentG: 158, accentB: 11,
      accentText: "#1a0a00", btnHover: "#fbbf24", gridLineOpacity: 0.022,
    },
  };

  if (presets[theme]) return presets[theme];

  // Custom theme — derive from user-picked accent + mode
  const hex = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#8b5cf6";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const accentText = luminance > 140 ? "#1a1a1a" : "#f5f5f5";
  const btnR = Math.min(255, r + 30).toString(16).padStart(2, "0");
  const btnG = Math.min(255, g + 30).toString(16).padStart(2, "0");
  const btnB = Math.min(255, b + 30).toString(16).padStart(2, "0");
  const btnHover = `#${btnR}${btnG}${btnB}`;

  if (mode === "light") {
    return {
      bg: "#f3f4f6", surface: "#ffffff", surface2: "#f0f0f4", surface3: "#e5e7eb",
      border: "#e5e7eb", border2: "#d1d5db", text: "#111827", muted: "#6b7280", muted2: "#9ca3af",
      accent: hex, accentR: r, accentG: g, accentB: b,
      accentText, btnHover, gridLineOpacity: 0.06,
    };
  }

  return {
    bg: "#0a0a0a", surface: "#111111", surface2: "#1a1a1a", surface3: "#222222",
    border: "#2a2a2a", border2: "#333333", text: "#e8e8e8", muted: "#666666", muted2: "#444444",
    accent: hex, accentR: r, accentG: g, accentB: b,
    accentText, btnHover, gridLineOpacity: 0.04,
  };
}

export function layout(title: string, content: string, activeTab?: string, themeSettings?: Record<string, string>): string {
  const t = getThemeVars(
    themeSettings?.THEME || "flux",
    themeSettings?.THEME_ACCENT || "",
    themeSettings?.THEME_MODE || "dark",
  );
  const { accentR: r, accentG: g, accentB: b } = t;
  const a = (op: number) => `rgba(${r},${g},${b},${op})`;

  const tabs = [
    { id: "status",   label: "Status",   icon: "activity" },
    { id: "tasks",    label: "Tasks",    icon: "check-square" },
    { id: "chat",     label: "Chat",     icon: "message-circle" },
    { id: "memory",   label: "Memory",   icon: "brain" },
    { id: "lists",    label: "Lists",    icon: "list" },
    { id: "files",    label: "Files",    icon: "folder" },
    { id: "mcp",      label: "MCP",      icon: "plug" },
    { id: "commands", label: "Commands", icon: "terminal" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  const navLinks = tabs.map(tab => {
    const active = tab.id === activeTab ? " active" : "";
    return `<a href="/dashboard?tab=${tab.id}" class="tab-link${active}"><i data-lucide="${tab.icon}" class="tab-icon"></i><span class="tab-label"> ${tab.label}</span></a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Claude Flux</title>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face {
      font-family: 'Space Grotesk';
      font-style: normal;
      font-weight: 400 700;
      font-display: block;
      src: url('/fonts/space-grotesk.woff2') format('woff2');
    }
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:           ${t.bg};
      --surface:      ${t.surface};
      --surface2:     ${t.surface2};
      --surface3:     ${t.surface3};
      --border:       ${t.border};
      --border2:      ${t.border2};
      --text:         ${t.text};
      --muted:        ${t.muted};
      --muted2:       ${t.muted2};
      --accent:       ${t.accent};
      --accent-dim:   ${a(0.10)};
      --accent-glow:  ${a(0.06)};
      --accent-text:  ${t.accentText};
      --btn-hover:    ${t.btnHover};
      --grid-line:    ${a(t.gridLineOpacity)};
      --red:          #ff5252;
      --yellow:       #ffd740;
      --green:        #00e676;
    }

    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      background-image:
        linear-gradient(var(--grid-line) 1px, transparent 1px),
        linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
      background-size: 28px 28px;
      color: var(--text);
      min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }

    /* ── Top bar ──────────────────────────────────────── */
    .topbar {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      padding: 0.9rem 1.75rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .topbar-logo {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text);
      flex: 1;
      text-transform: uppercase;
      letter-spacing: 0.18em;
    }
    .topbar-logo span { color: var(--accent); }
    .topbar-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 6px var(--accent);
      flex-shrink: 0;
    }

    /* ── Tab nav ──────────────────────────────────────── */
    .tabnav {
      display: flex;
      gap: 0;
      padding: 0 1.25rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .tab-link {
      padding: 0.7rem 1.1rem;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--muted);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: color 0.15s, border-color 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .tab-link:hover { color: var(--text); }
    .tab-link.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tab-icon { width: 13px; height: 13px; stroke-width: 2; flex-shrink: 0; }

    /* ── Main content ─────────────────────────────────── */
    .main { padding: 1.5rem 1.75rem; max-width: 1180px; margin: 0 auto; }

    /* ── Cards ────────────────────────────────────────── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem 1.4rem;
      margin-bottom: 1rem;
      overflow: scroll;
    }
    .card-title {
      font-size: 0.63rem;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin-bottom: 0.85rem;
    }

    /* ── Grid ─────────────────────────────────────────── */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
    @media (max-width: 700px) { .grid-2, .grid-3 { grid-template-columns: 1fr; gap: 0.5rem; } }

    /* ── Stat cards ───────────────────────────────────── */
    .stat-value {
      font-size: 2.8rem;
      font-weight: 700;
      color: var(--accent);
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .stat-label {
      font-size: 0.62rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.13em;
      font-weight: 600;
      margin-top: 0.4rem;
    }

    /* ── Badges ───────────────────────────────────────── */
    .badge {
      display: inline-block;
      padding: 0.18rem 0.55rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }
    .badge-green { background: ${a(0.10)}; color: var(--accent); border: 1px solid ${a(0.20)}; }
    .badge-red   { background: rgba(255,82,82,0.1);  color: #ff7070;       border: 1px solid rgba(255,82,82,0.2); }
    .badge-blue  { background: rgba(0,180,230,0.1);  color: #55d0f0;       border: 1px solid rgba(0,180,230,0.2); }
    .badge-gray  { background: var(--surface2);      color: var(--muted);  border: 1px solid var(--border); }

    /* ── Table ────────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th {
      text-align: left;
      color: var(--muted);
      font-weight: 700;
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 0.5rem 0.85rem;
      border-bottom: 1px solid var(--border);
    }
    td { padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border2); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: ${a(0.06)}; }

    /* ── Chat messages ────────────────────────────────── */
    .message { padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 0.5rem; font-size: 0.84rem; line-height: 1.55; }
    .message-user      { background: var(--surface2); border: 1px solid var(--border); }
    .message-assistant { background: ${a(0.04)}; border: 1px solid ${a(0.12)}; }
    .message-system    { background: var(--surface); color: var(--muted); font-size: 0.78rem; border: 1px solid var(--border); }
    .message-meta      { font-size: 0.65rem; color: var(--muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.07em; }

    /* ── Memory items ─────────────────────────────────── */
    .memory-item { padding: 0.75rem 0.9rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.4rem; font-size: 0.83rem; }
    .memory-type { font-size: 0.6rem; color: var(--muted); margin-bottom: 0.15rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }

    /* ── Forms ────────────────────────────────────────── */
    .field { margin-bottom: 1rem; }
    label { display: block; font-size: 0.65rem; color: var(--muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.09em; font-weight: 600; }
    .input-wrap { display: flex; gap: 0.5rem; }
    input, select {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border2);
      color: var(--text);
      border-radius: 6px;
      padding: 0.55rem 0.75rem;
      font-size: 0.84rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px ${a(0.10)};
    }
    input::placeholder { color: var(--muted2); }
    .reveal-btn {
      background: var(--surface2);
      border: 1px solid var(--border2);
      color: var(--muted);
      border-radius: 6px;
      padding: 0 0.8rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-family: inherit;
    }
    .reveal-btn:hover { color: var(--text); border-color: var(--accent); }
    .set-badge { display: inline-block; margin-top: 0.2rem; font-size: 0.62rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
    .section-title { font-size: 0.72rem; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 0.3rem; }
    .section-desc  { color: var(--muted); font-size: 0.8rem; margin-bottom: 1rem; line-height: 1.5; }
    .save-bar { display: flex; justify-content: flex-end; padding-top: 0.75rem; }

    /* ── Buttons ──────────────────────────────────────── */
    .btn {
      background: var(--accent);
      color: var(--accent-text);
      border: none;
      border-radius: 7px;
      padding: 0.65rem 1.6rem;
      font-size: 0.78rem;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      transition: background 0.15s, box-shadow 0.15s;
    }
    .btn:hover { background: var(--btn-hover); box-shadow: 0 0 12px ${a(0.30)}; }
    .btn-sm { padding: 0.4rem 0.9rem; font-size: 0.7rem; }
    .btn-outline {
      background: transparent;
      border: 1px solid var(--border2);
      color: var(--text);
    }
    .btn-outline:hover { background: var(--surface2); border-color: var(--accent); box-shadow: none; }

    /* ── Toast ────────────────────────────────────────── */
    .toast {
      position: fixed; top: 1.25rem; right: 1.25rem;
      padding: 0.7rem 1.1rem;
      border-radius: 7px;
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      z-index: 100;
      animation: fadeIn 0.2s ease;
    }
    .toast-success { background: ${a(0.12)}; color: var(--accent); border: 1px solid ${a(0.25)}; }
    .toast-error   { background: rgba(255,82,82,0.12);  color: #ff7070;       border: 1px solid rgba(255,82,82,0.25); }
    @keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }

    /* ── Pagination ───────────────────────────────────── */
    .pagination {
      display: flex; gap: 0.5rem; align-items: center;
      padding-top: 0.75rem;
      font-size: 0.7rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .pagination a { padding: 0.3rem 0.7rem; border: 1px solid var(--border2); border-radius: 5px; color: var(--text); }
    .pagination a:hover { border-color: var(--accent); color: var(--accent); }

    /* ── Theme cards ──────────────────────────────────── */
    .theme-card {
      border: 2px solid var(--border2);
      border-radius: 10px;
      padding: 0.85rem;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      user-select: none;
    }
    .theme-card:hover { border-color: var(--muted); }
    .theme-card.active { border-color: var(--accent); background: ${a(0.06)}; }

    /* ── Mobile ───────────────────────────────────────── */
    @media (max-width: 700px) {
      .topbar { padding: 0.6rem 1rem; }
      .tabnav { padding: 0 0.5rem; }
      .tab-link { padding: 0.6rem 0.7rem; font-size: 0.62rem; letter-spacing: 0.06em; }
      .main { padding: 0.65rem 0.65rem; }
      .card { padding: 0.75rem 0.85rem; margin-bottom: 0.6rem; }
      .card-title { margin-bottom: 0.55rem; }
      .stat-value { font-size: 1.9rem; }
      .stat-label { font-size: 0.58rem; margin-top: 0.2rem; }
      td { padding: 0.45rem 0.6rem; font-size: 0.78rem; }
      th { padding: 0.4rem 0.6rem; }
      .grid-2, .grid-3 { grid-template-columns: 1fr; gap: 0.5rem; }
      .stat-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 0.4rem !important; }
      .btn { padding: 0.55rem 1.2rem; }
      .btn-sm { padding: 0.38rem 0.8rem; }
    }
    @media (max-width: 480px) {
      .tab-link { padding: 0.5rem 0.6rem; font-size: 0.6rem; flex-direction: column; align-items: center; gap: 0.15rem; display: inline-flex; }
      .tab-link .tab-label { display: inline; font-size: 0.55rem; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-dot"></div>
    <div class="topbar-logo">Claude <span>Flux</span></div>
  </div>
  ${activeTab ? `<nav class="tabnav">${navLinks}</nav>` : ""}
  <div class="main">
    ${content}
  </div>
  <!-- ── Claude Flux Activity Indicator ─────────────────────── -->
  <div id="flux-indicator" style="
    display:none;
    position:fixed;
    bottom:1.5rem;
    left:50%;
    transform:translateX(-50%);
    background:var(--surface);
    border:1px solid var(--border2);
    border-radius:999px;
    padding:0.45rem 1.1rem;
    font-size:0.72rem;
    font-weight:600;
    color:var(--accent);
    text-transform:uppercase;
    letter-spacing:0.1em;
    z-index:300;
    box-shadow:0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px ${a(0.15)};
    white-space:nowrap;
    pointer-events:none;
    gap:0.5rem;
    align-items:center;
  ">
    <span id="flux-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px var(--accent);animation:fluxPulse 1s ease-in-out infinite;flex-shrink:0"></span>
    <span id="flux-label">Claude is thinking</span>
  </div>
  <style>
    @keyframes fluxPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.75); }
    }
  </style>
  <script>
    // Init Lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
    // Scroll to top on every tab load (prevent browser scroll restoration)
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    // Scroll active tab into view in the horizontal nav bar
    document.querySelector('.tab-link.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    // Auto-dismiss toasts
    document.querySelectorAll('.toast').forEach(t => setTimeout(() => t.remove(), 4000));
    // Reveal password fields
    function toggleReveal(id) {
      const input = document.getElementById(id);
      const btn = input.nextElementSibling;
      if (input.type === 'password') { input.type = 'text'; btn.textContent = 'Hide'; }
      else { input.type = 'password'; btn.textContent = 'Show'; }
    }
    // Auto-fill timezone from browser if field is empty
    const tzInput = document.getElementById('USER_TIMEZONE');
    if (tzInput && !tzInput.value) {
      tzInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    // ── Flux activity indicator polling ─────────────────────
    (function() {
      const el    = document.getElementById('flux-indicator');
      const label = document.getElementById('flux-label');
      if (!el || !label) return;
      async function pollRelayStatus() {
        try {
          const res  = await fetch('/api/relay-status');
          const data = await res.json();
          if (data.active || data.queue > 0) {
            el.style.display = 'flex';
            if (data.queue > 0) {
              label.textContent = data.active
                ? 'Claude is thinking · ' + data.queue + ' queued'
                : data.queue + ' message' + (data.queue > 1 ? 's' : '') + ' queued';
            } else {
              label.textContent = 'Claude is thinking';
            }
          } else {
            el.style.display = 'none';
          }
        } catch { el.style.display = 'none'; }
      }
      pollRelayStatus();
      setInterval(pollRelayStatus, 2000);
    })();
  </script>
</body>
</html>`;
}
