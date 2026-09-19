import { SOURCE_LOCALE, type Locale } from "./locale";

/* ============================================================================
   ТАБЛИЦЫ ПЕРЕВОДОВ

   Один паттерн на всё приложение: значение типа T существует на нескольких
   языках, и это записывается как Translations<T>.

     • язык-источник (ru) — ПОЛНЫЙ: тип T целиком, ни одного пропуска;
     • остальные языки — ЧАСТИЧНЫЕ: любое подмножество ключей T;
     • недостающий ключ не превращается в пустое место или в «key.name» на
       экране — он берётся из русского. Перевод можно вливать по кусочку, и
       продукт всё это время остаётся целым.

   Ключи остальных локалей ОБЯЗАТЕЛЬНЫ (пусть и пустым объектом): добавили
   локаль в LOCALES — компилятор перечислит все таблицы, где её забыли.

   Чем это не библиотека. Нам нужно ровно три вещи — типизированный словарь,
   откат на русский и проверка полноты. Внешний i18n-пакет добавил бы рантайм,
   формат каталогов и правила маршрутизации, из которых сегодня не нужно
   ничего: язык ещё один. Когда понадобятся плюральные формы и интерполяция,
   решение можно пересмотреть — таблицы Translations<T> переезжают в любой
   формат механически.
   ========================================================================= */

/**
 * Рекурсивно необязательная форма T. Массивы АТОМАРНЫ: локаль либо даёт весь
 * список, либо не даёт ничего. Частично переведённый массив разъехался бы по
 * длине и порядку с оригиналом, а найти это можно было бы только глазами.
 */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

type Source = typeof SOURCE_LOCALE;

export type Translations<T> = Record<Source, T> &
  Record<Exclude<Locale, Source>, DeepPartial<T>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Накладывает перевод на оригинал. Обход идёт по ключам ОРИГИНАЛА: порядок
 * ключей у всех локалей одинаков (по нему строятся списки в интерфейсе), а
 * опечатка в ключе перевода не создаёт «лишнего» поля, а просто не находит
 * пары — её ловит тест на осиротевшие ключи.
 */
function overlay(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(base)) out[key] = overlay(base[key], override[key]);
    return out;
  }
  return override;
}

const cache = new WeakMap<object, Partial<Record<Locale, unknown>>>();

/**
 * Значение таблицы для локали. Для языка-источника возвращает сам оригинал
 * (тот же объект, без копии), для остальных — оригинал с наложенным
 * переводом; результат кэшируется на пару «таблица, локаль».
 */
export function resolve<T>(translations: Translations<T>, locale: Locale): T {
  if (locale === SOURCE_LOCALE) return translations[SOURCE_LOCALE];

  const perLocale = cache.get(translations) ?? {};
  if (!(locale in perLocale)) {
    perLocale[locale] = overlay(translations[SOURCE_LOCALE], translations[locale]);
    cache.set(translations, perLocale);
  }
  return perLocale[locale] as T;
}
