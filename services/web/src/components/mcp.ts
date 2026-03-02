import { sql } from "../db.ts";

export async function renderMcp(): Promise<string> {
  let servers: any[];
  try {
    servers = await sql`
      SELECT id, name, type, command, args, env, url, enabled, created_at
      FROM mcp_servers
      ORDER BY name ASC
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading MCP servers: ${err.message}</p></div>`;
  }

  const srvMap: Record<string, any> = {};
  for (const s of servers) {
    srvMap[s.id] = {
      ...s,
      args: Array.isArray(s.args) ? s.args : [],
      env:  s.env && typeof s.env === "object" ? s.env : {},
    };
  }

  const rows = servers.map(s => {
    const badge = s.enabled
      ? `<span class="badge badge-green">on</span>`
      : `<span class="badge badge-gray">off</span>`;
    const typeBadge = s.type === "sse"
      ? `<span class="badge" style="background:rgba(0,180,255,0.12);color:#60c8ff;border:1px solid rgba(0,180,255,0.2)">SSE</span>`
      : `<span class="badge badge-gray">stdio</span>`;
    const detail = s.type === "sse"
      ? `<span style="font-size:0.75rem;color:var(--muted)">${(s.url || "").replace(/</g,"&lt;")}</span>`
      : `<span style="font-family:monospace;font-size:0.75rem;color:var(--muted)">${(s.command || "").replace(/</g,"&lt;")}${Array.isArray(s.args) && s.args.length ? " " + s.args.join(" ") : ""}</span>`;

    return `
    <tr>
      <td style="font-weight:600">${s.name.replace(/</g,"&lt;")}</td>
      <td>${typeBadge}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${detail}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-sm" onclick="openTestModal(${s.id})">Test</button>
        <button class="btn btn-outline btn-sm" onclick="openEditModal(${s.id})" style="margin-left:0.35rem">Edit</button>
        <form method="POST" action="/api/mcp/${s.id}/delete" style="display:inline;margin-left:0.35rem"
              onsubmit="return confirm('Delete ${s.name.replace(/'/g,"\\'")}?')">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const emptyRow = servers.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">No MCP servers configured yet.</td></tr>`
    : "";

  return `
  <!-- ── Header ──────────────────────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
    <span style="font-size:0.82rem;color:var(--muted)">${servers.filter(s=>s.enabled).length} active · ${servers.length} total · synced to ~/.claude.json on relay restart</span>
    <button class="btn btn-sm" onclick="openAddModal()">+ Add Server</button>
  </div>

  <!-- ── Add Modal ────────────────────────────────────────── -->
  <div id="mcp-add-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeAddModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(540px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">Add MCP Server</div>
        <button onclick="closeAddModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form method="POST" action="/api/mcp" onsubmit="serializeAddForm(this)">
        <input type="hidden" name="args_json" id="add-args-json">
        <input type="hidden" name="env_json"  id="add-env-json">
        <div class="grid-2" style="gap:0.75rem">
          <div class="field">
            <label>Name</label>
            <input name="name" type="text" placeholder="filesystem" required
              oninput="this.value=this.value.replace(/[^a-z0-9_-]/g,'').toLowerCase()">
          </div>
          <div class="field">
            <label>Type</label>
            <select name="type" onchange="toggleAddType(this.value)">
              <option value="stdio">stdio (command)</option>
              <option value="sse">SSE (HTTP)</option>
            </select>
          </div>
        </div>
        <div id="add-stdio-fields">
          <div class="field">
            <label>Command</label>
            <input name="command" id="add-command" type="text" placeholder="npx" style="font-family:monospace">
          </div>
          <div class="field">
            <label>Args <span style="font-size:0.72rem;color:var(--muted);font-weight:400">— one per line</span></label>
            <textarea id="add-args" rows="3"
              placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/files"
              style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.82rem;font-family:monospace;resize:vertical"></textarea>
          </div>
        </div>
        <div id="add-sse-fields" style="display:none">
          <div class="field">
            <label>URL</label>
            <input name="url" id="add-url" type="text" placeholder="https://my-server.com/sse">
          </div>
        </div>
        <div class="field">
          <label>Environment variables <span style="font-size:0.72rem;color:var(--muted);font-weight:400">— KEY=VALUE, one per line (optional)</span></label>
          <textarea id="add-env" rows="2"
            placeholder="API_KEY=your-key"
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.82rem;font-family:monospace;resize:vertical"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeAddModal()">Cancel</button>
          <button type="submit" class="btn btn-sm">Add Server</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Edit Modal ───────────────────────────────────────── -->
  <div id="mcp-edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeEditModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(540px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">Edit MCP Server</div>
        <button onclick="closeEditModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form id="edit-form" method="POST" action="" onsubmit="serializeEditForm(this)">
        <input type="hidden" name="args_json" id="edit-args-json">
        <input type="hidden" name="env_json"  id="edit-env-json">
        <div class="grid-2" style="gap:0.75rem">
          <div class="field">
            <label>Name</label>
            <input id="edit-name" name="name" type="text" required
              oninput="this.value=this.value.replace(/[^a-z0-9_-]/g,'').toLowerCase()">
          </div>
          <div class="field">
            <label>Type</label>
            <select id="edit-type" name="type" onchange="toggleEditType(this.value)">
              <option value="stdio">stdio (command)</option>
              <option value="sse">SSE (HTTP)</option>
            </select>
          </div>
        </div>
        <div id="edit-stdio-fields">
          <div class="field">
            <label>Command</label>
            <input id="edit-command" name="command" type="text" style="font-family:monospace">
          </div>
          <div class="field">
            <label>Args <span style="font-size:0.72rem;color:var(--muted);font-weight:400">— one per line</span></label>
            <textarea id="edit-args" rows="3"
              style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.82rem;font-family:monospace;resize:vertical"></textarea>
          </div>
        </div>
        <div id="edit-sse-fields" style="display:none">
          <div class="field">
            <label>URL</label>
            <input id="edit-url" name="url" type="text">
          </div>
        </div>
        <div class="field">
          <label>Environment variables <span style="font-size:0.72rem;color:var(--muted);font-weight:400">— KEY=VALUE, one per line</span></label>
          <textarea id="edit-env" rows="2"
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.82rem;font-family:monospace;resize:vertical"></textarea>
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

  <!-- ── Test Modal ───────────────────────────────────────── -->
  <div id="mcp-test-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeTestModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(560px,90vw);max-height:80vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0" id="test-modal-title">Testing…</div>
        <button onclick="closeTestModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <div id="test-modal-body" style="font-size:0.84rem;line-height:1.7"></div>
    </div>
  </div>

  <!-- ── Servers Table ────────────────────────────────────── -->
  <div class="card" style="padding:0;overflow:hidden">
    <div style="overflow-x:auto">
      <table style="white-space:nowrap">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Endpoint</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}${emptyRow}</tbody>
      </table>
    </div>
  </div>

  <script>
  const MCP = ${JSON.stringify(srvMap)};

  // ── Add modal ──
  function openAddModal() { document.getElementById('mcp-add-modal').style.display = 'flex'; }
  function closeAddModal() { document.getElementById('mcp-add-modal').style.display = 'none'; }
  function toggleAddType(v) {
    document.getElementById('add-stdio-fields').style.display = v === 'sse' ? 'none' : '';
    document.getElementById('add-sse-fields').style.display   = v === 'sse' ? '' : 'none';
  }
  function serializeAddForm(form) {
    const args = document.getElementById('add-args').value.trim().split('\\n').map(s=>s.trim()).filter(Boolean);
    const env  = parseEnvLines(document.getElementById('add-env').value);
    document.getElementById('add-args-json').value = JSON.stringify(args);
    document.getElementById('add-env-json').value  = JSON.stringify(env);
  }

  // ── Edit modal ──
  function openEditModal(id) {
    const s = MCP[id];
    if (!s) return;
    document.getElementById('edit-form').action = '/api/mcp/' + id + '/edit';
    document.getElementById('edit-name').value    = s.name;
    document.getElementById('edit-command').value = s.command || '';
    document.getElementById('edit-url').value     = s.url || '';
    document.getElementById('edit-args').value    = (s.args || []).join('\\n');
    document.getElementById('edit-env').value     = Object.entries(s.env || {}).map(([k,v])=>k+'='+v).join('\\n');
    document.getElementById('edit-enabled').checked = !!s.enabled;
    const typeEl = document.getElementById('edit-type');
    typeEl.value = s.type || 'stdio';
    toggleEditType(typeEl.value);
    document.getElementById('mcp-edit-modal').style.display = 'flex';
  }
  function closeEditModal() { document.getElementById('mcp-edit-modal').style.display = 'none'; }
  function toggleEditType(v) {
    document.getElementById('edit-stdio-fields').style.display = v === 'sse' ? 'none' : '';
    document.getElementById('edit-sse-fields').style.display   = v === 'sse' ? '' : 'none';
  }
  function serializeEditForm(form) {
    const args = document.getElementById('edit-args').value.trim().split('\\n').map(s=>s.trim()).filter(Boolean);
    const env  = parseEnvLines(document.getElementById('edit-env').value);
    document.getElementById('edit-args-json').value = JSON.stringify(args);
    document.getElementById('edit-env-json').value  = JSON.stringify(env);
  }

  // ── Test modal ──
  async function openTestModal(id) {
    const s = MCP[id];
    if (!s) return;
    document.getElementById('test-modal-title').textContent = 'Testing ' + s.name + '…';
    document.getElementById('test-modal-body').innerHTML = '<span style="color:var(--muted)">Connecting to MCP server…</span>';
    document.getElementById('mcp-test-modal').style.display = 'flex';
    try {
      const res = await fetch('/api/mcp/' + id + '/test', { method: 'POST' });
      const data = await res.json();
      renderTestResult(s.name, data);
    } catch (e) {
      document.getElementById('test-modal-body').innerHTML = '<span style="color:var(--red)">✗ Request failed: ' + e.message + '</span>';
    }
  }
  function closeTestModal() { document.getElementById('mcp-test-modal').style.display = 'none'; }

  function renderTestResult(name, data) {
    const body = document.getElementById('test-modal-body');
    document.getElementById('test-modal-title').textContent = name;
    if (data.error) {
      body.innerHTML = '<div style="color:var(--red);background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2);border-radius:6px;padding:0.75rem;font-family:monospace;font-size:0.8rem;white-space:pre-wrap">✗ ' + esc(data.error) + '</div>';
      return;
    }
    const tools = data.tools || [];
    if (tools.length === 0) {
      body.innerHTML = '<p style="color:var(--muted)">✓ Connected — server reported no tools.</p>';
      return;
    }
    const rows = tools.map(t => \`
      <div style="padding:0.65rem 0;border-bottom:1px solid var(--border)">
        <div style="font-family:monospace;color:var(--accent);font-size:0.84rem;font-weight:600">\${esc(t.name)}</div>
        \${t.description ? \`<div style="font-size:0.78rem;color:var(--muted);margin-top:0.2rem">\${esc(t.description)}</div>\` : ''}
      </div>\`).join('');
    body.innerHTML = \`
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.75rem">✓ Connected · \${tools.length} tool\${tools.length===1?'':'s'} available</div>
      <div>\${rows}</div>\`;
  }

  // ── Helpers ──
  function parseEnvLines(text) {
    const obj = {};
    for (const line of text.trim().split('\\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) obj[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return obj;
  }
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeAddModal(); closeEditModal(); closeTestModal(); }
  });
  </script>`;
}
