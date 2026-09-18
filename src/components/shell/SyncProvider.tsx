"use client";

import { useEffect, useRef } from "react";
import { useJourney } from "@/lib/store/journey";
import { useSession } from "@/lib/store/session";
import {
  adoptRemoteJourney,
  fetchMe,
  flushJourneyPush,
  scheduleJourneyPush,
} from "@/lib/sync/client";

/* ============================================================================
   ПОДКЛЮЧЕНИЕ СИНХРОНИЗАЦИИ

   Ключевое свойство: при authEnabled = false этот компонент не делает НИ
   ОДНОГО запроса. Гостевой сценарий без переменных окружения остаётся ровно
   таким, каким был до появления бэкенда, — без сети и без ожидания.
   ========================================================================= */

export function SyncProvider({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: React.ReactNode;
}) {
  const setAuthEnabled = useSession((s) => s.setAuthEnabled);
  const setUser = useSession((s) => s.setUser);
  const status = useSession((s) => s.status);
  const askedRef = useRef(false);

  useEffect(() => {
    setAuthEnabled(authEnabled);
    if (!authEnabled || askedRef.current) return;
    askedRef.current = true;

    void (async () => {
      const me = await fetchMe();
      if (!me?.user) {
        setUser(null);
        return;
      }
      setUser(me.user);
      // Сессия уже была (вернулись на сайт) — сливаем то, что успели
      // наделать гостем на этом устройстве, с тем, что лежит на сервере.
      await adoptRemoteJourney(me.journey);
    })();
  }, [authEnabled, setAuthEnabled, setUser]);

  /* Подписка на стор, а не на рендер: сохранять нужно любое изменение пути,
     включая те, что произошли на страницах без этого компонента в дереве. */
  useEffect(() => {
    if (status !== "signed-in") return;

    let previous = useJourney.getState().updatedAt;
    const unsubscribe = useJourney.subscribe((state) => {
      if (state.updatedAt === previous) return;
      previous = state.updatedAt;
      scheduleJourneyPush();
    });

    const onHide = () => {
      if (document.visibilityState === "hidden") flushJourneyPush();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      flushJourneyPush();
    };
  }, [status]);

  return <>{children}</>;
}
