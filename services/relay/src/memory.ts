/**
 * Memory Module
 *
 * Persistent facts, goals, and preferences stored in PostgreSQL.
 * Claude manages memory automatically via intent tags in its responses:
 *   [REMEMBER: fact]
 *   [GOAL: text | DEADLINE: date]
 *   [DONE: search text]
 *
 * The relay parses these tags, saves to the DB, and strips them
 * from the response before sending to the user.
 */

import { sql, embedContent } from "./db.ts";

/**
 * Parse Claude's response for memory intent tags.
 * Saves facts/goals to the DB and returns the cleaned response.
 */
export async function processMemoryIntents(response: string): Promise<string> {
  let clean = response;

  // [REMEMBER: fact to store]
  for (const match of response.matchAll(/\[REMEMBER:\s*(.+?)\]/gi)) {
    const content = match[1];
    const rows = await sql`INSERT INTO memory (type, content) VALUES ('fact', ${content}) RETURNING id`;
    const id = rows[0]?.id;
    if (id) embedContent("memory", id, content); // fire-and-forget
    clean = clean.replace(match[0], "");
  }

  // [GOAL: text] or [GOAL: text | DEADLINE: date]
  for (const match of response.matchAll(
    /\[GOAL:\s*(.+?)(?:\s*\|\s*DEADLINE:\s*(.+?))?\]/gi
  )) {
    const content = match[1];
    const deadline = match[2] || null;
    const rows = await sql`
      INSERT INTO memory (type, content, deadline)
      VALUES ('goal', ${content}, ${deadline})
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (id) embedContent("memory", id, content); // fire-and-forget
    clean = clean.replace(match[0], "");
  }

  // [DONE: search text for completed goal]
  for (const match of response.matchAll(/\[DONE:\s*(.+?)\]/gi)) {
    const searchTerm = `%${match[1]}%`;
    const found = await sql`
      SELECT id FROM memory WHERE type = 'goal' AND content ILIKE ${searchTerm} LIMIT 1
    `;
    if (found[0]) {
      await sql`
        UPDATE memory SET type = 'completed_goal', completed_at = NOW() WHERE id = ${found[0].id}
      `;
    }
    clean = clean.replace(match[0], "");
  }

  return clean.trim();
}

/**
 * Parse Claude's response for [SCHEDULE:] intent tags.
 * Inserts rows into scheduled_tasks and strips tags from the response.
 *
 * Tag formats:
 *   [SCHEDULE: desc | TYPE: once     | WHEN: ISO-UTC          | ACTION: prompt]
 *   [SCHEDULE: desc | TYPE: interval | MINUTES: N             | ACTION: prompt]
 *   [SCHEDULE: desc | TYPE: daily    | WHEN: ISO-UTC-first-run | ACTION: prompt]
 */
export async function processScheduleIntents(response: string): Promise<string> {
  let clean = response;

  // Non-greedy on both sides — avoids runaway matches in long responses
  const scheduleRegex = /\[SCHEDULE:\s*([\s\S]*?)\|\s*ACTION:\s*([\s\S]*?)\]/gi;

  const matches = [...response.matchAll(scheduleRegex)];

  if (matches.length === 0) {
    if (/schedule|remind|timer|daily|interval/i.test(response)) {
      console.log("[memory] No [SCHEDULE:] tag found. Raw snippet:", response.substring(0, 300));
    }
    return clean.trim();
  }

  for (const match of matches) {
    const paramsStr = match[1];
    const actionPrompt = match[2].trim();

    console.log("[memory] SCHEDULE tag found. params:", paramsStr.trim(), "| action:", actionPrompt.substring(0, 80));

    const getField = (key: string) => {
      const m = paramsStr.match(new RegExp(`\\b${key}:\\s*([^|\\]]+)`, "i"));
      return m ? m[1].trim() : undefined;
    };

    const description = paramsStr.split("|")[0].trim() || "Scheduled task";
    const type = (getField("TYPE") || "once").toLowerCase() as "once" | "interval" | "daily";
    const when = getField("WHEN");
    const minutesRaw = getField("MINUTES");
    const minutes = minutesRaw ? parseInt(minutesRaw, 10) : null;

    let nextRunAt: string;
    let intervalMinutes: number | null = null;

    if (type === "once" || type === "daily") {
      nextRunAt = when || new Date().toISOString();
    } else {
      intervalMinutes = minutes || 60;
      nextRunAt = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
    }

    console.log(`[memory] Inserting scheduled task: [${type}] "${description}" → ${nextRunAt}`);

    try {
      await sql`
        INSERT INTO scheduled_tasks (description, action_prompt, schedule_type, next_run_at, interval_minutes)
        VALUES (${description}, ${actionPrompt}, ${type}, ${nextRunAt}, ${intervalMinutes})
      `;
      console.log(`[memory] Scheduled: [${type}] ${description} → ${nextRunAt}`);
    } catch (err: any) {
      console.error("[memory] Schedule insert error:", err.message);
    }

    clean = clean.replace(match[0], "");
  }

  return clean.trim();
}

/**
 * Get all facts and active goals for prompt context.
 */
export async function getMemoryContext(): Promise<string> {
  try {
    const [facts, goals] = await Promise.all([
      sql`SELECT * FROM get_facts()`,
      sql`SELECT * FROM get_active_goals()`,
    ]);

    const parts: string[] = [];

    if (facts.length) {
      parts.push("FACTS:\n" + facts.map((f: any) => `- ${f.content}`).join("\n"));
    }

    if (goals.length) {
      parts.push(
        "GOALS:\n" +
          goals
            .map((g: any) => {
              const deadline = g.deadline
                ? ` (by ${new Date(g.deadline).toLocaleDateString()})`
                : "";
              return `- ${g.content}${deadline}`;
            })
            .join("\n")
      );
    }

    return parts.join("\n\n");
  } catch (error) {
    console.error("Memory context error:", error);
    return "";
  }
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    const data = (await res.json()) as any;
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Semantic search for relevant past messages via direct OpenAI embedding + SQL.
 */
export async function getRelevantContext(query: string): Promise<string> {
  try {
    const embedding = await generateEmbedding(query);
    if (!embedding) return "";

    const vectorStr = `[${embedding.join(",")}]`;
    const rows = await sql`SELECT * FROM match_messages(${vectorStr}::vector, 0.7, 5)`;

    if (!rows.length) return "";

    return (
      "RELEVANT PAST MESSAGES:\n" +
      rows.map((m: any) => `[${m.role}]: ${m.content}`).join("\n")
    );
  } catch {
    return "";
  }
}
