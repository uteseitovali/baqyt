import { connection } from "next/server";
import { isDbEnabled } from "@/lib/db/client";
import { describeDbError } from "@/lib/db/errors";
import { listPrograms } from "@/lib/db/programs.repo";
import { PROGRAMS, setCatalog, type CatalogSource } from "./programs";
import type { Program } from "@/lib/domain/types";

/* ============================================================================
   ЗАГРУЗЧИК КАТАЛОГА (только сервер)

   Единственное место, которое решает, откуда взялись программы. Правило одно
   и оно жёсткое: ЛЮБОЙ сбой базы — это статический срез, а не пустой экран.
   Нет DATABASE_URL, база не отвечает, запрос вышел за таймаут, строка не
   прошла Zod — пользователь всё равно получает полный каталог и проходит
   сценарий до конца. Ровно так же ведёт себя AI-слой: сбой усилителя не
   отменяет продукт.

   Что именно случилось, видно в GET /api/health → catalog.source и
   catalog.degradedReason. Приложение не делает вид, что данные живые, когда
   они статические.
   ========================================================================= */

export interface CatalogSnapshot {
  programs: Program[];
  source: CatalogSource;
  loadedAt: number;
  /** Заполнено, только если хотели базу, но пришлось откатиться в статику. */
  degradedReason?: string;
}

/** Каталог меняется редко; на каждый рендер в базу ходить незачем. */
const TTL_MS = Number(process.env.CATALOG_TTL_MS || 60_000);

const globalForCatalog = globalThis as unknown as {
  __bagytCatalog?: CatalogSnapshot;
};

function staticSnapshot(degradedReason?: string): CatalogSnapshot {
  return {
    programs: PROGRAMS,
    source: "static",
    loadedAt: Date.now(),
    degradedReason,
  };
}

function isFresh(snapshot: CatalogSnapshot | undefined): snapshot is CatalogSnapshot {
  return Boolean(snapshot) && Date.now() - snapshot!.loadedAt < TTL_MS;
}

/**
 * Каталог для серверного кода: роуты API, серверные компоненты.
 * Попутно обновляет синхронный снапшот в @/lib/data/programs, чтобы
 * getProgramById и CATALOG_META на сервере отвечали теми же данными.
 */
export async function loadCatalog(options: { force?: boolean } = {}): Promise<CatalogSnapshot> {
  if (!options.force && isFresh(globalForCatalog.__bagytCatalog)) {
    const cached = globalForCatalog.__bagytCatalog!;
    setCatalog(cached.programs, cached.source);
    return cached;
  }

  if (!isDbEnabled()) {
    const snapshot = staticSnapshot();
    globalForCatalog.__bagytCatalog = snapshot;
    return snapshot;
  }

  try {
    const programs = await listPrograms();

    if (programs.length === 0) {
      // База есть, но пустая — сид ещё не прогнали. Пустая витрина сломала бы
      // весь путь, поэтому показываем статику и честно говорим почему.
      const snapshot = staticSnapshot("база подключена, но каталог пуст — нужен npm run db:seed");
      globalForCatalog.__bagytCatalog = snapshot;
      return snapshot;
    }

    const snapshot: CatalogSnapshot = {
      programs,
      source: "db",
      loadedAt: Date.now(),
    };
    globalForCatalog.__bagytCatalog = snapshot;
    setCatalog(programs, "db");
    return snapshot;
  } catch (error) {
    const message = describeDbError(error);
    console.warn(`[bagyt/catalog] база недоступна, работаем на статике: ${message}`);
    const snapshot = staticSnapshot(message);
    globalForCatalog.__bagytCatalog = snapshot;
    return snapshot;
  }
}

/**
 * То же самое, но для рендера страниц.
 *
 * Без базы ничего не откладывается: layout остаётся пререндеримым, и демо
 * без единой переменной окружения отдаётся статикой, как сейчас. Как только
 * DATABASE_URL появился, connection() выводит рендер из пререндера — иначе
 * каталог зафиксировался бы на этапе сборки и правки в базе не доезжали бы
 * до пользователя до следующего деплоя.
 */
export async function loadCatalogForRender(): Promise<CatalogSnapshot> {
  if (!isDbEnabled()) return staticSnapshot();
  await connection();
  return loadCatalog();
}

/** Сбрасывает кэш — после записи через CRUD, чтобы правка была видна сразу. */
export function invalidateCatalogCache(): void {
  globalForCatalog.__bagytCatalog = undefined;
}
