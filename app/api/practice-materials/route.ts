import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuthUser } from "@/lib/auth";
import { createOpenAIClient, OPENAI_MODEL } from "@/lib/openai";
import {
  getPracticeStudyMaterial,
  listPracticeStudyCardMemories,
  recordPracticeStudyCardEvent,
  upsertPracticeStudyMaterial,
  updatePracticeStudyCardFavorite,
  updatePracticeStudyFavorites,
} from "@/lib/practice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const suggestedReplySchema = z.object({
  thai: z.string().min(1),
  romanization: z.string().min(1),
  chinese: z.string().min(1),
});

const assistantStructuredMessageSchema = z.object({
  thai: z.string().min(1),
  romanization: z.string().min(1),
  chinese: z.string().min(1),
  coachingNote: z.string().optional().default(""),
  suggestedReply: suggestedReplySchema.nullable().optional(),
  learnerTranslation: suggestedReplySchema.nullable().optional(),
  repeatPrompt: z.string().optional().default(""),
});

const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().min(1).optional(),
  structuredContent: assistantStructuredMessageSchema.optional(),
  learnerTranslation: suggestedReplySchema.nullable().optional(),
});

const requestSchema = z.object({
  scenario: z.string().trim().min(1),
  mode: z.enum(["vocabulary", "listening", "speaking"]),
  messages: z.array(chatMessageSchema).min(2).max(60),
  force: z.boolean().optional(),
});

const favoritesRequestSchema = z.object({
  scenario: z.string().trim().min(1),
  mode: z.literal("vocabulary"),
  messages: z.array(chatMessageSchema).min(2).max(60),
  favoriteCardIds: z.array(z.string().min(1)).max(60),
});

const cardEventRequestSchema = z.object({
  scenario: z.string().trim().min(1),
  mode: z.enum(["vocabulary", "listening", "speaking"]),
  messages: z.array(chatMessageSchema).min(2).max(60),
  cardId: z.string().trim().min(1),
  event: z.enum(["open", "audio_play", "answer_reveal", "review_view", "focus", "favorite"]),
  focusMs: z.number().int().min(0).max(10 * 60 * 1000).optional(),
  revisit: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});

const vocabularyMaterialSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: z
    .array(
      z.object({
        term: z.string().min(1),
        romanization: z.string().min(1),
        chineseMeaning: z.string().min(1),
        usageNote: z.string().min(1),
        sourceExcerpt: z.string().min(1),
        sourceRomanization: z.string().optional().default(""),
        sourceChinese: z.string().optional().default(""),
        exampleThai: z.string().min(1),
        exampleRomanization: z.string().min(1),
        exampleChinese: z.string().min(1),
      }),
    )
    .min(4)
    .max(6),
  reviewTips: z.array(z.string().min(1)).min(2).max(4),
});

const listeningMaterialSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  items: z
    .array(
      z.object({
        focus: z.string().min(1),
        thai: z.string().min(1),
        romanization: z.string().min(1),
        question: z.string().min(1),
        answer: z.string().min(1),
        explanation: z.string().min(1),
      }),
    )
    .min(3)
    .max(5),
});

const speakingMaterialSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  drills: z
    .array(
      z.object({
        situation: z.string().min(1),
        cue: z.string().min(1),
        targetThai: z.string().min(1),
        romanization: z.string().min(1),
        coachingTip: z.string().min(1),
      }),
    )
    .min(3)
    .max(5),
});

function formatConversation(messages: z.infer<typeof chatMessageSchema>[]) {
  return messages
    .slice(-16)
    .map((message, index) => {
      if (message.role === "assistant" && message.structuredContent) {
        const sections = [
          `Turn ${index + 1} | AI`,
          `Thai: ${message.structuredContent.thai}`,
          `Romanization: ${message.structuredContent.romanization}`,
          `Chinese: ${message.structuredContent.chinese}`,
        ];

        if (message.structuredContent.coachingNote) {
          sections.push(`Coaching: ${message.structuredContent.coachingNote}`);
        }

        if (message.structuredContent.suggestedReply) {
          sections.push(
            `Suggested reply: ${message.structuredContent.suggestedReply.thai} / ${message.structuredContent.suggestedReply.chinese}`,
          );
        }

        return sections.join("\n");
      }

      const sections = [`Turn ${index + 1} | Learner`, `Original: ${message.content}`];

      if (message.learnerTranslation) {
        sections.push(
          `Supported Thai: ${message.learnerTranslation.thai} / ${message.learnerTranslation.chinese}`,
        );
      }

      return sections.join("\n");
    })
    .join("\n\n");
}

