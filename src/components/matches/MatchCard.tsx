"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import {
  BandBadge,
  Card,
  Chip,
  ConfidenceTag,
  FactorBar,
  Label,
  ScoreRing,
} from "@/components/ui/Primitives";
import { BANDS, COUNTRIES, FACTOR_META } from "@/lib/domain/taxonomy";
import { cn, formatUSD } from "@/lib/utils/cn";
import { DUR, EASE } from "@/lib/motion/choreography";
import type { AdmissionBand, MatchResult } from "@/lib/domain/types";

/* ============================================================================
   Карточка рекомендации.

   Главная идея: «почему подходит» — не украшение, а основное содержание.
   Разбор по семи факторам раскрывается прямо в карточке, и при изменении
   анкеты полоски видимо меняются — это то, что проверяет жюри.
   ========================================================================= */

export function MatchCard({
  match,
  rank,
  explanation,
  inShortlist,
  onToggleShortlist,
  onBuildRoadmap,
  highlight,
}: {
  match: MatchResult;
  rank: number;
  explanation?: string;
  inShortlist: boolean;
  onToggleShortlist: () => void;
  onBuildRoadmap: () => void;
  highlight?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { program } = match;
  const totalCost =
    program.costs.tuitionUSDPerYear + program.costs.livingUSDPerYear;

  return (
    <motion.div layout="position" transition={{ duration: DUR.slow, ease: EASE.out }}>
      <Card
        interactive
        className={cn(
          "group overflow-hidden",
          match.blockers.length > 0 && "opacity-75",
          highlight && "border-accent-border",
        )}
      >
        {highlight && (
          <div className="border-b border-accent-border bg-accent-soft px-5 py-2">
            <Label className="text-accent">{highlight}</Label>
          </div>
        )}

        <div className="p-5">
          {/* ——— Шапка ————————————————————————————————————————— */}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <WaypointBadge rank={rank} band={match.band} />
                <BandBadge band={match.band} />
                {program.costs.fundingAvailable && (
                  <Chip tone="neutral">стипендии</Chip>
                )}
                {program.dormGuaranteed && <Chip tone="neutral">общежитие</Chip>}
              </div>

              <h3 className="t-title mt-2.5 text-[18px] leading-tight">
                {program.program}
              </h3>
              <p className="mt-1 text-[13.5px] text-muted">
                {program.university} · {program.city},{" "}
                {COUNTRIES[program.country].label}
              </p>
            </div>

            <ScoreRing score={match.score} />
          </div>

          {/* ——— Ключевые цифры ————————————————————————————————— */}
          <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r-sm)] border border-line bg-line">
            <Metric
              label="год обучения"
              value={formatUSD(program.costs.tuitionUSDPerYear)}
            />
            <Metric label="с проживанием" value={formatUSD(totalCost)} />
            <Metric
              label="длительность"
              value={`${program.durationYears} ${program.durationYears === 1 ? "год" : "года"}`}
            />
          </dl>

          {/* ——— Почему подходит ————————————————————————————————— */}
          <div className="mt-4">
            <Label className="mb-2">Почему подходит</Label>
            {explanation ? (
              <p className="t-body text-[14px] text-ink">{explanation}</p>
            ) : (
              <ul className="space-y-1.5">
                {match.reasons.map((reason, index) => (
                  <li key={index} className="flex gap-2 text-[13.5px] leading-snug">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-f-strong" aria-hidden />
                    <span className="text-muted">{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ——— На что обратить внимание ————————————————————————— */}
          {match.watchouts.length > 0 && (
            <div className="mt-3.5 rounded-[var(--r-sm)] border border-line bg-sunken/70 p-3">
              <Label className="mb-1.5">На что обратить внимание</Label>
              <ul className="space-y-1">
                {match.watchouts.map((item, index) => (
                  <li key={index} className="text-[13px] leading-snug text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ——— Жёсткие несовпадения ——————————————————————————— */}
          {match.blockers.length > 0 && (
            <div className="mt-3.5 rounded-[var(--r-sm)] border border-danger/25 bg-danger-soft p-3">
              <Label className="mb-1.5 text-danger">Серьёзное несовпадение</Label>
              <ul className="space-y-1">
                {match.blockers.map((item, index) => (
                  <li key={index} className="text-[13px] leading-snug text-danger">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ——— Разбор по факторам ————————————————————————————— */}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="mt-4 flex w-full items-center justify-between rounded-[var(--r-xs)] py-2 text-left transition-colors hover:text-accent"
          >
            <Label>Разбор по семи факторам</Label>
            <svg
              viewBox="0 0 12 12"
              className={cn(
                "size-3 fill-none stroke-current transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]",
                expanded && "rotate-180",
              )}
              strokeWidth={1.8}
            >
              <path d="M2 4.5L6 8.5L10 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Компактная сводка полосок — видна всегда, меняется при правках анкеты */}
          <div className="flex gap-1" aria-hidden>
            {match.factors.map((factor, index) => (
              <div key={factor.id} className="flex-1" title={`${factor.label}: ${factor.detail}`}>
                <FactorBar
                  value={factor.score}
                  status={factor.status}
                  delayMs={index * 30}
                />
              </div>
            ))}
          </div>

          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: DUR.base, ease: EASE.out }}
              className="overflow-hidden"
            >
              <ul className="mt-4 space-y-3.5">
                {match.factors.map((factor, index) => (
                  <li key={factor.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13.5px] font-semibold">
                        {factor.label}
                      </span>
                      <span className="t-label shrink-0">
                        вес {Math.round(FACTOR_META[factor.id].weight * 100)}% ·{" "}
                        {Math.round(factor.score * 100)}
                      </span>
                    </div>
                    <FactorBar
                      value={factor.score}
                      status={factor.status}
                      className="mt-1.5"
                      delayMs={index * 45}
                    />
                    <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                      {factor.detail}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="mt-4 rounded-[var(--r-sm)] border border-line bg-sunken/60 p-3">
                <p className="text-[12.5px] leading-snug text-muted">
                  <span className="font-semibold text-ink">
                    {BANDS[match.band].label}:
                  </span>{" "}
                  {BANDS[match.band].description} Это оценка соответствия
                  опубликованным требованиям, а не прогноз решения приёмной комиссии.
                </p>
              </div>
            </motion.div>
          )}

          {/* ——— Подача и источник ————————————————————————————— */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
            <p className="text-[12.5px] text-muted">
              {program.applicationDeadlineNote}
            </p>
            <ConfidenceTag
              confidence={program.dataConfidence}
              source={program.source}
            />
          </div>

          {/* ——— Действия ——————————————————————————————————————— */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={onBuildRoadmap}>
              Построить маршрут
            </Button>
            <Button
              size="sm"
              variant={inShortlist ? "secondary" : "outline"}
              onClick={onToggleShortlist}
            >
              {inShortlist ? "В сравнении ✓" : "Сравнить"}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/** Цвет полосы поступления как чернила — тот же токен, что у чипа и кольца. */
const BAND_INK: Record<AdmissionBand, string> = {
  safe: "var(--band-safe)",
  target: "var(--band-target)",
  reach: "var(--band-reach)",
};

/**
 * Веха маршрута вместо порядкового номера.
 *
 * Тот же знак, что в логотипе и на вертикальной линии маршрута: кольцо с
 * точкой внутри. Номер в списке превращается в остановку на пути, а цвет
 * кольца даёт полосу поступления ещё до чтения текста.
 */
function WaypointBadge({ rank, band }: { rank: number; band: AdmissionBand }) {
  return (
    <span
      className={cn(
        "t-num grid size-[26px] shrink-0 place-items-center rounded-full border-2 bg-surface",
        "text-[11px] font-bold leading-none",
        "transition-transform duration-[var(--dur-base)] ease-[var(--ease-overshoot)]",
        "group-hover:scale-110",
      )}
      style={{ borderColor: BAND_INK[band], color: BAND_INK[band] }}
      title={`Позиция в подборке: ${rank}`}
    >
      {rank}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="t-label">{label}</dt>
      <dd className="t-num mt-1 text-[14px] font-bold">{value}</dd>
    </div>
  );
}
