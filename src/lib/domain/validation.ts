import { z } from "zod";
import { COUNTRY_IDS, FIELD_IDS } from "./taxonomy";
import { createEmptyProfile } from "@/lib/store/journey.state";
import type { Profile } from "./types";

/* ============================================================================
   Валидация входа API. Клиент может прислать что угодно — доменная логика
   должна получать только заведомо корректный профиль.
   ========================================================================= */

export const profileSchema = z.object({
  version: z.literal(1),
  grade: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
  track: z.enum(["IB", "NIS", "national", "AP", "other"]),
  intakeYear: z.number().int().min(2024).max(2040),
  academics: z.object({
    gpaBand: z.enum(["top", "high", "mid", "developing", "unknown"]),
    predictedIB: z.number().min(24).max(45).optional(),
    entScore: z.number().min(0).max(140).optional(),
    satScore: z.number().min(400).max(1600).optional(),
    strongSubjects: z.array(z.string().max(60)).max(12),
  }),
  languages: z.object({
    ielts: z.number().min(1).max(9).optional(),
    toefl: z.number().min(0).max(120).optional(),
    englishSelf: z.enum(["none", "basic", "intermediate", "advanced"]),
    kazakh: z.enum(["none", "basic", "fluent"]),
    russian: z.enum(["none", "basic", "fluent"]),
  }),
  budget: z.object({
    annualTuitionUSD: z.number().min(0).max(120_000),
    needsFunding: z.boolean(),
    livingCoveredUSD: z.number().min(0).max(60_000),
  }),
  preferences: z.object({
    countries: z.array(z.enum(COUNTRY_IDS as [string, ...string[]])).max(12),
    fields: z.array(z.enum(FIELD_IDS as [string, ...string[]])).max(8),
    instructionLanguages: z.array(z.enum(["kk", "ru", "en", "tr"])).max(4),
    preferCloseToHome: z.boolean(),
    needsDorm: z.boolean(),
    campusPreference: z.enum(["big", "compact", "any"]),
  }),
  note: z.string().max(600).optional(),
});

export const recommendRequestSchema = z.object({
  profile: profileSchema,
  limit: z.number().int().min(1).max(24).optional(),
  hideBlocked: z.boolean().optional(),
  /** Запрашивать ли LLM-объяснения — на живом пересчёте их отключаем. */
  explain: z.boolean().optional(),
});

export const roadmapRequestSchema = z.object({
  profile: profileSchema,
  programId: z.string().min(1).max(80),
});

export const diagnoseRequestSchema = z.object({
  profile: profileSchema,
  enrich: z.boolean().optional(),
});

/** Приводит провалидированный объект к доменному типу. */
export function asProfile(input: z.infer<typeof profileSchema>): Profile {
  return input as Profile;
}

/* ============================================================================
   ВОССТАНОВЛЕНИЕ ПРОФИЛЯ ИЗ НЕДОВЕРЕННОГО ИСТОЧНИКА

   profileSchema выше закрывает сеть: всё, что приходит в API, обязано быть
   корректным, иначе 422. Но у анкеты есть второй вход, и он до сих пор был
   открыт — localStorage. zustand/persist кладёт сохранённый объект поверх
   начального состояния целиком, а не по полям: анкета, записанная прошлой
   версией приложения, переживает обновление кода как есть. Недостающая
   секция роняла рендер («Cannot read properties of undefined»), а значение
   вне диапазона доезжало до сервера и возвращалось 422 уже после того, как
   человек прошёл все пять шагов.

   reviveProfile чинит это в одном месте: достраивает форму по пустой анкете,
   отбрасывает значения, которые не проходят схему, и гарантирует, что дальше
   по коду профиль всегда валиден. Функция чистая — тесты в tests/domain.test.ts.
   ========================================================================= */

/**
 * Подтягивает введённое число к объявленному диапазону поля.
 *
 * HTML-атрибуты min/max на input[type=number] ничего не запрещают: они
 * управляют стрелками и валидацией формы, а формы здесь нет. Поэтому «7»
 * в поле SAT доезжало до сервера и возвращалось как 422 — уже после того,
 * как человек прошёл все пять шагов анкеты. Пустое поле остаётся пустым:
 * «не сдавал» — это не ноль.
 */
export function clampToRange(
  value: number | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

/** Необязательное число: берём, только если оно проходит свой диапазон. */
function keepNumberInRange(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= min && value <= max ? value : undefined;
}

function keepEnum<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Список известных значений.
 *
 * Отсутствие ключа и пустой список — разные вещи. Нет ключа: данных нет,
 * берём значение пустой анкеты (в странах это Казахстан — он должен быть
 * отмечен, когда человек впервые открывает шаг «Направление»). Есть пустой
 * список: человек снял все варианты сам, и его ответ сохраняется.
 */
function keepList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  max: number,
  fallback: T[],
): T[] {
  if (!Array.isArray(value)) return fallback;
  const kept = value.filter((item): item is T => allowed.includes(item as T));
  return [...new Set(kept)].slice(0, max);
}

