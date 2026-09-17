"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  BandBadge,
  Card,
  ConfidenceTag,
  EmptyState,
  Label,
  SectionHeading,
} from "@/components/ui/Primitives";
import { RequireProfile } from "@/components/shell/RequireProfile";
import { getProgramsByIds } from "@/lib/data/programs";
import { scoreProgram } from "@/lib/domain/scoring";
import { COUNTRIES, LANGUAGES } from "@/lib/domain/taxonomy";
import { useJourney } from "@/lib/store/journey";
import { cn, formatUSD } from "@/lib/utils/cn";
import type { MatchResult } from "@/lib/domain/types";

/* ============================================================================
   ЭТАП 5 — СРАВНЕНИЕ

   Сравниваются параметры, которые пользователь сам отметил важными в анкете.
   Лучшее значение в строке подсвечивается — таблицу можно читать по диагонали,
   не вчитываясь в каждую ячейку.
   ========================================================================= */

export default function ComparePage() {
  return (
    <RequireProfile>
      <CompareView />
    </RequireProfile>
  );
}

type RowKind = "text" | "money-low" | "score-high";

interface Row {
  label: string;
  kind: RowKind;
  values: (match: MatchResult) => { display: string; raw?: number };
  note?: string;
}

const ROWS: Row[] = [
  {
    label: "Совпадение с профилем",
    kind: "score-high",
    values: (m) => ({ display: `${Math.round(m.score)} / 100`, raw: m.score }),
  },
  {
    label: "Город и страна",
    kind: "text",
    values: (m) => ({
      display: `${m.program.city}, ${COUNTRIES[m.program.country].label}`,
    }),
  },
  {
    label: "Язык обучения",
    kind: "text",
    values: (m) => ({
      display: m.program.instructionLanguage.map((l) => LANGUAGES[l]).join(", "),
    }),
  },
  {
    label: "Обучение в год",
    kind: "money-low",
    values: (m) => ({
      display: formatUSD(m.program.costs.tuitionUSDPerYear),
      raw: m.program.costs.tuitionUSDPerYear,
    }),
  },
  {
    label: "Проживание в год",
    kind: "money-low",
    values: (m) => ({
      display: formatUSD(m.program.costs.livingUSDPerYear),
      raw: m.program.costs.livingUSDPerYear,
    }),
  },
  {
    label: "Итого в год",
    kind: "money-low",
    values: (m) => {
      const total =
        m.program.costs.tuitionUSDPerYear + m.program.costs.livingUSDPerYear;
      return { display: formatUSD(total), raw: total };
    },
  },
  {
    label: "Стипендии",
    kind: "text",
    values: (m) => ({
      display: m.program.costs.fundingAvailable
        ? (m.program.costs.fundingNote ?? "Заявлены вузом")
        : "Не заявлены",
    }),
  },
  {
    label: "Требования",
    kind: "text",
    values: (m) => {
      const r = m.program.requirements;
      const parts = [
        r.ibPoints ? `IB ${r.ibPoints}` : null,
        r.satScore ? `SAT ${r.satScore}` : null,
        r.entScore ? `ЕНТ ${r.entScore}` : null,
        r.ielts ? `IELTS ${r.ielts}` : null,
      ].filter(Boolean);
      return { display: parts.length ? parts.join(" · ") : "Не опубликованы" };
    },
  },
  {
    label: "Окно подачи",
    kind: "text",
    values: (m) => ({ display: m.program.applicationDeadlineNote }),
  },
  {
    label: "Длительность",
    kind: "text",
    values: (m) => ({ display: `${m.program.durationYears} года` }),
  },
  {
    label: "Общежитие",
    kind: "text",
    values: (m) => ({
      display: m.program.dormGuaranteed ? "Гарантировано" : "Не гарантировано",
    }),
  },
  {
    label: "Кампус",
    kind: "text",
    values: (m) => ({
      display: m.program.campusSize === "big" ? "Большой" : "Компактный",
    }),
  },
];

