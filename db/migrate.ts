/* ============================================================================
   ПРОГОН МИГРАЦИЙ

   Намеренно минималистичный раннер вместо ORM с собственным форматом:
   миграции — обычный SQL, который можно прочитать глазами и выполнить руками
   через psql, если что-то пойдёт не так на демо.

   Запуск:  npm run db:migrate
   ========================================================================= */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, isDbEnabled, query, withTransaction } from "../src/lib/db/client";
import { describeDbError } from "../src/lib/db/errors";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

async function ensureRegistry(): Promise<void> {
  await query(`
    create table if not exists _migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const rows = await query<{ name: string }>("select name from _migrations");
  return new Set(rows.map((r) => r.name));
}

async function main(): Promise<void> {
  if (!isDbEnabled()) {
    console.error(
      "DATABASE_URL не задан.\n" +
        "Скопируйте .env.example в .env.local и укажите строку подключения,\n" +
        "либо поднимите локальный Postgres — команда есть в README §5.",
    );
    process.exitCode = 1;
    return;
  }

  await ensureRegistry();
  const applied = await appliedMigrations();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} — уже применена`);
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");

    // Миграция и отметка о ней — в одной транзакции: не бывает состояния
    // «схема изменилась, но в реестре этого нет».
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("insert into _migrations (name) values ($1)", [file]);
    });

    console.log(`✓ ${file} — применена`);
    ran += 1;
  }

  console.log(
    ran === 0 ? "\nВсё уже применено, схема актуальна." : `\nГотово: ${ran} миграц(ий).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Миграция не прошла:", describeDbError(error));
    process.exitCode = 1;
  })
  .finally(() => closePool());
