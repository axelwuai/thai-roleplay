import type { NextRequest } from "next/server";

import { getUserFromSessionToken } from "@/lib/practice-store";

export const AUTH_SESSION_COOKIE_NAME = "thai_roleplay_session";

export function shouldUseSecureAuthCookie() {
  const configuredValue = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();

  if (configuredValue === "true") {
    return true;
  }

  if (configuredValue === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

export async function getRequestAuthUser(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim();

  if (!sessionToken) {
    return null;
  }

  return getUserFromSessionToken(sessionToken);
}
