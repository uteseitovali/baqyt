import { z } from "zod";
import { completeStructured } from "./client";
import type { Diagnosis, MatchResult, Profile } from "@/lib/domain/types";
import { FIELDS, COUNTRIES, TRACKS } from "@/lib/domain/taxonomy";

/* ============================================================================
   ОБОГАЩЕНИЕ ТЕКСТОВ ЧЕРЕЗ LLM

   Что LLM НЕ делает:
     • не решает, какой университет выше в выдаче;
     • не придумывает баллы, стоимость и дедлайны;
     • не создаёт список сильных сторон и пробелов.

   Что LLM делает:
     • переписывает готовый разбор человеческим языком;
     • формулирует «почему подходит» связной фразой вместо перечня фактов.

   Любой сбой возвращает исходный детерминированный текст.
   ========================================================================= */

const SYSTEM = `Ты — редактор консультанта по поступлению. Тебе дают ГОТОВЫЙ разбор профиля абитуриента, посчитанный правилами.

Твоя задача — переписать формулировки живым, спокойным русским языком для школьника 15-18 лет.

СТРОГИЕ ЗАПРЕТЫ:
- не добавляй НИ ОДНОЙ новой цифры, даты, названия университета или требования, которых нет во входных данных;
- не обещай поступление, не оценивай шансы в процентах, не используй слова «гарантированно», «точно поступишь»;
- не меняй смысл: если во входных данных написано, что чего-то не хватает, это должно остаться в тексте;
- не используй канцелярит и маркетинговые восклицания.

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.`;

/* ——— Диагностика ————————————————————————————————————————————————— */

const diagnosisSchema = z.object({
  headline: z.string().min(10).max(160),
  summary: z.string().min(60).max(700),
  goal: z.string().min(20).max(300),
});

function describeProfile(profile: Profile): string {
  const fields = profile.preferences.fields.map((f) => FIELDS[f].label).join(", ");
  const countries = profile.preferences.countries
    .map((c) => COUNTRIES[c].label)
    .join(", ");
  const a = profile.academics;
  const l = profile.languages;

  return [
    `Класс: ${profile.grade}`,
    `Учебный трек: ${TRACKS[profile.track].label}`,
    `Год поступления: ${profile.intakeYear}`,
    `Успеваемость: ${a.gpaBand}`,
    a.predictedIB ? `Предсказанные IB: ${a.predictedIB}` : null,
    a.entScore ? `ЕНТ: ${a.entScore}` : null,
    a.satScore ? `SAT: ${a.satScore}` : null,
    a.strongSubjects.length ? `Сильные предметы: ${a.strongSubjects.join(", ")}` : null,
    l.ielts ? `IELTS: ${l.ielts}` : l.toefl ? `TOEFL: ${l.toefl}` : "Языкового теста нет",
    `Английский (самооценка): ${l.englishSelf}`,
    `Бюджет на обучение: до ${profile.budget.annualTuitionUSD} USD в год`,
    `Стипендия критична: ${profile.budget.needsFunding ? "да" : "нет"}`,
    `Направления: ${fields || "не выбраны"}`,
    `Страны: ${countries || "не выбраны"}`,
    profile.note ? `Своими словами: ${profile.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Переписывает headline/summary/goal. Списки strengths и gaps не трогает. */
export async function enrichDiagnosis(
  profile: Profile,
  base: Diagnosis,
): Promise<Diagnosis> {
  const user = `АНКЕТА АБИТУРИЕНТА:
${describeProfile(profile)}

ГОТОВЫЙ РАЗБОР (посчитан правилами, смысл менять нельзя):
headline: ${base.headline}
summary: ${base.summary}
goal: ${base.goal}
сильные стороны: ${base.strengths.map((s) => s.title).join("; ")}
пробелы: ${base.gaps.map((g) => g.title).join("; ")}

Перепиши headline, summary и goal живым языком, обращаясь к абитуриенту на «вы».
headline — одно предложение до 120 символов.
summary — 3-5 предложений: где человек сейчас и что это значит для подбора.
goal — одно-два предложения о цели поступления.

Формат ответа: {"headline": "...", "summary": "...", "goal": "..."}`;

  const outcome = await completeStructured({
    system: SYSTEM,
    user,
    schema: diagnosisSchema,
    temperature: 0.5,
    maxTokens: 700,
  });

  if (!outcome.ok) return base;

  return {
    ...base,
    headline: outcome.data.headline,
    summary: outcome.data.summary,
    goal: outcome.data.goal,
    generatedBy: "llm",
  };
}

/* ——— Объяснения рекомендаций ————————————————————————————————————— */

const explanationsSchema = z.object({
  items: z
    .array(
      z.object({
        programId: z.string(),
        why: z.string().min(30).max(420),
      }),
    )
    .min(1),
});

export interface MatchExplanation {
  programId: string;
  why: string;
}

/**
 * Собирает по одному связному абзацу «почему подходит» на каждую программу.
 * На вход LLM получает только уже посчитанные факторы — выдумать новое не из чего.
 */
export async function enrichMatchExplanations(
  profile: Profile,
  matches: MatchResult[],
): Promise<Record<string, string>> {
  if (matches.length === 0) return {};

  const payload = matches
    .map((m) => {
      const factors = m.factors
        .map((f) => `  - ${f.label} (${f.status}): ${f.detail}`)
        .join("\n");
      return `programId: ${m.program.id}
университет: ${m.program.universityShort}, ${m.program.city}
программа: ${m.program.program}
полоса: ${m.band}
факторы:
${factors}
на что обратить внимание: ${m.watchouts.join(" ") || "нет"}`;
    })
    .join("\n\n");

  const user = `АНКЕТА:
${describeProfile(profile)}

РАССЧИТАННЫЕ СОВПАДЕНИЯ:
${payload}

Для каждой программы напиши абзац из 2-3 предложений: почему она подходит именно этому абитуриенту и что стоит учесть. Опирайся ТОЛЬКО на перечисленные факторы. Если фактор помечен weak, честно скажи об этом.

Формат: {"items": [{"programId": "...", "why": "..."}]}`;

  const outcome = await completeStructured({
    system: SYSTEM,
    user,
    schema: explanationsSchema,
    temperature: 0.45,
    maxTokens: 1200,
  });

  if (!outcome.ok) return {};

  const known = new Set(matches.map((m) => m.program.id));
  const result: Record<string, string> = {};
  for (const item of outcome.data.items) {
    // Защита от галлюцинации id — берём только те, что реально запрашивали.
    if (known.has(item.programId)) result[item.programId] = item.why;
  }
  return result;
}
