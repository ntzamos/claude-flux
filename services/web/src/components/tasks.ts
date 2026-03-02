import { sql } from "../db.ts";

export async function renderTasks(): Promise<string> {
  let tasks: any[];
  try {
    tasks = await sql`
      SELECT id, description, schedule_type, next_run_at, interval_minutes, action_prompt, status, run_count, last_run_at
      FROM scheduled_tasks
      ORDER BY next_run_at ASC
      LIMIT 100
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading tasks: ${err.message}</p></div>`;
  }

  const active = (tasks || []).filter(t => t.status === "active").length;

  // Embed all task data as JS map for the detail modal
  const taskMap: Record<string, any> = {};
  for (const t of (tasks || [])) {
    taskMap[t.id] = {
      id: t.id,
      description: t.description,
      schedule_type: t.schedule_type,
      next_run_at: t.next_run_at,
      interval_minutes: t.interval_minutes,
      action_prompt: t.action_prompt,
      status: t.status,
      run_count: t.run_count,
      last_run_at: t.last_run_at,
    };
  }

  const rows = (tasks || []).map(t => {
    const statusBadge = t.status === "active"
      ? `<span class="badge badge-green">active</span>`
      : t.status === "done"
        ? `<span class="badge badge-gray">done</span>`
        : `<span class="badge badge-red">cancelled</span>`;

    const typeLabel = t.schedule_type === "interval"
      ? `every ${t.interval_minutes}min`
      : t.schedule_type;

    const nextRun = t.next_run_at
      ? new Date(t.next_run_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";

    const lastRun = t.last_run_at
      ? new Date(t.last_run_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "never";

    const toggleStatus = t.status === "active" ? "done" : "active";
    const toggleLabel  = t.status === "active" ? "Pause" : "Resume";

    return `
    <tr style="cursor:pointer" onclick="showTaskDetail('${t.id}')">
      <td>
        <div style="font-size:0.84rem">${t.description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        ${t.action_prompt ? `<div style="font-size:0.7rem;color:var(--muted);margin-top:0.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px">${t.action_prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 80)}…</div>` : ""}
      </td>
      <td>${typeLabel}</td>
      <td style="white-space:nowrap">${nextRun}</td>
      <td style="white-space:nowrap">${lastRun}</td>
      <td style="text-align:center">${t.run_count}</td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <form method="POST" action="/api/tasks/${t.id}/status" style="display:inline">
          <input type="hidden" name="status" value="${toggleStatus}">
          <button class="btn btn-outline btn-sm">${toggleLabel}</button>
        </form>
        <form method="POST" action="/api/tasks/${t.id}/delete" style="display:inline;margin-left:0.35rem"
              onsubmit="return confirm('Delete this task?')">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const emptyRow = tasks.length === 0
    ? `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem">No scheduled tasks yet.</td></tr>`
    : "";

  return `
  <!-- ── Header with Add button ─────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
    <span style="font-size:0.82rem;color:var(--muted)">${active} active · ${tasks.length} total</span>
    <button class="btn btn-sm" onclick="openTaskModal()">+ Add Task</button>
  </div>

  <!-- ── Add Task Modal ──────────────────────────────────── -->
  <div id="task-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeTaskModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(520px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">New Task</div>
        <button onclick="closeTaskModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form method="POST" action="/api/tasks" onsubmit="convertTaskDatetime(this)">
        <input type="hidden" id="task-when-hidden" name="when">
        <div class="field">
          <label>Description</label>
          <input name="description" type="text" placeholder="Morning briefing" required>
        </div>
        <div class="grid-2" style="gap:0.75rem">
          <div class="field">
            <label>Type</label>
            <select name="schedule_type" onchange="toggleTaskFields(this.value)">
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="interval">Interval</option>
            </select>
          </div>
          <div class="field" id="task-when-field">
            <label>When</label>
            <input id="task-when-input" type="datetime-local" style="color-scheme:dark">
          </div>
          <div class="field" id="task-interval-field" style="display:none">
            <label>Interval (minutes)</label>
            <input name="interval_minutes" type="number" placeholder="60" min="1">
          </div>
        </div>
        <div class="field">
          <label>Action prompt</label>
          <textarea name="action_prompt" rows="3"
            placeholder="Send the user their morning briefing: weather, tasks, and a motivational note."
            required
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeTaskModal()">Cancel</button>
          <button type="submit" class="btn btn-sm">Create Task</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Task Detail Modal ───────────────────────────────── -->
  <div id="task-detail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeDetailModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(480px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0" id="detail-title">Task Details</div>
        <button onclick="closeDetailModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <div id="detail-body" style="font-size:0.84rem;line-height:1.7"></div>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem" id="detail-actions"></div>
    </div>
  </div>

  <!-- ── Task table ─────────────────────────────────────── -->
  <div class="card" style="padding:0;overflow:hidden;">
    <div style="overflow-x:auto">
      <table style="white-space:nowrap">
        <thead>
          <tr>
            <th>Description</th>
            <th>Type</th>
            <th>Next Run</th>
            <th>Last Run</th>
            <th style="text-align:center">Runs</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}${emptyRow}</tbody>
      </table>
    </div>
  </div>

  <script>
  const TASKS = ${JSON.stringify(taskMap)};

  function openTaskModal() {
    document.getElementById('task-modal').style.display = 'flex';
  }
  function closeTaskModal() {
    document.getElementById('task-modal').style.display = 'none';
  }

  function toggleTaskFields(type) {
    document.getElementById('task-when-field').style.display     = type === 'interval' ? 'none' : '';
    document.getElementById('task-interval-field').style.display = type === 'interval' ? '' : 'none';
  }

  function convertTaskDatetime(form) {
    const input  = document.getElementById('task-when-input');
    const hidden = document.getElementById('task-when-hidden');
    if (input && input.value) {
      hidden.value = new Date(input.value).toISOString();
    }
    input.disabled = true;
  }

  function showTaskDetail(id) {
    const t = TASKS[id];
    if (!t) return;

    const fmt = v => v ? new Date(v).toLocaleString() : '—';
    const esc = s => String(s ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const typeLabel = t.schedule_type === 'interval'
      ? 'Interval (every ' + t.interval_minutes + ' min)'
      : t.schedule_type.charAt(0).toUpperCase() + t.schedule_type.slice(1);

    const statusColor = t.status === 'active' ? 'var(--accent)' : t.status === 'done' ? 'var(--muted)' : '#ff7070';

    document.getElementById('detail-title').textContent = esc(t.description);
    document.getElementById('detail-body').innerHTML = \`
      <div style="display:grid;grid-template-columns:auto 1fr;gap:0.35rem 1rem;align-items:baseline">
        <span style="color:var(--muted)">Status</span>
        <span style="color:\${statusColor};font-weight:600">\${esc(t.status)}</span>
        <span style="color:var(--muted)">Type</span>
        <span>\${typeLabel}</span>
        <span style="color:var(--muted)">Next Run</span>
        <span>\${fmt(t.next_run_at)}</span>
        <span style="color:var(--muted)">Last Run</span>
        <span>\${fmt(t.last_run_at)}</span>
        <span style="color:var(--muted)">Run Count</span>
        <span>\${t.run_count}</span>
      </div>
      \${t.action_prompt ? \`
      <div style="margin-top:1rem">
        <div style="color:var(--muted);margin-bottom:0.35rem;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.04em">Action Prompt</div>
        <div style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:0.75rem;white-space:pre-wrap;font-size:0.82rem">\${esc(t.action_prompt)}</div>
      </div>\` : ''}
    \`;

    const toggleStatus = t.status === 'active' ? 'done' : 'active';
    const toggleLabel  = t.status === 'active' ? 'Pause' : 'Resume';
    document.getElementById('detail-actions').innerHTML = \`
      <form method="POST" action="/api/tasks/\${t.id}/status" style="display:inline">
        <input type="hidden" name="status" value="\${toggleStatus}">
        <button class="btn btn-outline btn-sm">\${toggleLabel}</button>
      </form>
      <form method="POST" action="/api/tasks/\${t.id}/delete" style="display:inline"
            onsubmit="return confirm('Delete this task?')">
        <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
      </form>
    \`;

    document.getElementById('task-detail-modal').style.display = 'flex';
  }

  function closeDetailModal() {
    document.getElementById('task-detail-modal').style.display = 'none';
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeTaskModal(); closeDetailModal(); }
  });
  </script>`;
}
