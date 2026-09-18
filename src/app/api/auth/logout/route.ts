import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST /api/auth/logout — закрыть сессию.
 * Локальный прогресс при этом не стирается: человек выходит из аккаунта,
 * а не отказывается от своего пути.
 */
export async function POST() {
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
}
