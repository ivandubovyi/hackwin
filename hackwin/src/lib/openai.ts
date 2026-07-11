import OpenAI from "openai";

let client: OpenAI | null | undefined;

export function getOpenAI(): OpenAI | null {
  if (client !== undefined) return client;
  if (!process.env.OPENAI_API_KEY) {
    client = null;
    return client;
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export async function chatJson(
  system: string,
  user: string,
  opts?: { temperature?: number },
): Promise<string> {
  const openai = getOpenAI();
  if (!openai) throw new Error("OPENAI_API_KEY is not configured");

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: opts?.temperature ?? 0.95,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty model response");
  return content;
}
