import { NextResponse } from "next/server";
import { z } from "zod";
import { createLoginCode, shouldRevealCode } from "@/lib/auth/codes";
import { isAuthEnabled } from "@/lib/auth/session";
import { describeDbError } from "@/lib/db/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().min(3).max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "нужен email"),
});

/**
 * POST /api/auth/request-code — выслать одноразовый код.
 *
 * Ответ одинаковый независимо от того, есть такой пользователь или нет:
 * иначе эндпоинт превращается в проверку «зарегистрирован ли этот человек».
 */
export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json(
      {
        error:
          "Аккаунты выключены: DATABASE_URL не задан. Путь работает без входа — прогресс хранится в этом браузере.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте адрес почты" }, { status: 422 });
  }

  try {
    const result = await createLoginCode(parsed.data.email);

    if (!result.ok) {
      return NextResponse.json(
        { error: "Слишком много запросов кода. Попробуйте через несколько минут." },
        { status: 429 },
      );
    }

    // Почтовый провайдер не подключён: код уходит в серверный лог. Это
    // осознанное ограничение демо, описанное в README §10.
    console.info(
      `[bagyt/auth] код входа для ${parsed.data.email}: ${result.code} ` +
        `(действует до ${result.expiresAt.toISOString()})`,
    );

    return NextResponse.json({
      sent: true,
      expiresAt: result.expiresAt.toISOString(),
      delivery: shouldRevealCode() ? "response" : "server-log",
      /* Код возвращается только когда это явно включено переменной
         AUTH_DEV_SHOW_CODE и только вне продакшена. */
      code: shouldRevealCode() ? result.code : undefined,
    });
  } catch (error) {
    console.warn("[bagyt/auth] не удалось создать код:", describeDbError(error));
    return NextResponse.json(
      { error: "База недоступна — вход временно невозможен. Путь без аккаунта работает." },
      { status: 503 },
    );
  }
}
