import { z } from "zod";
import { profileSchema } from "@/lib/domain/validation";
import type { JourneySnapshot } from "./merge";
import type { Profile } from "@/lib/domain/types";

/* ============================================================================
   Валидация состояния пути на границе сети и базы.

   Профиль проверяется той же схемой, что и вход в /api/recommend, — ни одна
   анкета не попадает в базу в форме, которую доменная логика потом не примет.
   ========================================================================= */

const stepIdSchema = z.enum([
  "intro",
  "profile",
  "diagnosis",
  "matches",
  "compare",
  "roadmap",
  "action",
]);

const isoDateTime = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), "ожидается ISO-время");

export const journeySnapshotSchema = z.object({
  profile: profileSchema,
  profileCompleted: z.boolean(),
  visitedSteps: z.array(stepIdSchema).max(7),
  shortlist: z.array(z.string().min(1).max(80)).max(3),
  activeProgramId: z.string().min(1).max(80).nullable(),
  completedTasks: z.record(z.string().max(120), z.boolean()),
  revisions: z.number().int().min(0).max(10_000),
  updatedAt: isoDateTime,
});

export const journeyPutSchema = z.object({
  journey: journeySnapshotSchema,
});

/**
 * Приводит провалидированное состояние к доменной форме — тем же приёмом,
 * что и asProfile в src/lib/domain/validation.ts: Zod отдаёт строки там, где
 * домен ждёт литеральные объединения (страны, направления), а проверка
 * значений уже выполнена схемой.
 */
export function asJourneySnapshot(
  input: z.infer<typeof journeySnapshotSchema>,
): JourneySnapshot {
  return {
    ...input,
    profile: input.profile as Profile,
    visitedSteps: input.visitedSteps as JourneySnapshot["visitedSteps"],
  };
}
