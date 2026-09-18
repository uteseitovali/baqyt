import { NextResponse } from "next/server";
import { CATALOG_META } from "@/lib/data/programs";
import { loadCatalog } from "@/lib/data/catalog.server";
import { isAIEnabled } from "@/lib/ai/client";
import { isDbEnabled, pingDb } from "@/lib/db/client";

export const runtime = "nodejs";

/** GET /api/health — быстрая проверка состояния для жюри и мониторинга. */
export async function GET() {
  const catalog = await loadCatalog();
  const dbEnabled = isDbEnabled();

  return NextResponse.json({
    status: "ok",
    service: "bagyt",
    catalog: {
      total: CATALOG_META.total,
      countries: CATALOG_META.countries,
      universities: CATALOG_META.universities,
      checkedOn: CATALOG_META.checkedOn,
      disclaimer: CATALOG_META.disclaimer,
      /* Честно показываем, откуда данные: "db" — живая витрина,
         "static" — кураторский срез из репозитория. */
      source: catalog.source,
      degradedReason: catalog.degradedReason ?? null,
    },
    db: {
      configured: dbEnabled,
      reachable: dbEnabled ? await pingDb() : false,
      note: dbEnabled
        ? "Каталог и профили читаются из Postgres; при сбое — откат в статический срез."
        : "DATABASE_URL не задан: каталог статический, состояние пути живёт в localStorage.",
    },
    ai: {
      enabled: isAIEnabled(),
      model: isAIEnabled() ? process.env.AI_MODEL || "gpt-4o-mini" : null,
      note: "Продукт полностью работает и без AI: подбор и маршрут детерминированы.",
    },
    time: new Date().toISOString(),
  });
}
