"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { JOURNEY } from "@/lib/domain/taxonomy";
import { useJourney } from "@/lib/store/journey";
import { cn } from "@/lib/utils/cn";
import type { StepId } from "@/lib/domain/types";

/* ============================================================================
   МАРШРУТНАЯ ЛИНИЯ — сигнатурный элемент системы.

   Отвечает на требование кейса «пользователь всегда понимает, где находится,
   что уже сделал и что будет дальше». Присутствует на каждом экране, на
   мобильном превращается в горизонтальную прокручиваемую ленту.
   ========================================================================= */

function stepFromPath(pathname: string): StepId {
  if (pathname === "/") return "intro";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/diagnosis")) return "diagnosis";
  if (pathname.startsWith("/matches")) return "matches";
  if (pathname.startsWith("/compare")) return "compare";
  if (pathname.startsWith("/roadmap")) return "roadmap";
  return "intro";
}

export function JourneyRail() {
  const pathname = usePathname();
  const current = stepFromPath(pathname);
  const profileCompleted = useJourney((s) => s.profileCompleted);
  const shortlist = useJourney((s) => s.shortlist);
  const activeProgramId = useJourney((s) => s.activeProgramId);
  const completedTasks = useJourney((s) => s.completedTasks);

  const currentIndex = JOURNEY.findIndex((s) => s.id === current);

  // На мобильном лента шире экрана: подкручиваем её к активному шагу, иначе
  // пользователь видит только начало маршрута и теряет ориентир.
  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const offset =
      active.offsetLeft - list.clientWidth / 2 + active.clientWidth / 2;
    list.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
  }, [current]);

  /** Шаг считается пройденным по фактическому результату, а не по посещению. */
  function isDone(id: StepId): boolean {
    switch (id) {
      case "intro":
        return true;
      case "profile":
        return profileCompleted;
      case "diagnosis":
        return profileCompleted;
      case "matches":
        return profileCompleted;
      case "compare":
        return shortlist.length >= 2;
      case "roadmap":
        return Boolean(activeProgramId);
      case "action":
        return Object.values(completedTasks).some(Boolean);
      default:
        return false;
    }
  }

  function isReachable(id: StepId): boolean {
    if (id === "intro" || id === "profile") return true;
    return profileCompleted;
  }

  const doneCount = JOURNEY.filter((s) => isDone(s.id)).length;
  const progressPercent = Math.round((doneCount / JOURNEY.length) * 100);

  return (
    <nav
      aria-label="Маршрут прохождения"
      className="border-b border-line bg-surface/85 backdrop-blur-xl"
    >
      <div className="mx-auto w-full max-w-[var(--page-max)] px-4 sm:px-6">
        <ol
          ref={listRef}
          className="no-scrollbar rail-fade flex items-center gap-0 overflow-x-auto py-2.5 lg:[mask-image:none]"
        >
          {JOURNEY.map((step, index) => {
            const done = isDone(step.id);
            const active = step.id === current;
            const reachable = isReachable(step.id);
            const passed = index < currentIndex;

            const content = (
              <span
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors",
                  active && "bg-accent-soft",
                  reachable && !active && "hover:bg-sunken",
                )}
              >
                <span
                  className={cn(
                    "grid size-[18px] shrink-0 place-items-center rounded-full border text-[9px] font-bold transition-colors",
                    done
                      ? "border-transparent bg-accent text-on-accent"
                      : active
                        ? "border-accent text-accent"
                        : "border-line-strong text-faint",
                  )}
                  aria-hidden
                >
                  {done ? (
                    <svg viewBox="0 0 10 8" className="size-2.5 fill-none stroke-current">
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    step.index
                  )}
                </span>
                <span
                  className={cn(
                    "text-[12.5px] font-semibold tracking-[-0.01em]",
                    active ? "text-accent" : done ? "text-ink" : "text-faint",
                  )}
                >
                  <span className="hidden sm:inline">{step.title}</span>
                  <span className="sm:hidden">{step.short}</span>
                </span>
              </span>
            );

            return (
              <li
                key={step.id}
                ref={active ? activeRef : undefined}
                className="flex items-center"
              >
                {index > 0 && (
                  <span
                    className={cn(
                      "h-px w-4 shrink-0 sm:w-6",
                      passed || done ? "bg-accent/45" : "bg-line",
                    )}
                    aria-hidden
                  />
                )}
                {reachable ? (
                  <Link
                    href={step.href}
                    aria-current={active ? "step" : undefined}
                    className="focus-visible:outline-offset-4"
                  >
                    {content}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    title="Сначала заполните анкету"
                    className="cursor-not-allowed opacity-55"
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Тонкая полоса общего прогресса под лентой */}
      <div
        className="h-[2px] w-full bg-f-track"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Общий прогресс маршрута"
      >
        {/* Прогресс едет через scaleX и общий токен длительности:
            та же кривая, что у полосок факторов и маршрутной линии. */}
        <div
          className="h-full w-full origin-left bg-accent"
          style={{
            transform: `scaleX(${progressPercent / 100})`,
            transition: "transform var(--dur-draw) var(--ease-out)",
          }}
        />
      </div>
    </nav>
  );
}
