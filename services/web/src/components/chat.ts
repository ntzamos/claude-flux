import { sql } from "../db.ts";

const INIT_SIZE = 20;
const IMG_EXTS  = ["jpg","jpeg","png","gif","webp","svg","avif"];
const AUDIO_EXTS = ["mp3","ogg","wav","webm","m4a","aac","opus"];

function renderFileTag(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMG_EXTS.includes(ext))
    return `<img src="/files/${name}" style="max-width:200px;max-height:200px;border-radius:8px;margin-top:0.4rem;display:block;object-fit:contain" loading="lazy">`;
  if (AUDIO_EXTS.includes(ext))
    return `<audio controls src="/files/${name}" style="width:100%;margin-top:0.4rem;display:block"></audio>`;
  return `<a href="/files/${name}" target="_blank" style="color:var(--accent);text-decoration:underline">&#128206; ${name}</a>`;
}

function renderContent(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\[(?:FILE|ATTACHED):\s*(?:\/files\/)?([^\]]+)\]/gi, (_, fn) => renderFileTag(fn.trim()));
}

export async function renderChat(): Promise<string> {
  let messages: any[] = [];
  try {
    const rows = await sql`
      SELECT id, created_at, role, content, channel
      FROM messages
      ORDER BY created_at DESC
      LIMIT ${INIT_SIZE}
    `;
    messages = rows.reverse();
  } catch (err: any) {
    return `<div class="card"><p style="color:var(--red)">Error loading messages: ${err.message}</p></div>`;
  }

  const lastTs   = messages.length > 0 ? new Date(messages[messages.length - 1].created_at).toISOString() : new Date(0).toISOString();
  const oldestTs = messages.length > 0 ? new Date(messages[0].created_at).toISOString() : null;

  const makeBubbleHtml = (m: any) => {
    const isUser  = m.role === "user";
    const time    = new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const content = renderContent(m.content);
    const hasAudio = content.includes("<audio");
    const hasMedia = hasAudio || content.includes("<img");
    const maxW  = hasMedia ? "90%" : "75%";
    const minW  = hasAudio ? "min-width:280px;" : "";
    return isUser
      ? `<div data-id="${m.id}" style="display:flex;justify-content:flex-end;margin-bottom:0.75rem"><div style="max-width:${maxW};${minW}"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">${time}</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">${content}</div></div></div>`
      : `<div data-id="${m.id}" style="display:flex;justify-content:flex-start;margin-bottom:0.75rem"><div style="max-width:${maxW};${minW}"><div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem;letter-spacing:0.05em">Claude &middot; ${time}</div><div style="background:var(--surface2);color:var(--text);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">${content}</div></div></div>`;
  };

  const bubbles    = messages.map(makeBubbleHtml).join("");
  const emptyState = messages.length === 0
    ? `<div id="empty-state" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.82rem">No messages yet. Send one below.</div>`
    : "";

  return `
  <div style="display:flex;flex-direction:column;height:calc(100vh - 160px);min-height:400px;">

    <!-- Scrollable message list -->
    <div id="messages-list" style="flex:1;overflow-y:auto;padding:0.25rem 0 0.5rem;">
      <div id="load-more-spinner" style="display:none;text-align:center;padding:0.5rem;font-size:0.72rem;color:var(--muted)">Loading older messages&hellip;</div>
      ${emptyState}
      <div id="messages-inner">${bubbles}</div>
    </div>

    <!-- Attachment preview (hidden until file/audio selected) -->
    <div id="attachment-preview" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;position:relative">
      <button onclick="clearAttachment()" title="Remove"
        style="position:absolute;top:0.3rem;right:0.4rem;background:none;border:none;color:var(--muted);font-size:1rem;cursor:pointer;line-height:1;padding:0.1rem 0.3rem">&times;</button>
      <div id="preview-content" style="max-height:160px;overflow:hidden"></div>
      <div id="preview-label" style="font-size:0.72rem;color:var(--muted);margin-top:0.3rem"></div>
    </div>

    <!-- Input bar -->
    <div style="padding-top:0.75rem;border-top:1px solid var(--border);">
      <!-- Pill container -->
      <div id="chat-pill"
        style="display:flex;align-items:center;gap:0;
               border:1px solid var(--border2);border-radius:999px;
               background:var(--surface2);padding:0.35rem 0.5rem 0.35rem 0.6rem;
               transition:border-color 0.15s;">

        <!-- Hidden file input -->
        <input type="file" id="file-input" style="display:none"
          accept="image/*,audio/*,video/*,.pdf,.txt,.md,.json,.csv,.zip"
          onchange="handleFileSelect(this)">

        <!-- + (attach) -->
        <button id="attach-btn" title="Attach file" onclick="document.getElementById('file-input').click()"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1.25rem;
                 font-weight:300;line-height:1;padding:0.1rem 0.5rem 0.1rem 0.15rem;flex-shrink:0;
                 transition:color 0.15s;"
          onmouseover="this.style.color='var(--text)'"
          onmouseout="this.style.color='var(--muted)'">+</button>

        <!-- Divider -->
        <div style="width:1px;height:1.2rem;background:var(--border2);flex-shrink:0;margin-right:0.4rem"></div>

        <!-- Textarea -->
        <textarea id="chat-input" rows="1" placeholder="Ask anything"
          style="flex:1;background:none;border:none;color:var(--text);
                 padding:0.3rem 0.5rem 0.3rem 0;font-size:0.9rem;font-family:inherit;
                 outline:none;resize:none;line-height:1.5;max-height:140px;overflow-y:auto;"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg();}"
          oninput="autoResize(this)"
          onfocus="document.getElementById('chat-pill').style.borderColor='var(--accent)'"
          onblur="document.getElementById('chat-pill').style.borderColor=''"
        ></textarea>

        <!-- Voice pill button -->
        <button id="mic-btn" title="Record audio" onclick="toggleRecording()"
          style="display:flex;align-items:center;gap:0.35rem;
                 background:var(--surface);border:1px solid var(--border);
                 color:var(--text);border-radius:999px;
                 padding:0.38rem 0.85rem 0.38rem 0.7rem;
                 cursor:pointer;font-size:0.82rem;font-weight:500;font-family:inherit;
                 flex-shrink:0;white-space:nowrap;transition:all 0.15s;">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
            <rect x="0"  y="5" width="2" height="4" rx="1" fill="currentColor"/>
            <rect x="3"  y="3" width="2" height="8" rx="1" fill="currentColor"/>
            <rect x="6"  y="1" width="2" height="12" rx="1" fill="currentColor"/>
            <rect x="9"  y="3" width="2" height="8" rx="1" fill="currentColor"/>
            <rect x="12" y="5" width="2" height="4" rx="1" fill="currentColor"/>
          </svg>
          <span id="mic-label">Voice</span>
        </button>
      </div>
      <div id="chat-status" style="height:1rem;margin-top:0.3rem;font-size:0.7rem;color:var(--muted);"></div>
    </div>
  </div>

  <script>
  (function() {
    var list    = document.getElementById("messages-list");
    var inner   = document.getElementById("messages-inner");
    var spinner = document.getElementById("load-more-spinner");

    var lastTs      = ${JSON.stringify(lastTs)};
    var oldestTs    = ${JSON.stringify(oldestTs)};
    var loadingMore = false;
    var noMoreOlder = ${messages.length < INIT_SIZE ? "true" : "false"};
    var optimisticBubble = null;

    // ── File extension helpers ─────────────────────────────────
    var IMG_EXTS   = ["jpg","jpeg","png","gif","webp","svg","avif"];
    var AUDIO_EXTS = ["mp3","ogg","wav","webm","m4a","aac","opus"];

    function getExt(name) { return (name.split(".").pop() || "").toLowerCase(); }

    function renderFileTag(name) {
      var ext = getExt(name);
      if (IMG_EXTS.indexOf(ext) >= 0)
        return '<img src="/files/' + name + '" style="max-width:200px;max-height:200px;border-radius:8px;margin-top:0.4rem;display:block;object-fit:contain" loading="lazy">';
      if (AUDIO_EXTS.indexOf(ext) >= 0)
        return '<audio controls src="/files/' + name + '" style="width:100%;margin-top:0.4rem;display:block"></audio>';
      return '<a href="/files/' + name + '" target="_blank" style="color:var(--accent);text-decoration:underline">&#128206; ' + name + '</a>';
    }

    function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    function renderContent(s) {
      return esc(s).replace(/\\[(?:FILE|ATTACHED):\\s*(?:\\/files\\/)?([^\\]]+)\\]/gi, function(_, fn) {
        return renderFileTag(fn.trim());
      });
    }
    function fmt(d) { return d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); }

    // ── Build bubble element ───────────────────────────────────
    function makeBubble(m) {
      var isUser   = m.role === "user";
      var time     = fmt(new Date(m.created_at));
      var content  = renderContent(m.content);
      var hasAudio = content.indexOf("<audio") >= 0;
      var hasMedia = hasAudio || content.indexOf("<img") >= 0;
      var maxW     = hasMedia ? "90%" : "75%";
      var minW     = hasAudio ? "min-width:280px;" : "";
      var div = document.createElement("div");
      div.dataset.id = m.id;
      if (isUser) {
        div.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:0.75rem";
        div.innerHTML = '<div style="max-width:' + maxW + ';' + minW + '"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">' + time + '</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">' + content + '</div></div>';
      } else {
        div.style.cssText = "display:flex;justify-content:flex-start;margin-bottom:0.75rem";
        div.innerHTML = '<div style="max-width:' + maxW + ';' + minW + '"><div style="font-size:0.62rem;color:var(--muted);margin-bottom:0.25rem;letter-spacing:0.05em">Claude &middot; ' + time + '</div><div style="background:var(--surface2);color:var(--text);padding:0.6rem 0.9rem;border-radius:14px 14px 14px 3px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">' + content + '</div></div>';
      }
      return div;
    }

    // ── Scroll helpers ─────────────────────────────────────────
    function scrollToBottom() { list.scrollTop = list.scrollHeight; }
    requestAnimationFrame(function() { scrollToBottom(); setTimeout(scrollToBottom, 150); });

    // ── Infinite scroll upward ─────────────────────────────────
    list.addEventListener("scroll", function() {
      if (list.scrollTop < 80 && !loadingMore && !noMoreOlder && oldestTs !== null) loadOlder();
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
          var prevHeight = list.scrollHeight;
          var frag = document.createDocumentFragment();
          for (var i = 0; i < msgs.length; i++) frag.appendChild(makeBubble(msgs[i]));
          inner.insertBefore(frag, inner.firstChild);
          oldestTs = new Date(msgs[0].created_at).toISOString();
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
        if (!msgs.length) return;
        var wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        if (optimisticBubble) { optimisticBubble.remove(); optimisticBubble = null; }
        var empty = document.getElementById("empty-state");
        if (empty) empty.remove();
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          if (inner.querySelector("[data-id='" + m.id + "']")) continue;
          inner.appendChild(makeBubble(m));
          if (m.created_at > lastTs) lastTs = m.created_at;
        }
        if (msgs.some(function(m) { return m.role === "assistant"; })) {
          var st = document.getElementById("chat-status");
          if (st && st.dataset.thinking) { st.textContent = ""; delete st.dataset.thinking; }
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
        if (++ticks >= 20 || !optimisticBubble) { clearInterval(fast); pollTimer = setInterval(pollMessages, 2500); }
      }, 1000);
    }

    // ── Attachment state ───────────────────────────────────────
    var pendingFile = null;   // { blob, filename }

    function showPreview(blob, filename) {
      pendingFile = { blob: blob, filename: filename };
      var ext = getExt(filename);
      var pc  = document.getElementById("preview-content");
      var pl  = document.getElementById("preview-label");
      pc.innerHTML = "";
      if (IMG_EXTS.indexOf(ext) >= 0) {
        var img = document.createElement("img");
        img.src = URL.createObjectURL(blob);
        img.style.cssText = "max-height:140px;max-width:100%;border-radius:6px;display:block;object-fit:contain";
        pc.appendChild(img);
      } else if (AUDIO_EXTS.indexOf(ext) >= 0) {
        var au = document.createElement("audio");
        au.controls = true;
        au.src = URL.createObjectURL(blob);
        au.style.cssText = "width:100%;margin-top:0.2rem";
        pc.appendChild(au);
      } else {
        pc.innerHTML = '<span style="font-size:0.85rem">&#128206; ' + esc(filename) + '</span>';
      }
      pl.textContent = filename;
      document.getElementById("attachment-preview").style.display = "block";
    }

    window.clearAttachment = function() {
      pendingFile = null;
      document.getElementById("attachment-preview").style.display = "none";
      document.getElementById("preview-content").innerHTML = "";
      document.getElementById("preview-label").textContent = "";
      document.getElementById("file-input").value = "";
    };

    // ── File select ────────────────────────────────────────────
    window.handleFileSelect = function(input) {
      var file = input.files && input.files[0];
      if (!file) return;
      showPreview(file, file.name);
    };

    // ── Audio recording ────────────────────────────────────────
    var mediaRecorder = null;
    var audioChunks   = [];
    window._recording = false;

    window.toggleRecording = async function() {
      if (window._recording) {
        stopRecording();
      } else {
        try {
          var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioChunks = [];
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) audioChunks.push(e.data); };
          mediaRecorder.onstop = function() {
            var blob = new Blob(audioChunks, { type: "audio/webm" });
            var ts   = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
            pendingFile = { blob: blob, filename: "recording-" + ts + ".webm" };
            stream.getTracks().forEach(function(t) { t.stop(); });
            window.sendChatMsg();
          };
          mediaRecorder.start();
          window._recording = true;
          var btn   = document.getElementById("mic-btn");
          var label = document.getElementById("mic-label");
          btn.style.background  = "rgba(255,82,82,0.15)";
          btn.style.borderColor = "#ff5252";
          btn.style.color       = "#ff5252";
          btn.title = "Stop recording";
          if (label) label.textContent = "Stop";
        } catch(e) {
          var st = document.getElementById("chat-status");
          st.style.color  = "var(--red)";
          st.textContent  = "Microphone access denied.";
        }
      }
    };

    function stopRecording() {
      if (mediaRecorder && window._recording) {
        mediaRecorder.stop();
        window._recording = false;
        var btn   = document.getElementById("mic-btn");
        var label = document.getElementById("mic-label");
        btn.style.background  = "";
        btn.style.borderColor = "";
        btn.style.color       = "";
        btn.title = "Record audio";
        if (label) label.textContent = "Voice";
      }
    }

    // ── Upload helper ──────────────────────────────────────────
    async function uploadFile(blob, filename) {
      var fd = new FormData();
      fd.append("file", blob, filename);
      var res  = await fetch("/api/upload", { method: "POST", body: fd });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      return data.filename;
    }

    // ── Send message ───────────────────────────────────────────
    window.autoResize = function(el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 140) + "px";
    };

    var _sending = false;

    window.sendChatMsg = async function() {
      var input  = document.getElementById("chat-input");
      var status = document.getElementById("chat-status");
      var msg    = input.value.trim();
      if ((!msg && !pendingFile) || _sending) return;

      // Stop recording if still going
      if (window._recording) stopRecording();
      // Wait briefly for onstop to fire
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        await new Promise(function(r) { setTimeout(r, 200); });
      }

      _sending = true;
      status.textContent = "";

      var uploadedFilename = null;
      if (pendingFile) {
        try {
          status.style.color  = "var(--muted)";
          status.textContent  = "Uploading\u2026";
          uploadedFilename = await uploadFile(pendingFile.blob, pendingFile.filename);
        } catch(e) {
          status.style.color = "var(--red)";
          status.textContent = "Upload failed: " + e.message;
          _sending = false;
          return;
        }
        clearAttachment();
      }

      input.value = "";
      input.style.height = "auto";

      // Optimistic bubble
      var previewContent = uploadedFilename
        ? (msg ? msg + "\\n" : "") + "[ATTACHED: /files/" + uploadedFilename + "]"
        : msg;
      optimisticBubble = document.createElement("div");
      optimisticBubble.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:0.75rem";
      var obMaxW = uploadedFilename ? "90%" : "75%";
      optimisticBubble.innerHTML = '<div style="max-width:' + obMaxW + '"><div style="font-size:0.62rem;color:var(--muted);text-align:right;margin-bottom:0.25rem;letter-spacing:0.05em">' + fmt(new Date()) + '</div><div style="background:var(--accent);color:#030f07;padding:0.6rem 0.9rem;border-radius:14px 14px 3px 14px;font-size:0.84rem;line-height:1.5;white-space:pre-wrap">' + renderContent(previewContent) + '</div></div>';
      inner.appendChild(optimisticBubble);
      scrollToBottom();

      try {
        var payload = { message: msg };
        if (uploadedFilename) Object.assign(payload, { filename: uploadedFilename });
        var res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
        _sending = false;
        input.focus();
      }
    };
  })();
  </script>`;
}
