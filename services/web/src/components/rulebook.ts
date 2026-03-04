import { sql } from "../db.ts";

const CATEGORIES = ["crack_vs_scratch", "lens", "grading"];

export async function renderRulebook(): Promise<string> {
  let items: any[];
  try {
    items = await sql`
      SELECT id, category, rule, active, created_at
      FROM grading_rulebook
      ORDER BY category, id
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading rulebook: ${err.message}</p></div>`;
  }

  function renderItem(r: any): string {
    const rule = r.rule.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const activeBadge = r.active
      ? `<span class="badge badge-green" style="font-size:0.65rem">active</span>`
      : `<span class="badge badge-gray" style="font-size:0.65rem">disabled</span>`;

    return `
    <div class="memory-item" style="position:relative">
      <!-- View mode -->
      <div id="view-${r.id}">
        <div style="display:flex;align-items:flex-start;gap:0.5rem;">
          <div style="flex:1;white-space:pre-wrap;font-size:0.83rem">${rule}</div>
          <div style="display:flex;gap:0.35rem;flex-shrink:0;margin-top:-0.1rem;align-items:center">
            ${activeBadge}
            <button class="btn btn-outline btn-sm" onclick="toggleRuleEdit('${r.id}')" style="padding:0.25rem 0.6rem;font-size:0.65rem">Edit</button>
            <form method="POST" action="/api/rulebook/${r.id}/delete" style="display:inline"
                  onsubmit="return confirm('Delete this rule?')">
              <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25);padding:0.25rem 0.6rem;font-size:0.65rem">Del</button>
            </form>
          </div>
        </div>
      </div>

      <!-- Edit mode (hidden by default) -->
      <div id="edit-${r.id}" style="display:none">
        <form method="POST" action="/api/rulebook/${r.id}/edit">
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
            <select name="category" style="flex:1">
              ${CATEGORIES.map(c => `<option value="${c}"${c === r.category ? " selected" : ""}>${c}</option>`).join("")}
            </select>
            <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.8rem;color:var(--muted)">
              <input type="checkbox" name="active" value="true"${r.active ? " checked" : ""}> active
            </label>
          </div>
          <textarea name="rule" rows="3" style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical">${rule}</textarea>
          <div style="display:flex;gap:0.4rem;margin-top:0.4rem">
            <button class="btn btn-sm" type="submit">Save</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="toggleRuleEdit('${r.id}')">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function renderGroup(category: string): string {
    const list = items.filter(r => r.category === category);
    if (list.length === 0) return "";
    const activeCount = list.filter(r => r.active).length;
    return `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-title">
        <span style="margin-right:0.5rem">${category}</span>
        <span style="color:var(--muted);font-size:0.78rem">${activeCount}/${list.length} active</span>
      </div>
      ${list.map(renderItem).join("")}
    </div>`;
  }

  const uncategorized = items.filter(r => !CATEGORIES.includes(r.category));

  return `
  <!-- ── Header ──────────────────────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
    <span style="font-size:0.82rem;color:var(--muted)">${items.length} rules · injected into every detect prompt</span>
    <button class="btn btn-sm" onclick="openRulebookModal()">+ Add Rule</button>
  </div>

  <!-- ── Add Rule Modal ──────────────────────────────────── -->
  <div id="rulebook-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:center;justify-content:center"
       onclick="if(event.target===this)closeRulebookModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:1.5rem;width:min(520px,90vw);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0">Add Rule</div>
        <button onclick="closeRulebookModal()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form method="POST" action="/api/rulebook">
        <div class="field">
          <label>Category</label>
          <select name="category">
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Rule</label>
          <textarea name="rule" rows="4" required placeholder="e.g. Circular wear around a lens rim is a scratch, not a crack."
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeRulebookModal()">Cancel</button>
          <button type="submit" class="btn btn-sm">Add</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Rules grouped by category ──────────────────────── -->
  ${CATEGORIES.map(renderGroup).join("")}
  ${uncategorized.length > 0 ? `
  <div class="card" style="margin-bottom:1rem;">
    <div class="card-title">other</div>
    ${uncategorized.map(renderItem).join("")}
  </div>` : ""}

  ${items.length === 0 ? `<div class="card"><p style="color:var(--muted)">No rules yet. Add rules to tune how defects are classified during detection.</p></div>` : ""}

  <script>
  function openRulebookModal() {
    document.getElementById('rulebook-modal').style.display = 'flex';
  }
  function closeRulebookModal() {
    document.getElementById('rulebook-modal').style.display = 'none';
  }
  function toggleRuleEdit(id) {
    const view = document.getElementById('view-' + id);
    const edit = document.getElementById('edit-' + id);
    const isEditing = edit.style.display !== 'none';
    view.style.display = isEditing ? '' : 'none';
    edit.style.display = isEditing ? 'none' : '';
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeRulebookModal();
  });
  </script>`;
}
