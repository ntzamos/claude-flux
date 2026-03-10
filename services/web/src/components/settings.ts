export const FIELD_GROUPS = [
  {
    title: "Telegram",
    description: "Connect your bot. Get a token from @BotFather and your ID from @userinfobot.",
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token",     type: "password", placeholder: "1234567890:ABCdef...", required: true },
      { key: "TELEGRAM_USER_ID",   label: "Your User ID",  type: "text",     placeholder: "123456789",            required: true },
    ],
  },
  {
    title: "AI",
    description: "Choose how the relay authenticates with Claude. You can use an API key or sign in with your browser.",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", type: "password", placeholder: "sk-ant-...", required: false },
    ],
  },
  {
    title: "Voice Transcription",
    description: "Transcribe voice messages using whisper.cpp (built into the relay). Download a model file to whisper-models/ and set the path below.",
    fields: [
      { key: "WHISPER_MODEL_PATH", label: "Whisper Model Path", type: "text", placeholder: "/whisper-models/ggml-base.bin", required: false },
      { key: "WHISPER_BINARY",     label: "Whisper Binary",     type: "text", placeholder: "whisper-cpp",                     required: false },
    ],
  },
  {
    title: "Voice Reply & Phone Calls",
    description: "Text-to-speech and outbound AI phone calls via ElevenLabs. All optional.",
    fields: [
      { key: "ELEVENLABS_API_KEY",          label: "ElevenLabs API Key",     type: "password", placeholder: "sk_...",           required: false },
      { key: "ELEVENLABS_VOICE_ID",         label: "Voice ID",               type: "text",     placeholder: "EXAVITQu4vr4xnSDxMaL", required: false },
      { key: "ELEVENLABS_AGENT_ID",         label: "Agent ID (/callme)",     type: "text",     placeholder: "agent_...",        required: false },
      { key: "ELEVENLABS_PHONE_NUMBER_ID",  label: "Phone Number ID",        type: "text",     placeholder: "pn_...",           required: false },
      { key: "MY_PHONE_NUMBER",             label: "Your Phone Number",      type: "text",     placeholder: "+12025551234",     required: false },
    ],
  },
  {
    title: "Semantic Memory",
    description: "OpenAI key for embedding-based memory search. Optional — bot works without it.",
    fields: [
      { key: "OPENAI_API_KEY", label: "OpenAI API Key", type: "password", placeholder: "sk-...", required: false },
    ],
  },
  {
    title: "Public URL",
    description: "Exposes the dashboard publicly via ngrok. Add an ngrok auth token to enable. Optionally set a custom domain (ngrok paid plan).",
    fields: [
      { key: "TUNNEL_ENABLED",   label: "Enable tunnel",    type: "toggle",   placeholder: "",                 required: false },
      { key: "NGROK_AUTH_TOKEN", label: "ngrok Auth Token", type: "password", placeholder: "2abc...",           required: false },
      { key: "NGROK_DOMAIN",     label: "Custom Domain",    type: "text",     placeholder: "my-bot.ngrok.dev", required: false },
    ],
  },
  {
    title: "Personalization",
    description: "Helps the bot address you correctly and use your local time.",
    fields: [
      { key: "USER_NAME",     label: "Your Name",     type: "text", placeholder: "Alex",              required: false },
      { key: "USER_TIMEZONE", label: "Your Timezone", type: "text", placeholder: "America/New_York",  required: false },
    ],
  },
  {
    title: "GitHub",
    description: `Connect a GitHub account so the bot can pull, push, and manage repos on your behalf. Create a Personal Access Token at <a href="https://github.com/settings/tokens" target="_blank" style="color:var(--accent)">github.com/settings/tokens</a> — choose <strong>Classic</strong>, tick <em>repo</em> scope, then paste the token below.`,
    fields: [
      { key: "GITHUB_TOKEN", label: "Personal Access Token", type: "password", placeholder: "ghp_...", required: false },
      { key: "GITHUB_USERNAME", label: "GitHub Username", type: "text", placeholder: "ntzamos", required: false },
    ],
  },
  {
    title: "Image Generation (Nano Banana)",
    description: `Generate images using Google's Nano Banana model (Gemini 3.1 Flash Image). Get an API key at <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent)">aistudio.google.com/apikey</a>.`,
    fields: [
      { key: "GEMINI_API_KEY", label: "Gemini API Key", type: "password", placeholder: "AIza...", required: false },
    ],
  },
  {
    title: "SMS (Twilio)",
    description: `Send SMS messages via Twilio. Get your credentials at <a href="https://console.twilio.com" target="_blank" style="color:var(--accent)">console.twilio.com</a>. Used by the send_sms action script.`,
    fields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID",   type: "password", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", required: false },
      { key: "TWILIO_AUTH_TOKEN",  label: "Auth Token",     type: "password", placeholder: "your-auth-token",                    required: false },
      { key: "TWILIO_FROM_NUMBER", label: "From Number",    type: "text",     placeholder: "+12025551234",                       required: false },
    ],
  },
  {
    title: "Email (Resend)",
    description: `Send emails via Resend. Get your API key at <a href="https://resend.com/api-keys" target="_blank" style="color:var(--accent)">resend.com/api-keys</a>. Used by the send_email action script.`,
    fields: [
      { key: "RESEND_API_KEY",    label: "API Key",      type: "password", placeholder: "re_...",               required: false },
      { key: "RESEND_FROM_EMAIL", label: "From Email",   type: "text",     placeholder: "you@yourdomain.com",   required: false },
    ],
  },
];

