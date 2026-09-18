import { Pool } from "pg";
import type { PoolClient, QueryResultRow } from "pg";

/* ============================================================================
   ДОСТУП К БАЗЕ ДАННЫХ

   Тот же принцип, что и у AI-слоя (src/lib/ai/client.ts): база — УСИЛИТЕЛЬ,
   а не зависимость. Нет DATABASE_URL — нет пула, нет соединений, нет ошибок:
   каталог отдаётся из статического среза, состояние пути живёт в localStorage,
   полный сценарий работает без единой переменной окружения.

   ВАЖНО: этот модуль и всё, что его импортирует, — только серверный код.
   Клиентские страницы работают с @/lib/data/programs, который драйвер не
   тянет ни одной веткой.
   ========================================================================= */

export interface DbConfig {
  url: string;
  /** Максимум соединений в пуле. Для демо хватает небольшого. */
  maxConnections: number;
  /** Верхняя граница на запрос: лучше деградировать в статику, чем висеть. */
  statementTimeoutMs: number;
  ssl: boolean;
}

export function readDbConfig(): DbConfig | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  // Хостинги (Neon, Supabase, Render) требуют TLS; локальный Docker — нет.
  const sslFlag = process.env.DATABASE_SSL?.trim().toLowerCase();
  const ssl =
    sslFlag === "true" || sslFlag === "require" || /sslmode=require/.test(url);

  return {
    url,
    maxConnections: Number(process.env.DATABASE_POOL_MAX || 5),
    statementTimeoutMs: Number(process.env.DATABASE_TIMEOUT_MS || 5_000),
    ssl,
  };
}

export function isDbEnabled(): boolean {
  return readDbConfig() !== null;
}

/* В dev при горячей перезагрузке модуль переисполняется; без глобального
   кэша каждый раз создавался бы новый пул и соединения бы утекали. */
const globalForPool = globalThis as unknown as { __bagytPool?: Pool };

function getPool(): Pool {
  const existing = globalForPool.__bagytPool;
  if (existing) return existing;

  const config = readDbConfig();
  if (!config) {
    throw new Error(
      "DATABASE_URL не задан: обращение к базе невозможно. " +
        "Вызывающий код обязан проверять isDbEnabled() и деградировать в статику.",
    );
  }

  const pool = new Pool({
    connectionString: config.url,
    max: config.maxConnections,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    statement_timeout: config.statementTimeoutMs,
    connectionTimeoutMillis: config.statementTimeoutMs,
  });

  // Сбой простаивающего соединения не должен ронять процесс Next.
  pool.on("error", (error) => {
    console.warn("[bagyt/db] соединение в пуле упало:", error.message);
  });

  globalForPool.__bagytPool = pool;
  return pool;
}

/** Обычный запрос. Бросает при ошибке — вызывающий решает, чем деградировать. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Ровно одна строка или undefined. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** Транзакция: нужна сиду и мерджу состояния, где важна атомарность. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Жива ли база прямо сейчас. Используется в /api/health, не бросает. */
export async function pingDb(): Promise<boolean> {
  if (!isDbEnabled()) return false;
  try {
    await query("select 1");
    return true;
  } catch {
    return false;
  }
}

/** Закрывает пул — нужно скриптам миграции и сида, чтобы процесс завершился. */
export async function closePool(): Promise<void> {
  const pool = globalForPool.__bagytPool;
  if (!pool) return;
  globalForPool.__bagytPool = undefined;
  await pool.end();
}
