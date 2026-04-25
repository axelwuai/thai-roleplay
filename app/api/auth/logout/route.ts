import { NextRequest, NextResponse } from "next/server";

import { AUTH_SESSION_COOKIE_NAME, shouldUseSecureAuthCookie } from "@/lib/auth";
import { revokeAuthSession } from "@/lib/practice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim();

  if (sessionToken) {
    revokeAuthSession(sessionToken);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureAuthCookie(),
    path: "/",
    expires: new Date(0),
  });

  return response;
}
