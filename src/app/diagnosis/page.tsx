"use client";

import { useCallback, useEffect, useState } from "react";
import { ButtonLink, Button } from "@/components/ui/Button";
import {
  Card,
  Chip,
  ErrorState,
  Label,
  SectionHeading,
  Skeleton,
} from "@/components/ui/Primitives";
import { RequireProfile } from "@/components/shell/RequireProfile";
import { useJourney } from "@/lib/store/journey";
import type { Diagnosis } from "@/lib/domain/types";

/* ============================================================================
   ЭТАП 3 — ДИАГНОСТИКА
   Резюме профиля до того, как показывать университеты: пользователь должен
   узнать себя в тексте, иначе рекомендациям он не поверит.
   ========================================================================= */

export default function DiagnosisPage() {
  return (
    <RequireProfile>
      <DiagnosisView />
    </RequireProfile>
  );
}

function DiagnosisView() {
  const profile = useJourney((s) => s.profile);
  const visitStep = useJourney((s) => s.visitStep);

  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `Сервер ответил ${response.status}`);
      }
      const payload = (await response.json()) as { diagnosis: Diagnosis };
      setDiagnosis(payload.diagnosis);
      visitStep("diagnosis");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось получить разбор");
    } finally {
      setLoading(false);
    }
  }, [profile, visitStep]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <SectionHeading
        label="Этап 3 · Диагностика"
        title="Вот как мы поняли ваш профиль"
        description="Проверьте, узнаёте ли вы себя. Если что-то не так — вернитесь в анкету, весь дальнейший подбор строится на этом."
      />

      <div className="mt-8 space-y-4">
        {loading && <DiagnosisSkeleton />}

        {error && !loading && (
          <ErrorState
            description={`${error}. Разбор считается на сервере — попробуйте ещё раз.`}
            onRetry={() => void load()}
          />
        )}

        {diagnosis && !loading && (
          <>
            {/* Главный блок */}
            <Card className="relative overflow-hidden p-6 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-accent" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="accent">Ваш профиль</Chip>
                <Chip tone="neutral">
                  {diagnosis.generatedBy === "llm"
                    ? "текст сформулирован AI"
                    : "текст собран правилами"}
                </Chip>
              </div>

              <h2 className="t-title mt-5 text-[22px] sm:text-[27px]">
                {diagnosis.headline}
              </h2>
              <p className="t-body mt-4 text-[15px] text-muted sm:text-[15.5px]">
                {diagnosis.summary}
              </p>

              <div className="mt-6 rounded-[var(--r-sm)] border border-line bg-sunken/70 p-4">
                <Label className="mb-2">Образовательная цель</Label>
                <p className="t-body text-[14px]">{diagnosis.goal}</p>
              </div>
            </Card>

            {/* Сильные стороны и пробелы */}
            <div className="grid gap-4 md:grid-cols-2">
              <InsightColumn
                label="Что работает на вас"
                tone="safe"
                items={diagnosis.strengths}
                empty="Пока нечего выделить — заполните больше полей анкеты."
              />
              <InsightColumn
                label="Над чем стоит поработать"
                tone="reach"
                items={diagnosis.gaps}
                empty="Явных пробелов не нашли."
              />
            </div>

            {/* Переход дальше */}
            <Card className="flex flex-col gap-4 bg-sunken/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="t-title text-[16px]">Следующий шаг</p>
                <p className="t-body mt-1 text-[13.5px] text-muted">
                  Подберём программы под эти вводные и объясним каждое совпадение.
                </p>
              </div>
              <div className="flex gap-2">
                <ButtonLink href="/profile" variant="outline">
                  Исправить анкету
                </ButtonLink>
                <ButtonLink href="/matches">Показать программы</ButtonLink>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function InsightColumn({
  label,
  tone,
  items,
  empty,
}: {
  label: string;
  tone: "safe" | "reach";
  items: { title: string; detail: string }[];
  empty: string;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{
            backgroundColor: tone === "safe" ? "var(--band-safe)" : "var(--band-reach)",
          }}
          aria-hidden
        />
        <Label>{label}</Label>
      </div>

      {items.length === 0 ? (
        <p className="t-body mt-4 text-[13.5px] text-faint">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((item) => (
            <li key={item.title} className="border-l-2 border-line pl-3.5">
              <p className="text-[14.5px] font-semibold leading-snug">{item.title}</p>
              <p className="t-body mt-1 text-[13.5px] text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DiagnosisSkeleton() {
  return (
    <>
      <Card className="space-y-4 p-6 sm:p-8">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-20 w-full" />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-4 p-6">
            <Skeleton className="h-3 w-28 rounded-full" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}
