"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/Primitives";
import { SharedSummary } from "./SharedSummary";
import { getCatalog } from "@/lib/data/programs";
import { decodeInline, INLINE_PARAM } from "@/lib/share/inline";
import { resolveShareable, type ResolvedShareProgram } from "@/lib/share/summary";

type State =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "ready"; items: ResolvedShareProgram[]; dropped: number };

/**
 * Читает сводку из ?d= и показывает её. Ни одного сетевого запроса: каталог уже
 * на клиенте (CatalogProvider), а декодирование локальное.
 *
 * Стор пути не читается и не пишется — человек по ссылке чужой путь не меняет.
 */
export function InlineShared() {
  const raw = useSearchParams().get(INLINE_PARAM);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // decodeInline не бросает, но экран не должен зависеть от этого обещания:
      // любой сбой — «ссылку не удалось прочитать», а не вечный скелетон.
      const summary = raw ? await decodeInline(raw).catch(() => null) : null;
      if (cancelled) return;

      if (!summary) {
        setState({ status: "invalid" });
        return;
      }

      const { items, dropped } = resolveShareable(summary, getCatalog());
      setState(items.length > 0 ? { status: "ready", items, dropped } : { status: "invalid" });
    })();

    return () => {
      cancelled = true;
    };
  }, [raw]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-12 sm:px-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          title="Ссылку не удалось прочитать"
          description="Скорее всего, она скопирована не целиком — мессенджеры иногда обрезают длинные адреса. Попросите отправителя прислать её ещё раз."
          action={
            <ButtonLink href="/" variant="outline">
              На главную
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return <SharedSummary items={state.items} dropped={state.dropped} source={{ kind: "link" }} />;
}
