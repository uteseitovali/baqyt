import { NextResponse } from "next/server";
import { getSessionUser, isAuthEnabled } from "@/lib/auth/session";
import { getJourney } from "@/lib/db/journey.repo";
import { describeDbError } from "@/lib/db/errors";

export const runtime = "nodejs";

/**
 * GET /api/auth/me — кто вошёл и что у него сохранено.
 * Гость — это не ошибка: 200 с user: null.
 */
export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authEnabled: false, user: null, journey: null });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authEnabled: true, user: null, journey: null });
  }

  let journey = null;
  try {
    journey = await getJourney(user.id);
  } catch (error) {
    console.warn("[bagyt/auth] состояние не прочиталось:", describeDbError(error));
  }

  return NextResponse.json({ authEnabled: true, user, journey });
}
