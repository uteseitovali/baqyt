import { NextResponse } from "next/server";
import { invalidateCatalogCache, loadCatalog } from "@/lib/data/catalog.server";
import { programCreateSchema } from "@/lib/data/schema";
import { checkAdminAccess } from "@/lib/auth/admin";
import { isDbEnabled } from "@/lib/db/client";
import { getProgram, insertProgram } from "@/lib/db/programs.repo";

export const runtime = "nodejs";

/* ============================================================================
   /api/programs — витрина каталога и его редактирование.

   GET открыт всем и работает всегда: с базой отдаёт живые данные, без базы —
   статический срез. Поле meta.source говорит, что именно вы получили.
   POST требует ADMIN_TOKEN и базу: писать в статический массив нельзя.
   ========================================================================= */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = url.searchParams.get("country") ?? undefined;
  const field = url.searchParams.get("field") ?? undefined;

  const catalog = await loadCatalog();

  // Фильтрация одинаковая в обоих режимах: на статике фильтруем в памяти,
  // чтобы контракт ответа не зависел от наличия базы.
  const programs = catalog.programs.filter((p) => {
    if (country && p.country !== country) return false;
    const secondary: string[] = p.secondaryFields;
    if (field && p.field !== field && !secondary.includes(field)) return false;
    return true;
  });

  return NextResponse.json({
    programs,
    meta: {
      total: programs.length,
      catalogTotal: catalog.programs.length,
      source: catalog.source,
      degradedReason: catalog.degradedReason ?? null,
      writable: isDbEnabled() && Boolean(process.env.ADMIN_TOKEN?.trim()),
    },
  });
}

export async function POST(request: Request) {
  const access = checkAdminAccess(request);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: access.status });
  }

  if (!isDbEnabled()) {
    return NextResponse.json(
      {
        error:
          "Каталог сейчас статический (DATABASE_URL не задан) — запись невозможна. " +
          "Программы правятся в src/lib/data/programs.ts.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Тело запроса не является корректным JSON" },
      { status: 400 },
    );
  }

  const parsed = programCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Программа не прошла валидацию",
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const program = parsed.data;

  if (await getProgram(program.id)) {
    return NextResponse.json(
      { error: `Программа ${program.id} уже существует — используйте PATCH` },
      { status: 409 },
    );
  }

  try {
    await insertProgram(program);
  } catch (error) {
    return NextResponse.json(
      {
        error: "База отклонила запись",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  invalidateCatalogCache();
  return NextResponse.json({ program }, { status: 201 });
}
