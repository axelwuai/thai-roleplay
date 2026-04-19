import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  attachClientSessionsToUser,
  createAuthSession,
  findUserByEmail,
  registerUser,
} from "@/lib/practice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(128),
  clientId: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, clientId } = requestSchema.parse(body);

    if (findUserByEmail(email)) {
      return NextResponse.json(
        { error: "这个邮箱已经注册过了。" },
        { status: 409 },
      );
    }

    const user = registerUser(email, password);

    if (clientId) {
      attachClientSessionsToUser(clientId, user.id);
    }

    const authSession = createAuthSession(user.id);
    const response = NextResponse.json({ user });

    response.cookies.set({
      name: AUTH_SESSION_COOKIE_NAME,
      value: authSession.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(authSession.expiresAt),
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "注册信息格式不正确。" },
        { status: 400 },
      );
    }

    console.error("[/api/auth/register] request failed", error);

    return NextResponse.json(
      { error: "暂时无法完成注册，请稍后再试。" },
      { status: 500 },
    );
  }
}
