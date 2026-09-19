import type { Metadata } from "next";
import { Suspense } from "react";
import { InlineShared } from "@/components/share/InlineShared";
import { Skeleton } from "@/components/ui/Primitives";

/* ============================================================================
   /shared — сводка, зашитая в адрес (?d=...).

   Работает без базы и без сети: страница только декодирует параметр. Это тот
   же путь деградации, что у каталога и входа: нет DATABASE_URL — нет запроса,
   демо остаётся полностью рабочим. Он же служит запасным, если база включена,
   но в момент создания ссылки не ответила.

   Сама страница серверная ради metadata; всё, что читает адрес, — в клиентском
   InlineShared за Suspense (так требует useSearchParams при пререндере).
   ========================================================================= */

export const metadata: Metadata = {
  title: "Подборка от абитуриента — Bagyt",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function InlineSharedPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-12 sm:px-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <InlineShared />
    </Suspense>
  );
}