const HUE_LOCAL_FIELDS = [
  { key: "HUE_BRIDGE_IP", label: "Bridge IP",  type: "text",     placeholder: "192.168.1.x",  required: false },
  { key: "HUE_API_KEY",   label: "API Key",    type: "password", placeholder: "abc123...",    required: false },
];

const HUE_REMOTE_FIELDS = [
  { key: "HUE_BRIDGE_ID",      label: "Bridge ID",        type: "text",     placeholder: "001788xxxxxx",  required: false },
  { key: "HUE_CLIENT_ID",      label: "OAuth Client ID",  type: "text",     placeholder: "your-app-id",   required: false },
  { key: "HUE_CLIENT_SECRET",  label: "Client Secret",    type: "password", placeholder: "secret...",     required: false },
  { key: "HUE_ACCESS_TOKEN",   label: "Access Token",     type: "password", placeholder: "eyJ...",        required: false },
  { key: "HUE_REFRESH_TOKEN",  label: "Refresh Token",    type: "password", placeholder: "eyJ...",        required: false },
];

function renderThemeSection(current: Record<string, string>): string {
  const activeTheme = current.THEME || "flux";
  const activeMode  = current.THEME_MODE || "dark";
  const activeAccent = current.THEME_ACCENT || "#8b5cf6";

  const presets = [
    {
      id: "flux",
      name: "Flux",
      desc: "Dark · Green",
      swatches: ["#090d09", "#0d130d", "#00e676"],
    },
    {
      id: "midnight",
      name: "Midnight",
      desc: "Dark · Blue",
      swatches: ["#08090f", "#0c1018", "#38bdf8"],
    },
    {
      id: "ember",
      name: "Ember",
      desc: "Dark · Amber",
      swatches: ["#0f0a06", "#160d08", "#f59e0b"],
    },
    {
      id: "custom",
      name: "Custom",
      desc: "Your colors",
      swatches: [],
    },
  ];

  const cards = presets.map(p => {
    const isActive = activeTheme === p.id;
    const swatchHtml = p.swatches.length
      ? p.swatches.map(c => `<div style="width:18px;height:18px;border-radius:3px;background:${c};border:1px solid rgba(255,255,255,0.08)"></div>`).join("")
      : `<div style="width:18px;height:18px;border-radius:3px;background:var(--border2)"></div>
         <div style="width:18px;height:18px;border-radius:3px;background:var(--surface)"></div>
         <div id="custom-swatch" style="width:18px;height:18px;border-radius:3px;background:${activeAccent}"></div>`;
    return `
    <div class="theme-card${isActive ? " active" : ""}" id="tc-${p.id}" onclick="pickTheme('${p.id}')">
      <div style="display:flex;gap:0.35rem;margin-bottom:0.55rem">${swatchHtml}</div>
      <div style="font-size:0.78rem;font-weight:700;color:var(--text)">${p.name}</div>
      <div style="font-size:0.65rem;color:var(--muted);margin-top:0.1rem">${p.desc}</div>
    </div>`;
  }).join("");

  return `
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Appearance</div>
    <div class="section-desc">Choose a theme. Changes apply instantly without restarting the bot.</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem">
      ${cards}
    </div>

    <!-- Custom builder — shown only when "Custom" is selected -->
    <div id="custom-builder" style="display:${activeTheme === "custom" ? "block" : "none"};background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:0.85rem;margin-bottom:0.85rem">
      <div style="display:flex;gap:2rem;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="font-size:0.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.09em;font-weight:600;margin-bottom:0.4rem">Mode</div>
          <div style="display:flex;gap:0.75rem">
            <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.8rem;cursor:pointer">
              <input type="radio" name="mode-pick" value="dark"  ${activeMode !== "light" ? "checked" : ""} onchange="updateMode('dark')"  style="accent-color:var(--accent)"> Dark
            </label>
            <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.8rem;cursor:pointer">
              <input type="radio" name="mode-pick" value="light" ${activeMode === "light" ? "checked" : ""} onchange="updateMode('light')" style="accent-color:var(--accent)"> Light
            </label>
          </div>
        </div>
        <div>
          <div style="font-size:0.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.09em;font-weight:600;margin-bottom:0.4rem">Accent Color</div>
          <div style="display:flex;align-items:center;gap:0.6rem">
            <input type="color" id="accent-picker" value="${activeAccent}"
              oninput="updateAccent(this.value)"
              style="width:40px;height:32px;border:1px solid var(--border2);border-radius:5px;background:var(--bg);cursor:pointer;padding:2px;flex:none">
            <span id="accent-hex" style="font-size:0.78rem;color:var(--muted);font-family:monospace">${activeAccent}</span>
          </div>
        </div>
      </div>
    </div>

    <form method="POST" action="/api/theme" style="display:flex;align-items:center;gap:0.75rem">
      <input type="hidden" name="THEME"        id="THEME"        value="${activeTheme}">
      <input type="hidden" name="THEME_MODE"   id="THEME_MODE"   value="${activeMode}">
      <input type="hidden" name="THEME_ACCENT" id="THEME_ACCENT" value="${activeAccent}">
      <button type="submit" class="btn btn-sm">Apply Theme</button>
      <span style="font-size:0.7rem;color:var(--muted)">Active: <strong style="color:var(--accent)">${activeTheme === "custom" ? "Custom (" + activeMode + ")" : activeTheme.charAt(0).toUpperCase() + activeTheme.slice(1)}</strong></span>
    </form>
  </div>

  <script>
  function pickTheme(name) {
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    document.getElementById('tc-' + name).classList.add('active');
    document.getElementById('THEME').value = name;
    document.getElementById('custom-builder').style.display = name === 'custom' ? 'block' : 'none';
  }
  function updateMode(mode) {
    document.getElementById('THEME_MODE').value = mode;
  }
  function updateAccent(color) {
    document.getElementById('THEME_ACCENT').value = color;
    document.getElementById('accent-hex').textContent = color;
    var s = document.getElementById('custom-swatch');
    if (s) s.style.background = color;
  }
  </script>`;
}

