import { NextResponse } from "next/server";
import { buildDiagnosis } from "@/lib/domain/diagnosis";
import { asProfile, diagnoseRequestSchema } from "@/lib/domain/validation";
import { enrichDiagnosis } from "@/lib/ai/enrich";
import { isAIEnabled } from "@/lib/ai/client";

export const runtime = "nodejs";

/**
 * POST /api/diagnose
 * Всегда возвращает полный разбор. LLM только переписывает формулировки —
 * если он недоступен, ответ остаётся валидным, а generatedBy честно скажет
 * «rules», и интерфейс покажет это пользователю.
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

  const parsed = diagnoseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Профиль не прошёл валидацию",
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const startedAt = Date.now();
  const profile = asProfile(parsed.data.profile);
  const base = buildDiagnosis(profile);

  const shouldEnrich = parsed.data.enrich !== false && isAIEnabled();
  const diagnosis = shouldEnrich ? await enrichDiagnosis(profile, base) : base;

  return NextResponse.json({
    diagnosis,
    meta: {
      aiEnabled: isAIEnabled(),
      tookMs: Date.now() - startedAt,
    },
  });
}