/** Необязательное поле включается в объект, только если значение есть:
    явный `undefined` — это уже другая форма объекта, а не её отсутствие. */
function optional<K extends string, V>(key: K, value: V | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Приводит что угодно к валидному профилю.
 *
 * Значения, которые проходят схему, сохраняются; остальные заменяются
 * значением из пустой анкеты. Ответы человека не выбрасываются целиком
 * из-за одного испорченного поля — иначе обновление приложения стирало бы
 * анкету, которую уже заполнили.
 */
function reviveAcademics(raw: unknown, empty: Profile): Profile["academics"] {
  const a = asRecord(raw);
  return {
    gpaBand: keepEnum(
      a.gpaBand,
      ["top", "high", "mid", "developing", "unknown"] as const,
      empty.academics.gpaBand,
    ),
    ...optional("predictedIB", keepNumberInRange(a.predictedIB, 24, 45)),
    ...optional("entScore", keepNumberInRange(a.entScore, 0, 140)),
    ...optional("satScore", keepNumberInRange(a.satScore, 400, 1600)),
    strongSubjects: Array.isArray(a.strongSubjects)
      ? a.strongSubjects
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.slice(0, 60))
          .slice(0, 12)
      : empty.academics.strongSubjects,
  };
}

function reviveLanguages(raw: unknown, empty: Profile): Profile["languages"] {
  const l = asRecord(raw);
  return {
    ...optional("ielts", keepNumberInRange(l.ielts, 1, 9)),
    ...optional("toefl", keepNumberInRange(l.toefl, 0, 120)),
    englishSelf: keepEnum(
      l.englishSelf,
      ["none", "basic", "intermediate", "advanced"] as const,
      empty.languages.englishSelf,
    ),
    kazakh: keepEnum(l.kazakh, ["none", "basic", "fluent"] as const, empty.languages.kazakh),
    russian: keepEnum(l.russian, ["none", "basic", "fluent"] as const, empty.languages.russian),
  };
}

function reviveBudget(raw: unknown, empty: Profile): Profile["budget"] {
  const b = asRecord(raw);
  return {
    annualTuitionUSD:
      keepNumberInRange(b.annualTuitionUSD, 0, 120_000) ?? empty.budget.annualTuitionUSD,
    needsFunding:
      typeof b.needsFunding === "boolean" ? b.needsFunding : empty.budget.needsFunding,
    livingCoveredUSD:
      keepNumberInRange(b.livingCoveredUSD, 0, 60_000) ?? empty.budget.livingCoveredUSD,
  };
}

function revivePreferences(raw: unknown, empty: Profile): Profile["preferences"] {
  const p = asRecord(raw);
  const e = empty.preferences;
  return {
    countries: keepList(p.countries, COUNTRY_IDS, 12, e.countries),
    fields: keepList(p.fields, FIELD_IDS, 8, e.fields),
    instructionLanguages: keepList(
      p.instructionLanguages,
      ["kk", "ru", "en", "tr"] as const,
      4,
      e.instructionLanguages,
    ),
    preferCloseToHome:
      typeof p.preferCloseToHome === "boolean" ? p.preferCloseToHome : e.preferCloseToHome,
    needsDorm: typeof p.needsDorm === "boolean" ? p.needsDorm : e.needsDorm,
    campusPreference: keepEnum(
      p.campusPreference,
      ["big", "compact", "any"] as const,
      e.campusPreference,
    ),
  };
}

/**
 * Приводит что угодно к валидному профилю.
 *
 * Значения, которые проходят схему, сохраняются; остальные заменяются
 * значением из пустой анкеты. Ответы человека не выбрасываются целиком
 * из-за одного испорченного поля — иначе обновление приложения стирало бы
 * анкету, которую уже заполнили.
 */
export function reviveProfile(input: unknown): Profile {
  const empty = createEmptyProfile();
  const raw = asRecord(input);

  const candidate: Profile = {
    version: 1,
    grade: keepEnum(raw.grade, [9, 10, 11, 12] as const, empty.grade),
    track: keepEnum(raw.track, ["IB", "NIS", "national", "AP", "other"] as const, empty.track),
    intakeYear:
      typeof raw.intakeYear === "number" &&
      Number.isInteger(raw.intakeYear) &&
      keepNumberInRange(raw.intakeYear, 2024, 2040) !== undefined
        ? raw.intakeYear
        : empty.intakeYear,
    academics: reviveAcademics(raw.academics, empty),
    languages: reviveLanguages(raw.languages, empty),
    budget: reviveBudget(raw.budget, empty),
    preferences: revivePreferences(raw.preferences, empty),
    ...(typeof raw.note === "string" ? { note: raw.note.slice(0, 600) } : {}),
  };

  /* Страховка: если схема всё же недовольна, отдаём пустую анкету, но никогда
     не бросаем — это путь рендера, а не путь запроса. */
  return profileSchema.safeParse(candidate).success ? candidate : empty;
}