function CompareView() {
  const router = useRouter();
  const profile = useJourney((s) => s.profile);
  const shortlist = useJourney((s) => s.shortlist);
  const toggleShortlist = useJourney((s) => s.toggleShortlist);
  const clearShortlist = useJourney((s) => s.clearShortlist);
  const setActiveProgram = useJourney((s) => s.setActiveProgram);
  const visitStep = useJourney((s) => s.visitStep);

  const matches = useMemo(() => {
    const programs = getProgramsByIds(shortlist);
    return programs.map((p) => scoreProgram(profile, p));
  }, [shortlist, profile]);

  useEffect(() => {
    if (matches.length >= 2) visitStep("compare");
  }, [matches.length, visitStep]);

  if (matches.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Пока нечего сравнивать"
          description="Вернитесь к рекомендациям и отметьте кнопкой «Сравнить» два-три варианта, которые вам интересны."
          action={<ButtonLink href="/matches">К рекомендациям</ButtonLink>}
        />
      </div>
    );
  }

  /** Индекс лучшего значения в строке — для подсветки. */
  function bestIndex(row: Row): number | null {
    if (row.kind === "text") return null;
    const raws = matches.map((m) => row.values(m).raw ?? NaN);
    if (raws.some((v) => Number.isNaN(v))) return null;
    const target =
      row.kind === "money-low" ? Math.min(...raws) : Math.max(...raws);
    // Если все значения равны, подсвечивать нечего.
    if (raws.every((v) => v === target)) return null;
    return raws.indexOf(target);
  }

  function openRoadmap(programId: string) {
    setActiveProgram(programId);
    router.push("/roadmap");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <SectionHeading
        label="Этап 5 · Сравнение"
        title="Чем эти варианты отличаются"
        description="Подсвечено лучшее значение в строке. Полный разбор по факторам остаётся на карточках рекомендаций."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/matches" variant="outline">
              Добавить вариант
            </ButtonLink>
            <Button variant="ghost" onClick={clearShortlist}>
              Очистить
            </Button>
          </div>
        }
      />

      {matches.length === 1 && (
        <Card className="mt-6 border-accent-border bg-accent-soft p-4">
          <p className="text-[13.5px] text-accent">
            Для сравнения нужен хотя бы второй вариант — добавьте его на экране
            рекомендаций.
          </p>
        </Card>
      )}

      {/* ——— Таблица ————————————————————————————————————————————— */}
      <div className="mt-8 overflow-x-auto pb-2">
        <table className="w-full min-w-[640px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[168px] bg-canvas p-0 text-left align-bottom">
                <span className="sr-only">Параметр</span>
              </th>
              {matches.map((match) => (
                <th
                  key={match.program.id}
                  className="p-0 pl-3 text-left align-bottom"
                  // Равные колонки: иначе последний столбец растягивается
                  // на всю оставшуюся ширину и таблица выглядит несимметрично.
                  style={{ width: `${Math.floor(78 / matches.length)}%` }}
                >
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <BandBadge band={match.band} />
                      <button
                        onClick={() => toggleShortlist(match.program.id)}
                        aria-label={`Убрать ${match.program.universityShort} из сравнения`}
                        className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-sunken hover:text-danger"
                      >
                        <svg viewBox="0 0 10 10" className="size-2.5 stroke-current" fill="none">
                          <path d="M1 1l8 8M9 1L1 9" strokeWidth={1.8} strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <p className="t-title mt-2.5 text-[15px] leading-tight">
                      {match.program.universityShort}
                    </p>
                    <p className="mt-1 text-[12.5px] font-normal leading-snug text-muted">
                      {match.program.program}
                    </p>
                  </Card>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {ROWS.map((row, rowIndex) => {
              const best = bestIndex(row);
              return (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 bg-canvas py-3 pr-3 text-left align-top",
                      rowIndex > 0 && "border-t border-line",
                    )}
                  >
                    <span className="t-label">{row.label}</span>
                  </th>
                  {matches.map((match, columnIndex) => {
                    const { display } = row.values(match);
                    const isBest = best === columnIndex;
                    return (
                      <td
                        key={match.program.id}
                        className={cn(
                          "py-3 pl-3 align-top",
                          rowIndex > 0 && "border-t border-line",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[13.5px] leading-snug",
                            isBest
                              ? "font-bold text-safe"
                              : "font-medium text-ink",
                          )}
                        >
                          {display}
                          {isBest && (
                            <svg
                              viewBox="0 0 10 8"
                              className="size-2.5 shrink-0 fill-none stroke-current"
                              aria-label="лучшее значение"
                            >
                              <path
                                d="M1 4l2.5 2.5L9 1"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Источники */}
            <tr>
              <th scope="row" className="sticky left-0 z-10 border-t border-line bg-canvas py-3 pr-3 text-left align-top">
                <span className="t-label">Источник</span>
              </th>
              {matches.map((match) => (
                <td key={match.program.id} className="border-t border-line py-3 pl-3 align-top">
                  <ConfidenceTag
                    confidence={match.program.dataConfidence}
                    source={match.program.source}
                  />
                </td>
              ))}
            </tr>

            {/* Действие */}
            <tr>
              <th scope="row" className="sticky left-0 z-10 border-t border-line bg-canvas py-4 pr-3 text-left align-top">
                <span className="t-label">Действие</span>
              </th>
              {matches.map((match) => (
                <td key={match.program.id} className="border-t border-line py-4 pl-3 align-top">
                  <Button size="sm" onClick={() => openRoadmap(match.program.id)}>
                    Построить маршрут
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ——— Что важно именно вам ————————————————————————————— */}
      <Card className="mt-8 bg-sunken/60 p-5">
        <Label className="mb-2">Как читать эту таблицу</Label>
        <p className="t-body text-[13.5px] text-muted">
          {profile.budget.needsFunding
            ? "Вы отметили, что стипендия критична, поэтому в первую очередь смотрите строку «Стипендии» и «Итого в год»: вариант без заявленного финансирования потребует запасного плана."
            : "Вы не привязаны к стипендии, поэтому решающими обычно становятся строки «Требования» и «Окно подачи» — именно они определяют, успеваете ли вы подготовиться."}{" "}
          Суммы и требования — ориентир из каталога; перед подачей сверьте их по
          ссылке на официальную страницу.
        </p>
      </Card>
    </div>
  );
}
