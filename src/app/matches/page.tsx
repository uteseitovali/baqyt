"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  Card,
  Chip,
  EmptyState,
  Label,
  SectionHeading,
} from "@/components/ui/Primitives";
import { RequireProfile } from "@/components/shell/RequireProfile";
import { MatchCard } from "@/components/matches/MatchCard";
import { TweakPanel } from "@/components/matches/TweakPanel";
import { SharePanel } from "@/components/share/SharePanel";
import { getCatalog } from "@/lib/data/programs";
import { balancedShortlist, rankPrograms } from "@/lib/domain/scoring";
import { useJourney } from "@/lib/store/journey";
import { cn } from "@/lib/utils/cn";
import type { AdmissionBand } from "@/lib/domain/types";

/* ============================================================================
   ЭТАП 4 — РЕКОМЕНДАЦИИ

   Ранжирование выполняется синхронно в браузере теми же чистыми функциями
   домена, что и на сервере: правка в панели настройки меняет список без
   задержки и без сетевого запроса. LLM-объяснения подтягиваются отдельно и
   необязательны — их отсутствие не ломает экран.
   ========================================================================= */

export default function MatchesPage() {
  return (
    <RequireProfile>
      <MatchesView />
    </RequireProfile>
  );
}

type BandFilter = "all" | AdmissionBand;

