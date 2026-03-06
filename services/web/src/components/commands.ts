import { sql } from "../db.ts";

const BUILTIN_COMMANDS = [
  { command: "start",    description: "Welcome message and quick-start guide" },
  { command: "help",     description: "Show all available commands" },
  { command: "tasks",    description: "List scheduled tasks" },
  { command: "memory",   description: "List all memory items" },
  { command: "session",  description: "Current session info" },
  { command: "botinfo",  description: "Bot configuration & status" },
  { command: "userinfo", description: "Your user info" },
  { command: "restart",  description: "Restart the bot" },
  { command: "callme",   description: "Start an AI phone call (requires ElevenLabs)" },
  { command: "mcps",     description: "List all installed MCP servers" },
  { command: "tunnel",   description: "Enable/disable remote dashboard access (/tunnel on|off|status)" },
  { command: "newsession",  description: "Clear current Claude session and start fresh" },
];

export async function renderCommands(): Promise<string> {
  let commands: any[];
  try {
    commands = await sql`
      SELECT id, command, description, action_prompt, enabled, created_at
      FROM telegram_commands
      ORDER BY command ASC
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading commands: ${err.message}</p></div>`;
  }

  const cmdMap: Record<string, any> = {};
  for (const c of commands) cmdMap[c.id] = c;

  const customRows = commands.map(c => {
    const badge = c.enabled
      ? `<span class="badge badge-green">on</span>`
      : `<span class="badge badge-gray">off</span>`;
    return `
    <tr>
      <td style="font-family:monospace;color:var(--accent)">/${c.command.replace(/</g, "&lt;")}</td>
      <td style="font-size:0.84rem">${c.description.replace(/</g, "&lt;")}</td>
      <td style="font-size:0.75rem;color:var(--muted);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${c.action_prompt.replace(/</g, "&lt;").substring(0, 80)}…
      </td>
      <td>${badge}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-sm" onclick="openEditModal(${c.id})">Edit</button>
        <form method="POST" action="/api/commands/${c.id}/delete" style="display:inline;margin-left:0.35rem"
              onsubmit="return confirm('Delete /${c.command}?')">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const emptyRow = commands.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">No custom commands yet. Add one below.</td></tr>`
    : "";

  const builtinRows = BUILTIN_COMMANDS.map(c => `
    <tr>
      <td style="font-family:monospace;color:var(--muted)">/${c.command}</td>
      <td style="font-size:0.84rem;color:var(--muted)">${c.description}</td>
      <td><span class="badge badge-gray">built-in</span></td>
    </tr>`).join("");

  return `
  <!-- ── Header ──────────────────────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
    <span style="font-size:0.82rem;color:var(--muted)">${commands.length} custom · ${BUILTIN_COMMANDS.length} built-in</span>
    <button class="btn btn-sm" onclick="openAddModal()">+ Add Command</button>
  </div>

  <!-- ── Add Modal ────────────────────────────────────────── -->
  <div id="cmd-add-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeAddModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(520px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">New Command</div>
        <button onclick="closeAddModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form method="POST" action="/api/commands">
        <div class="field">
          <label>Command</label>
          <input name="command" type="text" placeholder="standup" required
            style="font-family:monospace"
            oninput="this.value=this.value.replace(/[^a-z0-9_]/g,'').toLowerCase()">
          <div style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem">Lowercase letters, numbers, underscores only. Will be triggered as /command.</div>
        </div>
        <div class="field">
          <label>Description</label>
          <input name="description" type="text" placeholder="Send my daily standup" required>
        </div>
        <div class="field">
          <label>Action prompt</label>
          <textarea name="action_prompt" rows="4" required
            placeholder="Generate a daily standup message for the user. Include: what they worked on yesterday, what they plan today, and any blockers."
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeAddModal()">Cancel</button>
          <button type="submit" class="btn btn-sm">Create</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Edit Modal ───────────────────────────────────────── -->
  <div id="cmd-edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeEditModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(520px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">Edit Command</div>
        <button onclick="closeEditModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form id="edit-form" method="POST" action="">
        <div class="field">
          <label>Command</label>
          <input id="edit-command" name="command" type="text" required style="font-family:monospace"
            oninput="this.value=this.value.replace(/[^a-z0-9_]/g,'').toLowerCase()">
        </div>
        <div class="field">
          <label>Description</label>
          <input id="edit-description" name="description" type="text" required>
        </div>
        <div class="field">
          <label>Action prompt</label>
          <textarea id="edit-action-prompt" name="action_prompt" rows="4" required
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div class="field" style="display:flex;align-items:center;gap:0.5rem">
          <input id="edit-enabled" name="enabled" type="checkbox" value="true" style="width:auto">
          <label for="edit-enabled" style="margin:0;cursor:pointer">Enabled</label>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeEditModal()">Cancel</button>
          <button type="submit" class="btn btn-sm">Save</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Custom Commands Table ────────────────────────────── -->
  <div class="card" style="padding:0;overflow:hidden;margin-bottom:1.25rem">
    <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Custom Commands</div>
    <div style="overflow-x:auto">
      <table style="white-space:nowrap">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Action prompt</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${customRows}${emptyRow}</tbody>
      </table>
    </div>
  </div>

  <!-- ── Built-in Commands Table ──────────────────────────── -->
  <div class="card" style="padding:0;overflow:hidden">
    <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Built-in Commands</div>
    <div style="overflow-x:auto">
      <table style="white-space:nowrap">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>${builtinRows}</tbody>
      </table>
    </div>
  </div>

  <script>
  const CMDS = ${JSON.stringify(cmdMap)};

  function openAddModal() {
    document.getElementById('cmd-add-modal').style.display = 'flex';
  }
  function closeAddModal() {
    document.getElementById('cmd-add-modal').style.display = 'none';
  }

  function openEditModal(id) {
    const c = CMDS[id];
    if (!c) return;
    document.getElementById('edit-form').action = '/api/commands/' + id + '/edit';
    document.getElementById('edit-command').value = c.command;
    document.getElementById('edit-description').value = c.description;
    document.getElementById('edit-action-prompt').value = c.action_prompt;
    document.getElementById('edit-enabled').checked = c.enabled;
    document.getElementById('cmd-edit-modal').style.display = 'flex';
  }
  function closeEditModal() {
    document.getElementById('cmd-edit-modal').style.display = 'none';
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeAddModal(); closeEditModal(); }
  });
  </script>`;
}
