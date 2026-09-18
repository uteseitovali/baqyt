import { timingSafeEqual } from "node:crypto";

/* ============================================================================
   ДОСТУП К ЗАПИСИ В КАТАЛОГ

   Чтение каталога публично — это витрина. Запись закрыта токеном.

   Важный дефолт: если ADMIN_TOKEN не задан, запись не «открыта всем», а
   ВЫКЛЮЧЕНА. Забытая переменная окружения должна приводить к отказу, а не к
   открытому CRUD на продакшене.
   ========================================================================= */

export type WriteAccess =
  | { allowed: true }
  | { allowed: false; status: 401 | 503; reason: string };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual требует одинаковой длины, а сама длина секретом не является.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Проверяет заголовок Authorization: Bearer <ADMIN_TOKEN>. */
export function checkAdminAccess(request: Request): WriteAccess {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected) {
    return {
      allowed: false,
      status: 503,
      reason:
        "Запись в каталог выключена: ADMIN_TOKEN не задан. " +
        "Задайте его в .env.local, чтобы включить CRUD.",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !safeEqual(token, expected)) {
    return {
      allowed: false,
      status: 401,
      reason: "Требуется заголовок Authorization: Bearer <ADMIN_TOKEN>",
    };
  }

  return { allowed: true };
}
