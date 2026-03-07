import { getSettings } from "../db.ts";

interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number; // 0-254
  reachable: boolean;
}

interface HueRoom {
  id: string;
  name: string;
  type: string;
  on: boolean;
  brightness: number;
  lights: string[];
}

async function fetchHue(path: string, ip: string, token: string): Promise<any> {
  const res = await fetch(`http://${ip}/api/${token}${path}`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
  return res.json();
}

export async function renderHue(): Promise<string> {
  const settings = await getSettings();
  const ip    = settings.HUE_BRIDGE_IP?.trim();
  const token = settings.HUE_API_KEY?.trim();

  if (!ip || !token) {
    return `<div class="card"><div class="section-title">Philips Hue</div>
      <p style="font-size:0.85rem;color:var(--muted);margin-top:0.5rem">
        Bridge not configured. Go to <a href="/dashboard?tab=settings" style="color:var(--accent)">Settings</a> and click <strong>Discover &amp; Setup</strong>.
      </p></div>`;
  }

  let lights: HueLight[] = [];
  let rooms: HueRoom[] = [];
  let error = "";

  try {
    const [lightsRaw, groupsRaw] = await Promise.all([
      fetchHue("/lights", ip, token),
      fetchHue("/groups", ip, token),
    ]);

    lights = Object.entries(lightsRaw).map(([id, l]: [string, any]) => ({
      id,
      name: l.name,
      on: l.state?.on ?? false,
      brightness: l.state?.bri ?? 0,
      reachable: l.state?.reachable ?? false,
    }));

    rooms = Object.entries(groupsRaw)
      .filter(([, g]: [string, any]) => g.type === "Room" || g.type === "Zone" || g.type === "LightGroup")
      .map(([id, g]: [string, any]) => ({
        id,
        name: g.name,
        type: g.type,
        on: g.action?.on ?? false,
        brightness: g.action?.bri ?? 0,
        lights: g.lights ?? [],
      }));
  } catch (e: any) {
    error = e.message;
  }

  function brightnessBar(bri: number, id: string, type: "light" | "room") {
    const pct = Math.round((bri / 254) * 100);
    return `<input type="range" min="0" max="100" value="${pct}"
      style="width:100%;accent-color:var(--accent);cursor:pointer"
      oninput="hueBri('${type}','${id}',this.value)"
      onchange="hueBri('${type}','${id}',this.value)" />`;
  }

  function toggleBtn(on: boolean, id: string, type: "light" | "room") {
    const style = on
      ? "background:var(--accent);color:var(--accent-text);border:none"
      : "background:var(--surface2);color:var(--muted);border:1px solid var(--border2)";
    return `<button onclick="hueToggle('${type}','${id}',${on ? "false" : "true"})"
      style="${style};padding:0.3rem 0.75rem;border-radius:5px;font-size:0.75rem;font-weight:700;cursor:pointer">
      ${on ? "ON" : "OFF"}</button>`;
  }

  const roomCards = rooms.map(r => `
    <div class="card" style="margin-bottom:0.75rem" id="room-${r.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
        <div>
          <div style="font-weight:700;font-size:0.9rem">${r.name}</div>
          <div style="font-size:0.7rem;color:var(--muted)">${r.type} · ${r.lights.length} light${r.lights.length !== 1 ? "s" : ""}</div>
        </div>
        ${toggleBtn(r.on, r.id, "room")}
      </div>
      ${brightnessBar(r.brightness, r.id, "room")}
    </div>`).join("");

  const lightRows = lights.map(l => `
    <tr id="light-${l.id}" style="${!l.reachable ? "opacity:0.45" : ""}">
      <td style="font-size:0.82rem;color:var(--text);padding:0.5rem 0.25rem">${l.name}</td>
      <td style="padding:0.5rem 0.25rem">${toggleBtn(l.on, l.id, "light")}</td>
      <td style="padding:0.5rem 0.25rem;width:140px">${brightnessBar(l.brightness, l.id, "light")}</td>
      <td style="font-size:0.7rem;color:var(--muted);padding:0.5rem 0.25rem">${l.reachable ? "" : "unreachable"}</td>
    </tr>`).join("");

  const errorHtml = error
    ? `<div style="font-size:0.78rem;color:#ff5252;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2);border-radius:6px;padding:0.6rem 0.8rem;margin-bottom:1rem">
        Could not reach bridge at ${ip}: ${error}
       </div>`
    : "";

  return `
  ${errorHtml}

  <!-- Quick actions -->
  <div style="display:flex;gap:0.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
    <button class="btn btn-sm" onclick="hueAll(true)"  style="background:var(--accent);color:var(--accent-text);border:none">All On</button>
    <button class="btn btn-sm" onclick="hueAll(false)" style="background:var(--surface2);border:1px solid var(--border2);color:var(--muted)">All Off</button>
  </div>

  <!-- Rooms / Groups -->
  ${rooms.length ? `<div class="section-title" style="margin-bottom:0.75rem">Rooms &amp; Zones</div>${roomCards}` : ""}

  <!-- Individual lights -->
  ${lights.length ? `
  <div class="card" style="margin-top:0.5rem">
    <div class="section-title" style="margin-bottom:0.75rem">Lights</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <tbody>${lightRows}</tbody>
      </table>
    </div>
  </div>` : ""}

  <script>
  function hueAction(type, id, body) {
    var path = type === 'room'
      ? '/api/hue/groups/' + id + '/action'
      : '/api/hue/lights/' + id + '/state';
    fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(function(e) { console.error('Hue error:', e); });
  }
  function hueToggle(type, id, on) {
    hueAction(type, id, { on: on });
    // Update UI optimistically
    var el = document.getElementById((type === 'room' ? 'room-' : 'light-') + id);
    if (el) {
      var btn = el.querySelector('button');
      if (btn) {
        btn.textContent = on ? 'ON' : 'OFF';
        btn.style.background = on ? 'var(--accent)' : 'var(--surface2)';
        btn.style.color = on ? 'var(--accent-text)' : 'var(--muted)';
        btn.style.border = on ? 'none' : '1px solid var(--border2)';
        btn.setAttribute('onclick', "hueToggle('" + type + "','" + id + "'," + (on ? 'false' : 'true') + ")");
      }
    }
  }
  function hueBri(type, id, pct) {
    var bri = Math.round(pct * 254 / 100);
    hueAction(type, id, { bri: bri, on: bri > 0 });
  }
  function hueAll(on) {
    fetch('/api/hue/all', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: on })
    }).then(function() { location.reload(); });
  }
  </script>`;
}
