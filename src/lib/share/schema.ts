import { z } from "zod";
import { BANDS, FACTOR_ORDER } from "@/lib/domain/taxonomy";
import type { AdmissionBand, FactorId } from "@/lib/domain/types";
import type { ShareableSummary } from "./summary";
import { SHARE_MAX_REASONS, SHARE_TOP_N } from "./summary";

/* ============================================================================
   СХЕМА СВОДКИ — граница доверия

   Через неё проходит всё, что пришло извне: тело POST /api/share, строка из
   базы, параметр ?d= в ссылке. Схема строгая: любой лишний ключ — отказ, а не
   «игнорируем». Иначе в сводку можно было бы дописать что угодно, и оно
   доехало бы до чужого экрана.
   ========================================================================= */

/* Словари берём из домена, а не переписываем: добавили фактор или полосу —
   схема узнаёт о них сама, и общий доступ не ломается молча (422 на валидной
   сводке). */
const factorId = z.enum(FACTOR_ORDER as [FactorId, ...FactorId[]]);
const band = z.enum(Object.keys(BANDS) as [AdmissionBand, ...AdmissionBand[]]);

const shareableProgram = z.strictObject({
  programId: z.string().min(1).max(80),
  score: z.number().min(0).max(100),
  band,
  reasons: z
    .array(factorId)
    .max(SHARE_MAX_REASONS)
    .refine((ids) => new Set(ids).size === ids.length, "причины не должны повторяться"),
});

export const shareableSchema = z.strictObject({
  v: z.literal(1),
  programs: z
    .array(shareableProgram)
    .min(1)
    .max(SHARE_TOP_N)
    .refine(
      (items) => new Set(items.map((p) => p.programId)).size === items.length,
      "программы не должны повторяться",
    ),
});

/** Возвращаемый тип заставляет компилятор сверять схему с ShareableSummary. */
export function parseShareable(input: unknown): ShareableSummary | null {
  const parsed = shareableSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
