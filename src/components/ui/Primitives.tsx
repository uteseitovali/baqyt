"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils/cn";
import { DUR, EASE } from "@/lib/motion/choreography";
import type { AdmissionBand, DataConfidence, FactorStatus } from "@/lib/domain/types";
import { BANDS } from "@/lib/domain/taxonomy";

/* ============================================================================
   Примитивы дизайн-системы Bagyt.
   Все визуальные решения выражены токенами из globals.css — ни одного
   захардкоженного цвета, поэтому тёмная тема работает автоматически.
   ========================================================================= */

/* ——— Карточка ———————————————————————————————————————————————————— */

export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-[var(--r-md)]",
        // Интерактивная карточка приподнимается — это единственное место, где
        // система разрешает себе «физику» помимо маршрутных анимаций.
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out)] " +
            "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-lg)]",
        className,
      )}
      {...props}
    />
  );
}

/* ——— Микро-лейбл ————————————————————————————————————————————————— */

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("t-label", className)}>{children}</p>;
}

/* ——— Чип / бейдж ————————————————————————————————————————————————— */

type ChipTone = "neutral" | "accent" | "safe" | "target" | "reach" | "danger";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-sunken text-muted border-line",
  accent: "bg-accent-soft text-accent border-accent-border",
  safe: "bg-safe-soft text-safe border-transparent",
  target: "bg-target-soft text-target border-transparent",
  reach: "bg-reach-soft text-reach border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Chip({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
  /** Подсказка при наведении — для чипов, где ярлык короче смысла. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[11.5px] font-semibold leading-none tracking-[-0.005em]",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ——— Полоса поступления ————————————————————————————————————————— */

const BAND_TONE: Record<AdmissionBand, ChipTone> = {
  safe: "safe",
  target: "target",
  reach: "reach",
};

export function BandBadge({
  band,
  withDot = true,
}: {
  band: AdmissionBand;
  withDot?: boolean;
}) {
  return (
    <Chip tone={BAND_TONE[band]}>
      {withDot && (
        <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
      )}
      {BANDS[band].label}
    </Chip>
  );
}

/* ——— Пометка происхождения данных ——————————————————————————————— */

export function ConfidenceTag({
  confidence,
  source,
  compact = false,
}: {
  confidence: DataConfidence;
  source?: { label: string; url: string; checkedOn: string };
  compact?: boolean;
}) {
  const isDemo = confidence === "demo";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(
          "t-label",
          isDemo ? "text-faint" : "text-safe",
          compact && "text-[9.5px]",
        )}
        title={
          isDemo
            ? "Демонстрационные данные: подтвердите на сайте вуза перед подачей"
            : "Значение сверено с первоисточником"
        }
      >
        {isDemo ? "демо-данные" : "сверено"}
      </span>
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="t-label underline decoration-dotted underline-offset-2 hover:text-accent transition-colors"
        >
          источник ↗
        </a>
      )}
    </span>
  );
}

/* ——— Индикатор фактора ——————————————————————————————————————————— */

const STATUS_COLOR: Record<FactorStatus, string> = {
  strong: "var(--f-strong)",
  ok: "var(--f-ok)",
  weak: "var(--f-weak)",
};

/**
 * Полоска фактора.
 *
 * Едет через scaleX, а не width: ширина заставляет браузер пересчитывать
 * раскладку на каждый кадр, и при семи полосках в каждой из пятнадцати
 * карточек это заметно. Разгон при появлении — CSS-анимация bar-sweep:
 * она сама попадает под глобальный блок prefers-reduced-motion и не
 * тащит за собой JS.
 *
 * delayMs выстраивает полоски в каскад, когда раскрывается разбор.
 */
export function FactorBar({
  value,
  status,
  className,
  delayMs = 0,
}: {
  value: number;
  status: FactorStatus;
  className?: string;
  delayMs?: number;
}) {
  const filled = Math.min(1, Math.max(0, value));

  return (
    <div
      className={cn("h-1.5 w-full rounded-full bg-f-track overflow-hidden", className)}
      role="presentation"
    >
      <div
        className="h-full w-full origin-left rounded-full"
        style={{
          transform: `scaleX(${filled})`,
          backgroundColor: STATUS_COLOR[status],
          transition:
            "transform var(--dur-slow) var(--ease-out), background-color var(--dur-base) var(--ease-out)",
          animation: `bar-sweep var(--dur-slow) var(--ease-out) ${delayMs}ms backwards`,
        }}
      />
    </div>
  );
}

/* ——— Кольцо общего совпадения ————————————————————————————————————— */

/**
 * Кольцо общего совпадения.
 *
 * Заполняется при первом появлении и пересчитывается вместе с числом, когда
 * меняется анкета: главная цифра экрана не должна просто подменяться — видно,
 * что она именно доехала до нового значения.
 */
export function ScoreRing({
  score,
  size = 56,
  label = "совпадение",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const target = Math.min(100, Math.max(0, score));

  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - target / 100);

  // Цифра считается той же длительностью, что и дуга: они едут как одно целое.
  const count = useMotionValue(reduce ? target : 0);
  const rounded = useTransform(count, (value) => Math.round(value));

  useEffect(() => {
    const controls = animate(count, target, {
      duration: reduce ? 0 : DUR.draw * 0.75,
      ease: EASE.out,
    });
    return () => controls.stop();
  }, [count, target, reduce]);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(score)} из 100 — ${label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={4}
          className="stroke-f-track"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          stroke="var(--accent)"
          strokeDasharray={circumference}
          initial={reduce ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : DUR.draw * 0.75, ease: EASE.out }}
        />
      </svg>
      <motion.span className="absolute inset-0 grid place-items-center t-num text-[15px] font-bold">
        {rounded}
      </motion.span>
    </div>
  );
}

/* ——— Состояния ——————————————————————————————————————————————————— */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[var(--r-sm)]", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-line-strong bg-sunken/50 px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <h3 className="t-title text-[17px]">{title}</h3>
      <p className="t-body max-w-sm text-[14px] text-muted">{description}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Что-то пошло не так",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[var(--r-md)] border border-danger/30 bg-danger-soft px-5 py-4">
      <p className="text-[14px] font-semibold text-danger">{title}</p>
      <p className="t-body mt-1 text-[13.5px] text-muted">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-[13px] font-semibold text-danger underline underline-offset-4"
        >
          Попробовать снова
        </button>
      )}
    </div>
  );
}

/* ——— Разделитель с подписью ——————————————————————————————————————— */

export function SectionHeading({
  label,
  title,
  description,
  action,
}: {
  label?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {label && <Label className="mb-2">{label}</Label>}
        <h2 className="t-title text-[22px] sm:text-[26px]">{title}</h2>
        {description && (
          <p className="t-body mt-2 text-[14.5px] text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
