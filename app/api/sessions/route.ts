import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuthUser } from "@/lib/auth";
import {
  deletePracticeSession,
  getPracticeSession,
  listPracticeSessionSummaries,
  renamePracticeSession,
  upsertPracticeSession,
} from "@/lib/practice-store";
import type { ScenarioSession } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().min(1),
  structuredContent: z.unknown().optional(),
  learnerTranslation: z.unknown().optional(),
});

const sessionSchema = z.object({
  scenario: z.string().trim().min(1),
  messages: z.array(chatMessageSchema).default([]),
  showThaiScript: z.boolean(),
  updatedAt: z.string().min(1),
});

const renameSessionSchema = z.object({
  fromScenario: z.string().trim().min(1),
  toScenario: z.string().trim().min(1),
});

async function resolvePracticeOwner(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);

  if (!authUser) {
    return null;
  }

  return {
    type: "user" as const,
    id: authUser.id,
  };
}

export async function GET(request: NextRequest) {
  const owner = await resolvePracticeOwner(request);

  if (!owner) {
    return NextResponse.json({ error: "请先登录账号，再查看你的学习记录。" }, { status: 401 });
  }

  const scenario = request.nextUrl.searchParams.get("scenario")?.trim();

  if (scenario) {
    return NextResponse.json({
      session: getPracticeSession(owner, scenario),
    });
  }

  return NextResponse.json({
    sessions: listPracticeSessionSummaries(owner),
  });
}

export async function PUT(request: NextRequest) {
  const owner = await resolvePracticeOwner(request);

  if (!owner) {
    return NextResponse.json({ error: "请先登录账号，再保存你的学习记录。" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const session = sessionSchema.parse(body.session);

    return NextResponse.json({
      session: upsertPracticeSession(owner, session as ScenarioSession),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid session payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/sessions] request failed", error);

    return NextResponse.json(
      { error: "Could not save the practice session right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const owner = await resolvePracticeOwner(request);

  if (!owner) {
    return NextResponse.json({ error: "请先登录账号，再管理你的场景记录。" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fromScenario, toScenario } = renameSessionSchema.parse(body);
    const result = renamePracticeSession(owner, fromScenario, toScenario);

    switch (result.status) {
      case "not_found":
        return NextResponse.json({ error: "原场景不存在。" }, { status: 404 });
      case "conflict":
        return NextResponse.json(
          { error: "已经有同名场景了，请换一个名字。" },
          { status: 409 },
        );
      case "success":
        return NextResponse.json({
          session: result.session,
        });
      default:
        return NextResponse.json({ error: "暂时无法重命名场景，请稍后再试。" }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid rename payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    console.error("[/api/sessions] rename failed", error);

    return NextResponse.json(
      { error: "暂时无法重命名场景，请稍后再试。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const owner = await resolvePracticeOwner(request);

  if (!owner) {
    return NextResponse.json({ error: "请先登录账号，再管理你的场景记录。" }, { status: 401 });
  }

  const scenario = request.nextUrl.searchParams.get("scenario")?.trim();

  if (!scenario) {
    return NextResponse.json({ error: "Missing scenario." }, { status: 400 });
  }

  const deleted = deletePracticeSession(owner, scenario);

  if (!deleted) {
    return NextResponse.json({ error: "场景不存在。" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
