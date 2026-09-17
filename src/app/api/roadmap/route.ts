import { NextResponse } from "next/server";
import { getProgramById } from "@/lib/data/programs";
import { buildRoadmap } from "@/lib/domain/roadmap";
import { scoreProgram } from "@/lib/domain/scoring";
import { asProfile, roadmapRequestSchema } from "@/lib/domain/validation";

export const runtime = "nodejs";

/**
 * POST /api/roadmap
 * Строит персональный план под выбранную программу. Полностью детерминированно:
 * состав задач зависит от того, чего в профиле не хватает под требования вуза.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Тело запроса не является корректным JSON" },
      { status: 400 },
    );
  }

  const parsed = roadmapRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректный запрос", issues: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const program = getProgramById(parsed.data.programId);
  if (!program) {
    return NextResponse.json(
      { error: `Программа ${parsed.data.programId} не найдена в каталоге` },
      { status: 404 },
    );
  }

  const profile = asProfile(parsed.data.profile);

  return NextResponse.json({
    roadmap: buildRoadmap(profile, program),
    match: scoreProgram(profile, program),
  });
}