function buildMaterialPrompt({
  scenario,
  mode,
  conversation,
}: {
  scenario: string;
  mode: "vocabulary" | "listening" | "speaking";
  conversation: string;
}) {
  const common = `
You are building study materials for a Chinese-speaking beginner who just finished a Thai roleplay conversation.

Scenario: ${scenario}

Conversation transcript:
${conversation}

General rules:
- Use only content grounded in the conversation above.
- Keep everything practical, spoken, and beginner-friendly.
- Prefer short, useful, high-frequency language.
- Use Simplified Chinese.
- Return valid JSON only.
`.trim();

  if (mode === "vocabulary") {
    return `
${common}

Return exactly one JSON object with this shape:
{
  "title": string,
  "summary": string,
  "notes": [
    {
      "term": string,
      "romanization": string,
      "chineseMeaning": string,
      "usageNote": string,
      "sourceExcerpt": string,
      "sourceRomanization": string,
      "sourceChinese": string,
      "exampleThai": string,
      "exampleRomanization": string,
      "exampleChinese": string
    }
  ],
  "reviewTips": [string]
}

Vocabulary notes rules:
- Extract 4 to 6 useful Thai words or short phrases from the conversation.
- term must be Thai text.
- usageNote should explain how it was used in this scene.
- sourceExcerpt should be a short quote or fragment from the conversation, not a whole paragraph.
- sourceRomanization should match sourceExcerpt in Thai pronunciation.
- sourceChinese should be a concise Chinese meaning of sourceExcerpt in this scene.
- exampleThai should be one short, spoken Thai example based on this scene or a very close daily-life use case.
- exampleRomanization should match exampleThai.
- exampleChinese should be a concise Chinese translation of the example.
- reviewTips should give 2 to 4 concrete review suggestions.
`.trim();
  }

  if (mode === "listening") {
    return `
${common}

Return exactly one JSON object with this shape:
{
  "title": string,
  "summary": string,
  "items": [
    {
      "focus": string,
      "thai": string,
      "romanization": string,
      "question": string,
      "answer": string,
      "explanation": string
    }
  ]
}

Listening review rules:
- Create 3 to 5 short listening items from the conversation.
- thai should be a short line worth replaying for listening practice.
- question should ask what the learner should catch or understand.
- answer should be a short Chinese answer.
- explanation should explain the listening cue briefly.
`.trim();
  }

  return `
${common}

Return exactly one JSON object with this shape:
{
  "title": string,
  "summary": string,
  "drills": [
    {
      "situation": string,
      "cue": string,
      "targetThai": string,
      "romanization": string,
      "coachingTip": string
    }
  ]
}

Speaking review rules:
- Create 3 to 5 speaking drills based on what the learner should be able to say after this conversation.
- cue should be a Chinese speaking cue.
- targetThai should be a short natural spoken Thai reply.
- coachingTip should tell the learner what to pay attention to when speaking.
`.trim();
}

function buildContentSignature(
  scenario: string,
  messages: z.infer<typeof chatMessageSchema>[],
) {
  const payload = JSON.stringify({
    scenario,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      structuredContent: message.structuredContent,
      learnerTranslation: message.learnerTranslation,
    })),
  });

  let hash = 5381;

  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 33) ^ payload.charCodeAt(index);
  }

  return `${encodeURIComponent(scenario)}:${(hash >>> 0).toString(36)}`;
}

