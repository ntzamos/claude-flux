import { sql } from "../db.ts";

const PAGE_SIZE = 50;

export async function renderChat(page = 1): Promise<string> {
  const offset = (page - 1) * PAGE_SIZE;

  let messages: any[];
  let count: number;
  try {
    const [msgs, countResult] = await Promise.all([
      sql`
        SELECT id, created_at, role, content, channel
        FROM messages
        ORDER BY created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::int AS count FROM messages`,
    ]);
    messages = msgs;
    count = countResult[0]?.count ?? 0;
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading messages: ${err.message}</p></div>`;
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  // Reverse to show oldest-first in the viewport (newest loaded via DESC, displayed reversed)
  const reversed = [...(messages || [])].reverse();

  const bubbles = reversed.map(m => {
    const isUser = m.role === "user";
    const time = new Date(m.created_at).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const content = m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return isUser
      ? `
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem;">
        <div style="max-width:72%;">
          <div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">${time}</div>
          <div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">${content}</div>
        </div>
      </div>`
      : `
      <div style="display:flex;justify-content:flex-start;margin-bottom:0.75rem;">
        <div style="max-width:72%;">
          <div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem;letter-spacing:0.05em">Claude · ${time}</div>
          <div style="background:var(--surface2);color:var(--text);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">${content}</div>
        </div>
      </div>`;
  }).join("");

  const emptyState = count === 0
    ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.82rem">No messages yet. Send one below.</div>`
    : "";

  let pagination = "";
  if (totalPages > 1) {
    const prev = page < totalPages ? `<a href="/dashboard?tab=chat&page=${page + 1}" style="color:var(--muted);font-size:0.72rem">← Older</a>` : "";
    const next = page > 1 ? `<a href="/dashboard?tab=chat&page=${page - 1}" style="color:var(--muted);font-size:0.72rem">Newer →</a>` : "";
    pagination = `<div style="display:flex;justify-content:space-between;padding:0.5rem 0.5rem 0;">${prev}<span style="color:var(--muted);font-size:0.72rem">Page ${page} of ${totalPages}</span>${next}</div>`;
  }

  return `
  <!-- ── Chat layout: fills remaining height ────────────── -->
  <div style="display:flex;flex-direction:column;height:calc(100vh - 160px);min-height:400px;">

    <!-- Message history (scrollable) -->
    <div id="messages-list" style="flex:1;overflow-y:auto;padding:0.25rem 0 0.5rem;">
      ${pagination}
      ${emptyState}${bubbles}
      <div id="chat-anchor"></div>
    </div>

    <!-- Input bar pinned to bottom -->
    <div style="padding-top:0.75rem;border-top:1px solid var(--border);">
      <div style="display:flex;gap:0.6rem;align-items:flex-end;">
        <textarea id="chat-input" rows="1" placeholder="Message Claude…"
          style="flex:1;background:var(--surface2);border:1px solid var(--border2);color:var(--text);
                 border-radius:10px;padding:0.65rem 0.9rem;font-size:0.88rem;font-family:inherit;
                 outline:none;resize:none;line-height:1.45;max-height:140px;overflow-y:auto;
                 transition:border-color 0.15s;"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg();}"
          oninput="autoResize(this)"
          onfocus="this.style.borderColor='var(--accent)'"
          onblur="this.style.borderColor=''"
        ></textarea>
        <button id="chat-send-btn" onclick="sendChatMsg()"
          style="background:var(--accent);color:#030f07;border:none;border-radius:10px;
                 padding:0.65rem 1.1rem;font-size:0.78rem;font-weight:700;font-family:inherit;
                 cursor:pointer;text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap;
                 transition:background 0.15s;flex-shrink:0;"
          onmouseover="this.style.background='#1ffb8a'"
          onmouseout="this.style.background='var(--accent)'"
        >Send</button>
      </div>
      <div id="chat-status" style="height:1rem;margin-top:0.3rem;font-size:0.7rem;color:var(--muted);"></div>
    </div>
  </div>

  <script>
  // Auto-grow textarea
  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  // Scroll to bottom on load
  document.getElementById('chat-anchor')?.scrollIntoView();

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = d => d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

  async function sendChatMsg() {
    const input  = document.getElementById('chat-input');
    const btn    = document.getElementById('chat-send-btn');
    const status = document.getElementById('chat-status');
    const list   = document.getElementById('messages-list');
    const msg    = input.value.trim();
    if (!msg || btn.disabled) return;

    btn.disabled = true;
    btn.textContent = '...';
    input.disabled  = true;
    status.style.color = 'var(--muted)';
    status.textContent  = 'Sending…';

    // Optimistic user bubble
    const anchor = document.getElementById('chat-anchor');
    const userBubble = document.createElement('div');
    userBubble.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:0.75rem';
    userBubble.innerHTML = \`
      <div style="max-width:72%">
        <div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem">\${fmt(new Date())}</div>
        <div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">\${esc(msg)}</div>
      </div>\`;
    list.insertBefore(userBubble, anchor);

    // Thinking bubble
    const thinkBubble = document.createElement('div');
    thinkBubble.style.cssText = 'display:flex;justify-content:flex-start;margin-bottom:0.75rem';
    thinkBubble.innerHTML = \`
      <div style="max-width:72%">
        <div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem">Claude</div>
        <div style="background:var(--surface2);color:var(--muted);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem">Thinking…</div>
      </div>\`;
    list.insertBefore(thinkBubble, anchor);

    input.value = '';
    input.style.height = 'auto';
    anchor.scrollIntoView({ behavior: 'smooth' });

    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      const reply = data.error ? ('Error: ' + data.error) : (data.response || '');
      const replyColor = data.error ? 'color:#ff7070' : 'color:var(--text)';
      thinkBubble.innerHTML = \`
        <div style="max-width:72%">
          <div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem">Claude · \${fmt(new Date())}</div>
          <div style="background:var(--surface2);\${replyColor};padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">\${esc(reply)}</div>
        </div>\`;
      status.textContent = '';
    } catch (e) {
      thinkBubble.querySelector('div > div:last-child').textContent = 'Network error — is the relay running?';
      status.style.color = 'var(--red)';
      status.textContent = 'Network error';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Send';
      input.disabled  = false;
      input.focus();
      anchor.scrollIntoView({ behavior: 'smooth' });
    }
  }
  </script>`;
}
