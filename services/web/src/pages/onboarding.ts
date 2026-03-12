import { layout } from "../components/layout.ts";
import { sql } from "../db.ts";

const STEPS = [
  {
    id: "telegram",
    title: "Connect Telegram",
    description: "Create a bot and get your user ID.",
    instructions: `
    <ol style="color:var(--muted);font-size:0.84rem;line-height:2;padding-left:1.25rem;">
      <li>Open <a href="tg://resolve?domain=BotFather" style="color:var(--accent)">@BotFather</a> in Telegram</li>
      <li>Send <code>/newbot</code>, pick a name and username ending in "bot"</li>
      <li>Copy the token it gives you</li>
      <li>Get your user ID from <a href="tg://resolve?domain=userinfobot" style="color:var(--accent)">@userinfobot</a></li>
    </ol>`,
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token",    type: "password", placeholder: "1234567890:ABCdef..." },
      { key: "TELEGRAM_USER_ID",   label: "Your User ID", type: "text",     placeholder: "123456789" },
    ],
  },
  {
    id: "ai",
    title: "Connect Claude",
    description: "Your bot uses Claude to think and respond. Choose how to authenticate.",
    instructions: ``,
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", type: "password", placeholder: "sk-ant-...", required: false },
    ],
  },
  {
    id: "voice",
    title: "Voice Transcription",
    description: "Voice messages are transcribed locally using whisper.cpp — no API key needed.",
    instructions: `
    <p style="color:var(--muted);font-size:0.84rem;line-height:1.7;">
      A whisper model was automatically downloaded during setup. Your bot can understand voice messages out of the box.
    </p>`,
    fields: [],
  },
  {
    id: "personalize",
    title: "Personalize",
    description: "Help your bot address you correctly.",
    instructions: ``,
    fields: [
      { key: "USER_NAME",     label: "Your Name",     type: "text", placeholder: "Alex",             required: false },
      { key: "USER_TIMEZONE", label: "Your Timezone", type: "text", placeholder: "America/New_York", required: false },
    ],
  },
];

function renderOnboardingAuthToggle(existing: Record<string, string>): string {
  const method = existing.CLAUDE_AUTH_METHOD || "api_key";
  const isOAuth = method === "oauth";

  return `
  <div style="margin-top:1rem;margin-bottom:0.5rem">
    <div style="display:flex;gap:0.5rem;margin-bottom:0.85rem">
      <button type="button" id="ob-auth-tab-api" class="btn btn-sm"
        style="${!isOAuth ? "background:var(--accent);color:var(--accent-text);border-color:var(--accent)" : "background:transparent;color:var(--muted);border:1px solid var(--border2)"}"
        onclick="switchOnboardingAuth('api_key')">
        API Key
      </button>
      <button type="button" id="ob-auth-tab-oauth" class="btn btn-sm"
        style="${isOAuth ? "background:var(--accent);color:var(--accent-text);border-color:var(--accent)" : "background:transparent;color:var(--muted);border:1px solid var(--border2)"}"
        onclick="switchOnboardingAuth('oauth')">
        Browser Login
      </button>
    </div>
    <div id="ob-oauth-section" style="display:${isOAuth ? "block" : "none"};background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:0.85rem;margin-bottom:0.75rem">
      <div id="ob-oauth-status" style="font-size:0.82rem;color:var(--muted);margin-bottom:0.6rem">Click below to sign in via your browser.</div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button type="button" id="ob-oauth-login-btn" class="btn btn-sm" onclick="startOnboardingLogin()">Sign in with Browser</button>
        <span id="ob-oauth-action" style="font-size:0.72rem;color:var(--muted)"></span>
      </div>
      <!-- Code paste step -->
      <div id="ob-oauth-step2" style="display:none;margin-top:0.65rem;padding-top:0.65rem;border-top:1px solid var(--border2)">
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.5rem">Paste the authentication code shown in your browser:</div>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <input type="text" id="ob-oauth-code" placeholder="Paste code here"
            style="flex:1;background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:0.5rem 0.65rem;color:var(--text);font-size:0.88rem;font-family:monospace;outline:none" />
          <button type="button" id="ob-oauth-code-btn" class="btn btn-sm" onclick="submitOnboardingCode()">Submit</button>
        </div>
        <span id="ob-oauth-code-status" style="font-size:0.72rem;color:var(--muted);margin-top:0.3rem;display:block"></span>
      </div>
    </div>
    <p style="font-size:0.75rem;color:var(--muted);line-height:1.5;margin-bottom:0.5rem">
      ${isOAuth ? "Or paste an API key below instead:" : `Go to <strong>console.anthropic.com</strong> to create an API key, or use Browser Login.`}
    </p>
  </div>`;
}

