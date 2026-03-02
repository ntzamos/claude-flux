import { sql } from "../db.ts";

const TYPE_META: Record<string, { label: string; badge: string }> = {
  goal:           { label: "Goals",           badge: "badge-blue"  },
  fact:           { label: "Facts",           badge: "badge-gray"  },
  preference:     { label: "Preferences",     badge: "badge-gray"  },
  completed_goal: { label: "Completed Goals", badge: "badge-green" },
};

export async function renderMemory(): Promise<string> {
  let items: any[];
  try {
    items = await sql`
      SELECT id, type, content, deadline, completed_at, priority, created_at
      FROM memory
      ORDER BY created_at DESC
      LIMIT 200
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading memory: ${err.message}</p></div>`;
  }

  // Group by type
  const groups: Record<string, any[]> = { goal: [], fact: [], preference: [], completed_goal: [] };
  for (const item of (items || [])) {
    const key = groups[item.type] ? item.type : "fact";
    groups[key].push(item);
  }

  function renderItem(m: any): string {
    const time = new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric" });
    const deadline = m.deadline
      ? `<span style="color:var(--yellow);font-size:0.72rem"> · due ${new Date(m.deadline).toLocaleDateString()}</span>`
      : "";
    const content = m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const editId = `edit-${m.id}`;
    const deadlineVal = m.deadline ? new Date(m.deadline).toISOString().split("T")[0] : "";

    return `
    <div class="memory-item" style="position:relative">
      <!-- View mode -->
      <div id="view-${m.id}">
        <div class="memory-type">${time}${deadline}${m.priority ? ` · P${m.priority}` : ""}</div>
        <div style="display:flex;align-items:flex-start;gap:0.5rem;">
          <div style="flex:1;white-space:pre-wrap">${content}</div>
          <div style="display:flex;gap:0.35rem;flex-shrink:0;margin-top:-0.1rem">
            <button class="btn btn-outline btn-sm" onclick="toggleEdit('${m.id}')" style="padding:0.25rem 0.6rem;font-size:0.65rem">Edit</button>
            <form method="POST" action="/api/memory/${m.id}/delete" style="display:inline"
                  onsubmit="return confirm('Delete this memory?')">
              <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25);padding:0.25rem 0.6rem;font-size:0.65rem">Del</button>
            </form>
          </div>
        </div>
      </div>

      <!-- Edit mode (hidden by default) -->
      <div id="${editId}" style="display:none">
        <form method="POST" action="/api/memory/${m.id}/edit">
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
            <select name="type" style="flex:0 0 auto;width:130px">
              ${["fact","goal","preference","completed_goal"].map(t =>
                `<option value="${t}"${t === m.type ? " selected" : ""}>${t}</option>`
              ).join("")}
            </select>
            <input name="deadline" type="date" value="${deadlineVal}" style="flex:1;color-scheme:dark">
            <input name="priority" type="number" placeholder="priority" value="${m.priority || ""}" style="width:80px">
          </div>
          <textarea name="content" rows="2" style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical">${content}</textarea>
          <div style="display:flex;gap:0.4rem;margin-top:0.4rem">
            <button class="btn btn-sm" type="submit">Save</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="toggleEdit('${m.id}')">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function renderGroup(type: string): string {
    const list = groups[type];
    if (!list || list.length === 0) return "";
    const meta = TYPE_META[type] || { label: type, badge: "badge-gray" };
    return `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-title">
        <span class="badge ${meta.badge}" style="margin-right:0.5rem">${meta.label}</span>
        <span style="color:var(--muted)">${list.length}</span>
      </div>
      ${list.map(renderItem).join("")}
    </div>`;
  }

  const total = (items || []).length;

  return `
  <!-- ── Header with Add button ─────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
    <span style="font-size:0.82rem;color:var(--muted)">${total} total memory items</span>
    <button class="btn btn-sm" onclick="openMemoryModal()">+ Add Memory</button>
  </div>

  <!-- ── Add Memory Modal ────────────────────────────────── -->
  <div id="memory-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeMemoryModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(480px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">Add Memory</div>
        <button onclick="closeMemoryModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form method="POST" action="/api/memory">
        <div class="grid-2" style="gap:0.75rem">
          <div class="field">
            <label>Type</label>
            <select name="type">
              <option value="fact">Fact</option>
              <option value="goal">Goal</option>
              <option value="preference">Preference</option>
              <option value="completed_goal">Completed Goal</option>
            </select>
          </div>
          <div class="field">
            <label>Deadline (optional)</label>
            <input name="deadline" type="date" style="color-scheme:dark">
          </div>
        </div>
        <div class="field">
          <label>Priority (optional, 1–5)</label>
          <input name="priority" type="number" min="1" max="5" placeholder="—">
        </div>
        <div class="field">
          <label>Content</label>
          <textarea name="content" rows="3" required placeholder="Something worth remembering…"
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeMemoryModal()">Cancel</button>
          <button type="submit" class="btn btn-sm">Add</button>
        </div>
      </form>
    </div>
  </div>

  ${renderGroup("goal")}
  ${renderGroup("fact")}
  ${renderGroup("preference")}
  ${renderGroup("completed_goal")}

  ${total === 0 ? `<div class="card"><p style="color:var(--muted)">No memory stored yet. Tell your bot something worth remembering.</p></div>` : ""}

  <script>
  function openMemoryModal() {
    document.getElementById('memory-modal').style.display = 'flex';
  }
  function closeMemoryModal() {
    document.getElementById('memory-modal').style.display = 'none';
  }

  function toggleEdit(id) {
    const view = document.getElementById('view-' + id);
    const edit = document.getElementById('edit-' + id);
    const isEditing = edit.style.display !== 'none';
    view.style.display = isEditing ? '' : 'none';
    edit.style.display = isEditing ? 'none' : '';
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMemoryModal();
  });
  </script>`;
}
