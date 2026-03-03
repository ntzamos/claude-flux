import { sql } from "../db.ts";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderLists(selectedListId?: string): Promise<string> {
  let lists: any[];
  let items: any[];

  try {
    lists = await sql`
      SELECT l.id, l.name, l.description,
             COUNT(i.id)::int                                        AS total_items,
             COUNT(i.id) FILTER (WHERE i.completed = true)::int      AS completed_items
      FROM lists l
      LEFT JOIN list_items i ON i.list_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at ASC
    `;

    items = await sql`
      SELECT id, list_id, title, description,
             deadline::text AS deadline,
             completed, completed_at, created_at
      FROM list_items
      ORDER BY completed ASC, created_at ASC
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:#ff7070">Error loading lists: ${esc(err.message)}</p></div>`;
  }

  const activeId = selectedListId && lists.find(l => l.id === selectedListId)
    ? selectedListId
    : (lists[0]?.id ?? "");

  // Build JS data maps
  const listsMap: Record<string, any> = {};
  for (const l of lists) listsMap[l.id] = l;

  const itemsByList: Record<string, any[]> = {};
  for (const item of items) {
    if (!itemsByList[item.list_id]) itemsByList[item.list_id] = [];
    itemsByList[item.list_id].push(item);
  }

  // Sidebar rows (server-rendered)
  const sidebarRows = lists.map(l => {
    const progress = l.total_items > 0
      ? `${l.completed_items}/${l.total_items} done`
      : "no items";
    return `
    <div class="list-sidebar-item" data-list-id="${l.id}"
         onclick="selectList('${l.id}')"
         style="padding:0.85rem 1rem;border-radius:8px;cursor:pointer;margin-bottom:0.4rem;
                border:1px solid transparent;transition:background 0.1s,border-color 0.1s">
      <div class="lsi-name" style="font-size:0.87rem;font-weight:600;color:var(--text)">${esc(l.name)}</div>
      ${l.description ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:0.15rem;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.description)}</div>` : ""}
      <div style="font-size:0.72rem;color:var(--muted);margin-top:0.15rem">${progress}</div>
    </div>`;
  }).join("");

  const emptySidebar = lists.length === 0
    ? `<div style="color:var(--muted);font-size:0.82rem;padding:1rem 0.25rem;text-align:center;line-height:1.6">
         No lists yet.<br>Create one to start.
       </div>`
    : "";

  return `

  <!-- ── New / Edit List Modal ──────────────────────────────── -->
  <div id="list-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;
       align-items:center;justify-content:center" onclick="if(event.target===this)closeListModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;
                padding:1.5rem;width:min(460px,90vw)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0" id="list-modal-title">New List</div>
        <button onclick="closeListModal()"
                style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form id="list-form" method="POST" action="/api/lists">
        <div class="field">
          <label>Name</label>
          <input id="list-name-input" name="name" type="text" placeholder="Shopping List" required>
        </div>
        <div class="field">
          <label>Description <span style="color:var(--muted);font-weight:400">(optional)</span></label>
          <input id="list-desc-input" name="description" type="text" placeholder="Weekly groceries and household items">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeListModal()">Cancel</button>
          <button type="submit" class="btn btn-sm" id="list-submit-btn">Create</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── New / Edit Item Modal ──────────────────────────────── -->
  <div id="item-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;
       align-items:center;justify-content:center" onclick="if(event.target===this)closeItemModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;
                padding:1.5rem;width:min(480px,90vw)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div class="section-title" style="margin:0" id="item-modal-title">New Item</div>
        <button onclick="closeItemModal()"
                style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <form id="item-form" method="POST" action="">
        <div class="field">
          <label>Title</label>
          <input id="item-title-input" name="title" type="text" placeholder="Item title" required>
        </div>
        <div class="field">
          <label>Description <span style="color:var(--muted);font-weight:400">(optional)</span></label>
          <textarea id="item-desc-input" name="description" rows="2"
            style="width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);
                   border-radius:6px;padding:0.45rem 0.65rem;font-size:0.83rem;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div class="field">
          <label>Deadline <span style="color:var(--muted);font-weight:400">(optional)</span></label>
          <input id="item-deadline-input" name="deadline" type="date" style="color-scheme:dark">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem">
          <button type="button" class="btn btn-outline btn-sm" onclick="closeItemModal()">Cancel</button>
          <button type="submit" class="btn btn-sm" id="item-submit-btn">Add</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Delete List Confirm Modal ──────────────────────────── -->
  <div id="del-list-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;
       align-items:center;justify-content:center" onclick="if(event.target===this)closeDelListModal()">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;
                padding:1.5rem;width:min(380px,90vw)">
      <div class="section-title" style="margin-bottom:0.75rem">Delete List?</div>
      <p style="font-size:0.84rem;color:var(--muted);margin-bottom:1.25rem;line-height:1.5">
        This will permanently delete the list and all its items.
      </p>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem">
        <button class="btn btn-outline btn-sm" onclick="closeDelListModal()">Cancel</button>
        <form id="del-list-form" method="POST" action="" style="display:inline">
          <button class="btn btn-sm"
                  style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">
            Delete
          </button>
        </form>
      </div>
    </div>
  </div>

  <!-- ── Main layout ────────────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:220px 1fr;gap:1rem;align-items:start">

    <!-- Sidebar -->
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.65rem">
        <span style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Lists</span>
        <button class="btn btn-sm" onclick="openNewListModal()"
                style="font-size:0.71rem;padding:0.22rem 0.6rem">+ New</button>
      </div>
      ${sidebarRows}
      ${emptySidebar}
    </div>

    <!-- Items panel (rendered by JS) -->
    <div id="items-panel"></div>

  </div>

  <style>
  @media (max-width:700px) {
    #lists-grid { grid-template-columns: 1fr !important; }
  }
  </style>

  <script>
  const LISTS         = ${JSON.stringify(listsMap)};
  const ITEMS_BY_LIST = ${JSON.stringify(itemsByList)};
  let ACTIVE_ID       = ${JSON.stringify(activeId)};

  function xesc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(d) {
    if (!d) return '';
    // d may be "2026-03-05" or an ISO string
    const str = String(d).slice(0, 10);
    const [y, m, day] = str.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function selectList(id) {
    ACTIVE_ID = id;
    // Update sidebar highlight
    document.querySelectorAll('.list-sidebar-item').forEach(el => {
      const active = el.dataset.listId === id;
      el.style.background    = active ? 'var(--surface2)' : 'transparent';
      el.style.borderColor   = active ? 'var(--border2)'  : 'transparent';
      el.querySelector('.lsi-name').style.color = active ? 'var(--accent)' : 'var(--text)';
    });
    renderItems();
    const u = new URL(window.location.href);
    u.searchParams.set('lid', id);
    history.replaceState(null, '', u.toString());
  }

  function renderItems() {
    const panel = document.getElementById('items-panel');
    const list  = LISTS[ACTIVE_ID];
    if (!list) {
      panel.innerHTML = '<div class="card" style="color:var(--muted);text-align:center;padding:2rem">Select a list to view its items.</div>';
      return;
    }

    const all      = ITEMS_BY_LIST[ACTIVE_ID] || [];
    const pending  = all.filter(i => !i.completed);
    const done     = all.filter(i => i.completed);

    const itemHtml = (item) => {
      const deadline = item.deadline
        ? \`<span style="font-size:0.72rem;color:var(--muted);margin-left:0.4rem">· \${fmtDate(item.deadline)}</span>\`
        : '';
      const desc = item.description
        ? \`<div style="font-size:0.75rem;color:var(--muted);margin-top:0.12rem;line-height:1.4">\${xesc(item.description)}</div>\`
        : '';
      const lineThrough = item.completed ? 'text-decoration:line-through;color:var(--muted)' : '';
      const checkColor  = item.completed ? 'var(--accent)' : 'var(--border2)';
      const checkBg     = item.completed ? 'var(--accent-dim)' : 'transparent';
      const checkMark   = item.completed ? '✓' : '';
      return \`
        <div style="display:flex;align-items:flex-start;gap:0.65rem;padding:0.65rem 0;
                    border-bottom:1px solid var(--border)">
          <form method="POST" action="/api/list-items/\${item.id}/toggle" style="margin:0;flex-shrink:0;margin-top:2px">
            <input type="hidden" name="list_id" value="\${item.list_id}">
            <button type="submit"
              style="background:\${checkBg};border:2px solid \${checkColor};border-radius:50%;
                     width:18px;height:18px;cursor:pointer;padding:0;display:flex;align-items:center;
                     justify-content:center;color:\${item.completed ? 'var(--accent)' : 'transparent'};
                     font-size:10px;line-height:1">\${checkMark}</button>
          </form>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;flex-wrap:wrap">
              <span style="font-size:0.84rem;\${lineThrough}">\${xesc(item.title)}</span>
              \${deadline}
            </div>
            \${desc}
          </div>
          <div style="display:flex;gap:0.3rem;flex-shrink:0">
            <button class="btn btn-outline btn-sm"
                    style="padding:0.18rem 0.45rem;font-size:0.7rem"
                    onclick="openEditItemModal('\${item.id}')">Edit</button>
            <form method="POST" action="/api/list-items/\${item.id}/delete" style="display:inline"
                  onsubmit="return confirm('Delete this item?')">
              <input type="hidden" name="list_id" value="\${item.list_id}">
              <button class="btn btn-sm"
                      style="padding:0.18rem 0.45rem;font-size:0.7rem;
                             background:rgba(255,82,82,0.1);color:#ff7070;border:1px solid rgba(255,82,82,0.22)">✕</button>
            </form>
          </div>
        </div>\`;
    };

    const pendingHtml = pending.map(itemHtml).join('');
    const doneSection = done.length > 0 ? \`
      <div style="margin-top:0.75rem">
        <div style="font-size:0.71rem;color:var(--muted);text-transform:uppercase;
                    letter-spacing:0.06em;margin-bottom:0.4rem;padding-top:0.4rem;
                    border-top:1px solid var(--border)">
          Completed (\${done.length})
        </div>
        \${done.map(itemHtml).join('')}
      </div>\` : '';

    const emptyHtml = all.length === 0
      ? '<div style="color:var(--muted);text-align:center;padding:1.75rem;font-size:0.83rem">No items yet. Add the first one!</div>'
      : '';

    panel.innerHTML = \`
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
          <div>
            <span style="font-size:1rem;font-weight:600">\${xesc(list.name)}</span>
            \${list.description ? \`<span style="font-size:0.78rem;color:var(--muted);margin-left:0.5rem">\${xesc(list.description)}</span>\` : ''}
          </div>
          <div style="display:flex;gap:0.4rem">
            <button class="btn btn-outline btn-sm" onclick="openEditListModal('\${list.id}')">Edit</button>
            <button class="btn btn-sm"
                    style="background:rgba(255,82,82,0.1);color:#ff7070;border:1px solid rgba(255,82,82,0.22)"
                    onclick="openDelListModal('\${list.id}')">Delete</button>
            <button class="btn btn-sm" onclick="openNewItemModal()">+ Add Item</button>
          </div>
        </div>
        <div class="card" style="padding:0 1rem">
          \${pendingHtml}\${emptyHtml}\${doneSection}
        </div>
      </div>\`;
  }

  // ── List Modals ──────────────────────────────────────────────

  function openNewListModal() {
    document.getElementById('list-modal-title').textContent = 'New List';
    document.getElementById('list-form').action            = '/api/lists';
    document.getElementById('list-name-input').value       = '';
    document.getElementById('list-desc-input').value       = '';
    document.getElementById('list-submit-btn').textContent = 'Create';
    document.getElementById('list-modal').style.display    = 'flex';
  }

  function openEditListModal(id) {
    const list = LISTS[id];
    if (!list) return;
    document.getElementById('list-modal-title').textContent = 'Edit List';
    document.getElementById('list-form').action            = '/api/lists/' + id + '/edit';
    document.getElementById('list-name-input').value       = list.name;
    document.getElementById('list-desc-input').value       = list.description || '';
    document.getElementById('list-submit-btn').textContent = 'Save';
    document.getElementById('list-modal').style.display    = 'flex';
  }

  function closeListModal() {
    document.getElementById('list-modal').style.display = 'none';
  }

  function openDelListModal(id) {
    document.getElementById('del-list-form').action    = '/api/lists/' + id + '/delete';
    document.getElementById('del-list-modal').style.display = 'flex';
  }

  function closeDelListModal() {
    document.getElementById('del-list-modal').style.display = 'none';
  }

  // ── Item Modals ──────────────────────────────────────────────

  function openNewItemModal() {
    document.getElementById('item-modal-title').textContent = 'New Item';
    document.getElementById('item-form').action            = '/api/lists/' + ACTIVE_ID + '/items';
    document.getElementById('item-title-input').value      = '';
    document.getElementById('item-desc-input').value       = '';
    document.getElementById('item-deadline-input').value   = '';
    document.getElementById('item-submit-btn').textContent = 'Add';
    document.getElementById('item-modal').style.display    = 'flex';
  }

  function openEditItemModal(id) {
    let item = null;
    for (const arr of Object.values(ITEMS_BY_LIST)) {
      item = arr.find(i => i.id === id);
      if (item) break;
    }
    if (!item) return;
    document.getElementById('item-modal-title').textContent = 'Edit Item';
    document.getElementById('item-form').action            = '/api/list-items/' + id + '/edit';
    document.getElementById('item-title-input').value      = item.title;
    document.getElementById('item-desc-input').value       = item.description || '';
    document.getElementById('item-deadline-input').value   = item.deadline
      ? String(item.deadline).slice(0, 10)
      : '';
    document.getElementById('item-submit-btn').textContent = 'Save';
    document.getElementById('item-modal').style.display    = 'flex';
  }

  function closeItemModal() {
    document.getElementById('item-modal').style.display = 'none';
  }

  // ── Init ────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeListModal(); closeItemModal(); closeDelListModal(); }
  });

  if (ACTIVE_ID) {
    selectList(ACTIVE_ID);
  } else {
    document.getElementById('items-panel').innerHTML =
      '<div class="card" style="color:var(--muted);text-align:center;padding:2rem;font-size:0.83rem">Create a list to get started.</div>';
  }
  </script>`;
}