export function MatchesView() {
  const router = useRouter();
  const profile = useJourney((s) => s.profile);
  const shortlist = useJourney((s) => s.shortlist);
  const toggleShortlist = useJourney((s) => s.toggleShortlist);
  const setActiveProgram = useJourney((s) => s.setActiveProgram);
  const visitStep = useJourney((s) => s.visitStep);

  const [bandFilter, setBandFilter] = useState<BandFilter>("all");
  const [hideBlocked, setHideBlocked] = useState(true);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explaining, setExplaining] = useState(false);

  // Пересчёт синхронный — это и есть «заметная реакция на изменение вводных».
  // getCatalog() отдаёт снапшот, который к этому моменту уже заполнен:
  // из базы, если она подключена, иначе статическим срезом.
  const allMatches = useMemo(
    () => rankPrograms(profile, getCatalog(), { limit: 14, hideBlocked }),
    [profile, hideBlocked],
  );

  const balanced = useMemo(() => balancedShortlist(allMatches), [allMatches]);
  const balancedIds = useMemo(
    () => new Set(balanced.map((m) => m.program.id)),
    [balanced],
  );

  const visible = useMemo(
    () =>
      bandFilter === "all"
        ? allMatches
        : allMatches.filter((m) => m.band === bandFilter),
    [allMatches, bandFilter],
  );

  useEffect(() => {
    visitStep("matches");
  }, [visitStep]);

  // Ключ профиля: при любом изменении вводных старые объяснения становятся
  // неактуальными и должны быть сброшены, иначе текст разойдётся с цифрами.
  const profileKey = useMemo(() => JSON.stringify(profile), [profile]);
  const lastExplainedKey = useRef<string | null>(null);

  useEffect(() => {
    setExplanations({});
  }, [profileKey]);

  async function requestExplanations() {
    setExplaining(true);
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, explain: true, hideBlocked, limit: 6 }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        explanations: Record<string, string>;
        meta: { explanationSource: string; aiEnabled: boolean };
      };
      setExplanations(payload.explanations ?? {});
      lastExplainedKey.current = profileKey;
    } catch {
      /* объяснения необязательны: карточки уже содержат разбор по факторам */
    } finally {
      setExplaining(false);
    }
  }

  /* Переход не блокируется и не откладывается: router.push уходит сразу.
     Пока страница маршрута грузится (isNavigating), выбранная карточка
     подсвечена, остальные отступают, кнопка честно пишет, что происходит.
     Как только переход завершился или сорвался, флаг гаснет сам. */
  const [isNavigating, startNavigation] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);

  function openRoadmap(programId: string) {
    setActiveProgram(programId);
    setOpeningId(programId);
    startNavigation(() => router.push("/roadmap"));
  }

  function phaseOf(programId: string): "idle" | "opening" | "receding" {
    if (!isNavigating || openingId === null) return "idle";
    return openingId === programId ? "opening" : "receding";
  }

  const counts = useMemo(
    () => ({
      all: allMatches.length,
      safe: allMatches.filter((m) => m.band === "safe").length,
      target: allMatches.filter((m) => m.band === "target").length,
      reach: allMatches.filter((m) => m.band === "reach").length,
    }),
    [allMatches],
  );

  const openingTitle = isNavigating
    ? allMatches.find((m) => m.program.id === openingId)?.program.program
    : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Один живой регион на страницу — а не по одному на кнопку. */}
      <p role="status" className="sr-only">
        {openingTitle ? `Открываем маршрут: ${openingTitle}` : ""}
      </p>

      <SectionHeading
        label="Этап 4 · Рекомендации"
        title="Программы под ваш профиль"
        description="Список отсортирован по совпадению с анкетой. У каждой карточки раскрывается разбор по семи факторам — видно, что именно её подняло."
        action={
          shortlist.length > 0 ? (
            <ButtonLink href="/compare" variant="outline">
              Сравнить ({shortlist.length})
            </ButtonLink>
          ) : undefined
        }
      />

      {/* ——— Сбалансированная подборка ————————————————————————— */}
      {balanced.length >= 2 && bandFilter === "all" && (
        <Card className="mt-8 bg-sunken/60 p-5">
          <Label className="mb-2">Рекомендуем подавать так</Label>
          <p className="t-body text-[13.5px] text-muted">
            Сильная стратегия — подаваться сразу в три полосы: надёжный вариант,
            целевой и амбициозный. Ниже отмечены подходящие кандидаты из вашего
            списка.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {balanced.map((m) => (
              <Chip key={m.program.id} tone={m.band}>
                {m.program.universityShort} · {Math.round(m.score)}
              </Chip>
            ))}
          </div>
        </Card>
      )}

      {/* ——— Настройка ————————————————————————————————————————— */}
      <div className="mt-6">
        <TweakPanel resultCount={allMatches.length} />
      </div>

      {/* ——— Фильтры ——————————————————————————————————————————— */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Фильтр по полосе поступления"
          className="flex flex-wrap gap-1.5"
        >
          {(
            [
              ["all", `Все · ${counts.all}`],
              ["safe", `Надёжные · ${counts.safe}`],
              ["target", `Целевые · ${counts.target}`],
              ["reach", `Амбициозные · ${counts.reach}`],
            ] as [BandFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={bandFilter === value}
              onClick={() => setBandFilter(value)}
              className={cn(
                "min-h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                bandFilter === value
                  ? "border-ink bg-ink text-canvas"
                  : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideBlocked(!hideBlocked)}
            className="text-[12.5px] font-semibold text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
          >
            {hideBlocked ? "Показать несовместимые" : "Скрыть несовместимые"}
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={requestExplanations}
            disabled={explaining}
          >
            {explaining ? "Формулирую…" : "Объяснить словами"}
          </Button>
        </div>
      </div>

      {Object.keys(explanations).length > 0 && (
        <p className="mt-3 text-[12.5px] text-faint">
          Объяснения переписаны AI на основе тех же рассчитанных факторов. Цифры
          и требования берутся только из каталога.
        </p>
      )}

      {/* ——— Список ————————————————————————————————————————————— */}
      <div className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <EmptyState
            title="Под эти условия ничего не нашлось"
            description="Попробуйте расширить список стран, поднять бюджет или снять требование обязательной стипендии в панели живой настройки выше."
            action={
              <Button variant="outline" onClick={() => setBandFilter("all")}>
                Сбросить фильтр
              </Button>
            }
          />
        ) : (
          visible.map((match, index) => (
            <MatchCard
              key={match.program.id}
              match={match}
              rank={allMatches.indexOf(match) + 1}
              explanation={explanations[match.program.id]}
              inShortlist={shortlist.includes(match.program.id)}
              onToggleShortlist={() => toggleShortlist(match.program.id)}
              onBuildRoadmap={() => openRoadmap(match.program.id)}
              phase={phaseOf(match.program.id)}
              highlight={
                balancedIds.has(match.program.id) && index < 6
                  ? `Кандидат в полосу «${
                      match.band === "safe"
                        ? "надёжный"
                        : match.band === "target"
                          ? "целевой"
                          : "амбициозный"
                    }»`
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* ——— Показать семье ————————————————————————————————————— */}
      {allMatches.length > 0 && (
        <div className="mt-8">
          <SharePanel matches={allMatches} />
        </div>
      )}

      {/* ——— Нижняя навигация ————————————————————————————————— */}
      {visible.length > 0 && (
        <Card className="mt-8 flex flex-col gap-4 bg-sunken/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="t-title text-[16px]">
              {shortlist.length >= 2
                ? "Готовы сравнить отмеченные варианты"
                : "Отметьте два-три варианта для сравнения"}
            </p>
            <p className="t-body mt-1 text-[13.5px] text-muted">
              Дальше — таблица различий по важным для вас параметрам, а затем план
              под выбранную программу.
            </p>
          </div>
          <ButtonLink
            href="/compare"
            variant={shortlist.length >= 2 ? "primary" : "outline"}
          >
            Перейти к сравнению
          </ButtonLink>
        </Card>
      )}
    </div>
  );
}
