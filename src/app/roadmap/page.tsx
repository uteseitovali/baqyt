"use client";

import { useEffect, useMemo } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  BandBadge,
  Card,
  Chip,
  ConfidenceTag,
  EmptyState,
  Label,
  SectionHeading,
} from "@/components/ui/Primitives";
import { RequireProfile } from "@/components/shell/RequireProfile";
import { getProgramById } from "@/lib/data/programs";
import {
  buildRoadmap,
  nextAction,
  remainingEffort,
  roadmapProgress,
} from "@/lib/domain/roadmap";
import { scoreProgram } from "@/lib/domain/scoring";
import { COUNTRIES, PHASE_META, TASK_CATEGORIES } from "@/lib/domain/taxonomy";
import { useJourney } from "@/lib/store/journey";
import { cn, plural } from "@/lib/utils/cn";
import type { RoadmapPhase, RoadmapTask } from "@/lib/domain/types";

/* ============================================================================
   ЭТАПЫ 6 и 7 — МАРШРУТ И СЛЕДУЮЩЕЕ ДЕЙСТВИЕ

   План строится обратным ходом от окна подачи выбранной программы. Состав
   задач зависит от того, чего не хватает именно в этом профиле: есть IELTS —
   блок подготовки к нему не появится вовсе.
   ========================================================================= */

export default function RoadmapPage() {
  return (
    <RequireProfile>
      <RoadmapView />
    </RequireProfile>
  );
}

function RoadmapView() {
  const profile = useJourney((s) => s.profile);
  const activeProgramId = useJourney((s) => s.activeProgramId);
  const completedTasks = useJourney((s) => s.completedTasks);
  const toggleTask = useJourney((s) => s.toggleTask);
  const visitStep = useJourney((s) => s.visitStep);

  const program = activeProgramId ? getProgramById(activeProgramId) : undefined;

  const roadmap = useMemo(
    () => (program ? buildRoadmap(profile, program) : null),
    [profile, program],
  );

  const match = useMemo(
    () => (program ? scoreProgram(profile, program) : null),
    [profile, program],
  );

  useEffect(() => {
    if (roadmap) visitStep("roadmap");
  }, [roadmap, visitStep]);

  useEffect(() => {
    if (Object.values(completedTasks).some(Boolean)) visitStep("action");
  }, [completedTasks, visitStep]);

  if (!program || !roadmap || !match) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Маршрут ещё не построен"
          description="Выберите программу на экране рекомендаций и нажмите «Построить маршрут» — план соберётся под её требования и окно подачи."
          action={<ButtonLink href="/matches">К рекомендациям</ButtonLink>}
        />
      </div>
    );
  }

  const progress = roadmapProgress(roadmap, completedTasks);
  const next = nextAction(roadmap, completedTasks);
  const hoursLeft = remainingEffort(roadmap, completedTasks);

  const phases: RoadmapPhase[] = ["now", "soon", "later"];
  const grouped = phases.map((phase) => ({
    phase,
    tasks: roadmap.tasks.filter((t) => t.phase === phase),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <SectionHeading
        label="Этап 6 · Маршрут"
        title="План до подачи"
        description="Сроки посчитаны обратным ходом от окна подачи — это ориентиры, а не официальные даты вуза."
        action={
          <ButtonLink href="/matches" variant="outline">
            Сменить программу
          </ButtonLink>
        }
      />

      {/* ——— Выбранная программа ————————————————————————————— */}
      <Card className="mt-8 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BandBadge band={match.band} />
              <Chip tone="neutral">
                совпадение {Math.round(match.score)} / 100
              </Chip>
            </div>
            <h2 className="t-title mt-3 text-[20px] leading-tight">
              {program.program}
            </h2>
            <p className="mt-1 text-[13.5px] text-muted">
              {program.university} · {program.city},{" "}
              {COUNTRIES[program.country].label}
            </p>
          </div>
          <ConfidenceTag confidence={program.dataConfidence} source={program.source} />
        </div>
      </Card>

      {/* ——— ЭТАП 7: следующее действие ——————————————————————— */}
      <section id="next" className="mt-6 scroll-mt-32">
        <Card
          className={cn(
            "relative overflow-hidden",
            next ? "border-accent-border" : "border-safe/40",
          )}
        >
          <div
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: next ? "var(--accent)" : "var(--band-safe)" }}
            aria-hidden
          />
          <div className="p-5 sm:p-6">
            <Label className="mb-3">Этап 7 · Ваш следующий шаг</Label>

            {next ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="accent">{TASK_CATEGORIES[next.category].label}</Chip>
                  <Chip tone="neutral">{next.dueLabel}</Chip>
                  <Chip tone="neutral">
                    ≈ {next.effortHours} {plural(next.effortHours, "час", "часа", "часов")}
                  </Chip>
                </div>

                <h3 className="t-title mt-3.5 text-[21px] leading-tight sm:text-[24px]">
                  {next.title}
                </h3>
                <p className="t-body mt-2.5 text-[14.5px] text-muted">{next.why}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={() => toggleTask(next.id)}>
                    Отметить выполненным
                  </Button>
                  {next.source && (
                    <a
                      href={next.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center rounded-[12px] border border-line bg-surface px-5 text-[14px] font-semibold transition-colors hover:border-accent hover:text-accent"
                    >
                      Открыть источник ↗
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="t-title mt-1 text-[21px]">Все шаги отмечены</h3>
                <p className="t-body mt-2 text-[14.5px] text-muted">
                  План по этой программе пройден целиком. Добавьте вторую программу
                  из рекомендаций — подаваться в несколько полос надёжнее, чем
                  ставить всё на один вариант.
                </p>
                <ButtonLink href="/matches" className="mt-5">
                  Выбрать вторую программу
                </ButtonLink>
              </>
            )}
          </div>
        </Card>
      </section>

      {/* ——— Прогресс ————————————————————————————————————————— */}
      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Label>Прогресс маршрута</Label>
          <span className="t-num text-[13px] font-bold">
            {progress.done} / {progress.total} · осталось ≈ {hoursLeft}{" "}
            {plural(hoursLeft, "час", "часа", "часов")}
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-f-track"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Выполнено задач маршрута"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </Card>

      {/* ——— Таймлайн ————————————————————————————————————————— */}
      <div className="mt-8 space-y-8">
        {grouped.map(
          ({ phase, tasks }) =>
            tasks.length > 0 && (
              <section key={phase}>
                <div className="flex items-baseline gap-2.5">
                  <h3 className="t-title text-[17px]">{PHASE_META[phase].label}</h3>
                  <span className="t-label">{PHASE_META[phase].hint}</span>
                </div>

                <ol className="relative mt-4 space-y-2.5 pl-6">
                  {/* Вертикальная маршрутная линия */}
                  <span
                    className="rail-dotted absolute left-[7px] top-2 bottom-2 w-px"
                    aria-hidden
                  />
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      done={Boolean(completedTasks[task.id])}
                      isNext={next?.id === task.id}
                      onToggle={() => toggleTask(task.id)}
                    />
                  ))}
                </ol>
              </section>
            ),
        )}
      </div>

      <p className="mt-10 text-[12.5px] leading-relaxed text-faint">
        Состав задач зависит от вашей анкеты: например, блок подготовки к IELTS
        появляется только если официального результата ещё нет. Измените анкету —
        и план пересоберётся.
      </p>
    </div>
  );
}

