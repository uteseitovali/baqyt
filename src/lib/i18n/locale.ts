/* ============================================================================
   ЛОКАЛИ ИНТЕРФЕЙСА

   Это НЕ то же самое, что LanguageId в domain/types.ts. LanguageId — язык
   ОБУЧЕНИЯ программы («kk», «ru», «en», «tr»): данные каталога. Locale — язык,
   на котором интерфейс говорит с человеком. Значения пересекаются, смыслы нет:
   человек с русским интерфейсом смотрит программы на английском.

   Добавить локаль = дописать её сюда. Компилятор тут же укажет на каждую
   таблицу переводов, где для неё нет ключа (см. Translations в translations.ts).
   ========================================================================= */

export const LOCALES = ["ru", "kk", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Язык-первоисточник: только здесь таблица обязана быть полной. Остальные
 * локали могут быть заполнены частично — недостающее берётся отсюда.
 */
export const SOURCE_LOCALE = "ru" satisfies Locale;

/** Что показываем, пока человек не выбрал язык. Может отличаться от источника. */
export const DEFAULT_LOCALE: Locale = SOURCE_LOCALE;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
