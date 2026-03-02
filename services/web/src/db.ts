import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!);

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await sql`SELECT key, value FROM settings`;
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value ?? "";
  }
  return map;
}

export async function embedContent(
  table: "messages" | "memory",
  id: string,
  content: string
): Promise<void> {
  const settings = await getSettings();
  const apiKey = settings.OPENAI_API_KEY?.trim();
  if (!apiKey) return;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: content }),
    });
    const data = (await res.json()) as any;
    const embedding: number[] = data.data?.[0]?.embedding;
    if (!embedding) return;
    const vectorStr = `[${embedding.join(",")}]`;
    if (table === "messages") {
      await sql`UPDATE messages SET embedding = ${vectorStr}::vector WHERE id = ${id}`;
    } else {
      await sql`UPDATE memory SET embedding = ${vectorStr}::vector WHERE id = ${id}`;
    }
  } catch (err) {
    console.error(`[embed] ${table} ${id}:`, err);
  }
}

export async function isOnboarded(): Promise<boolean> {
  const settings = await getSettings();
  return !!(settings.TELEGRAM_BOT_TOKEN && settings.ANTHROPIC_API_KEY);
}
