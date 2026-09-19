import { createHash, randomBytes } from "node:crypto";
import { hashToken } from "@/lib/auth/session";


/* ============================================================================
   СЛАГ ССЫЛКИ

   Тот же приём, что у токена сессии (auth/session.ts): случайные байты из
   CSPRNG уходят человеку в ссылке, а в базе лежит только SHA-256. Дамп таблицы
   shares не даёт открыть ни одну ссылку.

   Слаг — это и есть право на чтение: у страницы нет аккаунта, кто знает адрес,
   тот и смотрит. Поэтому он длинный (128 бит), не порядковый и не выводится
   из содержимого. Перебирать такое пространство бессмысленно, и отдельная
   защита от перебора на GET не нужна.
   ========================================================================= */

/** Сколько живёт ссылка. Тот же срок, что у сессии: путь поступления длинный. */
export const SHARE_TTL_DAYS = 30;

const SLUG_BYTES = 16;

/** 16 байт в base64url без «=» — ровно 22 символа. */
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function generateSlug(): string {
  return randomBytes(SLUG_BYTES).toString("base64url");
}

/** Ключ поиска в базе. Ровно hashToken сессии — не отдельная выдумка. */
export function hashSlug(slug: string): string {
  return hashToken(slug);
}

/** Дешёвая проверка формы: чужой мусор не должен доходить до запроса в базу. */
export function isWellFormedSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** Перец на время жизни процесса — на случай, когда AUTH_SECRET не задан. */
const globalForPepper = globalThis as unknown as { __bagytSharePepper?: string };

function creatorPepper(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  // IPv4 — четыре байта: хэш без секрета перебирается за секунды, и дамп базы
  // выдал бы адрес автора каждой ссылки. Поэтому без AUTH_SECRET берём
  // случайный перец процесса: адрес из дампа не восстановить вовсе. Цена —
  // ключи не переживают перезапуск и не совпадают между инстансами, то есть
  // лимит частоты слабее; для настоящего лимита задайте AUTH_SECRET.
  return (globalForPepper.__bagytSharePepper ??= randomBytes(32).toString("hex"));
}

/**
 * Обезличенный ключ автора для ограничения частоты.
 *
 * Адрес хэшируется с перцем (AUTH_SECRET, как у кода входа). Ключ нужен только
 * чтобы посчитать «сколько ссылок за час», и живёт ровно столько же, сколько
 * сама ссылка.
 */
export function hashCreator(ip: string): string {
  return createHash("sha256").update(`share:${ip}:${creatorPepper()}`).digest("hex");
}
