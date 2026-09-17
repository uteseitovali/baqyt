"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Primitives";
import { useJourney } from "@/lib/store/journey";

/**
 * Защищает шаги после анкеты. Ждёт гидратации persist-хранилища, чтобы не
 * показать «анкета не заполнена» пользователю, у которого она на самом деле есть.
 */
export function RequireProfile({ children }: { children: React.ReactNode }) {
  const profileCompleted = useJourney((s) => s.profileCompleted);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // zustand/persist восстанавливает состояние после первого рендера.
    const unsub = useJourney.persist.onFinishHydration(() => setHydrated(true));
    if (useJourney.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[var(--page-max)] px-4 py-16 sm:px-6">
        <div className="skeleton h-6 w-48 rounded-full" />
        <div className="skeleton mt-4 h-40 w-full rounded-[var(--r-md)]" />
      </div>
    );
  }

  if (!profileCompleted) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Сначала заполните анкету"
          description="Разбор, рекомендации и маршрут строятся на ваших ответах. Это занимает около пяти минут."
          action={<ButtonLink href="/profile">Перейти к анкете</ButtonLink>}
        />
      </div>
    );
  }

  return <>{children}</>;
}
