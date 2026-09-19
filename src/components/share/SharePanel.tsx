"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, Label } from "@/components/ui/Primitives";
import { useSession } from "@/lib/store/session";
import { encodeInline, INLINE_PARAM } from "@/lib/share/inline";
import { buildShareable } from "@/lib/share/summary";
import type { MatchResult } from "@/lib/domain/types";

/* ============================================================================
   «ПОКАЗАТЬ СЕМЬЕ»

   Тот же принцип деградации, что у каталога и входа:
     • есть база — сводка уходит на сервер, в ответ короткая ссылка на 30 дней;
     • базы нет — сетевого запроса нет вовсе: сводка сжимается в сам адрес;
     • база есть, но не ответила — тоже адрес со сводкой, и мы честно пишем,
       что ссылка получилась без хранения.

   Компонент только читает список совпадений. Стор пути он не меняет.
   ========================================================================= */

/** Почему хранение не сработало: лимит частоты или сбой — тексты разные. */
type Degraded = false | "error" | "limit";

type Result =
  | { mode: "stored"; url: string; expiresAt: string }
  | { mode: "inline"; url: string; degraded: Degraded };

const STORED_PATH = /^\/shared\/[A-Za-z0-9_-]{22}$/;

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function SharePanel({ matches }: { matches: MatchResult[] }) {
  // «Аккаунты есть» и «база есть» — одно и то же условие (DATABASE_URL), как
  // и в остальном приложении: SyncProvider получает его с сервера.
  const storageAvailable = useSession((s) => s.authEnabled);

  const summary = useMemo(() => buildShareable(matches), [matches]);
  const summaryKey = useMemo(() => JSON.stringify(summary), [summary]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Подборка, к которой относится текущее состояние. Ответ на запрос,
  // отправленный для прежней подборки, сюда попасть не должен.
  const currentKey = useRef(summaryKey);

  // Подборка изменилась (правка анкеты, фильтр) — старая ссылка уже про другое.
  useEffect(() => {
    currentKey.current = summaryKey;
    setResult(null);
    setFailed(false);
    setCopied(false);
    setBusy(false);
  }, [summaryKey]);

  if (summary.programs.length === 0) return null;

  async function createLink() {
    const requestedFor = summaryKey;
    const stale = () => currentKey.current !== requestedFor;

    setBusy(true);
    setFailed(false);
    setCopied(false);

    try {
      let degraded: Degraded = false;

      if (storageAvailable) {
        const stored = await tryStore(summary);
        if (stale()) return;
        if (stored.kind === "stored") {
          setResult(stored.result);
          return;
        }
        degraded = stored.kind === "limit" ? "limit" : "error";
      }

      const encoded = await encodeInline(summary);
      if (stale()) return;
      setResult({
        mode: "inline",
        url: `${window.location.origin}/shared?${INLINE_PARAM}=${encoded}`,
        degraded,
      });
    } catch {
      if (!stale()) setFailed(true);
    } finally {
      if (!stale()) setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      /* буфер недоступен — поле выделяется по фокусу, скопируют руками */
    }
  }

  return (
    <Card className="bg-sunken/60 p-5">
      <Label className="mb-2">Показать семье</Label>
      <p className="t-body text-[13.5px] text-muted">
        Короткая сводка для родителей: три лучшие программы, оценка, полоса
        поступления и причины. Анкета — баллы, бюджет, заметки — в ссылку не
        попадает.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={createLink} disabled={busy}>
          {busy ? "Создаём ссылку…" : result ? "Создать заново" : "Создать ссылку"}
        </Button>
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          Не получилось создать ссылку. Попробуйте ещё раз.
        </p>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={result.url}
              aria-label="Ссылка для семьи"
              onFocus={(event) => event.currentTarget.select()}
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-[12.5px] text-ink"
            />
            <Button size="sm" onClick={copy}>
              {copied ? "Скопировано ✓" : "Скопировать"}
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] text-muted" aria-live="polite">
            {noteFor(result)}
          </p>
        </div>
      )}
    </Card>
  );
}

/** Честное описание того, чем эта ссылка является на самом деле. */
function noteFor(result: Result): string {
  if (result.mode === "stored") {
    return `Сводка хранится на сервере без анкеты. Ссылка действует до ${DATE_FORMAT.format(new Date(result.expiresAt))}.`;
  }
  const why =
    result.degraded === "limit"
      ? "За последний час создано слишком много ссылок, поэтому эта получилась без хранения. "
      : result.degraded === "error"
        ? "Сервер сейчас не сохранил сводку, поэтому ссылка получилась без хранения. "
        : "";
  return (
    why +
    "Сводка зашита в саму ссылку: на сервере ничего не хранится и срока действия нет. Кто получил ссылку, тот видит эти программы."
  );
}

type StoreOutcome =
  | { kind: "stored"; result: Extract<Result, { mode: "stored" }> }
  | { kind: "limit" }
  | { kind: "error" };

/**
 * Пробует сохранить сводку на сервере. Любой неуспех — сеть, 503, неожиданный
 * ответ — это «error»: вызывающий уходит на ссылку без хранения. Лимит частоты
 * (429) выделен отдельно, чтобы не выдавать его за сбой сервера.
 */
async function tryStore(summary: ReturnType<typeof buildShareable>): Promise<StoreOutcome> {
  try {
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    });
    if (response.status === 429) return { kind: "limit" };
    if (!response.ok) return { kind: "error" };

    const data = (await response.json()) as { path?: unknown; expiresAt?: unknown };
    if (
      typeof data.path !== "string" ||
      !STORED_PATH.test(data.path) ||
      typeof data.expiresAt !== "string"
    ) {
      return { kind: "error" };
    }
    return {
      kind: "stored",
      result: {
        mode: "stored",
        url: `${window.location.origin}${data.path}`,
        expiresAt: data.expiresAt,
      },
    };
  } catch {
    return { kind: "error" };
  }
}
