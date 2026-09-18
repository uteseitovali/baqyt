import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db/client";
import { describeDbError } from "@/lib/db/errors";

/* ============================================================================
   СЕССИИ

   Cookie хранит непрозрачный случайный токен; в базе лежит только его
   SHA-256. Ни код входа, ни токен нельзя восстановить из дампа базы.

   Сессия серверная, а не JWT: её можно отозвать. Для продукта, который
   хранит анкету школьника, возможность выйти со всех устройств важнее
   экономии одного запроса к базе на проверку.
   ========================================================================= */

export const SESSION_COOKIE = "bagyt_session";

/** 30 дней: путь поступления длинный, каждую неделю логиниться незачем. */
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isAuthEnabled(): boolean {
  // Аккаунты существуют ровно тогда, когда есть где хранить пользователей.
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Создаёт сессию и возвращает токен для cookie. */
export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  );

  return { token, expiresAt };
}

/** Ставит cookie сессии. Только из route handler — так требует Next. */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Текущий пользователь или null. Не бросает: сбой базы означает «гость»,
 * а гостевой сценарий работает полностью.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;

  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const row = await queryOne<{ id: string; email: string; session_id: string }>(
      `select u.id, u.email, s.id as session_id
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now()`,
      [hashToken(token)],
    );
    if (!row) return null;

    // Отметка активности: по ней позже можно чистить мёртвые сессии.
    await query("update sessions set last_seen_at = now() where id = $1", [
      row.session_id,
    ]).catch(() => {});

    return { id: row.id, email: row.email };
  } catch (error) {
    console.warn(
      "[bagyt/auth] сессию проверить не удалось, работаем как гость:",
      describeDbError(error),
    );
    return null;
  }
}

/** Выход с текущего устройства. */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("delete from sessions where token_hash = $1", [hashToken(token)]).catch(
      () => {},
    );
  }
  await clearSessionCookie();
}

/** Сравнение секретов постоянным временем. */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export { hashToken };
