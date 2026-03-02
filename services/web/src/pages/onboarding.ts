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
    title: "Claude API Key",
    description: "Your bot uses Claude to think and respond.",
    instructions: `
    <ol style="color:var(--muted);font-size:0.84rem;line-height:2;padding-left:1.25rem;">
      <li>Go to <strong>console.anthropic.com</strong></li>
      <li>Create an API key and copy it</li>
    </ol>`,
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", type: "password", placeholder: "sk-ant-..." },
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
      <form method="POST" action="/api/onboarding-step" style="margin-top:1.25rem;">
        <input type="hidden" name="_step" value="${step.id}" />
        <input type="hidden" name="_next" value="${nextStep?.id ?? "done"}" />
        ${fieldsHtml}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1rem;">
          ${step.id === "telegram" ? `
          <div style="display:flex;align-items:center;gap:0.5rem">
            <button type="button" id="test-btn" class="btn btn-outline btn-sm" disabled onclick="testTelegram()">Test</button>
            <span id="test-result" style="font-size:0.78rem;color:var(--muted)"></span>
          </div>` : `<span></span>`}
          <div style="display:flex;align-items:center;gap:0.5rem">
            ${skipLink}
            <button type="submit" class="btn">${isLast ? "Finish" : "Continue →"}</button>
          </div>
        </div>
      </form>
    </div>
  </div>
  ${step.id === "telegram" ? `<script>
  function checkTestBtn() {
    const token  = document.getElementById('TELEGRAM_BOT_TOKEN')?.value.trim();
    const userId = document.getElementById('TELEGRAM_USER_ID')?.value.trim();
    document.getElementById('test-btn').disabled = !(token && userId);
  }
  document.getElementById('TELEGRAM_BOT_TOKEN')?.addEventListener('input', checkTestBtn);
  document.getElementById('TELEGRAM_USER_ID')?.addEventListener('input', checkTestBtn);
  checkTestBtn();

  async function testTelegram() {
    const btn    = document.getElementById('test-btn');
    const result = document.getElementById('test-result');
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
        result.style.color = 'var(--accent)';
        result.textContent = '✓ Message sent — check Telegram';
      } else {
        result.style.color = 'var(--red)';
        result.textContent = '✗ ' + (data.error || 'Failed');
      }
    } catch (e) {
      result.style.color = 'var(--red)';
      result.textContent = '✗ Request failed';
    }
    btn.textContent = 'Test';
    btn.disabled = false;
  }
  </script>` : ""}`;

  return layout("Setup", content);
}
