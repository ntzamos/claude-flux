import { getSettings, isOnboarded } from "./db.ts";

// ── Local access detection ────────────────────────────────────
// Returns true when running locally with no public tunnel — auth can be skipped.
export async function isLocalAccess(): Promise<boolean> {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return false; // cloud deployment
  try {
    const settings = await getSettings();
    const tunnelEnabled = settings.TUNNEL_ENABLED;
    const ngrokToken = settings.NGROK_AUTH_TOKEN?.trim();
    if (tunnelEnabled !== "false" && ngrokToken) return false; // active tunnel
  } catch {}
  return true;
}

// ── Session store ─────────────────────────────────────────────
const sessions = new Map<string, number>(); // token → expiresAt
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── OTP store ─────────────────────────────────────────────────
export let otpState: { code: string; expiresAt: number; sentAt: number } | null = null;
export const OTP_TTL      = 15 * 60 * 1000; // 15 minutes
export const OTP_COOLDOWN = 60 * 1000;      // 1 minute between sends

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function generateToken(): string {
  return crypto.randomUUID();
}

export function getSessionToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/flux_session=([^;]+)/);
  return m ? m[1] : null;
}

export function isAuthenticated(req: Request): boolean {
  const token = getSessionToken(req);
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || Date.now() > exp) {
    if (token) sessions.delete(token);
    return false;
  }
  return true;
}

export function createSession(): { token: string; cookie: string } {
  const token = generateToken();
  sessions.set(token, Date.now() + SESSION_TTL);
  const expires = new Date(Date.now() + SESSION_TTL).toUTCString();
  const cookie = "flux_session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Expires=" + expires;
  return { token, cookie };
}

export function clearSession(req: Request): string {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  return "flux_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export async function requireAuth(req: Request): Promise<Response | null> {
  if (isAuthenticated(req)) return null;
  if (await isLocalAccess()) return null;
  const onboarded = await isOnboarded().catch(() => false);
  if (!onboarded) return new Response(null, { status: 302, headers: { Location: "/onboarding" } });
  return new Response(null, { status: 302, headers: { Location: "/login" } });
}

export async function sendOtpViaTelegram(code: string): Promise<boolean> {
  const settings = await getSettings();
  const token  = settings.TELEGRAM_BOT_TOKEN?.trim();
  const userId = settings.TELEGRAM_USER_ID?.trim();
  if (!token || !userId) return false;
  const text = "🔐 Your Claude Flux login code:\n\n*" + code + "*\n\nExpires in 15 minutes. Do not share it.";
  const res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: userId, text, parse_mode: "Markdown" }),
  });
  return res.ok;
}

export function setOtp(code: string): void {
  otpState = { code, expiresAt: Date.now() + OTP_TTL, sentAt: Date.now() };
}

export function clearOtp(): void {
  otpState = null;
}
