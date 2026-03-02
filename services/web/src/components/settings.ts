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
    description: "Claude API key — used by the relay to call Claude Code CLI.",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", type: "password", placeholder: "sk-ant-...", required: true },
    ],
  },
  {
    title: "Voice Transcription",
    description: "Transcribe voice messages using whisper.cpp (built into the relay). Download a model file to whisper-models/ and set the path below.",
    fields: [
      { key: "WHISPER_MODEL_PATH", label: "Whisper Model Path", type: "text", placeholder: "/whisper-models/ggml-base.en.bin", required: false },
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
];

export function renderSettingsForm(
  current: Record<string, string>,
  toast?: { type: "success" | "error"; text: string }
): string {
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

    return `
    <div class="card" style="margin-bottom:1rem;">
      <div class="section-title">${group.title}</div>
      <div class="section-desc">${group.description}</div>
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

  <form method="POST" action="/api/settings">
    ${groupsHtml}
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
