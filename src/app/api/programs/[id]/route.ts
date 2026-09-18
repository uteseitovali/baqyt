import { NextResponse } from "next/server";
import { invalidateCatalogCache, loadCatalog } from "@/lib/data/catalog.server";
import { programPatchSchema } from "@/lib/data/schema";
import { checkAdminAccess } from "@/lib/auth/admin";
import { isDbEnabled } from "@/lib/db/client";
import { deleteProgram, updateProgram } from "@/lib/db/programs.repo";

export const runtime = "nodejs";

/** Общий отказ для записи, когда каталог статический. */
function staticCatalogResponse() {
  return NextResponse.json(
    {
      error:
        "Каталог сейчас статический (DATABASE_URL не задан) — правка через API невозможна.",
    },
    { status: 503 },
  );
}

export async function GET(_request: Request, ctx: RouteContext<"/api/programs/[id]">) {
  const { id } = await ctx.params;
  const catalog = await loadCatalog();
  const program = catalog.programs.find((p) => p.id === id);

  if (!program) {
    return NextResponse.json({ error: `Программа ${id} не найдена` }, { status: 404 });
  }

  return NextResponse.json({ program, meta: { source: catalog.source } });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/programs/[id]">) {
  const access = checkAdminAccess(request);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: access.status });
  }
  if (!isDbEnabled()) return staticCatalogResponse();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Тело запроса не является корректным JSON" },
      { status: 400 },
    );
  }

  const parsed = programPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Обновление не прошло валидацию",
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const program = await updateProgram(id, parsed.data);
    if (!program) {
      return NextResponse.json({ error: `Программа ${id} не найдена` }, { status: 404 });
    }
    invalidateCatalogCache();
    return NextResponse.json({ program });
  } catch (error) {
    return NextResponse.json(
      {
        error: "База отклонила обновление",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/programs/[id]">) {
  const access = checkAdminAccess(request);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: access.status });
  }
  if (!isDbEnabled()) return staticCatalogResponse();

  const { id } = await ctx.params;
  const deleted = await deleteProgram(id);

  if (!deleted) {
    return NextResponse.json({ error: `Программа ${id} не найдена` }, { status: 404 });
  }

  invalidateCatalogCache();
  return NextResponse.json({ deleted: id });
}
