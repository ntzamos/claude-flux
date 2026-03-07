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

  // Track the newest created_at for client-side polling
  const lastTs = messages.length > 0
    ? new Date(messages[0].created_at).toISOString()
    : new Date(0).toISOString();

  const bubbles = reversed.map(m => {
    const isUser = m.role === "user";
    const time = new Date(m.created_at).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const escaped = m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const content = escaped.replace(/\[FILE:\s*([^\]]+)\]/gi, (_, fn) => {
      const name = fn.trim();
      return `<a href="/files/${name}" style="color:var(--accent);text-decoration:underline" target="_blank">File: ${name}</a>`;
    });

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

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const renderMsg = s => esc(s).replace(/\[FILE:\s*([^\]]+)\]/gi, (_, fn) => '<a href="/files/' + fn.trim() + '" style="color:var(--accent);text-decoration:underline" target="_blank">File: ' + fn.trim() + '</a>');
  const fmt = d => d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

  const list   = document.getElementById('messages-list');
  const anchor = document.getElementById('chat-anchor');

  // Start polling from the last rendered message timestamp
  let lastMsgTime = ${JSON.stringify(lastTs)};
  let optimisticBubble = null;

  function makeBubble(m) {
    const isUser = m.role === 'user';
    const time = fmt(new Date(m.created_at));
    const content = renderMsg(m.content);
    const div = document.createElement('div');
    if (isUser) {
      div.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:0.75rem';
      div.innerHTML = \`<div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">\${time}</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">\${content}</div></div>\`;
    } else {
      div.style.cssText = 'display:flex;justify-content:flex-start;margin-bottom:0.75rem';
      div.innerHTML = \`<div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem;letter-spacing:0.05em">Claude · \${time}</div><div style="background:var(--surface2);color:var(--text);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">\${content}</div></div>\`;
    }
    return div;
  }

  async function pollMessages() {
    try {
      const res = await fetch('/api/messages?since=' + encodeURIComponent(lastMsgTime));
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        // Remove optimistic bubble once real messages arrive
        if (optimisticBubble) {
          optimisticBubble.remove();
          optimisticBubble = null;
        }
        for (const m of data.data) {
          list.insertBefore(makeBubble(m), anchor);
          if (m.created_at > lastMsgTime) lastMsgTime = m.created_at;
        }
        // Clear thinking status when Claude's reply arrives
        const hasAssistant = data.data.some((m) => m.role === 'assistant');
        if (hasAssistant) {
          const status = document.getElementById('chat-status');
          if (status && status.dataset.thinking) {
            status.textContent = '';
            delete status.dataset.thinking;
          }
        }
        if (wasAtBottom) list.scrollTop = list.scrollHeight;
      }
    } catch (e) {}
  }

  // Poll every 2.5 seconds for new messages
  let pollTimer = setInterval(pollMessages, 2500);

  function fastPoll() {
    // Poll quickly after sending until Claude replies, then resume normal cadence
    clearInterval(pollTimer);
    let ticks = 0;
    const fast = setInterval(async () => {
      await pollMessages();
      ticks++;
      if (ticks >= 20 || !optimisticBubble) {
        clearInterval(fast);
        pollTimer = setInterval(pollMessages, 2500);
      }
    }, 1000);
  }

  // Scroll to bottom on load — defer to allow layout to complete
  function scrollToBottom() { list.scrollTop = list.scrollHeight; }
  requestAnimationFrame(() => { scrollToBottom(); setTimeout(scrollToBottom, 150); });

  async function sendChatMsg() {
    const input  = document.getElementById('chat-input');
    const btn    = document.getElementById('chat-send-btn');
    const status = document.getElementById('chat-status');
    const msg    = input.value.trim();
    if (!msg || btn.disabled) return;

    btn.disabled = true;
    btn.style.opacity = '0.5';
    input.value = '';
    input.style.height = 'auto';
    status.textContent = '';

    // Optimistic user bubble — replaced by polling when message appears in DB
    optimisticBubble = document.createElement('div');
    optimisticBubble.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:0.75rem';
    optimisticBubble.innerHTML = \`<div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">\${fmt(new Date())}</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">\${esc(msg)}</div></div>\`;
    list.insertBefore(optimisticBubble, anchor);
    list.scrollTop = list.scrollHeight;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.ok) {
        status.style.color = 'var(--muted)';
        status.textContent = 'Claude is thinking…';
        status.dataset.thinking = '1';
        fastPoll();
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        status.style.color = 'var(--red)';
        status.textContent = err.error || 'Failed to send message';
        if (optimisticBubble) { optimisticBubble.remove(); optimisticBubble = null; }
      }
    } catch (e) {
      status.style.color = 'var(--red)';
      status.textContent = 'Network error — is the relay running?';
      if (optimisticBubble) { optimisticBubble.remove(); optimisticBubble = null; }
    } finally {
      btn.disabled = false;
      btn.style.opacity = '1';
      input.focus();
    }
  }
  </script>`;
}