export async function renderOnboarding(stepId?: string, toast?: { type: "success" | "error"; text: string }): Promise<string> {
  const currentStepIndex = STEPS.findIndex(s => s.id === stepId) ?? 0;
  const stepIndex = currentStepIndex < 0 ? 0 : currentStepIndex;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // Load existing values for pre-fill
  const rows = await sql`SELECT key, value FROM settings`;
  const existing: Record<string, string> = {};
  for (const row of rows) existing[row.key] = row.value ?? "";

  const progressDots = STEPS.map((_s, i) => {
    const active = i === stepIndex ? "background:var(--accent)" : i < stepIndex ? "background:#4ade80" : "background:var(--border)";
    return `<div style="width:10px;height:10px;border-radius:50%;${active}"></div>`;
  }).join("");

  const fieldsHtml = step.fields.map(f => {
    const val = (existing[f.key] ?? "").replace(/"/g, "&quot;");
    const hasValue = val.length > 0;
    const required = f.required !== false && !step.optional && !hasValue ? "required" : "";
    return `
    <div class="field">
      <label for="${f.key}">${f.label}</label>
      <div class="input-wrap">
        <input id="${f.key}" name="${f.key}" type="${f.type}" value="${val}" placeholder="${f.placeholder}" autocomplete="off" data-lpignore="true" data-1p-ignore ${required}
          ${f.type === "password" ? `data-reveal="false"` : ""}
        />
        ${f.type === "password" ? `<button type="button" class="reveal-btn" onclick="toggleReveal('${f.key}')">Show</button>` : ""}
      </div>
      ${hasValue && f.type === "password" ? `<span class="set-badge">✓ set</span>` : ""}
    </div>`;
  }).join("");

  const nextStep = STEPS[stepIndex + 1];
  const skipLink = step.optional
    ? `<a href="/onboarding?step=${nextStep?.id ?? "done"}" class="btn btn-outline btn-sm" style="margin-right:0.75rem">Skip</a>`
    : "";

  const toastHtml = toast
    ? `<div class="toast toast-${toast.type}">${toast.text}</div>`
    : "";

  const content = `
  ${toastHtml}
  <div style="max-width:520px;margin:3rem auto;">
    <div style="text-align:center;margin-bottom:2.5rem;">
      <h1 style="font-size:1.4rem;font-weight:700;color:#fff;margin-bottom:0.4rem;">Set up your bot</h1>
      <p style="color:var(--muted);font-size:0.84rem;">Step ${stepIndex + 1} of ${STEPS.length}</p>
      <div style="display:flex;gap:0.5rem;justify-content:center;margin-top:0.75rem;">
        ${progressDots}
      </div>
    </div>

    <div class="card">
      <div class="section-title">${step.title}</div>
      <div class="section-desc">${step.description}</div>
      ${step.instructions}
      ${step.id === "ai" ? renderOnboardingAuthToggle(existing) : ""}
      <form method="POST" action="/api/onboarding-step" style="margin-top:1.25rem;">
        <input type="hidden" name="_step" value="${step.id}" />
        <input type="hidden" name="_next" value="${nextStep?.id ?? "done"}" />
        ${step.id === "ai" ? `<input type="hidden" name="CLAUDE_AUTH_METHOD" id="CLAUDE_AUTH_METHOD" value="${existing.CLAUDE_AUTH_METHOD || "api_key"}" /><div id="apikey-fields">` : ""}
        ${fieldsHtml}
        ${step.id === "ai" ? `</div>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1rem;">
          ${step.id === "telegram" ? `
          <div style="display:flex;align-items:center;gap:0.5rem">
            <button type="button" id="test-btn" class="btn btn-outline btn-sm" disabled onclick="testTelegram()">Test</button>
            <span id="test-result" style="font-size:0.78rem;color:var(--muted)"></span>
          </div>` : `<span></span>`}
          <div style="display:flex;align-items:center;gap:0.5rem">
            ${skipLink}
            <button type="submit" id="submit-btn" class="btn" ${step.id === "telegram" && !(existing.TELEGRAM_BOT_TOKEN && existing.TELEGRAM_USER_ID) ? "disabled" : ""}>${isLast ? "Finish" : "Continue →"}</button>
          </div>
        </div>
      </form>
    </div>
  </div>
  ${step.id === "ai" ? `<script>
  function switchOnboardingAuth(method) {
    document.getElementById('CLAUDE_AUTH_METHOD').value = method;
    var isOAuth = method === 'oauth';
    document.getElementById('apikey-fields').style.display = isOAuth ? 'none' : '';
    document.getElementById('ob-oauth-section').style.display = isOAuth ? 'block' : 'none';
    var tabApi = document.getElementById('ob-auth-tab-api');
    var tabOauth = document.getElementById('ob-auth-tab-oauth');
    if (isOAuth) {
      tabOauth.style.background = 'var(--accent)'; tabOauth.style.color = 'var(--accent-text)'; tabOauth.style.borderColor = 'var(--accent)';
      tabApi.style.background = 'transparent'; tabApi.style.color = 'var(--muted)'; tabApi.style.borderColor = 'var(--border2)';
      checkOnboardingAuth();
    } else {
      tabApi.style.background = 'var(--accent)'; tabApi.style.color = 'var(--accent-text)'; tabApi.style.borderColor = 'var(--accent)';
      tabOauth.style.background = 'transparent'; tabOauth.style.color = 'var(--muted)'; tabOauth.style.borderColor = 'var(--border2)';
    }
  }

  function checkOnboardingAuth() {
    var el = document.getElementById('ob-oauth-status');
    el.textContent = 'Checking...';
    fetch('/api/claude-auth/status')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.loggedIn) {
          el.innerHTML = '<span style="color:var(--accent);font-weight:600">Authenticated</span> — ' +
            (d.email || '') + (d.orgName ? ' (' + d.orgName + ')' : '');
          document.getElementById('ob-oauth-login-btn').textContent = 'Authenticated';
          document.getElementById('ob-oauth-login-btn').disabled = true;
        } else {
          el.innerHTML = 'Not signed in yet. Click below to authenticate.';
          document.getElementById('ob-oauth-login-btn').disabled = false;
          document.getElementById('ob-oauth-login-btn').textContent = 'Sign in with Browser';
        }
      })
      .catch(function(e) { el.textContent = 'Could not check: ' + e.message; });
  }

  function startOnboardingLogin() {
    var btn = document.getElementById('ob-oauth-login-btn');
    var status = document.getElementById('ob-oauth-action');
    btn.disabled = true; btn.textContent = 'Starting...';
    status.textContent = 'Preparing login...';
    status.style.color = 'var(--muted)';
    var authWindow = window.open('about:blank', '_blank');
    fetch('/api/claude-auth/login', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.url) {
          if (authWindow && !authWindow.closed) {
            authWindow.location.href = d.url;
          } else {
            status.innerHTML = '<a href="' + d.url + '" target="_blank" style="color:var(--accent)">Click here to sign in</a>';
          }
          status.innerHTML = 'Sign in in the browser tab that opened.';
          status.style.color = 'var(--accent)';
          btn.textContent = 'Sign in with Browser';
          btn.disabled = false;
          document.getElementById('ob-oauth-step2').style.display = 'block';
          document.getElementById('ob-oauth-code').value = '';
          document.getElementById('ob-oauth-code').focus();
          document.getElementById('ob-oauth-code-status').textContent = '';
        } else {
          if (authWindow) authWindow.close();
          status.textContent = d.error || 'Failed to start login.';
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

  function submitOnboardingCode() {
    var code = document.getElementById('ob-oauth-code').value.trim();
    var btn = document.getElementById('ob-oauth-code-btn');
    var status = document.getElementById('ob-oauth-code-status');
    if (!code) { status.textContent = 'Please paste the code.'; status.style.color = '#ff5252'; return; }
    btn.disabled = true; btn.textContent = 'Verifying...'; status.textContent = '';
    fetch('/api/claude-auth/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        btn.disabled = false; btn.textContent = 'Submit';
        if (d.ok) {
          status.textContent = 'Authenticated!'; status.style.color = 'var(--accent)';
          document.getElementById('ob-oauth-step2').style.display = 'none';
          document.getElementById('ob-oauth-action').textContent = '';
          checkOnboardingAuth();
        } else {
          status.textContent = d.error || 'Authentication failed.'; status.style.color = '#ff5252';
        }
      })
      .catch(function(e) {
        btn.disabled = false; btn.textContent = 'Submit';
        status.textContent = 'Request failed: ' + e.message; status.style.color = '#ff5252';
      });
  }
  </script>` : ""}
  ${step.id === "telegram" ? `<script>
  var testPassed = false;

  function checkTestBtn() {
    const token  = document.getElementById('TELEGRAM_BOT_TOKEN')?.value.trim();
    const userId = document.getElementById('TELEGRAM_USER_ID')?.value.trim();
    document.getElementById('test-btn').disabled = !(token && userId);
  }

  function onInputChange() {
    testPassed = false;
    document.getElementById('submit-btn').disabled = true;
    document.getElementById('test-result').textContent = '';
    checkTestBtn();
  }

  document.getElementById('TELEGRAM_BOT_TOKEN')?.addEventListener('input', onInputChange);
  document.getElementById('TELEGRAM_USER_ID')?.addEventListener('input', onInputChange);
  checkTestBtn();

  async function testTelegram() {
    const btn    = document.getElementById('test-btn');
    const result = document.getElementById('test-result');
    const submitBtn = document.getElementById('submit-btn');
    const token  = document.getElementById('TELEGRAM_BOT_TOKEN')?.value.trim();
    const userId = document.getElementById('TELEGRAM_USER_ID')?.value.trim();
    btn.disabled = true;
    btn.textContent = 'Sending…';
    result.style.color = 'var(--muted)';
    result.textContent = '';
    try {
      const res = await fetch('/api/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user_id: userId }),
      });
      const data = await res.json();
      if (data.ok) {
        testPassed = true;
        submitBtn.disabled = false;
        result.style.color = 'var(--accent)';
        result.textContent = '✓ Message sent — check Telegram';
      } else {
        testPassed = false;
        submitBtn.disabled = true;
        result.style.color = 'var(--red)';
        result.textContent = '✗ ' + (data.error || 'Failed');
      }
    } catch (e) {
      testPassed = false;
      submitBtn.disabled = true;
      result.style.color = 'var(--red)';
      result.textContent = '✗ Request failed';
    }
    btn.textContent = 'Test';
    btn.disabled = !(document.getElementById('TELEGRAM_BOT_TOKEN')?.value.trim() && document.getElementById('TELEGRAM_USER_ID')?.value.trim());
  }
  </script>` : ""}`;

  return layout("Setup", content);
}
