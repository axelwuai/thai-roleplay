import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuthUser } from "@/lib/auth";
import { createOpenAIClient, OPENAI_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUT_JSON_INSTRUCTION = `
Return exactly one JSON object.

Required JSON shape:
{
  "term": string,
  "romanization": string,
  "chineseMeaning": string,
  "usage": string,
  "exampleThai": string,
  "exampleRomanization": string,
  "exampleChinese": string
}

Rules:
- Output valid JSON only.
- Do not wrap JSON in markdown fences.
- Do not include any extra text before or after the JSON object.
- Keep every field concise and beginner-friendly.
`.trim();

const requestSchema = z.object({
  term: z.string().trim().min(1).max(80),
  sentence: z.string().trim().max(300).optional(),
  scenario: z.string().trim().max(120).optional(),
});

const responseSchema = z.object({
  term: z.string().min(1),
  romanization: z.string().min(1),
  chineseMeaning: z.string().min(1),
  usage: z.string().min(1),
  exampleThai: z.string().min(1),
  exampleRomanization: z.string().min(1),
  exampleChinese: z.string().min(1),
});

function buildVocabularyPrompt({
  term,
  sentence,
  scenario,
}: {
  term: string;
  sentence?: string;
  scenario?: string;
}) {
  return `
You are a Thai vocabulary coach for Chinese-speaking beginners.

Task:
- Explain the clicked Thai term: ${term}
- Use the sentence context when helpful
- Keep the answer practical for spoken Thai learners

Context:
- Scenario: ${scenario || "unknown"}
- Source sentence: ${sentence || "unknown"}

What to return:
- term: keep the same Thai term
- romanization: easy Latin transliteration for Chinese-speaking beginners
- chineseMeaning: short natural Simplified Chinese meaning
- usage: explain how the term is used in this sentence and in real spoken Thai
- exampleThai: one short beginner-friendly Thai example sentence
- exampleRomanization: transliteration of the example
- exampleChinese: concise Chinese translation of the example

Extra rules:
- Prefer spoken everyday Thai over textbook wording
- If the clicked term is a particle, classifier, or polite word, explain its function clearly
- If the context changes the meaning, explain the contextual meaning first
- Be precise but brief
`.trim();
}

export async function POST(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);

  if (!authUser) {
    return NextResponse.json(
      {
        error: "请先登录账号，再使用单词学习功能。",
      },
      { status: 401 },
    );
  }

  const requestApiKey =
    request.headers.get("x-ai-api-key")?.trim() || request.headers.get("x-openai-api-key")?.trim();
  const apiKey =
    requestApiKey || process.env.DASHSCOPE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing API key. Please set DASHSCOPE_API_KEY on the server or provide a key in the app.",
      },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);

    const response = await createOpenAIClient(apiKey).chat.completions.create({
      model: OPENAI_MODEL,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: OUTPUT_JSON_INSTRUCTION,
        },
        {
          role: "user",
          content: buildVocabularyPrompt(payload),
        },
      ],
    });

    const rawContent = response.choices[0]?.message?.content;
    const explanation = responseSchema.parse(JSON.parse(rawContent ?? "{}"));

    return NextResponse.json({ explanation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid vocabulary payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/vocab] request failed", error);

    return NextResponse.json(
      {
        error: "暂时无法解析这个词，请稍后再试。",
      },
      { status: 500 },
    );
  }
}
