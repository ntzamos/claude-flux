import { sql } from "../db.ts";

export async function renderDevices(): Promise<string> {
  let assessments: any[];
  try {
    assessments = await sql`
      SELECT
        id, imei, device_info, overall_grade, status, created_at,
        COALESCE(array_length(front_images, 1), 0) AS front_count,
        COALESCE(array_length(back_images,  1), 0) AS back_count,
        COALESCE(array_length(frame_images, 1), 0) AS frame_count
      FROM device_assessments
      ORDER BY created_at DESC
      LIMIT 100
    `;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading devices: ${err.message}</p></div>`;
  }

  const total = assessments.length;
  const complete = assessments.filter(a => a.status === "complete").length;

  function statusBadge(status: string): string {
    if (status === "complete")   return `<span class="badge badge-green">complete</span>`;
    if (status === "processing") return `<span class="badge badge-blue">processing</span>`;
    if (status === "cancelled")  return `<span class="badge badge-gray">cancelled</span>`;
    if (status.startsWith("collecting_")) return `<span class="badge badge-blue">collecting</span>`;
    return `<span class="badge badge-gray">${status.replace(/_/g, " ")}</span>`;
  }

  function gradeBadge(grade: string | null): string {
    if (!grade) return `<span style="color:var(--muted)">—</span>`;
    const color = grade === "D" ? "badge-red" : grade === "C" ? "" : "badge-green";
    const style = grade === "C" ? 'style="background:rgba(255,215,0,0.1);color:#ffd740;border:1px solid rgba(255,215,0,0.25)"' : "";
    return `<span class="badge ${color}" ${style}>${grade}</span>`;
  }

  const rows = assessments.map(a => {
    const date = new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    const device = (a.device_info?.description as string) || "—";
    const imageCount = (a.front_count || 0) + (a.back_count || 0) + (a.frame_count || 0);

    return `
    <tr>
      <td class="col-id"><code style="font-size:0.78rem;color:var(--muted)">${a.id.slice(0, 8)}</code></td>
      <td>${device.replace(/</g, "&lt;").slice(0, 35)}</td>
      <td class="col-imei" style="color:var(--muted)">${(a.imei || "—").replace(/</g, "&lt;")}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${gradeBadge(a.overall_grade)}</td>
      <td class="col-photos" style="color:var(--muted);text-align:center">${imageCount}</td>
      <td style="color:var(--muted);white-space:nowrap">${date}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="window.openDeviceModal('${a.id}')" style="margin-right:0.4rem">View</button>
        <form method="POST" action="/api/devices/${a.id}/delete" style="display:inline"
              onsubmit="return confirm('Delete this assessment and all its images?')">
          <button class="btn btn-sm" style="background:rgba(255,82,82,0.12);color:#ff7070;border:1px solid rgba(255,82,82,0.25)">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const emptyState = assessments.length === 0
    ? `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem">No assessments yet. Use /device in Telegram to start grading a device.</td></tr>`
    : "";

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
    <div style="font-size:0.75rem;color:var(--muted)">${total} assessment${total !== 1 ? "s" : ""} · ${complete} complete</div>
  </div>

  <div class="card" style="padding:0;overflow:auto">
    <table>
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th>Device</th>
          <th class="col-imei">IMEI</th>
          <th>Status</th>
          <th>Grade</th>
          <th class="col-photos" style="text-align:center">Photos</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${emptyState}
      </tbody>
    </table>
  </div>

  <script>
    (function() {
      // ── Build modal and append directly to body so no parent CSS interferes ──
      if (!document.getElementById('device-modal')) {
        var modal = document.createElement('div');
        modal.id = 'device-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;overflow-y:auto;';
        modal.innerHTML = \`
          <div style="background:var(--surface);min-height:100vh;max-width:900px;margin:0 auto;padding:1rem 1rem 3rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid var(--border2);padding-bottom:0.75rem;gap:0.75rem">
              <div style="min-width:0;flex:1">
                <div id="dm-device" style="font-size:1rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
                <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.3rem;align-items:center">
                  <span id="dm-status-badge"></span>
                  <span id="dm-date" style="font-size:0.7rem;color:var(--muted)"></span>
                </div>
                <div id="dm-id" style="font-family:monospace;font-size:0.65rem;color:var(--muted);margin-top:0.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
              </div>
              <div style="display:flex;align-items:center;gap:0.75rem;flex-shrink:0">
                <div id="dm-grade" style="font-size:2rem;font-weight:800;line-height:1"></div>
                <button onclick="window.closeDeviceModal()" style="background:rgba(255,255,255,0.07);border:1px solid var(--border2);color:var(--text);cursor:pointer;font-size:0.85rem;padding:0.4rem 0.75rem;border-radius:6px;white-space:nowrap">✕ Close</button>
              </div>
            </div>
            <div id="dm-content"><div style="text-align:center;padding:3rem;color:var(--muted)">Loading…</div></div>
          </div>\`;
        modal.addEventListener('click', function(e) { if (e.target === modal) window.closeDeviceModal(); });
        document.body.appendChild(modal);
      }

      const GRADE_COLORS = { A: '#4caf50', B: '#4caf50', C: '#ffd740', D: '#ff5252' };

      function gradeBadgeHtml(g) {
        if (!g) return '<span style="color:var(--muted)">—</span>';
        var c = GRADE_COLORS[g] || 'var(--accent)';
        return '<span style="background:' + c + '22;color:' + c + ';border:1px solid ' + c + '44;padding:1px 7px;border-radius:4px;font-size:0.78rem;font-weight:600">' + g + '</span>';
      }

      function statusBadgeHtml(s) {
        var colors = { complete: '#4caf50', processing: '#64b5f6', cancelled: '#888' };
        var c = colors[s] || (s.startsWith('collecting') ? '#64b5f6' : '#888');
        return '<span style="background:' + c + '22;color:' + c + ';border:1px solid ' + c + '44;padding:1px 7px;border-radius:4px;font-size:0.72rem">' + s.replace(/_/g,' ') + '</span>';
      }

      function statusDot(s) {
        if (s === 'complete') return '<span style="color:#4caf50">●</span>';
        if (s === 'processing') return '<span style="color:#64b5f6">●</span>';
        if (s === 'error') return '<span style="color:#ff5252">●</span>';
        return '<span style="color:#888">○</span>';
      }

      function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      function buildContent(data) {
        var sides = ['front', 'back', 'frame'];
        var byPath = {};
        for (var r of (data.image_results || [])) byPath[r.image_path] = r;
        var html = '';

        for (var side of sides) {
          var images = data[side + '_images'] || [];
          if (!images.length) continue;
          var sideResults = images.map(function(p) { return byPath[p]; }).filter(Boolean);
          var grades = sideResults.filter(function(r) { return r.image_grade; }).map(function(r) { return r.image_grade; });
          var worstGrade = grades.includes('D') ? 'D' : grades.includes('C') ? 'C' : grades.includes('B') ? 'B' : grades.length ? 'A' : null;

          html += '<div style="margin-bottom:2rem">';
          html += '<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.8rem;padding-bottom:0.5rem;border-bottom:1px solid var(--border2)">';
          html += '<span style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.12em;font-weight:600">' + side + '</span>';
          html += '<span style="font-size:0.65rem;color:var(--muted)">(' + images.length + ' photo' + (images.length !== 1 ? 's' : '') + ')</span>';
          if (worstGrade) html += gradeBadgeHtml(worstGrade);
          html += '</div>';

          for (var i = 0; i < images.length; i++) {
            var imgPath = images[i];
            var res = byPath[imgPath];
            var idx = i + 1;
            var annotatedPath = data.id ? 'devices/' + data.id + '/annotated_' + side + '_' + idx + '.jpg' : null;

            // Photos side-by-side (2 cols) with detect text below — works on any screen
            html += '<div style="margin-bottom:1rem;padding:0.75rem;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border2)">';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.6rem">';
            html += '<div><div style="font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin-bottom:0.25rem">Original</div>';
            html += '<a href="/files/' + encodeURI(imgPath) + '" target="_blank">';
            html += '<img src="/files/' + encodeURI(imgPath) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid var(--border2)">';
            html += '</a></div>';
            html += '<div><div style="font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin-bottom:0.25rem">Annotated</div>';
            if (annotatedPath) {
              html += '<a href="/files/' + encodeURI(annotatedPath) + '" target="_blank">';
              html += '<img src="/files/' + encodeURI(annotatedPath) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid var(--border2)" onerror="this.remove()">';
              html += '</a>';
            }
            html += '</div></div>';
            // Detect result — full width below photos
            html += '<div><div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem">';
            if (res) {
              html += statusDot(res.status);
              if (res.image_grade) html += gradeBadgeHtml(res.image_grade);
              html += '<span style="font-size:0.6rem;color:var(--muted)">' + (res.status === 'processing' ? 'Analyzing…' : res.status) + '</span>';
            } else {
              html += '<span style="font-size:0.6rem;color:var(--muted)">○ pending</span>';
            }
            html += '</div>';
            if (res && res.detect_result) {
              html += '<div style="font-size:0.72rem;line-height:1.55;color:var(--text);white-space:pre-wrap">' + escHtml(res.detect_result) + '</div>';
            } else if (!res || res.status === 'processing') {
              html += '<div style="font-size:0.72rem;color:var(--muted);font-style:italic">Detection in progress…</div>';
            }
            html += '</div></div>';
          }
          html += '</div>';
        }

        var summary = data.grading_result && data.grading_result.summary;
        if (summary) {
          html += '<div style="margin-top:1rem;padding:1rem;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid var(--border2)">';
          html += '<div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.6rem;font-weight:600">Final Assessment</div>';
          html += '<div style="font-size:0.82rem;line-height:1.65;white-space:pre-wrap;color:var(--text)">' + escHtml(summary) + '</div>';
          html += '</div>';
        } else if (data.status !== 'complete') {
          html += '<div style="padding:1rem;color:var(--muted);font-size:0.8rem;font-style:italic">Final assessment will appear here once grading is complete.</div>';
        }

        return html || '<div style="color:var(--muted);font-size:0.8rem">No images collected yet.</div>';
      }

      window.openDeviceModal = async function(id) {
        var modal = document.getElementById('device-modal');
        modal.style.display = 'block';
        document.getElementById('dm-content').innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)">Loading…</div>';
        document.getElementById('dm-id').textContent = id;
        document.getElementById('dm-device').textContent = '';
        document.getElementById('dm-grade').textContent = '—';
        document.getElementById('dm-grade').style.color = 'var(--muted)';
        document.getElementById('dm-status-badge').innerHTML = '';
        document.getElementById('dm-date').textContent = '';

        try {
          var res = await fetch('/api/devices/' + id);
          var data = await res.json();
          if (data.error) throw new Error(data.error);
          document.getElementById('dm-device').textContent = (data.device_info && data.device_info.description) || 'Unknown device';
          document.getElementById('dm-status-badge').innerHTML = statusBadgeHtml(data.status);
          document.getElementById('dm-date').textContent = new Date(data.created_at).toLocaleString();
          var g = data.overall_grade;
          var gradeEl = document.getElementById('dm-grade');
          gradeEl.textContent = g || '—';
          gradeEl.style.color = g ? (GRADE_COLORS[g] || 'var(--accent)') : 'var(--muted)';
          document.getElementById('dm-content').innerHTML = buildContent(data);
        } catch (err) {
          document.getElementById('dm-content').innerHTML = '<div style="color:#ff5252;padding:1rem">Failed to load: ' + escHtml(err.message) + '</div>';
        }
      };

      window.closeDeviceModal = function() {
        document.getElementById('device-modal').style.display = 'none';
      };

      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') window.closeDeviceModal(); });
    })();
  </script>

  <style>
    @keyframes blink { 50% { opacity: 0; } }
    @media (max-width: 600px) {
      .col-id, .col-imei, .col-photos { display: none; }
    }
  </style>`;
}
