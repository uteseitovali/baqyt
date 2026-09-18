import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLoginCode } from "@/lib/auth/codes";
import { createSession, isAuthEnabled, setSessionCookie } from "@/lib/auth/session";
import { getJourney } from "@/lib/db/journey.repo";
import { describeDbError } from "@/lib/db/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().min(3).max(200),
  code: z.string().regex(/^\d{6}$/, "код из шести цифр"),
});

const MESSAGES: Record<string, string> = {
  "no-code": "Код не запрашивался или уже использован — запросите новый.",
  expired: "Код истёк. Запросите новый.",
  "too-many-attempts": "Слишком много попыток. Запросите новый код.",
  "wrong-code": "Код не подошёл.",
};

/**
 * POST /api/auth/verify — проверить код, открыть сессию.
 *
 * Возвращает серверное состояние пути, если оно есть. Слияние с локальным
 * делает клиент: mergeJourneys — чистая функция, и работать она должна там,
 * где лежит гостевой прогресс.
 */
export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Аккаунты выключены" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите код из шести цифр" }, { status: 422 });
  }

  try {
    const result = await verifyLoginCode(parsed.data.email, parsed.data.code);
    if (!result.ok) {
      return NextResponse.json(
        { error: MESSAGES[result.reason] ?? "Войти не удалось" },
        { status: 401 },
      );
    }

    const { token, expiresAt } = await createSession(result.userId);
    await setSessionCookie(token, expiresAt);

    return NextResponse.json({
      user: { id: result.userId, email: result.email },
      journey: await getJourney(result.userId),
    });
  } catch (error) {
    console.warn("[bagyt/auth] вход не удался:", describeDbError(error));
    return NextResponse.json({ error: "База недоступна — попробуйте позже" }, { status: 503 });
  }
}
