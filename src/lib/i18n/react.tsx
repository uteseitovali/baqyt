"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { resolve, type Translations } from "./translations";

/* ============================================================================
   ЛОКАЛЬ В КЛИЕНТСКИХ КОМПОНЕНТАХ

   Провайдера в корневом layout пока нет — и это сознательно: откуда берётся
   язык (cookie, localStorage, сегмент адреса) — отдельное решение, оно
   меняет способ пререндера и вид ссылок (см. README рядом). Без провайдера
   контекст отдаёт DEFAULT_LOCALE, то есть поведение приложения не меняется.

   Серверным компонентам хуки недоступны: им — resolve(таблица, locale) напрямую.
   ========================================================================= */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Текст экрана для текущей локали. resolve кэширует — useMemo не нужен. */
export function useTranslations<T>(translations: Translations<T>): T {
  return resolve(translations, useLocale());
}
