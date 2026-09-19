import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedSummary } from "@/components/share/SharedSummary";
import { ErrorState } from "@/components/ui/Primitives";
import { loadCatalog } from "@/lib/data/catalog.server";
import { isDbEnabled } from "@/lib/db/client";
import { describeDbError } from "@/lib/db/errors";
import { findShare } from "@/lib/db/shares.repo";
import { resolveShareable } from "@/lib/share/summary";
import { hashSlug, isWellFormedSlug } from "@/lib/share/slug";

/* ============================================================================
   /shared/[slug] — сохранённая сводка, только для чтения.

   Без входа и без записи: страница не трогает journey, не отмечает шаги и не
   создаёт сессию. Слаг в адресе — это и есть право на чтение, поэтому:
     • страницу не индексируют;
     • Referrer не отправляется — иначе слаг утёк бы на сайт любого вуза,
       по ссылке на который перешли отсюда.
   ========================================================================= */

export const metadata: Metadata = {
  title: "Подборка от абитуриента — Bagyt",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Без базы ссылок этого вида нет вообще — и это не сбой, а конфигурация.
  // Мусор в адресе не доходит до запроса.
  if (!isDbEnabled() || !isWellFormedSlug(slug)) notFound();

  let share;
  try {
    share = await findShare(hashSlug(slug));
  } catch (error) {
    console.warn("[bagyt/share] ссылку прочитать не удалось:", describeDbError(error));
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <ErrorState
          title="Сводку сейчас не удаётся загрузить"
          description="Это временный сбой на нашей стороне, ссылка не потеряна. Откройте её ещё раз через минуту."
        />
      </div>
    );
  }

  // «Нет такой», «истекла» и «повреждена» — один и тот же ответ.
  if (!share) notFound();

  const catalog = await loadCatalog();
  const { items, dropped } = resolveShareable(share.summary, catalog.programs);
  if (items.length === 0) notFound();

  return (
    <SharedSummary
      items={items}
      dropped={dropped}
      source={{ kind: "stored", expiresAt: share.expiresAt.toISOString() }}
    />
  );
}