function TaskRow({
  task,
  done,
  isNext,
  onToggle,
}: {
  task: RoadmapTask;
  done: boolean;
  isNext: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="relative">
      {/* Веха на линии */}
      <span
        className={cn(
          "absolute -left-6 top-4 size-[15px] rounded-full border-2 transition-colors",
          done
            ? "border-transparent bg-f-strong"
            : isNext
              ? "border-accent bg-canvas"
              : "border-line-strong bg-canvas",
        )}
        aria-hidden
      />

      <Card
        className={cn(
          "p-3.5 transition-colors",
          done && "bg-sunken/50",
          isNext && !done && "border-accent-border",
        )}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={onToggle}
            role="checkbox"
            aria-checked={done}
            aria-label={done ? `Снять отметку: ${task.title}` : `Отметить: ${task.title}`}
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors",
              done
                ? "border-transparent bg-f-strong"
                : "border-line-strong hover:border-accent",
            )}
          >
            {done && (
              <svg viewBox="0 0 10 8" className="size-3 fill-none stroke-canvas">
                <path
                  d="M1 4l2.5 2.5L9 1"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="t-label">{TASK_CATEGORIES[task.category].label}</span>
              <span className="t-label">·</span>
              <span className="t-label">{task.dueLabel}</span>
              {isNext && !done && (
                <span className="t-label text-accent">следующий шаг</span>
              )}
            </div>

            <p
              className={cn(
                "mt-1 text-[14.5px] font-semibold leading-snug",
                done && "text-muted line-through decoration-1",
              )}
            >
              {task.title}
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">{task.why}</p>
          </div>

          <span className="t-label shrink-0 pt-0.5">
            {task.effortHours}ч
          </span>
        </div>
      </Card>
    </li>
  );
}
