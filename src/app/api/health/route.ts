import { NextResponse } from "next/server";
import { CATALOG_META } from "@/lib/data/programs";
import { isAIEnabled } from "@/lib/ai/client";

export const runtime = "nodejs";

/** GET /api/health — быстрая проверка состояния для жюри и мониторинга. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "bagyt",
    catalog: CATALOG_META,
    ai: {
      enabled: isAIEnabled(),
      model: isAIEnabled() ? process.env.AI_MODEL || "gpt-4o-mini" : null,
      note: "Продукт полностью работает и без AI: подбор и маршрут детерминированы.",
    },
    time: new Date().toISOString(),
  });
}
