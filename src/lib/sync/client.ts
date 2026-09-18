"use client";

import { mergeJourneys, type JourneySnapshot } from "./merge";
import { useJourney } from "@/lib/store/journey";
import { useSession } from "@/lib/store/session";

/* ============================================================================
   КЛИЕНТСКАЯ СИНХРОНИЗАЦИЯ

   Три операции и ничего больше: узнать, кто вошёл; слить состояния при
   входе; сохранять изменения с задержкой.

   Слияние выполняется здесь, а не на сервере, по одной причине: гостевой
   прогресс лежит в браузере, и отправлять его на сервер до того, как
   человек согласился войти, неправильно. К моменту слияния обе версии уже
   на руках у клиента, а mergeJourneys — чистая функция с тестами.
   ========================================================================= */

export interface MeResponse {
  authEnabled: boolean;
  user: { id: string; email: string } | null;
  journey: JourneySnapshot | null;
}

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as MeResponse;
  } catch {
    // Сети нет — остаёмся гостем с локальным прогрессом.
    return null;
  }
}

/** Отправляет состояние на сервер. Возвращает false, если не вышло. */
export async function pushJourney(snapshot: JourneySnapshot): Promise<boolean> {
  try {
    const response = await fetch("/api/journey", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journey: snapshot }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Приводит локальное и серверное состояние к общему виду и сохраняет
 * результат на обеих сторонах.
 *
 * Если на сервере ещё ничего нет — локальное состояние просто уезжает туда
 * целиком: первый вход не должен выглядеть как потеря анкеты.
 */
export async function adoptRemoteJourney(remote: JourneySnapshot | null): Promise<void> {
  const journey = useJourney.getState();
  const session = useSession.getState();
  const local = journey.snapshot();

  if (!remote) {
    session.setSync("syncing");
    const ok = await pushJourney(local);
    session.setSync(ok ? "saved" : "error");
    return;
  }

  const { merged, summary } = mergeJourneys(local, remote);
  journey.applySnapshot(merged);
  session.setLastMerge(summary);

  session.setSync("syncing");
  const ok = await pushJourney(merged);
  session.setSync(ok ? "saved" : "error");
}

/* Пауза перед отправкой: ползунок «Живой настройки» меняет профиль десятки
   раз подряд, и каждый сдвиг не должен превращаться в запрос. */
const DEBOUNCE_MS = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;

/** Откладывает сохранение; повторные вызовы сдвигают таймер. */
export function scheduleJourneyPush(): void {
  const session = useSession.getState();
  if (session.status !== "signed-in") return;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const snapshot = useJourney.getState().snapshot();
    useSession.getState().setSync("syncing");
    void pushJourney(snapshot).then((ok) => {
      useSession.getState().setSync(ok ? "saved" : "error");
    });
  }, DEBOUNCE_MS);
}

/** Немедленная отправка — например, при закрытии вкладки. */
export function flushJourneyPush(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  if (useSession.getState().status !== "signed-in") return;
  void pushJourney(useJourney.getState().snapshot());
}
