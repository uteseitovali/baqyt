/* ============================================================================
   СИД КАТАЛОГА

   Переносит кураторский срез из src/lib/data/programs.ts в базу.

   Массив НЕ удаляется из репозитория после переноса — он остаётся
   fallback'ом: без DATABASE_URL приложение обязано работать полностью
   (README §5), значит статический каталог должен существовать всегда.
   База — витрина, которую можно обновлять без релиза; файл — гарантия,
   что демо не зависит от инфраструктуры.

   Скрипт идемпотентный: гоняйте сколько угодно раз.
   Запуск:  npm run db:seed
   ========================================================================= */

import { closePool, isDbEnabled, withTransaction } from "../src/lib/db/client";
import { describeDbError } from "../src/lib/db/errors";
import { upsertProgram } from "../src/lib/db/programs.repo";
import { parseProgram } from "../src/lib/data/schema";
import { PROGRAMS } from "../src/lib/data/programs";

async function main(): Promise<void> {
  if (!isDbEnabled()) {
    console.error(
      "DATABASE_URL не задан — сид пропущен.\n" +
        "Приложение при этом работает: каталог отдаётся из статического среза.",
    );
    process.exitCode = 1;
    return;
  }

  // Сид — последний момент, когда запись можно остановить до базы.
  const invalid = PROGRAMS.filter((p) => parseProgram(p) === null);
  if (invalid.length > 0) {
    console.error(
      `Каталог не прошёл валидацию: ${invalid.length} запис(ей). Сид отменён.`,
    );
    process.exitCode = 1;
    return;
  }

  await withTransaction(async (client) => {
    for (const program of PROGRAMS) {
      await upsertProgram(program, client);
    }
  });

  const countries = new Set(PROGRAMS.map((p) => p.country)).size;
  console.log(
    `✓ Записано программ: ${PROGRAMS.length} (стран: ${countries}).\n` +
      "  Проверить: GET /api/programs или GET /api/health → catalog.source === \"db\".",
  );
}

main()
  .catch((error: unknown) => {
    console.error("Сид не прошёл:", describeDbError(error));
    process.exitCode = 1;
  })
  .finally(() => closePool());
