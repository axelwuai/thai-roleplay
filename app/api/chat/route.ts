import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOpenAIClient, OPENAI_MODEL } from "@/lib/openai";
import { buildSystemPrompt, buildTurnInstruction } from "@/lib/prompt";
import { containsChinese, isHelpTrigger, isRepeatTrigger } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUT_JSON_INSTRUCTION = `
Return exactly one JSON object.

Required JSON shape:
{
  "thai": string,
  "romanization": string,
  "chinese": string,
  "coachingNote": string,
  "suggestedReply": {
    "thai": string,
    "romanization": string,
    "chinese": string
  } | null,
  "learnerTranslation": {
    "thai": string,
    "romanization": string,
    "chinese": string
  } | null,
  "repeatPrompt": string
}

Rules:
- Output valid JSON only.
- Do not wrap JSON in markdown fences.
- Do not include any extra text before or after the JSON object.
`.trim();

const requestSchema = z.object({
  scenario: z.string().trim().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(100)
    .default([]),
  userMessage: z.string().default(""),
});

const assistantStructuredMessageSchema = z.object({
  thai: z.string().min(1),
  romanization: z.string().min(1),
  chinese: z.string().min(1),
  coachingNote: z.string(),
  suggestedReply: z
    .object({
      thai: z.string().min(1),
      romanization: z.string().min(1),
      chinese: z.string().min(1),
    })
    .nullable(),
  learnerTranslation: z
    .object({
      thai: z.string().min(1),
      romanization: z.string().min(1),
      chinese: z.string().min(1),
    })
    .nullable(),
  repeatPrompt: z.string(),
});

export async function POST(request: NextRequest) {
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
    const { scenario, history, userMessage } = requestSchema.parse(body);

    const trimmedHistory = history.slice(-12);
    const normalizedUserMessage = userMessage.trim();
    const initialTurn = trimmedHistory.length === 0 && normalizedUserMessage.length === 0;
    const helpTrigger = isHelpTrigger(normalizedUserMessage);
    const repeatTrigger = isRepeatTrigger(normalizedUserMessage);
    const shouldProvideLearnerTranslation =
      normalizedUserMessage.length > 0 && containsChinese(normalizedUserMessage) && !helpTrigger;

    const response = await createOpenAIClient(apiKey).chat.completions.create({
      model: OPENAI_MODEL,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `${buildSystemPrompt(scenario)}\n\n${OUTPUT_JSON_INSTRUCTION}`,
        },
        ...trimmedHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: "user",
          content: buildTurnInstruction({
            scenario,
            userMessage: normalizedUserMessage,
            initialTurn,
            helpTrigger,
            repeatTrigger,
            shouldProvideLearnerTranslation,
          }),
        },
      ],
    });

    const rawContent = response.choices[0]?.message?.content;
    const parsedContent = assistantStructuredMessageSchema.parse(JSON.parse(rawContent ?? "{}"));

    return NextResponse.json({
      message: parsedContent,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/chat] request failed", error);

    return NextResponse.json(
      {
        error: "The AI coach could not answer right now. Please retry in a moment.",
      },
      { status: 500 },
    );
  }
}