function renderFieldGroup(
  title: string,
  description: string,
  fields: { key: string; label: string; type: string; placeholder: string; required: boolean }[],
  current: Record<string, string>
): string {
  const fieldsHtml = fields.map(f => {
    const val = (current[f.key] ?? "").replace(/"/g, "&quot;");
    const hasValue = val.length > 0;
    return `
    <div class="field">
      <label for="${f.key}">${f.label}</label>
      <div class="input-wrap">
        <input id="${f.key}" name="${f.key}" type="${f.type}" value="${val}"
          placeholder="${f.placeholder}" autocomplete="off"
          ${f.type === "password" ? `data-reveal="false"` : ""}/>
        ${f.type === "password" ? `<button type="button" class="reveal-btn" onclick="toggleReveal('${f.key}')">Show</button>` : ""}
      </div>
      ${hasValue && f.type === "password" ? `<span class="set-badge">✓ set</span>` : ""}
    </div>`;
  }).join("");
  return `
  <div class="card" style="margin-bottom:1rem;">
    <div class="section-title">${title}</div>
    <div class="section-desc">${description}</div>
    ${fieldsHtml}
  </div>`;
}

export function renderMembersSection(
  members: { id: string; telegram_id: string; name: string; role: string }[]
): string {
  const rows = members.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.65rem 0;border-bottom:1px solid var(--border2)">
      <div style="display:flex;align-items:center;gap:0.6rem">
        <span style="font-size:0.82rem;font-weight:600;color:var(--text)">${m.name || "(no name)"}</span>
        <span style="font-size:0.72rem;color:var(--muted);font-family:monospace">${m.telegram_id}</span>
        ${m.role === "owner" ? `<span style="font-size:0.62rem;background:var(--accent);color:var(--accent-text);padding:0.15rem 0.45rem;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Owner</span>` : `<span style="font-size:0.62rem;background:var(--surface2);color:var(--muted);padding:0.15rem 0.45rem;border-radius:4px;font-weight:600">Member</span>`}
      </div>
      ${m.role !== "owner" ? `<button type="button" class="btn btn-sm" style="background:rgba(255,82,82,0.1);color:#ff7070;border:1px solid rgba(255,82,82,0.25);font-size:0.72rem;padding:0.3rem 0.6rem" onclick="removeMember('${m.id}')">Remove</button>` : ""}
    </div>`).join("");

  return `
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Members</div>
    <div class="section-desc">Authorized Telegram users who can interact with the bot. The owner (Your User ID above) is always authorized. Members can chat with the bot but personalization (name, timezone) applies only to the owner.</div>
    <div id="members-list">
      ${members.length > 0 ? rows : `<div style="font-size:0.78rem;color:var(--muted);padding:0.65rem 0">No members added yet.</div>`}
    </div>
    <div style="margin-top:0.85rem;display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:120px">
        <label style="font-size:0.68rem;color:var(--muted);display:block;margin-bottom:0.3rem">Name</label>
        <input id="member-name" type="text" placeholder="Alex" style="width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:0.5rem 0.65rem;color:var(--text);font-size:0.82rem;outline:none" />
      </div>
      <div style="flex:1;min-width:120px">
        <label style="font-size:0.68rem;color:var(--muted);display:block;margin-bottom:0.3rem">Telegram ID</label>
        <input id="member-tid" type="text" placeholder="123456789" style="width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:0.5rem 0.65rem;color:var(--text);font-size:0.82rem;outline:none" />
      </div>
      <button type="button" class="btn btn-sm" onclick="addMember()" style="white-space:nowrap">Add Member</button>
    </div>
    <span id="member-status" style="font-size:0.72rem;color:var(--muted);margin-top:0.4rem;display:block"></span>
  </div>

  <script>
  function addMember() {
    var name = document.getElementById('member-name').value.trim();
    var tid = document.getElementById('member-tid').value.trim();
    var status = document.getElementById('member-status');
    if (!name || !tid) { status.textContent = 'Both name and Telegram ID are required.'; status.style.color = '#ff5252'; return; }
    if (!/^\\d+$/.test(tid)) { status.textContent = 'Telegram ID must be numeric.'; status.style.color = '#ff5252'; return; }
    status.textContent = 'Adding...'; status.style.color = 'var(--muted)';
    fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, telegram_id: tid }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) { location.reload(); }
        else { status.textContent = d.error || 'Failed to add member.'; status.style.color = '#ff5252'; }
      })
      .catch(function(e) { status.textContent = 'Request failed: ' + e.message; status.style.color = '#ff5252'; });
  }
  function removeMember(id) {
    if (!confirm('Remove this member?')) return;
    fetch('/api/members/' + id, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) { location.reload(); }
        else { alert(d.error || 'Failed to remove member.'); }
      })
      .catch(function(e) { alert('Request failed: ' + e.message); });
  }
  </script>`;
}

function renderClaudeAuthSection(current: Record<string, string>): string {
  const method = current.CLAUDE_AUTH_METHOD || "api_key";
  const isOAuth = method === "oauth";

  return `
  <div style="margin-bottom:1rem">
    <div style="display:flex;gap:0.5rem;margin-bottom:0.85rem">
      <button type="button" id="auth-tab-api" class="btn btn-sm"
        style="${!isOAuth ? "background:var(--accent);color:var(--accent-text);border-color:var(--accent)" : "background:transparent;color:var(--muted);border:1px solid var(--border2)"}"
        onclick="switchAuthMethod('api_key')">
        API Key
      </button>
      <button type="button" id="auth-tab-oauth" class="btn btn-sm"
        style="${isOAuth ? "background:var(--accent);color:var(--accent-text);border-color:var(--accent)" : "background:transparent;color:var(--muted);border:1px solid var(--border2)"}"
        onclick="switchAuthMethod('oauth')">
        Browser Login
      </button>
    </div>
    <input type="hidden" name="CLAUDE_AUTH_METHOD" id="CLAUDE_AUTH_METHOD" value="${method}" />

    <!-- OAuth section -->
    <div id="oauth-section" style="display:${isOAuth ? "block" : "none"}">
      <div id="oauth-status" style="font-size:0.82rem;color:var(--muted);padding:0.65rem 0.85rem;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;margin-bottom:0.65rem">
        Checking authentication status...
      </div>

      <!-- Step 1: Start login -->
      <div id="oauth-step1">
        <div style="display:flex;gap:0.5rem;align-items:center">
          <button type="button" id="oauth-login-btn" class="btn btn-sm" onclick="startClaudeLogin()">
            Sign in with Browser
          </button>
          <button type="button" id="oauth-logout-btn" class="btn btn-sm" style="display:none;background:rgba(255,82,82,0.1);color:#ff7070;border:1px solid rgba(255,82,82,0.25)" onclick="claudeLogout()">
            Sign Out
          </button>
          <span id="oauth-action-status" style="font-size:0.72rem;color:var(--muted)"></span>
        </div>
      </div>

      <!-- Step 2: Paste auth code -->
      <div id="oauth-step2" style="display:none;margin-top:0.65rem;padding:0.85rem;background:var(--surface2);border:1px solid var(--border2);border-radius:8px">
        <div style="font-size:0.82rem;color:var(--text);margin-bottom:0.5rem;font-weight:600">Paste the authentication code</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-bottom:0.65rem;line-height:1.5">
          After signing in, the browser will show an authentication code. Copy it and paste it below.
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <input type="text" id="oauth-code-input" placeholder="Paste code here"
            style="flex:1;background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:0.5rem 0.65rem;color:var(--text);font-size:0.88rem;font-family:monospace;outline:none" />
          <button type="button" id="oauth-code-btn" class="btn btn-sm" onclick="submitAuthCode()">Submit</button>
        </div>
        <span id="oauth-code-status" style="font-size:0.72rem;color:var(--muted);margin-top:0.35rem;display:block"></span>
      </div>
    </div>

    <!-- API key section (shown/hidden by the form field below) -->
    <div id="apikey-section" style="display:${isOAuth ? "none" : "block"}">
    </div>
  </div>

  <script>
  function switchAuthMethod(method) {
    document.getElementById('CLAUDE_AUTH_METHOD').value = method;
    var isOAuth = method === 'oauth';
    document.getElementById('oauth-section').style.display = isOAuth ? 'block' : 'none';
    document.getElementById('apikey-section').style.display = isOAuth ? 'none' : 'block';
    var akField = document.getElementById('ANTHROPIC_API_KEY');
    if (akField) akField.closest('.field').style.display = isOAuth ? 'none' : '';
    var tabApi = document.getElementById('auth-tab-api');
    var tabOauth = document.getElementById('auth-tab-oauth');
    if (isOAuth) {
      tabOauth.style.background = 'var(--accent)'; tabOauth.style.color = 'var(--accent-text)'; tabOauth.style.borderColor = 'var(--accent)';
      tabApi.style.background = 'transparent'; tabApi.style.color = 'var(--muted)'; tabApi.style.borderColor = 'var(--border2)';
    } else {
      tabApi.style.background = 'var(--accent)'; tabApi.style.color = 'var(--accent-text)'; tabApi.style.borderColor = 'var(--accent)';
      tabOauth.style.background = 'transparent'; tabOauth.style.color = 'var(--muted)'; tabOauth.style.borderColor = 'var(--border2)';
    }
    if (isOAuth) checkClaudeAuth();
  }

  function checkClaudeAuth() {
    var el = document.getElementById('oauth-status');
    el.textContent = 'Checking...';
    el.style.color = 'var(--muted)';
    document.getElementById('oauth-step2').style.display = 'none';
    fetch('/api/claude-auth/status')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.loggedIn) {
          el.innerHTML = '<span style="color:var(--accent);font-weight:600">Authenticated</span> — ' +
            (d.email || '') + (d.orgName ? ' (' + d.orgName + ')' : '') +
            (d.subscriptionType ? ' <span style="font-size:0.7rem;color:var(--muted)">[' + d.subscriptionType + ']</span>' : '');
          document.getElementById('oauth-login-btn').style.display = 'none';
          document.getElementById('oauth-logout-btn').style.display = '';
        } else {
          el.innerHTML = '<span style="color:var(--muted)">Not signed in.</span> Click below to start.';
          document.getElementById('oauth-login-btn').style.display = '';
          document.getElementById('oauth-login-btn').textContent = 'Sign in with Browser';
          document.getElementById('oauth-login-btn').disabled = false;
          document.getElementById('oauth-login-btn').onclick = startClaudeLogin;
          document.getElementById('oauth-logout-btn').style.display = 'none';
        }
      })
      .catch(function(e) {
        el.textContent = 'Could not check status: ' + e.message;
        el.style.color = '#ff5252';
      });
  }

  function startClaudeLogin() {
    var btn = document.getElementById('oauth-login-btn');
    var status = document.getElementById('oauth-action-status');
    btn.disabled = true;
    btn.textContent = 'Starting...';
    status.textContent = 'Preparing login... (this takes a few seconds)';
    status.style.color = 'var(--muted)';
    // Open window immediately (on user click) to avoid popup blocker
    var authWindow = window.open('about:blank', '_blank');
    fetch('/api/claude-auth/login', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.url) {
          if (authWindow && !authWindow.closed) {
            authWindow.location.href = d.url;
          } else {
            // Fallback: show link if popup was blocked
            status.innerHTML = '<a href="' + d.url + '" target="_blank" style="color:var(--accent)">Click here to sign in</a>';
          }
          status.innerHTML = 'Sign in in the browser tab that opened.';
          status.style.color = 'var(--accent)';
          // Show code paste step
          document.getElementById('oauth-step2').style.display = 'block';
          document.getElementById('oauth-code-input').value = '';
          document.getElementById('oauth-code-input').focus();
          document.getElementById('oauth-code-status').textContent = '';
          btn.textContent = 'Sign in with Browser';
          btn.disabled = false;
        } else if (d.error) {
          if (authWindow) authWindow.close();
          status.textContent = d.error;
          status.style.color = '#ff5252';
          btn.textContent = 'Sign in with Browser';
          btn.disabled = false;
        }
      })
      .catch(function(e) {
        if (authWindow) authWindow.close();
        status.textContent = 'Request failed: ' + e.message;
        status.style.color = '#ff5252';
        btn.textContent = 'Sign in with Browser';
        btn.disabled = false;
      });
  }

  function submitAuthCode() {
    var code = document.getElementById('oauth-code-input').value.trim();
    var btn = document.getElementById('oauth-code-btn');
    var status = document.getElementById('oauth-code-status');
    if (!code) { status.textContent = 'Please paste the code.'; status.style.color = '#ff5252'; return; }
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    status.textContent = '';
    fetch('/api/claude-auth/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        btn.disabled = false;
        btn.textContent = 'Submit';
        if (d.ok) {
          status.textContent = 'Authenticated successfully!';
          status.style.color = 'var(--accent)';
          document.getElementById('oauth-step2').style.display = 'none';
          document.getElementById('oauth-action-status').textContent = '';
          checkClaudeAuth();
        } else {
          status.textContent = d.error || 'Authentication failed.';
          status.style.color = '#ff5252';
        }
      })
      .catch(function(e) {
        btn.disabled = false;
        btn.textContent = 'Submit';
        status.textContent = 'Request failed: ' + e.message;
        status.style.color = '#ff5252';
      });
  }

  function claudeLogout() {
    var btn = document.getElementById('oauth-logout-btn');
    btn.disabled = true;
    btn.textContent = 'Signing out...';
    fetch('/api/claude-auth/logout', { method: 'POST' })
      .then(function() { btn.disabled = false; btn.textContent = 'Sign Out'; checkClaudeAuth(); })
      .catch(function() { btn.disabled = false; btn.textContent = 'Sign Out'; checkClaudeAuth(); });
  }

  // Auto-check on page load if oauth is the selected method
  if (document.getElementById('CLAUDE_AUTH_METHOD').value === 'oauth') {
    checkClaudeAuth();
  }
  </script>`;
}

export function renderSettingsForm(
  current: Record<string, string>,
  members: { id: string; telegram_id: string; name: string; role: string }[],
  toast?: { type: "success" | "error"; text: string }
): string {
  const isRailway = !!process.env.RAILWAY_PUBLIC_DOMAIN;

  const groupsHtml = FIELD_GROUPS.map(group => {
    const fieldsHtml = group.fields.map(f => {
      const val = (current[f.key] ?? "").replace(/"/g, "&quot;");
      const hasValue = val.length > 0;

      if (f.type === "toggle") {
        // Default to enabled (true) unless explicitly set to "false"
        const on = current[f.key] !== "false";
        const toggleId = `toggle_${f.key}`;
        return `
      <div class="field" style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0">
        <label for="${toggleId}" style="margin:0;cursor:pointer">${f.label}</label>
        <label for="${toggleId}" style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;cursor:pointer">
          <input type="hidden" name="${f.key}" value="false" id="${f.key}" ${on ? "disabled" : ""} />
          <input type="checkbox" id="${toggleId}" value="true"
            ${on ? "checked" : ""}
            style="opacity:0;width:0;height:0;position:absolute"
            onchange="
              var h=document.getElementById('${f.key}');
              h.value=this.checked?'true':'false';
              h.disabled=false;
              var s=this.parentElement.querySelector('span');
              var k=s.querySelector('span');
              s.style.background=this.checked?'var(--accent)':'var(--border2)';
              k.style.transform=this.checked?'translateX(18px)':'none';
            " />
          <span style="position:absolute;inset:0;background:${on ? "var(--accent)" : "var(--border2)"};border-radius:24px;transition:.2s">
            <span style="position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s;transform:${on ? "translateX(18px)" : "none"}"></span>
          </span>
        </label>
      </div>`;
      }

      return `
      <div class="field">
        <label for="${f.key}">${f.label}${f.required ? ' <span style="color:var(--accent)">*</span>' : ""}</label>
        <div class="input-wrap">
          <input
            id="${f.key}" name="${f.key}"
            type="${f.type}" value="${val}" placeholder="${f.placeholder}"
            autocomplete="off"
            ${f.type === "password" ? `data-reveal="false"` : ""}
          />
          ${f.type === "password" ? `<button type="button" class="reveal-btn" onclick="toggleReveal('${f.key}')">Show</button>` : ""}
        </div>
        ${hasValue && f.type === "password" ? `<span class="set-badge">✓ set</span>` : ""}
      </div>`;
    }).join("");

    // Inject Claude auth toggle into the AI group
    const authExtra = group.title === "AI" ? renderClaudeAuthSection(current) : "";

    return `
    <div class="card" style="margin-bottom:1rem;">
      <div class="section-title">${group.title}</div>
      <div class="section-desc">${group.description}</div>
      ${authExtra}
      ${fieldsHtml}
    </div>`;
  }).join("");

  const toastHtml = toast
    ? `<div class="toast toast-${toast.type}">${toast.text}</div>`
    : "";

  const dangerActions = [
    { action: "messages", label: "Clear Chat History",  desc: "Deletes all conversation messages from the database.",  icon: "▣" },
    { action: "tasks",    label: "Clear All Tasks",     desc: "Deletes all scheduled tasks.",                          icon: "⏰" },
    { action: "memory",   label: "Clear All Memory",    desc: "Deletes all stored facts, goals, and preferences.",     icon: "◈" },
    { action: "files",    label: "Clear All Files",     desc: "Deletes all files generated by Claude.",                icon: "📁" },
  ];

  const dangerButtons = dangerActions.map(a => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 0;border-bottom:1px solid var(--border2)">
      <div>
        <div style="font-size:0.83rem;font-weight:600;color:var(--text)">${a.icon} ${a.label}</div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:0.15rem">${a.desc}</div>
      </div>
      <button type="button" class="btn btn-sm"
        style="background:rgba(255,82,82,0.1);color:#ff7070;border:1px solid rgba(255,82,82,0.25);flex-shrink:0;margin-left:1rem"
        onclick="openDangerModal('${a.action}','${a.label}','${a.desc}')">
        Clear
      </button>
    </div>`).join("");

  return `
  ${toastHtml}
  ${renderThemeSection(current)}
  ${renderMembersSection(members)}

  <!-- ── Danger Zone confirmation modal ─────────────────── -->
  <div id="danger-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeDangerModal()">
    <div style="background:var(--surface);border:1px solid rgba(255,82,82,0.35);border-radius:12px;padding:1.75rem;width:min(420px,90vw)">
      <div style="font-size:1rem;font-weight:700;color:#ff7070;margin-bottom:0.5rem" id="danger-title"></div>
      <div style="font-size:0.83rem;color:var(--muted);margin-bottom:1.5rem;line-height:1.6" id="danger-desc"></div>
      <div style="font-size:0.78rem;color:#ff7070;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2);border-radius:6px;padding:0.65rem 0.85rem;margin-bottom:1.25rem">
        This action is permanent and cannot be undone.
      </div>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem">
        <button class="btn btn-outline btn-sm" onclick="closeDangerModal()">Cancel</button>
        <form id="danger-form" method="POST" style="display:inline">
          <button type="submit" class="btn btn-sm"
            style="background:rgba(255,82,82,0.15);color:#ff7070;border:1px solid rgba(255,82,82,0.3)">
            Yes, delete everything
          </button>
        </form>
      </div>
    </div>
  </div>

  <!-- ── Import from .env ────────────────────────────────── -->
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Import from .env</div>
    <div class="section-desc">Paste the contents of a <code>.env</code> file and matching fields will be filled in automatically.</div>
    <textarea id="env-paste" rows="5" placeholder="TELEGRAM_BOT_TOKEN=123...\nANTHROPIC_API_KEY=sk-ant-..."
      style="width:100%;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:0.65rem 0.75rem;color:var(--text);font-family:monospace;font-size:0.78rem;resize:vertical;outline:none;margin-top:0.25rem"></textarea>
    <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.6rem">
      <button type="button" class="btn btn-sm" onclick="importEnv()">Fill Fields</button>
      <span id="env-status" style="font-size:0.75rem;color:var(--muted)"></span>
    </div>
  </div>

  <form method="POST" action="/api/settings">
    ${groupsHtml}
    ${isRailway
      ? renderFieldGroup(
          "Philips Hue (Remote / Cloud)",
          `You're running on Railway. Use the Hue Remote API — works from anywhere. ` +
          `<strong>Step 1:</strong> Register a free developer app at <a href="https://developers.meethue.com" target="_blank" style="color:var(--accent)">developers.meethue.com</a>. ` +
          `<strong>Step 2:</strong> Complete the OAuth flow to get an access token. ` +
          `<strong>Step 3:</strong> Find your bridge ID at <a href="https://discovery.meethue.com" target="_blank" style="color:var(--accent)">discovery.meethue.com</a>. ` +
          `Then set the fields below and tell Claude to control your lights.`,
          HUE_REMOTE_FIELDS,
          current
        )
      : renderFieldGroup(
          "Philips Hue (Local)",
          `Use the direct bridge API — fast, no cloud needed. ` +
          `Press the button on your Hue bridge, then click <strong>Discover &amp; Setup</strong> to auto-fill the fields below. ` +
          `<br><br>` +
          `<button type="button" class="btn btn-sm" id="hue-setup-btn" onclick="hueSetup()" style="margin-top:0.25rem">` +
          `Discover &amp; Setup</button> ` +
          `<span id="hue-setup-status" style="font-size:0.75rem;color:var(--muted);margin-left:0.5rem"></span>`,
          HUE_LOCAL_FIELDS,
          current
        )
    }
    <div class="save-bar">
      <button type="submit" class="btn">Save All Settings</button>
    </div>
  </form>

  <!-- ── Danger Zone ─────────────────────────────────────── -->
  <div class="card" style="margin-top:1.5rem;border-color:rgba(255,82,82,0.25);">
    <div class="card-title" style="color:#ff7070">Danger Zone</div>
    <div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.75rem">
      These actions permanently delete data and cannot be undone.
    </div>
    <div style="margin-top:-0.25rem">
      ${dangerButtons}
      <div style="border-bottom:none;padding-bottom:0"></div>
    </div>
  </div>

  <script>
  function hueSetup() {
    var btn = document.getElementById('hue-setup-btn');
    var status = document.getElementById('hue-setup-status');
    btn.disabled = true;
    btn.textContent = "Searching\u2026";
    status.textContent = "Press the button on your bridge now if you have not already.";
    status.style.color = "var(--muted)";
    fetch("/api/hue-setup", { method: "POST" })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          var ip = document.getElementById("HUE_BRIDGE_IP");
          var key = document.getElementById("HUE_API_KEY");
          if (ip) { ip.value = d.ip; }
          if (key) { key.value = d.token; key.type = "text"; }
          btn.textContent = "\u2713 Done";
          status.textContent = "Bridge found at " + d.ip + ". Click Save All Settings to save.";
          status.style.color = "var(--accent)";
        } else {
          btn.disabled = false;
          btn.textContent = "Discover & Setup";
          status.textContent = d.error || "Setup failed.";
          status.style.color = "#ff5252";
        }
      })
      .catch(function(e) {
        btn.disabled = false;
        btn.textContent = "Discover & Setup";
        status.textContent = "Request failed: " + e.message;
        status.style.color = "#ff5252";
      });
  }

  function importEnv() {
    var raw = document.getElementById('env-paste').value;
    var filled = 0, skipped = 0;
    raw.split('\\n').forEach(function(line) {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      var eq = line.indexOf('=');
      if (eq < 1) return;
      var key = line.slice(0, eq).trim();
      var val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      var el = document.getElementById(key);
      if (el && el.tagName === 'INPUT' && el.type !== 'checkbox') {
        el.value = val;
        if (el.type === 'password') el.type = 'text';
        filled++;
      } else {
        skipped++;
      }
    });
    var s = document.getElementById('env-status');
    s.textContent = filled + ' field' + (filled !== 1 ? 's' : '') + ' filled' + (skipped ? ', ' + skipped + ' unknown keys skipped' : '') + '.';
    s.style.color = filled > 0 ? 'var(--accent)' : 'var(--muted)';
  }

  function openDangerModal(action, label, desc) {
    document.getElementById('danger-title').textContent = label;
    document.getElementById('danger-desc').textContent = desc;
    document.getElementById('danger-form').action = '/api/clear/' + action;
    document.getElementById('danger-modal').style.display = 'flex';
  }
  function closeDangerModal() {
    document.getElementById('danger-modal').style.display = 'none';
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDangerModal();
  });
  </script>`;
}
