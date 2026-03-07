import { sql } from "../db.ts";

const INIT_SIZE = 20;

export async function renderChat(): Promise<string> {
  let messages: any[] = [];
  try {
    const rows = await sql`
      SELECT id, created_at, role, content, channel
      FROM messages
      ORDER BY created_at DESC
      LIMIT ${INIT_SIZE}
    `;
    messages = rows.reverse(); // oldest → newest (newest at bottom)
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading messages: ${err.message}</p></div>`;
  }

  const lastTs = messages.length > 0
    ? new Date(messages[messages.length - 1].created_at).toISOString()
    : new Date(0).toISOString();

  const oldestTs = messages.length > 0 ? new Date(messages[0].created_at).toISOString() : null;

  const esc = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const renderContent = (s: string) => esc(s).replace(/\[FILE:\s*([^\]]+)\]/gi, (_, fn) => {
    const name = fn.trim();
    return `<a href="/files/${name}" style="color:var(--accent);text-decoration:underline" target="_blank">File: ${name}</a>`;
  });

  const makeBubbleHtml = (m: any) => {
    const isUser = m.role === "user";
    const time = new Date(m.created_at).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const content = renderContent(m.content);
    return isUser
      ? `<div data-id="${m.id}" style="display:flex;justify-content:flex-end;margin-bottom:0.75rem"><div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">${time}</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">${content}</div></div></div>`
      : `<div data-id="${m.id}" style="display:flex;justify-content:flex-start;margin-bottom:0.75rem"><div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem;letter-spacing:0.05em">Claude · ${time}</div><div style="background:var(--surface2);color:var(--text);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">${content}</div></div></div>`;
  };

  const bubbles = messages.map(makeBubbleHtml).join("");
  const emptyState = messages.length === 0
    ? `<div id="empty-state" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.82rem">No messages yet. Send one below.</div>`
    : "";

  return `
  <div style="display:flex;flex-direction:column;height:calc(100vh - 160px);min-height:400px;">

    <!-- Scrollable message list -->
    <div id="messages-list" style="flex:1;overflow-y:auto;padding:0.25rem 0 0.5rem;">
      <div id="load-more-sentinel" style="height:1px"></div>
      <div id="load-more-spinner" style="display:none;text-align:center;padding:0.5rem;font-size:0.72rem;color:var(--muted)">Loading…</div>
      ${emptyState}
      <div id="messages-inner">${bubbles}</div>
      <div id="chat-anchor"></div>
    </div>

    <!-- Input bar -->
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
  (function() {
    var list   = document.getElementById("messages-list");
    var inner  = document.getElementById("messages-inner");
    var anchor = document.getElementById("chat-anchor");
    var spinner = document.getElementById("load-more-spinner");

    var lastTs      = ${JSON.stringify(lastTs)};
    var oldestTs    = ${JSON.stringify(oldestTs)};
    var loadingMore = false;
    var noMoreOlder = ${messages.length < INIT_SIZE ? "true" : "false"};
    var optimisticBubble = null;

    // ── Helpers ────────────────────────────────────────────────
    function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    function renderContent(s) {
      return esc(s).replace(/\\[FILE:\\s*([^\\]]+)\\]/gi, function(_, fn) {
        return '<a href="/files/' + fn.trim() + '" style="color:var(--accent);text-decoration:underline" target="_blank">File: ' + fn.trim() + '</a>';
      });
    }
    function fmt(d) { return d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); }

    function makeBubble(m) {
      var isUser = m.role === "user";
      var time   = fmt(new Date(m.created_at));
      var content = renderContent(m.content);
      var div = document.createElement("div");
      div.dataset.id = m.id;
      if (isUser) {
        div.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:0.75rem";
        div.innerHTML = '<div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">' + time + '</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">' + content + '</div></div>';
      } else {
        div.style.cssText = "display:flex;justify-content:flex-start;margin-bottom:0.75rem";
        div.innerHTML = '<div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem;letter-spacing:0.05em">Claude \xb7 ' + time + '</div><div style="background:var(--surface2);color:var(--text);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">' + content + '</div></div>';
      }
      return div;
    }

    // ── Scroll to bottom ───────────────────────────────────────
    function scrollToBottom() { list.scrollTop = list.scrollHeight; }
    requestAnimationFrame(function() { scrollToBottom(); setTimeout(scrollToBottom, 150); });

    // ── Infinite scroll upward ─────────────────────────────────
    list.addEventListener("scroll", function() {
      if (list.scrollTop < 80 && !loadingMore && !noMoreOlder && oldestTs !== null) {
        loadOlder();
      }
    });

    async function loadOlder() {
      loadingMore = true;
      spinner.style.display = "block";
      try {
        var res = await fetch("/api/messages?before=" + encodeURIComponent(oldestTs) + "&limit=20");
        if (res.status === 401) { window.location.href = "/login"; return; }
        var data = await res.json();
        var msgs = data.data || [];
        if (msgs.length === 0) {
          noMoreOlder = true;
        } else {
          if (msgs.length < 20) noMoreOlder = true;

          // Save scroll position before prepending
          var prevHeight = list.scrollHeight;

          var frag = document.createDocumentFragment();
          for (var i = 0; i < msgs.length; i++) frag.appendChild(makeBubble(msgs[i]));
          inner.insertBefore(frag, inner.firstChild);

          // Update oldest timestamp cursor
          oldestTs = new Date(msgs[0].created_at).toISOString();

          // Restore scroll position so view doesn't jump
          list.scrollTop = list.scrollHeight - prevHeight;
        }
      } catch(e) {}
      spinner.style.display = "none";
      loadingMore = false;
    }

    // ── Polling for new messages ───────────────────────────────
    async function pollMessages() {
      try {
        var res = await fetch("/api/messages?since=" + encodeURIComponent(lastTs));
        if (res.status === 401) { window.location.href = "/login"; return; }
        var data = await res.json();
        var msgs = data.data || [];
        if (msgs.length === 0) return;

        var wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;

        if (optimisticBubble) { optimisticBubble.remove(); optimisticBubble = null; }

        var empty = document.getElementById("empty-state");
        if (empty) empty.remove();

        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          // Skip if already rendered
          if (inner.querySelector("[data-id='" + m.id + "']")) continue;
          inner.appendChild(makeBubble(m));
          if (m.created_at > lastTs) lastTs = m.created_at;
        }

        var hasAssistant = msgs.some(function(m) { return m.role === "assistant"; });
        if (hasAssistant) {
          var status = document.getElementById("chat-status");
          if (status && status.dataset.thinking) { status.textContent = ""; delete status.dataset.thinking; }
        }

        if (wasAtBottom) scrollToBottom();
      } catch(e) {}
    }

    var pollTimer = setInterval(pollMessages, 2500);

    function fastPoll() {
      clearInterval(pollTimer);
      var ticks = 0;
      var fast = setInterval(async function() {
        await pollMessages();
        ticks++;
        if (ticks >= 20 || !optimisticBubble) { clearInterval(fast); pollTimer = setInterval(pollMessages, 2500); }
      }, 1000);
    }

    // ── Send message ───────────────────────────────────────────
    window.autoResize = function(el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 140) + "px";
    };

    window.sendChatMsg = async function() {
      var input  = document.getElementById("chat-input");
      var btn    = document.getElementById("chat-send-btn");
      var status = document.getElementById("chat-status");
      var msg    = input.value.trim();
      if (!msg || btn.disabled) return;

      btn.disabled = true;
      btn.style.opacity = "0.5";
      input.value = "";
      input.style.height = "auto";
      status.textContent = "";

      optimisticBubble = document.createElement("div");
      optimisticBubble.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:0.75rem";
      optimisticBubble.innerHTML = '<div style="max-width:72%"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">' + fmt(new Date()) + '</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">' + esc(msg) + '</div></div>';
      inner.appendChild(optimisticBubble);
      scrollToBottom();

      try {
        var res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
        if (res.status === 401) { window.location.href = "/login"; return; }
        if (res.ok) {
          status.style.color = "var(--muted)";
          status.textContent = "Claude is thinking\u2026";
          status.dataset.thinking = "1";
          fastPoll();
        } else {
          var err = await res.json().catch(function() { return { error: res.statusText }; });
          status.style.color = "var(--red)";
          status.textContent = err.error || "Failed to send message";
          if (optimisticBubble) { optimisticBubble.remove(); optimisticBubble = null; }
        }
      } catch(e) {
        status.style.color = "var(--red)";
        status.textContent = "Network error \u2014 is the relay running?";
        if (optimisticBubble) { optimisticBubble.remove(); optimisticBubble = null; }
      } finally {
        btn.disabled = false;
        btn.style.opacity = "1";
        input.focus();
      }
    };
  })();
  </script>`;
}
