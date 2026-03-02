export function layout(title: string, content: string, activeTab?: string): string {
  const tabs = [
    { id: "status",   label: "Status",   icon: "◉" },
    { id: "tasks",    label: "Tasks",    icon: "♧" },
    { id: "chat",     label: "Chat",     icon: "▣" },
    { id: "memory",   label: "Memory",   icon: "◈" },
    { id: "files",    label: "Files",    icon: "⌺" },
    { id: "mcp",      label: "MCP",      icon: "⬡" },
    { id: "commands", label: "Commands", icon: "⌘" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  const navLinks = tabs.map(t => {
    const active = t.id === activeTab ? " active" : "";
    return `<a href="/dashboard?tab=${t.id}" class="tab-link${active}">${t.icon} ${t.label}</a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Claude Flux</title>
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
      --bg:           #090d09;
      --surface:      #0d130d;
      --surface2:     #121a12;
      --surface3:     #172017;
      --border:       #1a2a1a;
      --border2:      #243624;
      --text:         #d8edd8;
      --muted:        #4a674a;
      --muted2:       #2e452e;
      --accent:       #00e676;
      --accent-dim:   rgba(0, 230, 118, 0.10);
      --accent-glow:  rgba(0, 230, 118, 0.06);
      --red:          #ff5252;
      --yellow:       #ffd740;
      --green:        #00e676;
    }

    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      background-image:
        linear-gradient(rgba(0,230,118,0.022) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,230,118,0.022) 1px, transparent 1px);
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
    }
    .tab-link:hover { color: var(--text); }
    .tab-link.active { color: var(--accent); border-bottom-color: var(--accent); }

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
    .badge-green { background: rgba(0,230,118,0.1);  color: var(--accent); border: 1px solid rgba(0,230,118,0.2); }
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
    tr:hover td { background: var(--accent-glow); }

    /* ── Chat messages ────────────────────────────────── */
    .message { padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 0.5rem; font-size: 0.84rem; line-height: 1.55; }
    .message-user      { background: var(--surface2); border: 1px solid var(--border); }
    .message-assistant { background: rgba(0,230,118,0.04); border: 1px solid rgba(0,230,118,0.12); }
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
      box-shadow: 0 0 0 2px rgba(0,230,118,0.1);
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
      color: #030f07;
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
    .btn:hover { background: #1ffb8a; box-shadow: 0 0 12px rgba(0,230,118,0.3); }
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
    .toast-success { background: rgba(0,230,118,0.12); color: var(--accent); border: 1px solid rgba(0,230,118,0.25); }
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

    /* ── Mobile ───────────────────────────────────────── */
    @media (max-width: 700px) {
      .main { padding: 0.75rem 0.75rem; }
      .card { padding: 0.75rem 0.85rem; margin-bottom: 0.6rem; }
      .card-title { margin-bottom: 0.55rem; }
      .stat-value { font-size: 1.9rem; }
      .stat-label { font-size: 0.58rem; margin-top: 0.2rem; }
      td { padding: 0.45rem 0.6rem; font-size: 0.78rem; }
      th { padding: 0.4rem 0.6rem; }
      .grid-2, .grid-3 { grid-template-columns: 1fr; gap: 0.5rem; }
      .stat-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 0.4rem !important; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-dot"></div>
    <div class="topbar-logo">Claude <span>Relay</span></div>
  </div>
  ${activeTab ? `<nav class="tabnav">${navLinks}</nav>` : ""}
  <div class="main">
    ${content}
  </div>
  <script>
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
  </script>
</body>
</html>`;
}
