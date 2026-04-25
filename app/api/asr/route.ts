import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuthUser } from "@/lib/auth";
import type { AsrDetectedLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  transcript: z.string().trim().min(1).max(500),
  speechMode: z.enum(["auto", "zh", "th"]).default("auto"),
});

function normalizeTranscript(transcript: string) {
  return transcript.replace(/\s+/g, " ").trim();
}

function detectLanguage(transcript: string, speechMode: "auto" | "zh" | "th"): AsrDetectedLanguage {
  const hasChinese = /[\u3400-\u9fff]/.test(transcript);
  const hasThai = /[\u0E00-\u0E7F]/.test(transcript);

  if (hasChinese && hasThai) {
    return "mixed";
  }

  if (hasThai) {
    return "th";
  }

  if (hasChinese) {
    return "zh";
  }

  if (speechMode === "zh") {
    return "zh";
  }

  if (speechMode === "th") {
    return "th";
  }

  return "unknown";
}

export async function POST(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);

  if (!authUser) {
    return NextResponse.json(
      {
        error: "请先登录账号，再使用语音输入。",
      },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);
    const normalizedTranscript = normalizeTranscript(payload.transcript);

    return NextResponse.json({
      transcript: payload.transcript,
      normalizedTranscript,
      detectedLanguage: detectLanguage(normalizedTranscript, payload.speechMode),
      speechMode: payload.speechMode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "语音识别请求格式不正确。",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/asr] request failed", error);

    return NextResponse.json(
      {
        error: "暂时无法处理这段语音，请稍后再试。",
      },
      { status: 500 },
    );
  }
}
