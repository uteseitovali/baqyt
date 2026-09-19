import { query, queryOne, withTransaction } from "./client";
import { parseShareable } from "@/lib/share/schema";
import { SHARE_TTL_DAYS } from "@/lib/share/slug";
import type { ShareableSummary } from "@/lib/share/summary";

/* ============================================================================
   РЕПОЗИТОРИЙ ССЫЛОК «ПОКАЗАТЬ СЕМЬЕ»

   Только серверный модуль: импортирует драйвер. Слаг сюда не приходит —
   репозиторий видит уже посчитанный хэш и не может ни залогировать, ни
   сохранить саму ссылку.
   ========================================================================= */

/** Не больше десяти новых ссылок в час с одного адреса. */
export const MAX_SHARES_PER_HOUR = 10;

/**
 * Истёкшие строки не нужны никому: чистим при записи, отдельного cron нет.
 * Пачками по сто — иначе после долгого затишья один DELETE упёрся бы в
 * statement_timeout. Сбой уборки не должен мешать создать ссылку, поэтому
 * вызывающий его игнорирует.
 */
export async function purgeExpiredShares(): Promise<void> {
  await query(
    `delete from shares where id in (
       select id from shares where expires_at <= now() limit 100
     )`,
  );
}

export type InsertShareResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: "rate-limited" };

/**
 * Проверка лимита и вставка — в одной транзакции под advisory-локом на ключ
 * автора. Без лока «посчитать, потом вставить» гонится: сто параллельных
 * запросов увидели бы счётчик меньше десяти и записали все сто.
 */
export async function insertShareWithinLimit(input: {
  slugHash: string;
  summary: ShareableSummary;
  creatorHash: string;
}): Promise<InsertShareResult> {
  return withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [input.creatorHash]);

    const recent = await client.query<{ count: string }>(
      `select count(*)::text as count from shares
        where creator_hash = $1 and created_at > now() - interval '1 hour'`,
      [input.creatorHash],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= MAX_SHARES_PER_HOUR) {
      return { ok: false, reason: "rate-limited" } as const;
    }

    const inserted = await client.query<{ expires_at: Date }>(
      `insert into shares (slug_hash, summary, creator_hash, expires_at)
       values ($1, $2, $3, now() + ($4 * interval '1 day'))
       returning expires_at`,
      [input.slugHash, JSON.stringify(input.summary), input.creatorHash, SHARE_TTL_DAYS],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("вставка ссылки не вернула строку");
    return { ok: true, expiresAt: row.expires_at } as const;
  });
}

export interface StoredShare {
  summary: ShareableSummary;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Живая ссылка по хэшу слага или null.
 *
 * «Нет», «истекла» и «в базе лежит что-то не по схеме» неразличимы для
 * вызывающего: страница отвечает на все три одинаково, чтобы по ответу нельзя
 * было выяснить, существовал ли когда-то такой слаг.
 */
export async function findShare(slugHash: string): Promise<StoredShare | null> {
  const row = await queryOne<{ summary: unknown; created_at: Date; expires_at: Date }>(
    `select summary, created_at, expires_at from shares
      where slug_hash = $1 and expires_at > now()`,
    [slugHash],
  );
  if (!row) return null;

  const summary = parseShareable(row.summary);
  if (!summary) {
    console.warn("[bagyt/share] сохранённая сводка не прошла схему — считаем ссылку недействительной");
    return null;
  }
  return { summary, createdAt: row.created_at, expiresAt: row.expires_at };
}
