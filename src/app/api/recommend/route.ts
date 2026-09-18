import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/data/catalog.server";
import { balancedShortlist, rankPrograms } from "@/lib/domain/scoring";
import { asProfile, recommendRequestSchema } from "@/lib/domain/validation";
import { enrichMatchExplanations } from "@/lib/ai/enrich";
import { isAIEnabled } from "@/lib/ai/client";

export const runtime = "nodejs";

/**
 * POST /api/recommend
 * Ранжирует каталог под профиль. Ранжирование детерминированное; LLM только
 * дописывает объяснения и только когда клиент явно просит (explain: true).
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

  const parsed = recommendRequestSchema.safeParse(body);
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
  const catalog = await loadCatalog();
  const matches = rankPrograms(profile, catalog.programs, {
    limit: parsed.data.limit ?? 12,
    hideBlocked: parsed.data.hideBlocked ?? false,
  });

  const shortlist = balancedShortlist(matches).map((m) => m.program.id);

  let explanations: Record<string, string> = {};
  let explanationSource: "llm" | "rules" = "rules";

  if (parsed.data.explain && isAIEnabled()) {
    explanations = await enrichMatchExplanations(profile, matches.slice(0, 5));
    if (Object.keys(explanations).length > 0) explanationSource = "llm";
  }

  return NextResponse.json({
    matches,
    shortlist,
    explanations,
    meta: {
      explanationSource,
      aiEnabled: isAIEnabled(),
      catalogSize: catalog.programs.length,
      catalogSource: catalog.source,
      tookMs: Date.now() - startedAt,
    },
  });
}
