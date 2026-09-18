"use client";

import { cn } from "@/lib/utils/cn";
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
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-200 hover:border-line-strong hover:shadow-[var(--shadow-md)]",
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
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
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

export function FactorBar({
  value,
  status,
  className,
}: {
  value: number;
  status: FactorStatus;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1.5 w-full rounded-full bg-f-track overflow-hidden", className)}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
        style={{
          width: `${Math.round(value * 100)}%`,
          backgroundColor: STATUS_COLOR[status],
        }}
      />
    </div>
  );
}

/* ——— Кольцо общего совпадения ————————————————————————————————————— */

export function ScoreRing({
  score,
  size = 56,
  label = "совпадение",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          stroke="var(--accent)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center t-num text-[15px] font-bold">
        {Math.round(score)}
      </span>
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
