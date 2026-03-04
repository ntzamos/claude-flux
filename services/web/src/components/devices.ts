import { sql } from "../db.ts";

export async function renderDevices(): Promise<string> {
  let assessments: any[];
  try {
    assessments = await sql`
      SELECT
        id, imei, device_info, front_images, back_images, frame_images,
        grading_result, overall_grade, status, created_at, updated_at,
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

  // Build JS map for the detail modal
  const assessmentMap: Record<string, any> = {};
  for (const a of assessments) {
    assessmentMap[a.id] = {
      id: a.id,
      imei: a.imei,
      device_info: a.device_info,
      front_images: a.front_images,
      back_images: a.back_images,
      frame_images: a.frame_images,
      grading_result: a.grading_result,
      overall_grade: a.overall_grade,
      status: a.status,
      created_at: a.created_at,
    };
  }

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
    <tr style="cursor:pointer" onclick="showDeviceDetail('${a.id}')">
      <td><code style="font-size:0.78rem;color:var(--muted)">${a.id.slice(0, 8)}</code></td>
      <td>${device.replace(/</g, "&lt;").slice(0, 35)}</td>
      <td style="color:var(--muted)">${(a.imei || "—").replace(/</g, "&lt;")}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${gradeBadge(a.overall_grade)}</td>
      <td style="color:var(--muted);text-align:center">${imageCount}</td>
      <td style="color:var(--muted);white-space:nowrap">${date}</td>
      <td onclick="event.stopPropagation()">
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
          <th>ID</th>
          <th>Device</th>
          <th>IMEI</th>
          <th>Status</th>
          <th>Grade</th>
          <th style="text-align:center">Photos</th>
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

  <!-- Detail Modal -->
  <div id="device-modal" style="
    display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7);
    z-index:200; align-items:center; justify-content:center; padding:1rem;
  " onclick="if(event.target===this)closeDeviceModal()">
    <div style="
      background:var(--surface); border:1px solid var(--border2); border-radius:12px;
      max-width:660px; width:100%; max-height:88vh; overflow-y:auto; padding:1.5rem;
    ">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
        <div>
          <div style="font-size:0.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Assessment</div>
          <div id="dm-id" style="font-family:monospace;font-size:0.9rem;margin-top:0.15rem"></div>
        </div>
        <button onclick="closeDeviceModal()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1.2rem;padding:0">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">
        <div>
          <div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem">Device</div>
          <div id="dm-device" style="font-size:0.85rem"></div>
        </div>
        <div>
          <div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem">IMEI</div>
          <div id="dm-imei" style="font-size:0.85rem;color:var(--muted)"></div>
        </div>
        <div>
          <div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem">Status</div>
          <div id="dm-status" style="font-size:0.85rem"></div>
        </div>
        <div>
          <div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem">Grade</div>
          <div id="dm-grade" style="font-size:1.6rem;font-weight:700;color:var(--accent)"></div>
        </div>
      </div>

      <div id="dm-images" style="margin-bottom:1rem"></div>
      <div id="dm-grading" style="font-size:0.8rem;line-height:1.6;white-space:pre-wrap;color:var(--text)"></div>
    </div>
  </div>

  <script>
    const DEVICE_MAP = ${JSON.stringify(assessmentMap)};

    function showDeviceDetail(id) {
      const a = DEVICE_MAP[id];
      if (!a) return;
      document.getElementById('dm-id').textContent = a.id;
      document.getElementById('dm-device').textContent = a.device_info?.description || 'Unknown';
      document.getElementById('dm-imei').textContent = a.imei || '—';
      document.getElementById('dm-status').textContent = a.status.replace(/_/g,' ');
      document.getElementById('dm-grade').textContent = a.overall_grade || '—';

      // Images
      const imgDiv = document.getElementById('dm-images');
      const sides = [
        { label: 'Front', images: a.front_images || [] },
        { label: 'Back',  images: a.back_images  || [] },
        { label: 'Frame', images: a.frame_images || [] },
      ];
      let imgHtml = '';
      for (const { label, images } of sides) {
        if (!images.length) continue;
        imgHtml += '<div style="margin-bottom:0.75rem"><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.35rem">' + label + ' (' + images.length + ')</div>';
        imgHtml += '<div style="display:flex;flex-wrap:wrap;gap:0.4rem">';
        for (const img of images) {
          const name = img.split('/').pop();
          imgHtml += '<a href="/files/' + encodeURI(img) + '" target="_blank" style="display:block">';
          imgHtml += '<img src="/files/' + encodeURI(img) + '" alt="' + name + '" style="height:80px;border-radius:6px;border:1px solid var(--border2);object-fit:cover" onerror="this.style.display=\'none\'">';
          imgHtml += '</a>';
        }
        imgHtml += '</div></div>';
      }
      imgDiv.innerHTML = imgHtml || '<div style="color:var(--muted);font-size:0.8rem">No images saved yet.</div>';

      // Grading result
      const gradingDiv = document.getElementById('dm-grading');
      if (a.grading_result?.summary) {
        gradingDiv.textContent = a.grading_result.summary;
      } else {
        gradingDiv.textContent = '';
      }

      document.getElementById('device-modal').style.display = 'flex';
    }

    function closeDeviceModal() {
      document.getElementById('device-modal').style.display = 'none';
    }
  </script>`;
}
