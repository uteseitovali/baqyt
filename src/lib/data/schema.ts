import { z } from "zod";
import { COUNTRY_IDS, FIELD_IDS } from "@/lib/domain/taxonomy";
import type { Program } from "@/lib/domain/types";

/* ============================================================================
   ГРАНИЦА ДОВЕРИЯ КАТАЛОГА

   Всё, что приходит извне процесса — строка из Postgres, тело POST/PATCH в
   /api/programs — проходит через эти схемы прежде, чем попасть в движок
   подбора. Битая или неполная запись отбрасывается на границе, а не всплывает
   потом в scoring.ts в виде NaN в карточке.

   Аннотация `z.ZodType<Program>` — не украшение: она заставляет TypeScript
   сверять схему с доменным типом. Появится поле в Program — компиляция
   упадёт здесь, а не в рантайме на демо.
   ========================================================================= */

const countrySchema = z.enum(COUNTRY_IDS as [Program["country"], ...Program["country"][]]);
const fieldSchema = z.enum(FIELD_IDS as [Program["field"], ...Program["field"][]]);
const languageSchema = z.enum(["kk", "ru", "en", "tr"]);

const sourceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().regex(/^https?:\/\//, "ссылка на первоисточник").max(500),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "дата фиксации в формате YYYY-MM-DD"),
});

const requirementsSchema = z.object({
  ibPoints: z.number().min(24).max(45).optional(),
  satScore: z.number().min(400).max(1600).optional(),
  entScore: z.number().min(0).max(140).optional(),
  ielts: z.number().min(1).max(9).optional(),
  toefl: z.number().min(0).max(120).optional(),
  expectedSubjects: z.array(z.string().max(80)).max(12).optional(),
});

/* Грантовый трек РК. Поле опционально: у зарубежных программ его нет, и
   записи, созданные до появления трека, обязаны остаться валидными. Порог
   ограничен шкалой ЕНТ (0–140) — значение вне шкалы означает битые данные,
   а не строгий вуз. */
const grantSchema = z.object({
  entThreshold: z.number().min(0).max(140),
  note: z.string().min(10).max(400),
});

const costsSchema = z.object({
  tuitionUSDPerYear: z.number().min(0).max(200_000),
  livingUSDPerYear: z.number().min(0).max(100_000),
  fundingAvailable: z.boolean(),
  fundingNote: z.string().max(400).optional(),
  grant: grantSchema.optional(),
});

/* Объектная схема нужна отдельно от аннотированной: только у неё есть
   .omit()/.partial() для схемы частичного обновления. */
const programObjectSchema = z.object({
  id: z.string().min(1).max(80),
  university: z.string().min(1).max(200),
  universityShort: z.string().min(1).max(60),
  country: countrySchema,
  city: z.string().min(1).max(120),
  program: z.string().min(1).max(200),
  field: fieldSchema,
  secondaryFields: z.array(fieldSchema).max(6),
  degree: z.literal("bachelor"),
  instructionLanguage: z.array(languageSchema).min(1).max(4),
  durationYears: z.number().min(0.5).max(10),
  requirements: requirementsSchema,
  costs: costsSchema,
  applicationDeadlineMonth: z.number().int().min(1).max(12),
  applicationDeadlineNote: z.string().max(300),
  intakeMonth: z.number().int().min(1).max(12),
  campusSize: z.enum(["big", "compact"]),
  dormGuaranteed: z.boolean(),
  reputationBand: z.enum(["global-top", "strong", "regional"]),
  highlights: z.array(z.string().max(200)).max(8),
  /* Источник и пометка достоверности обязательны и здесь, и в схеме БД:
     программа без прослеживаемого происхождения в каталог не попадает. */
  source: sourceSchema,
  dataConfidence: z.enum(["verified", "demo"]),
});

/** Аннотация типом домена: схема и Program не смогут разойтись незаметно. */
export const programSchema: z.ZodType<Program> = programObjectSchema;

export const programListSchema = z.array(programSchema);

/** Тело POST /api/programs — полная запись. */
export const programCreateSchema = programObjectSchema;

/**
 * Тело PATCH /api/programs/[id] — частичное обновление.
 * `id` править нельзя: на него завязаны shortlist и activeProgramId
 * в сохранённых маршрутах пользователей.
 */
export const programPatchSchema = programObjectSchema
  .omit({ id: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Пустое обновление: нужно хотя бы одно поле",
  });

export type ProgramPatch = z.infer<typeof programPatchSchema>;

/**
 * Разбирает запись каталога, не бросая исключение.
 * Возвращает null и пишет причину — вызывающий решает, пропустить запись
 * или деградировать в статический срез целиком.
 */
export function parseProgram(input: unknown): Program | null {
  const result = programSchema.safeParse(input);
  if (result.success) return result.data;

  const first = result.error.issues[0];
  const id =
    typeof input === "object" && input !== null && "id" in input
      ? String((input as { id: unknown }).id)
      : "<без id>";
  console.warn(
    `[bagyt/catalog] запись ${id} отброшена: ${first?.path.join(".")} — ${first?.message}`,
  );
  return null;
}
