export function renderLoginPage(opts: {
  sent?: boolean;
  error?: string;
  cooldownSecs?: number;
}): string {
  const { sent, error, cooldownSecs } = opts;

  const errorHtml = error
    ? '<div class="msg err">' + error + '</div>'
    : "";

  const infoHtml = sent && !error
    ? '<div class="msg ok">✅ OTP sent to your Telegram. Check your messages.</div>'
    : "";

  const otpForm = sent ? `
    <form method="POST" action="/api/auth/verify-otp">
      <label for="otp">6-digit code</label>
      <input id="otp" name="otp" type="text" inputmode="numeric" pattern="[0-9]{6}"
             maxlength="6" placeholder="123456" autocomplete="one-time-code" autofocus required />
      <button class="btn" type="submit">Verify &amp; Sign In</button>
    </form>
    <hr class="divider" />` : "";

  const sendBtn = cooldownSecs && cooldownSecs > 0
    ? `<p class="cd-msg">Resend available in <span id="cd">${cooldownSecs}</span>s</p>
       <script>
         var s=${cooldownSecs};
         var iv=setInterval(function(){s--;document.getElementById('cd').textContent=s;if(s<=0){clearInterval(iv);location.reload();}},1000);
       </script>`
    : `<form method="POST" action="/api/auth/request-otp">
         <button class="btn ${sent ? "btn-sm" : ""}" type="submit">
           ${sent ? "Resend OTP" : "Send OTP to Telegram"}
         </button>
       </form>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login — Claude Flux</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #090d09; --surface: #0d130d; --surface2: #121a12;
      --border2: #243624; --text: #d8edd8; --muted: #4a674a;
      --accent: #00e676; --accent-text: #030f07;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg); color: var(--text); min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 1rem;
    }
    .card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
    }
    h1 { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.3rem; }
    .sub { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.5rem; line-height: 1.5; }
    label { display: block; font-size: 0.75rem; color: var(--muted); margin-bottom: 0.4rem; }
    input {
      width: 100%; background: var(--surface2); border: 1px solid var(--border2);
      border-radius: 7px; padding: 0.75rem; color: var(--text);
      font-size: 1.4rem; letter-spacing: 0.35em; text-align: center; outline: none;
    }
    input:focus { border-color: var(--accent); }
    .btn {
      display: block; width: 100%; padding: 0.7rem; border: none; border-radius: 7px;
      background: var(--accent); color: var(--accent-text); font-size: 0.88rem;
      font-weight: 700; cursor: pointer; margin-top: 0.9rem;
    }
    .btn-sm { font-size: 0.8rem; padding: 0.5rem; background: transparent;
              border: 1px solid var(--border2); color: var(--muted); }
    .btn:hover { opacity: 0.88; }
    .msg { font-size: 0.78rem; border-radius: 6px; padding: 0.55rem 0.75rem; margin-bottom: 1rem; }
    .ok  { color: var(--accent); background: rgba(0,230,118,0.08); border: 1px solid rgba(0,230,118,0.2); }
    .err { color: #ff5252; background: rgba(255,82,82,0.08); border: 1px solid rgba(255,82,82,0.2); }
    .divider { border: none; border-top: 1px solid var(--border2); margin: 1.1rem 0; }
    .cd-msg { font-size: 0.76rem; color: var(--muted); text-align: center; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Claude Flux</h1>
    <p class="sub">Confirm it's you — enter the OTP sent to your Telegram to access the dashboard.</p>
    ${errorHtml}
    ${infoHtml}
    ${otpForm}
    ${sendBtn}
  </div>
</body>
</html>`;
}
