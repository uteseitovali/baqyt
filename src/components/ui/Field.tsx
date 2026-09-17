"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Label } from "./Primitives";

/* ============================================================================
   Элементы управления анкеты. Все — крупные тач-цели (минимум 44px),
   с явным состоянием выбора и клавиатурной доступностью.
   ========================================================================= */

export function FieldBlock({
  label,
  title,
  hint,
  children,
  error,
}: {
  label?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <fieldset className="space-y-3">
      {label && <Label>{label}</Label>}
      <legend className="sr-only">{title}</legend>
      <div>
        <p className="t-title text-[16px]">{title}</p>
        {hint && <p className="t-body mt-1 text-[13.5px] text-muted">{hint}</p>}
      </div>
      {children}
      {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
    </fieldset>
  );
}

/* ——— Карточка-опция ——————————————————————————————————————————————— */

export function OptionCard({
  selected,
  onSelect,
  title,
  hint,
  compact = false,
  disabled = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group relative w-full rounded-[var(--r-sm)] border px-3.5 text-left",
        "transition-[border-color,background-color,box-shadow] duration-150",
        compact ? "py-2.5" : "py-3",
        selected
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface hover:border-line-strong",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors",
            selected ? "border-accent bg-accent" : "border-line-strong bg-transparent",
          )}
          aria-hidden
        >
          {selected && (
            <svg viewBox="0 0 10 8" className="size-2.5 fill-none stroke-on-accent">
              <path
                d="M1 4l2.5 2.5L9 1"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[14px] font-semibold leading-tight",
              selected ? "text-accent" : "text-ink",
            )}
          >
            {title}
          </span>
          {hint && (
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
              {hint}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/* ——— Сегментированный переключатель ——————————————————————————————— */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full flex-wrap gap-1 rounded-[var(--r-sm)] border border-line bg-sunken p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-9 flex-1 rounded-[7px] px-3 text-[13px] font-semibold",
              "transition-[background-color,color,box-shadow] duration-150",
              active
                ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ——— Слайдер с числом ————————————————————————————————————————————— */

export function RangeField({
  value,
  onChange,
  min,
  max,
  step,
  format,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  ariaLabel: string;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="t-num text-[20px] font-bold">{format(value)}</span>
        <span className="t-label">
          {format(min)} — {format(max)}
        </span>
      </div>
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-[7px]
          [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface
          [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[var(--shadow-md)]
          [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface
          [&::-moz-range-thumb]:bg-accent [&::-moz-range-track]:h-1.5
          [&::-moz-range-track]:rounded-full"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--f-track) ${percent}%, var(--f-track) 100%)`,
          borderRadius: 999,
          height: 6,
        }}
      />
    </div>
  );
}

/* ——— Переключатель ———————————————————————————————————————————————— */

export function ToggleField({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-[var(--r-sm)] border px-3.5 py-3 text-left transition-colors",
        checked ? "border-accent-border bg-accent-soft" : "border-line bg-surface",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        {hint && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-f-track",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-surface shadow-[var(--shadow-sm)] transition-[left] duration-200",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/* ——— Числовое поле с необязательным значением ——————————————————— */

export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
  min,
  max,
  step = 1,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
        className={cn(
          "h-11 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3.5",
          "t-num text-[15px] text-ink placeholder:font-sans placeholder:text-[14px] placeholder:text-faint",
          "transition-colors focus:border-accent",
          suffix && "pr-14",
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 t-label">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ——— Ввод тегов (сильные предметы) ——————————————————————————————— */

export function TagInput({
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add(tag: string) {
    const clean = tag.trim();
    if (!clean || values.includes(clean) || values.length >= 6) return;
    onChange([...values, clean]);
    setDraft("");
  }

  const available = suggestions.filter((s) => !values.includes(s));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft py-1 pl-3 pr-1.5 text-[12.5px] font-semibold text-accent"
          >
            {tag}
            <button
              type="button"
              aria-label={`Убрать ${tag}`}
              onClick={() => onChange(values.filter((v) => v !== tag))}
              className="grid size-4 place-items-center rounded-full hover:bg-accent hover:text-on-accent transition-colors"
            >
              <svg viewBox="0 0 8 8" className="size-2 stroke-current" fill="none">
                <path d="M1 1l6 6M7 1L1 7" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          }
        }}
        placeholder={placeholder}
        aria-label="Добавить предмет"
        className="h-11 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3.5 text-[14px] placeholder:text-faint transition-colors focus:border-accent"
      />

      {available.length > 0 && values.length < 6 && (
        <div className="flex flex-wrap gap-1.5">
          {available.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ——— Многострочное поле ————————————————————————————————————————— */

export function TextareaField({
  value,
  onChange,
  placeholder,
  maxLength = 400,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  ariaLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-[var(--r-sm)] border border-line bg-surface px-3.5 py-3 text-[14px] leading-relaxed placeholder:text-faint transition-colors focus:border-accent"
      />
      <p className="t-label text-right">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}