export async function POST(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);

  if (!authUser) {
    return NextResponse.json(
      {
        error: "请先登录账号，再生成复习内容。",
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
    const contentSignature = buildContentSignature(payload.scenario, payload.messages);
    const owner = {
      type: "user" as const,
      id: authUser.id,
    };
    const cached = !payload.force
      ? getPracticeStudyMaterial(owner, payload.scenario, contentSignature, payload.mode)
      : null;

    if (cached) {
      const cachedMaterial =
        payload.mode === "vocabulary"
          ? vocabularyMaterialSchema.parse(cached.material)
          : payload.mode === "listening"
            ? listeningMaterialSchema.parse(cached.material)
            : speakingMaterialSchema.parse(cached.material);

      return NextResponse.json({
        mode: payload.mode,
        material: cachedMaterial,
        favoriteCardIds: cached.favoriteCardIds,
        cardMemories: listPracticeStudyCardMemories(
          owner,
          payload.scenario,
          contentSignature,
          payload.mode,
        ),
      });
    }

    const conversation = formatConversation(payload.messages);
    const prompt = buildMaterialPrompt({
      scenario: payload.scenario,
      mode: payload.mode,
      conversation,
    });

    const response = await createOpenAIClient(apiKey).chat.completions.create({
      model: OPENAI_MODEL,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: "Return valid JSON only. Do not wrap in markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const rawContent = response.choices[0]?.message?.content;
    const parsed = JSON.parse(rawContent ?? "{}");

    if (payload.mode === "vocabulary") {
      const material = vocabularyMaterialSchema.parse(parsed);
      const stored = upsertPracticeStudyMaterial(owner, {
        scenario: payload.scenario,
        contentSignature,
        mode: payload.mode,
        material,
      });

      return NextResponse.json({
        mode: payload.mode,
        material,
        favoriteCardIds: stored.favoriteCardIds,
        cardMemories: listPracticeStudyCardMemories(
          owner,
          payload.scenario,
          contentSignature,
          payload.mode,
        ),
      });
    }

    if (payload.mode === "listening") {
      const material = listeningMaterialSchema.parse(parsed);
      upsertPracticeStudyMaterial(owner, {
        scenario: payload.scenario,
        contentSignature,
        mode: payload.mode,
        material,
      });

      return NextResponse.json({
        mode: payload.mode,
        material,
        cardMemories: listPracticeStudyCardMemories(
          owner,
          payload.scenario,
          contentSignature,
          payload.mode,
        ),
      });
    }

    const material = speakingMaterialSchema.parse(parsed);
    upsertPracticeStudyMaterial(owner, {
      scenario: payload.scenario,
      contentSignature,
      mode: payload.mode,
      material,
    });

    return NextResponse.json({
      mode: payload.mode,
      material,
      cardMemories: listPracticeStudyCardMemories(
        owner,
        payload.scenario,
        contentSignature,
        payload.mode,
      ),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid practice materials payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/practice-materials] request failed", error);

    return NextResponse.json(
      {
        error: "暂时无法生成这份复习内容，请稍后再试。",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);

  if (!authUser) {
    return NextResponse.json(
      {
        error: "请先登录账号，再保存重点词。",
      },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const payload = favoritesRequestSchema.parse(body);
    const contentSignature = buildContentSignature(payload.scenario, payload.messages);
    const owner = {
      type: "user" as const,
      id: authUser.id,
    };
    const existingMaterial = getPracticeStudyMaterial(
      owner,
      payload.scenario,
      contentSignature,
      payload.mode,
    );
    const updated = updatePracticeStudyFavorites(owner, {
      scenario: payload.scenario,
      contentSignature,
      mode: payload.mode,
      favoriteCardIds: payload.favoriteCardIds,
    });

    if (!updated) {
      return NextResponse.json(
        {
          error: "请先生成词汇笔记，再保存重点词。",
        },
        { status: 404 },
      );
    }

    const previousFavoriteIds = new Set(existingMaterial?.favoriteCardIds ?? []);
    const nextFavoriteIds = new Set(payload.favoriteCardIds);

    for (const cardId of previousFavoriteIds) {
      if (!nextFavoriteIds.has(cardId)) {
        updatePracticeStudyCardFavorite(owner, {
          scenario: payload.scenario,
          contentSignature,
          mode: payload.mode,
          cardId,
          isFavorite: false,
        });
      }
    }

    for (const cardId of payload.favoriteCardIds) {
      updatePracticeStudyCardFavorite(owner, {
        scenario: payload.scenario,
        contentSignature,
        mode: payload.mode,
        cardId,
        isFavorite: true,
      });
    }

    return NextResponse.json({
      ok: true,
      favoriteCardIds: updated.favoriteCardIds,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid practice favorites payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/practice-materials] favorites update failed", error);

    return NextResponse.json(
      {
        error: "暂时无法保存重点词，请稍后再试。",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);

  if (!authUser) {
    return NextResponse.json(
      {
        error: "请先登录账号，再记录复习偏好。",
      },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const payload = cardEventRequestSchema.parse(body);
    const contentSignature = buildContentSignature(payload.scenario, payload.messages);
    const owner = {
      type: "user" as const,
      id: authUser.id,
    };

    const memory =
      payload.event === "favorite"
        ? updatePracticeStudyCardFavorite(owner, {
            scenario: payload.scenario,
            contentSignature,
            mode: payload.mode,
            cardId: payload.cardId,
            isFavorite: payload.isFavorite ?? true,
          })
        : recordPracticeStudyCardEvent(owner, {
            scenario: payload.scenario,
            contentSignature,
            mode: payload.mode,
            cardId: payload.cardId,
            event: payload.event,
            focusMs: payload.focusMs,
            revisit: payload.revisit,
          });

    return NextResponse.json({
      ok: true,
      memory,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid practice card event payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/practice-materials] card event update failed", error);

    return NextResponse.json(
      {
        error: "暂时无法记录这次复习偏好，请稍后再试。",
      },
      { status: 500 },
    );
  }
}
