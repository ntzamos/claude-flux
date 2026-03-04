import { readdir, stat } from "fs/promises";
import { join } from "path";

const FILES_DIR = "/files";

function sanitizePath(raw: string): string {
  const parts = raw.split("/").filter(p => p.length > 0 && p !== "." && p !== "..");
  return parts.join("/");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "📄";
  if (["csv", "xlsx", "xls"].includes(ext)) return "📊";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "🎵";
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "🎬";
  if (["zip", "tar", "gz", "7z"].includes(ext)) return "📦";
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "⚙";
  if (["md", "txt", "log"].includes(ext)) return "📝";
  if (["py", "ts", "js", "sh", "rs", "go"].includes(ext)) return "💻";
  if (["docx", "doc"].includes(ext)) return "📝";
  return "📁";
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function renderFiles(currentPath: string = ""): Promise<string> {
  const safePath = sanitizePath(currentPath);
  const absDir = safePath ? join(FILES_DIR, safePath) : FILES_DIR;

  let dirs: { name: string; mtime: Date }[] = [];
  let files: { name: string; size: number; mtime: Date }[] = [];

  try {
    const entries = await readdir(absDir);
    const stats = await Promise.all(
      entries.map(async name => {
        try {
          const s = await stat(join(absDir, name));
          return { name, size: s.size, mtime: s.mtime, isDir: s.isDirectory() };
        } catch {
          return null;
        }
      })
    );
    for (const e of stats) {
      if (!e) continue;
      if (e.isDir) dirs.push({ name: e.name, mtime: e.mtime });
      else files.push({ name: e.name, size: e.size, mtime: e.mtime });
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    dirs = [];
    files = [];
  }

  // Breadcrumbs
  const parts = safePath ? safePath.split("/") : [];
  const breadcrumbHtml = [
    `<a href="/dashboard?tab=files" style="color:var(--accent);text-decoration:none">Files</a>`,
    ...parts.map((part, i) => {
      const p = parts.slice(0, i + 1).join("/");
      return `<a href="/dashboard?tab=files&path=${encodeURIComponent(p)}" style="color:var(--accent);text-decoration:none">${esc(part)}</a>`;
    })
  ].join(` <span style="color:var(--muted);margin:0 0.25rem">/</span> `);

  const parentPath = parts.length > 0 ? parts.slice(0, -1).join("/") : null;
  const parentUrl = parentPath !== null
    ? `/dashboard?tab=files${parentPath ? "&path=" + encodeURIComponent(parentPath) : ""}`
    : "/dashboard?tab=files";

  // Back row
  const backRow = safePath ? `
    <tr style="cursor:pointer;opacity:0.75" onclick="window.location='${parentUrl}'"
        ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event,'${esc(parentPath ?? '')}')">
      <td colspan="4">
        <div style="display:flex;align-items:center;gap:0.5rem;color:var(--accent)">
          <span>↩</span><span>.. up</span>
        </div>
      </td>
    </tr>` : "";

  // Directory rows
  const dirRows = dirs.map(d => {
    const fullPath = safePath ? `${safePath}/${d.name}` : d.name;
    const encPath = encodeURIComponent(fullPath);
    const nameEsc = esc(d.name);
    const dateFmt = d.mtime.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return `
    <tr style="cursor:pointer" draggable="true" ondragstart="onDragStart(event,'${esc(fullPath)}')"
        ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event,'${esc(fullPath)}')"
        onclick="window.location='/dashboard?tab=files&path=${encPath}'">
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span style="font-size:1.1rem;flex-shrink:0">📁</span>
          <span style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameEsc}/</span>
        </div>
      </td>
      <td style="white-space:nowrap;color:var(--muted)">—</td>
      <td style="white-space:nowrap;color:var(--muted)">${dateFmt}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-sm" onclick="openMove('${esc(fullPath)}','${esc(d.name)}')">Move</button>
        <button class="btn btn-outline btn-sm" style="margin-left:0.35rem" onclick="openRename('${esc(fullPath)}','${esc(d.name)}','${esc(safePath)}')">Rename</button>
        <form method="POST" action="/api/files/rmdir" style="display:inline;margin-left:0.35rem"
              onsubmit="return confirm('Delete folder ${nameEsc} and all its contents?')">
          <input type="hidden" name="path" value="${esc(fullPath)}">
          <input type="hidden" name="parentPath" value="${esc(safePath)}">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  // File rows
  const filePreviewData: Record<string, string> = {};
  const fileSizeData: Record<string, string> = {};

  const fileRows = files.map(f => {
    const fullPath = safePath ? `${safePath}/${f.name}` : f.name;
    const nameEsc = esc(f.name);
    const icon = mimeIcon(f.name);
    const sizeStr = formatBytes(f.size);
    const dateFmt = f.mtime.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const serveUrl = "/files/" + fullPath.split("/").map(encodeURIComponent).join("/");

    filePreviewData[fullPath] = icon;
    fileSizeData[fullPath] = sizeStr;

    return `
    <tr style="cursor:pointer" draggable="true" ondragstart="onDragStart(event,'${esc(fullPath)}')"
        data-fullpath="${esc(fullPath)}" data-url="${esc(serveUrl)}"
        onclick="previewFile(this.dataset.fullpath, this.dataset.url)">
      <td style="white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis">
        <div style="display:flex;align-items:center;gap:0.5rem;overflow:hidden">
          <span style="font-size:1.1rem;flex-shrink:0">${icon}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameEsc}</span>
        </div>
      </td>
      <td style="white-space:nowrap;color:var(--muted)">${sizeStr}</td>
      <td style="white-space:nowrap;color:var(--muted)">${dateFmt}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <a href="${esc(serveUrl)}" download class="btn btn-outline btn-sm" style="text-decoration:none">Download</a>
        <button class="btn btn-outline btn-sm" style="margin-left:0.35rem" onclick="openMove('${esc(fullPath)}','${esc(f.name)}')">Move</button>
        <button class="btn btn-outline btn-sm" style="margin-left:0.35rem" onclick="openRename('${esc(fullPath)}','${esc(f.name)}','${esc(safePath)}')">Rename</button>
        <form method="POST" action="/api/files/delete" style="display:inline;margin-left:0.35rem"
              onsubmit="return confirm('Delete ${nameEsc}?')">
          <input type="hidden" name="path" value="${esc(fullPath)}">
          <input type="hidden" name="parentPath" value="${esc(safePath)}">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const totalFiles = files.length;
  const totalDirs = dirs.length;
  const countLabel = [
    totalFiles > 0 ? `${totalFiles} file${totalFiles !== 1 ? "s" : ""}` : "",
    totalDirs > 0 ? `${totalDirs} folder${totalDirs !== 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(", ") || "Empty";

  const emptyRow = dirs.length === 0 && files.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem">
        ${safePath ? "This folder is empty." : "No files yet. Ask Claude to generate a report, analysis, CSV, or any file — it will appear here."}
      </td></tr>`
    : "";

  return `
  <!-- ── File preview modal ────────────────────────────────── -->
  <div id="file-preview-modal"
       style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:300;flex-direction:column">
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.25rem;
                background:var(--surface);border-bottom:1px solid var(--border2);flex-shrink:0">
      <span id="preview-icon" style="font-size:1.2rem"></span>
      <span id="preview-name" style="font-weight:600;font-size:0.9rem;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>
      <span id="preview-size" style="font-size:0.75rem;color:var(--muted);flex-shrink:0"></span>
      <a id="preview-download" href="#" download
         class="btn btn-outline btn-sm" style="text-decoration:none;flex-shrink:0">Download</a>
      <button id="md-toggle-btn" onclick="toggleMdView()" style="display:none;background:none;
              border:1px solid var(--border2);color:var(--muted);border-radius:6px;
              padding:0.3rem 0.7rem;cursor:pointer;font-size:0.8rem;flex-shrink:0">Rendered</button>
      <button onclick="closePreview()"
              style="background:none;border:1px solid var(--border2);color:var(--muted);border-radius:6px;
                     padding:0.3rem 0.7rem;cursor:pointer;font-size:0.8rem;flex-shrink:0">✕ Close</button>
    </div>
    <div id="preview-content"
         style="flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:1.5rem;min-height:0">
    </div>
  </div>

  <!-- ── Move modal ───────────────────────────────────────── -->
  <div id="move-modal"
       style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:400;align-items:center;justify-content:center">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:1.5rem;width:min(360px,92vw);box-shadow:0 8px 32px rgba(0,0,0,0.5)">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.25rem">Move to</div>
      <div id="move-item-label" style="font-size:0.78rem;color:var(--muted);margin-bottom:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      <div id="move-options" style="display:flex;flex-direction:column;gap:0.35rem;max-height:280px;overflow-y:auto;margin-bottom:1rem"></div>
      <div style="display:flex;justify-content:flex-end">
        <button onclick="closeMove()" class="btn btn-outline btn-sm">Cancel</button>
      </div>
    </div>
  </div>

  <!-- ── Rename modal ─────────────────────────────────────── -->
  <div id="rename-modal"
       style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:400;align-items:center;justify-content:center">
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:1.5rem;width:min(420px,92vw);box-shadow:0 8px 32px rgba(0,0,0,0.5)">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:1rem">Rename</div>
      <form id="rename-form" method="POST" action="/api/files/rename">
        <input type="hidden" id="rename-old-path" name="oldPath">
        <input type="hidden" id="rename-parent-path" name="parentPath">
        <input type="text" id="rename-new-name" name="newName" class="input"
               style="width:100%;font-size:0.88rem;margin-bottom:1rem" required>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem">
          <button type="button" onclick="closeRename()" class="btn btn-outline btn-sm">Cancel</button>
          <button type="submit" class="btn btn-sm">Rename</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Breadcrumb + toolbar ──────────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
    <div style="font-size:0.85rem;display:flex;align-items:center;flex-wrap:wrap;gap:0.25rem">
      ${breadcrumbHtml}
    </div>
    <div style="display:flex;align-items:center;gap:0.75rem">
      <span style="font-size:0.72rem;color:var(--muted)">${countLabel}</span>
      <button onclick="toggleNewFolder()" class="btn btn-outline btn-sm" id="new-folder-btn">+ New Folder</button>
    </div>
  </div>

  <!-- New folder inline form -->
  <form id="new-folder-form" method="POST" action="/api/files/mkdir"
        style="display:none;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
    <input type="hidden" name="parentPath" value="${esc(safePath)}">
    <input type="text" name="name" placeholder="Folder name" class="input"
           style="font-size:0.82rem;padding:0.35rem 0.65rem;width:200px" required
           pattern="[^/\\\\.]+" title="No slashes or dots">
    <button type="submit" class="btn btn-sm">Create</button>
    <button type="button" onclick="toggleNewFolder()" class="btn btn-outline btn-sm">Cancel</button>
  </form>

  <!-- ── File / folder list ────────────────────────────────── -->
  <div class="card" style="padding:0;overflow:hidden;">
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table style="min-width:520px;">
      <thead>
        <tr>
          <th>Name</th>
          <th style="white-space:nowrap">Size</th>
          <th style="white-space:nowrap">Modified</th>
          <th style="white-space:nowrap">Actions</th>
        </tr>
      </thead>
      <tbody>${backRow}${dirRows}${fileRows}${emptyRow}</tbody>
    </table>
    </div>
  </div>

  <style>
    #file-preview-modal iframe, #file-preview-modal embed {
      width: 100%; height: 100%; border: none; border-radius: 6px; background: #fff;
    }
    #file-preview-modal img {
      max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px;
    }
    #preview-content pre {
      background: var(--surface); border: 1px solid var(--border2); border-radius: 8px;
      padding: 1.25rem 1.5rem; font-size: 0.82rem; line-height: 1.6;
      white-space: pre-wrap; word-break: break-word; color: var(--text);
      width: 100%; max-width: 900px; font-family: 'SF Mono', 'Fira Code', monospace;
    }
    #preview-content table {
      border-collapse: collapse; font-size: 0.82rem; background: var(--surface);
      border-radius: 8px; overflow: hidden; width: 100%;
    }
    #preview-content th {
      background: var(--surface2); color: var(--accent); font-weight: 700;
      font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
      padding: 0.6rem 0.85rem; border-bottom: 1px solid var(--border2);
      text-align: left; white-space: nowrap;
    }
    #preview-content td {
      padding: 0.55rem 0.85rem; border-bottom: 1px solid var(--border2);
      vertical-align: top; white-space: nowrap;
    }
    #preview-content tr:last-child td { border-bottom: none; }
    #preview-content tr:hover td { background: var(--accent-glow); }
    .preview-iframe-wrap { width: 100%; height: calc(100vh - 130px); }
    .preview-unavailable {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 1rem; color: var(--muted); text-align: center; padding: 3rem;
    }
    .preview-unavailable .big-icon { font-size: 4rem; }
    #new-folder-form.visible { display: flex; }
    tr.drop-target > td { background: var(--accent-glow) !important; }
    .move-opt {
      padding: 0.5rem 0.75rem; border-radius: 6px; cursor: pointer;
      font-size: 0.85rem; border: 1px solid var(--border2);
    }
    .move-opt:hover { background: var(--accent-glow); }
  </style>

  <script>
  const FILE_ICONS = ${JSON.stringify(filePreviewData)};
  const FILE_SIZES = ${JSON.stringify(fileSizeData)};

  function previewFile(fullPath, url) {
    const name = fullPath.split('/').pop();
    const ext  = name.split('.').pop().toLowerCase();
    const modal   = document.getElementById('file-preview-modal');
    const content = document.getElementById('preview-content');

    document.getElementById('preview-icon').textContent     = FILE_ICONS[fullPath] || '📁';
    document.getElementById('preview-name').textContent     = name;
    document.getElementById('preview-size').textContent     = FILE_SIZES[fullPath] || '';
    document.getElementById('preview-download').href        = url;
    document.getElementById('preview-download').download    = name;
    content.innerHTML = '<div style="color:var(--muted);padding:2rem">Loading…</div>';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const images = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff','avif'];
    const pdfs   = ['pdf'];
    const text   = ['txt','log','sh','py','ts','js','jsx','tsx','css','html','xml','toml','yaml','yml','ini','conf','env'];
    const json   = ['json'];
    const csv    = ['csv'];
    const video  = ['mp4','webm','mov','ogg'];
    const audio  = ['mp3','wav','ogg','m4a','flac'];

    if (images.includes(ext)) {
      content.innerHTML = \`<img src="\${url}" alt="\${esc(name)}" />\`;

    } else if (pdfs.includes(ext)) {
      content.innerHTML = \`<div class="preview-iframe-wrap">
        <iframe src="\${url}#toolbar=1&view=FitH" title="\${esc(name)}"></iframe></div>\`;

    } else if (video.includes(ext)) {
      content.innerHTML = \`<video controls autoplay style="max-width:100%;max-height:calc(100vh - 130px);border-radius:8px">
        <source src="\${url}"></video>\`;

    } else if (audio.includes(ext)) {
      content.innerHTML = \`<div style="padding:3rem;text-align:center">
        <div style="font-size:3rem;margin-bottom:1.5rem">🎵</div>
        <audio controls style="width:min(500px,90vw)"><source src="\${url}"></audio></div>\`;

    } else if (csv.includes(ext)) {
      fetch(url).then(r => r.text()).then(text => {
        const lines = text.trim().split('\\n').filter(Boolean);
        if (!lines.length) { content.innerHTML = '<pre>Empty file</pre>'; return; }
        const parse = line => {
          const cells = []; let cur = ''; let inQ = false;
          for (const ch of line + ',') {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          return cells;
        };
        const headers  = parse(lines[0]);
        const headerHtml = headers.map(h => \`<th>\${esc(h)}</th>\`).join('');
        const bodyHtml   = lines.slice(1).map(l => {
          return '<tr>' + parse(l).map(c => \`<td>\${esc(c)}</td>\`).join('') + '</tr>';
        }).join('');
        content.innerHTML = \`<div style="overflow:auto;width:100%;max-height:calc(100vh - 150px)">
          <table><thead><tr>\${headerHtml}</tr></thead><tbody>\${bodyHtml}</tbody></table></div>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${esc(e.message)}</pre>\`; });

    } else if (json.includes(ext)) {
      fetch(url).then(r => r.text()).then(raw => {
        try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
        content.innerHTML = \`<pre>\${esc(raw)}</pre>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${esc(e.message)}</pre>\`; });

    } else if (ext === 'md') {
      fetch(url).then(r => r.text()).then(raw => {
        window._mdRaw = raw;
        window._mdRendered = false;
        const btn = document.getElementById('md-toggle-btn');
        btn.textContent = 'Rendered';
        btn.style.display = '';
        content.innerHTML = \`<pre>\${esc(raw)}</pre>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${esc(e.message)}</pre>\`; });

    } else if (text.includes(ext)) {
      fetch(url).then(r => r.text()).then(raw => {
        content.innerHTML = \`<pre>\${esc(raw)}</pre>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${esc(e.message)}</pre>\`; });

    } else {
      content.innerHTML = \`<div class="preview-unavailable">
        <div class="big-icon">\${FILE_ICONS[fullPath] || '📁'}</div>
        <div style="font-size:0.9rem;color:var(--text);font-weight:600">\${esc(name)}</div>
        <div style="font-size:0.8rem">Preview not available for this file type.</div>
        <a href="\${url}" download class="btn btn-sm" style="margin-top:0.5rem;text-decoration:none">Download File</a>
      </div>\`;
    }
  }

  function closePreview() {
    document.getElementById('file-preview-modal').style.display = 'none';
    document.getElementById('preview-content').innerHTML = '';
    document.getElementById('md-toggle-btn').style.display = 'none';
    document.body.style.overflow = '';
    window._mdRaw = null;
    window._mdRendered = false;
  }

  let _markedLoaded = false;
  function loadMarked(cb) {
    if (typeof marked !== 'undefined') { cb(); return; }
    if (_markedLoaded) { const t = setInterval(() => { if (typeof marked !== 'undefined') { clearInterval(t); cb(); } }, 50); return; }
    _markedLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function toggleMdView() {
    const btn = document.getElementById('md-toggle-btn');
    const content = document.getElementById('preview-content');
    window._mdRendered = !window._mdRendered;
    if (window._mdRendered) {
      btn.textContent = 'Plain text';
      loadMarked(() => {
        content.innerHTML = \`<div class="md-body" style="max-width:860px;width:100%;padding:0.5rem 0;font-size:0.88rem;line-height:1.7">\${marked.parse(window._mdRaw)}</div>\`;
      });
    } else {
      btn.textContent = 'Rendered';
      content.innerHTML = \`<pre>\${esc(window._mdRaw)}</pre>\`;
    }
  }

  function toggleNewFolder() {
    const form = document.getElementById('new-folder-form');
    const btn  = document.getElementById('new-folder-btn');
    if (form.style.display === 'none' || form.style.display === '') {
      form.style.display = 'flex';
      btn.style.display = 'none';
      form.querySelector('input[name="name"]').focus();
    } else {
      form.style.display = 'none';
      btn.style.display = '';
      form.querySelector('input[name="name"]').value = '';
    }
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function openRename(oldPath, currentName, parentPath) {
    document.getElementById('rename-old-path').value    = oldPath;
    document.getElementById('rename-parent-path').value = parentPath;
    const input = document.getElementById('rename-new-name');
    input.value = currentName;
    const modal = document.getElementById('rename-modal');
    modal.style.display = 'flex';
    input.focus();
    input.select();
  }

  function closeRename() {
    document.getElementById('rename-modal').style.display = 'none';
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePreview(); closeRename(); closeMove(); }
  });

  // ── Move ────────────────────────────────────────────────
  const MOVE_DIRS = ${JSON.stringify(dirs.map(d => ({ name: d.name, path: safePath ? `${safePath}/${d.name}` : d.name })))};
  const MOVE_PARENT = ${JSON.stringify(parentPath)};
  let _moveItemPath = null;
  let _dragPath = null;

  function openMove(itemPath, itemName) {
    _moveItemPath = itemPath;
    document.getElementById('move-item-label').textContent = itemName;
    const opts = document.getElementById('move-options');
    const rows = [];
    if (MOVE_PARENT !== null) {
      const label = MOVE_PARENT ? (MOVE_PARENT.split('/').pop() + '/') : 'Files (root)';
      rows.push('<div class="move-opt" onclick="doMove(_moveItemPath,' + JSON.stringify(MOVE_PARENT ?? '') + ')">↩ ' + esc(label) + '</div>');
    }
    for (const dir of MOVE_DIRS) {
      if (dir.path === itemPath) continue;
      rows.push('<div class="move-opt" onclick="doMove(_moveItemPath,' + JSON.stringify(dir.path) + ')">📁 ' + esc(dir.name) + '/</div>');
    }
    opts.innerHTML = rows.length ? rows.join('') : '<div style="color:var(--muted);font-size:0.82rem;padding:0.5rem 0">No folders to move to.</div>';
    document.getElementById('move-modal').style.display = 'flex';
  }

  function closeMove() {
    document.getElementById('move-modal').style.display = 'none';
    _moveItemPath = null;
  }

  async function doMove(sourcePath, destFolder) {
    closeMove();
    try {
      const res = await fetch('/api/files/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, destFolder })
      });
      const data = await res.json();
      if (data.ok) window.location.reload();
      else alert(data.error || 'Move failed.');
    } catch { alert('Move failed.'); }
  }

  // ── Drag-and-drop ────────────────────────────────────────
  function onDragStart(e, path) {
    _dragPath = path;
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function onDragOver(e) {
    if (!_dragPath) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drop-target');
    e.stopPropagation();
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
  }

  async function onDrop(e, destFolder) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');
    if (!_dragPath) return;
    const src = _dragPath; _dragPath = null;
    await doMove(src, destFolder);
  }
  </script>`;
}
