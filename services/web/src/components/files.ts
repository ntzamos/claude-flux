import { readdir, stat } from "fs/promises";
import { join } from "path";

const FILES_DIR = "/files";

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
  if (["xlsx", "xls"].includes(ext)) return "📊";
  return "📁";
}

export async function renderFiles(): Promise<string> {
  let files: { name: string; size: number; mtime: Date }[] = [];

  try {
    const entries = await readdir(FILES_DIR);
    const stats = await Promise.all(
      entries.map(async name => {
        try {
          const s = await stat(join(FILES_DIR, name));
          return s.isFile() ? { name, size: s.size, mtime: s.mtime } : null;
        } catch {
          return null;
        }
      })
    );
    files = (stats.filter(Boolean) as typeof files).sort(
      (a, b) => b.mtime.getTime() - a.mtime.getTime()
    );
  } catch {
    files = [];
  }

  const rows = files.map(f => {
    const dateFmt = f.mtime.toLocaleString("en-US", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const nameEsc = f.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nameEnc = encodeURIComponent(f.name);
    const icon = mimeIcon(f.name);

    return `
    <tr style="cursor:pointer" data-name="${nameEsc}" data-enc="${nameEnc}" onclick="previewFile(this.dataset.name, this.dataset.enc)">
      <td style="white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis">
        <div style="display:flex;align-items:center;gap:0.5rem;overflow:hidden">
          <span style="font-size:1.1rem;flex-shrink:0">${icon}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameEsc}</span>
        </div>
      </td>
      <td style="white-space:nowrap;color:var(--muted)">${formatBytes(f.size)}</td>
      <td style="white-space:nowrap;color:var(--muted)">${dateFmt}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <a href="/files/${nameEnc}" download class="btn btn-outline btn-sm" style="text-decoration:none">Download</a>
        <form method="POST" action="/api/files/${nameEnc}/delete" style="display:inline;margin-left:0.35rem"
              onsubmit="return confirm('Delete ${nameEsc}?')">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const emptyRow = files.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem">
        No files yet. Ask Claude to generate a report, analysis, CSV, or any file — it will appear here.
      </td></tr>`
    : "";

  return `
  <!-- ── File preview modal ─────────────────────────────── -->
  <div id="file-preview-modal"
       style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:300;flex-direction:column">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.25rem;
                background:var(--surface);border-bottom:1px solid var(--border2);flex-shrink:0">
      <span id="preview-icon" style="font-size:1.2rem"></span>
      <span id="preview-name" style="font-weight:600;font-size:0.9rem;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>
      <span id="preview-size" style="font-size:0.75rem;color:var(--muted);flex-shrink:0"></span>
      <a id="preview-download" href="#" download
         class="btn btn-outline btn-sm" style="text-decoration:none;flex-shrink:0">Download</a>
      <button onclick="closePreview()"
              style="background:none;border:1px solid var(--border2);color:var(--muted);border-radius:6px;
                     padding:0.3rem 0.7rem;cursor:pointer;font-size:0.8rem;flex-shrink:0">✕ Close</button>
    </div>

    <!-- Content -->
    <div id="preview-content"
         style="flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:1.5rem;min-height:0">
    </div>
  </div>

  <!-- ── File list ───────────────────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
    <span style="font-size:0.82rem;color:var(--muted)">${files.length} file${files.length !== 1 ? "s" : ""}</span>
    <span style="font-size:0.72rem;color:var(--muted)">Files saved to <code>/files/</code> by Claude</span>
  </div>
  <div class="card" style="padding:0;overflow:hidden;">
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table style="min-width:520px;">
      <thead>
        <tr>
          <th>Name</th>
          <th style="white-space:nowrap">Size</th>
          <th style="white-space:nowrap">Created</th>
          <th style="white-space:nowrap">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}${emptyRow}</tbody>
    </table>
    </div>
  </div>

  <style>
    #file-preview-modal iframe,
    #file-preview-modal embed {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 6px;
      background: #fff;
    }
    #file-preview-modal img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 6px;
    }
    #preview-content pre {
      background: var(--surface);
      border: 1px solid var(--border2);
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      font-size: 0.82rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text);
      width: 100%;
      max-width: 900px;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    #preview-content table {
      border-collapse: collapse;
      font-size: 0.82rem;
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
      width: 100%;
    }
    #preview-content th {
      background: var(--surface2);
      color: var(--accent);
      font-weight: 700;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.6rem 0.85rem;
      border-bottom: 1px solid var(--border2);
      text-align: left;
      white-space: nowrap;
    }
    #preview-content td {
      padding: 0.55rem 0.85rem;
      border-bottom: 1px solid var(--border2);
      vertical-align: top;
      white-space: nowrap;
    }
    #preview-content tr:last-child td { border-bottom: none; }
    #preview-content tr:hover td { background: var(--accent-glow); }
    .preview-iframe-wrap {
      width: 100%;
      height: calc(100vh - 130px);
    }
    .preview-unavailable {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: var(--muted);
      text-align: center;
      padding: 3rem;
    }
    .preview-unavailable .big-icon { font-size: 4rem; }
  </style>

  <script>
  const FILE_ICONS = ${JSON.stringify(
    Object.fromEntries(files.map(f => [f.name, mimeIcon(f.name)]))
  )};
  const FILE_SIZES = ${JSON.stringify(
    Object.fromEntries(files.map(f => [f.name, formatBytes(f.size)]))
  )};

  function previewFile(name, nameEnc) {
    const ext = name.split('.').pop().toLowerCase();
    const url  = '/files/' + nameEnc;
    const modal = document.getElementById('file-preview-modal');
    const content = document.getElementById('preview-content');

    document.getElementById('preview-icon').textContent     = FILE_ICONS[name] || '📁';
    document.getElementById('preview-name').textContent     = name;
    document.getElementById('preview-size').textContent     = FILE_SIZES[name] || '';
    document.getElementById('preview-download').href        = url;
    document.getElementById('preview-download').download    = name;
    content.innerHTML = '<div style="color:var(--muted);padding:2rem">Loading…</div>';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const images  = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff','avif'];
    const pdfs    = ['pdf'];
    const text    = ['txt','md','log','sh','py','ts','js','jsx','tsx','css','html','xml','toml','yaml','yml','ini','conf','env'];
    const json    = ['json'];
    const csv     = ['csv'];
    const video   = ['mp4','webm','mov','ogg'];
    const audio   = ['mp3','wav','ogg','m4a','flac'];

    if (images.includes(ext)) {
      content.innerHTML = \`<img src="\${url}" alt="\${name}" />\`;

    } else if (pdfs.includes(ext)) {
      content.innerHTML = \`
        <div class="preview-iframe-wrap">
          <iframe src="\${url}#toolbar=1&view=FitH" title="\${name}"></iframe>
        </div>\`;

    } else if (video.includes(ext)) {
      content.innerHTML = \`
        <video controls autoplay style="max-width:100%;max-height:calc(100vh - 130px);border-radius:8px">
          <source src="\${url}">
        </video>\`;

    } else if (audio.includes(ext)) {
      content.innerHTML = \`
        <div style="padding:3rem;text-align:center">
          <div style="font-size:3rem;margin-bottom:1.5rem">🎵</div>
          <audio controls style="width:min(500px,90vw)"><source src="\${url}"></audio>
        </div>\`;

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
        const headers = parse(lines[0]);
        const headerHtml = headers.map(h => \`<th>\${esc(h)}</th>\`).join('');
        const bodyHtml = lines.slice(1).map(l => {
          const cells = parse(l);
          return '<tr>' + cells.map(c => \`<td>\${esc(c)}</td>\`).join('') + '</tr>';
        }).join('');
        content.innerHTML = \`
          <div style="overflow:auto;width:100%;max-height:calc(100vh - 150px)">
            <table><thead><tr>\${headerHtml}</tr></thead><tbody>\${bodyHtml}</tbody></table>
          </div>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${e.message}</pre>\`; });

    } else if (json.includes(ext)) {
      fetch(url).then(r => r.text()).then(raw => {
        try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
        content.innerHTML = \`<pre>\${esc(raw)}</pre>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${e.message}</pre>\`; });

    } else if (text.includes(ext)) {
      fetch(url).then(r => r.text()).then(raw => {
        content.innerHTML = \`<pre>\${esc(raw)}</pre>\`;
      }).catch(e => { content.innerHTML = \`<pre>Error: \${e.message}</pre>\`; });

    } else {
      // Unknown type — try rendering in iframe first, fallback message with download
      content.innerHTML = \`
        <div class="preview-unavailable">
          <div class="big-icon">\${FILE_ICONS[name] || '📁'}</div>
          <div style="font-size:0.9rem;color:var(--text);font-weight:600">\${esc(name)}</div>
          <div style="font-size:0.8rem">Preview not available for this file type.</div>
          <a href="\${url}" download class="btn btn-sm" style="margin-top:0.5rem;text-decoration:none">
            Download File
          </a>
        </div>\`;
    }
  }

  function closePreview() {
    document.getElementById('file-preview-modal').style.display = 'none';
    document.getElementById('preview-content').innerHTML = '';
    document.body.style.overflow = '';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });
  </script>`;
}
