import { NextRequest, NextResponse } from "next/server";

import { getRequestAuthUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getRequestAuthUser(request);

  return NextResponse.json({
    user,
  });
}
