import { sql } from "./db.ts";

/**
 * Load settings from the `settings` table into process.env.
 * Called at relay startup before any other env vars are read.
 * Only runs when DATABASE_URL is present (Docker mode).
 */
export async function loadSettings(): Promise<void> {
  try {
    const rows = await sql`SELECT key, value FROM settings`;

    if (!rows || rows.length === 0) {
      console.log("[config] No settings in DB yet — using env vars only.");
      return;
    }

    let loaded = 0;
    for (const { key, value } of rows) {
      if (key && value) {
        process.env[key] = value;
        loaded++;
      }
    }

    // Only log on first load (relay startup), not on every scheduler tick
    if (!process.env._SETTINGS_LOADED) {
      console.log(`[config] Loaded ${loaded} settings from DB.`);
      process.env._SETTINGS_LOADED = "1";
    }
  } catch (err) {
    console.warn("[config] Settings load failed (non-fatal):", err);
  }
}
