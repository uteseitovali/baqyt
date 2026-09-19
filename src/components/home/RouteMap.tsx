"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { DUR, EASE, SPRING_WAYPOINT, STAGGER } from "@/lib/motion/choreography";
import { cn } from "@/lib/utils/cn";

/* ============================================================================
   СИГНАТУРНЫЙ ЭЛЕМЕНТ ГЕРОЯ — маршрутная линия

   Семь вех — ровно семь шагов пути (JOURNEY). Это не орнамент: на экране
   рядом стоит та же линия из логотипа и та же нумерация шагов ниже по
   странице, а на маршруте — пунктирная вертикаль между задачами. Один жест
   в четырёх местах.

   Хореография (одна на всю систему, см. lib/motion/choreography.ts), всё
   вместе — около 1.2 с, один раз при загрузке:
     1. линия прочерчивается слева направо — маской по stroke-dashoffset,
        чтобы сохранить пунктир самой линии;
     2. вехи приезжают вслед за головой линии, каждая с перелётом;
     3. когда садится последняя, точка назначения звенит один раз.

   Reduced motion. Сервер не знает предпочтения пользователя, поэтому в
   серверный HTML попадает скрытое исходное состояние (offset 480, вехи с
   opacity 0). JS-ветка useReducedMotion срабатывает только после гидрации —
   до неё человек видел бы пустое место. Поэтому финальное состояние
   закреплено ещё и в CSS-блоке prefers-reduced-motion (globals.css, классы
   .route-map / .route-pulse): карта на месте с первого кадра.

   Пунктир держим маской, а не dasharray самой линии: dasharray уже занят
   под рисунок пунктира, вторая роль на том же свойстве не помещается.
   ========================================================================= */

/** Семь вех маршрута. Высота падает слева направо — путь идёт вверх. */
const WAYPOINTS: readonly (readonly [number, number])[] = [
  [18, 196],
  [86, 166],
  [150, 178],
  [214, 132],
  [278, 142],
  [346, 74],
  [418, 26],
];

const ROUTE_D = `M${WAYPOINTS.map(([x, y]) => `${x} ${y}`).join(" L")}`;

/** С запасом больше фактической длины пути (≈466) — маска обязана закрыть всё. */
const ROUTE_LENGTH = 480;

const DESTINATION = WAYPOINTS[WAYPOINTS.length - 1];

/**
 * Лёгкий параллакс от курсора. Два плана с разной глубиной — этого хватает,
 * чтобы плоская карта ожила, и не хватает, чтобы она превратилась в сцену.
 * Значение пишем в MotionValue, минуя рендер React.
 */
function usePointerParallax(enabled: boolean) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    if (!enabled) return;
    // Тач и узкие экраны пропускаем: там курсора нет, а сам элемент скрыт.
    const media = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    if (!media.matches) return;

    function onMove(event: PointerEvent) {
      x.set((event.clientX / window.innerWidth) * 2 - 1);
      y.set((event.clientY / window.innerHeight) * 2 - 1);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled, x, y]);

  return { x, y };
}

export function RouteMap({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const { x, y } = usePointerParallax(!reduce);

  const smoothX = useSpring(x, { stiffness: 90, damping: 20, mass: 0.6 });
  const smoothY = useSpring(y, { stiffness: 90, damping: 20, mass: 0.6 });

  // Дальний план — сама линия, ближний — вехи.
  const lineX = useTransform(smoothX, (v) => v * 8);
  const lineY = useTransform(smoothY, (v) => v * 5);
  const pinX = useTransform(smoothX, (v) => v * 16);
  const pinY = useTransform(smoothY, (v) => v * 10);

  /** Момент, когда голова линии доходит до вехи. */
  const arrival = (index: number) => 0.1 + index * STAGGER.waypoint;
  /** Последняя веха садится — в этот момент звенит кольцо назначения. */
  const landing = arrival(WAYPOINTS.length - 1);

  return (
    <svg
      viewBox="0 0 440 220"
      className={cn("route-map", className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* Маска-«карандаш»: широкий штрих, который открывает пунктир. */}
        <mask id="bagyt-route-draw">
          <motion.path
            d={ROUTE_D}
            fill="none"
            // Белый здесь — не цвет, а канал маски: яркость задаёт прозрачность.
            // На экран он не попадает, поэтому токен тут неприменим.
            stroke="#fff"
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: ROUTE_LENGTH }}
            initial={reduce ? false : { strokeDashoffset: ROUTE_LENGTH }}
            animate={{ strokeDashoffset: 0 }}
            // Короче общего DUR.draw (он у кольца оценки и линии маршрута): вся
            // вводная анимация героя обязана уложиться в ~1.2 с, а голова линии
            // должна опережать вехи — к моменту посадки последней (≈0.52 с)
            // прочерчено уже ≈97% пути.
            transition={{ duration: DUR.draw * 0.7, ease: EASE.out }}
          />
        </mask>
      </defs>

      <motion.g style={reduce ? undefined : { x: lineX, y: lineY }}>
        <g mask="url(#bagyt-route-draw)">
          <path
            d={ROUTE_D}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
      </motion.g>

      <motion.g style={reduce ? undefined : { x: pinX, y: pinY }}>
        {WAYPOINTS.map(([cx, cy], index) => {
          const isDestination = index === WAYPOINTS.length - 1;
          const isStart = index === 0;
          return (
            <motion.circle
              key={index}
              cx={cx}
              cy={cy}
              r={isDestination ? 7 : 4}
              fill={
                isDestination || isStart ? "var(--accent)" : "var(--canvas)"
              }
              stroke="var(--accent)"
              strokeWidth="2"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...SPRING_WAYPOINT, delay: arrival(index) }}
            />
          );
        })}

        {/* Точка назначения отзванивается один раз, когда садится последняя
            веха, — и на этом вводная анимация заканчивается. */}
        {!reduce && (
          <motion.circle
            className="route-pulse"
            cx={DESTINATION[0]}
            cy={DESTINATION[1]}
            r={7}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 2.6], opacity: [0.45, 0] }}
            transition={{ duration: 0.5, ease: EASE.out, delay: landing }}
          />
        )}
      </motion.g>
    </svg>
  );
}
