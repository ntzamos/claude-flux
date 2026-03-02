import postgres from "postgres";

export const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres"
);

/**
 * Fire-and-forget: generate OpenAI embedding and store on the row.
 * Does nothing if OPENAI_API_KEY is not set.
 */
export async function embedContent(
  table: "messages" | "memory",
  id: string,
  content: string
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
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
