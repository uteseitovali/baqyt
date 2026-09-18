import { NextResponse } from "next/server";
import { getSessionUser, isAuthEnabled } from "@/lib/auth/session";
import { getJourney, saveJourney } from "@/lib/db/journey.repo";
import { journeyPutSchema, asJourneySnapshot } from "@/lib/sync/schema";
import { describeDbError } from "@/lib/db/errors";

export const runtime = "nodejs";

/* ============================================================================
   /api/journey — состояние пути вошедшего пользователя.

   Гостю этот роут не нужен вовсе: без аккаунта путь живёт в localStorage и
   ни одного запроса сюда не уходит.
   ========================================================================= */

async function requireUser() {
  if (!isAuthEnabled()) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Синхронизация выключена: DATABASE_URL не задан" },
        { status: 503 },
      ),
    };
  }

  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Нужен вход в аккаунт" }, { status: 401 }),
    };
  }

  return { user, response: null };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({ journey: await getJourney(user.id) });
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = journeyPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Состояние не прошло валидацию",
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const snapshot = asJourneySnapshot(parsed.data.journey);

  /* Время ставит сервер, а не браузер. Часы на устройстве могут быть
     сбиты — а по этому полю потом решается, чья версия анкеты свежее при
     входе с другого устройства. */
  const stored = { ...snapshot, updatedAt: new Date().toISOString() };

  try {
    await saveJourney(user.id, stored);
  } catch (error) {
    console.warn("[bagyt/journey] сохранить не удалось:", describeDbError(error));
    return NextResponse.json(
      { error: "База недоступна — прогресс остался в этом браузере" },
      { status: 503 },
    );
  }

  return NextResponse.json({ journey: stored });
}
