import { z } from "zod";
import { COUNTRY_IDS, FIELD_IDS } from "./taxonomy";
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
