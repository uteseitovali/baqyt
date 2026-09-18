import { z } from "zod";
import { completeStructured } from "./client";
import type {
  Diagnosis,
  MatchResult,
  Profile,
  RealityCheckFinding,
} from "@/lib/domain/types";
import { FIELDS, COUNTRIES, TRACKS } from "@/lib/domain/taxonomy";

/* ============================================================================
   ОБОГАЩЕНИЕ ТЕКСТОВ ЧЕРЕЗ LLM

   Что LLM НЕ делает:
     • не решает, какой университет выше в выдаче;
     • не придумывает баллы, стоимость и дедлайны;
     • не создаёт список сильных сторон и пробелов;
     • не добавляет, не убирает и не подменяет варианты в проверке реальности.

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

async function rewriteNarrative(
  profile: Profile,
  base: Diagnosis,
): Promise<{ headline: string; summary: string; goal: string } | null> {
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

  return outcome.ok ? outcome.data : null;
}

/* ——— Проверка реальности ————————————————————————————————————————— */

/**
 * Схема ответа на переписывание находок. Форма — та же защита, что и в
 * explanationsSchema: id приходят обратно, и всё, что не совпало с исходным
 * набором, отбрасывается уже после парсинга.
 */
const realityCheckSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        conflict: z.string().min(40).max(600),
        resolutions: z
          .array(
            z.object({
              id: z.string(),
              title: z.string().min(4).max(90),
              detail: z.string().min(25).max(400),
            }),
          )
          .min(2)
          .max(3),
      }),
    )
    .min(1),
});

export type RealityCheckRewrite = z.infer<typeof realityCheckSchema>["items"][number];

/**
 * Накладывает переписанные формулировки на детерминированные находки.
 *
 * Правило одно: LLM меняет только ТЕКСТ. Состав находок и состав вариантов
 * задаёт домен. Поэтому находка принимает переписывание, только если модель
 * вернула ровно те же id вариантов — ни одного нового, ни одного потерянного.
 * Любое отклонение откатывает эту находку к исходному тексту целиком, а не
 * частично: смешанный текст читался бы как согласованный, а он уже не он.
 *
 * Чистая функция — вся защита от галлюцинаций проверяется тестами без сети.
 */
export function applyRealityCheckRewrite(
  base: RealityCheckFinding[],
  items: RealityCheckRewrite[],
): RealityCheckFinding[] {
  const rewrites = new Map<string, RealityCheckRewrite>();
  for (const item of items) {
    // Дубль по id — тоже попытка что-то добавить: берём первое вхождение.
    if (!rewrites.has(item.id)) rewrites.set(item.id, item);
  }

  return base.map((finding) => {
    const rewrite = rewrites.get(finding.id);
    if (!rewrite) return finding;

    if (rewrite.resolutions.length !== finding.resolutions.length) return finding;

    const byId = new Map(rewrite.resolutions.map((r) => [r.id, r]));
    if (byId.size !== rewrite.resolutions.length) return finding;
    if (finding.resolutions.some((r) => !byId.has(r.id))) return finding;

    return {
      ...finding,
      conflict: rewrite.conflict,
      // Порядок и id берём из домена, от модели — только слова.
      resolutions: finding.resolutions.map((resolution) => ({
        ...resolution,
        title: byId.get(resolution.id)!.title,
        detail: byId.get(resolution.id)!.detail,
      })),
    };
  });
}

async function rewriteRealityChecks(
  findings: RealityCheckFinding[],
): Promise<RealityCheckFinding[] | null> {
  if (findings.length === 0) return null;

  const payload = findings
    .map((finding) => {
      const resolutions = finding.resolutions
        .map((r) => `  - id: ${r.id} | ${r.title}: ${r.detail}`)
        .join("\n");
      return `id: ${finding.id}
заголовок: ${finding.title}
конфликт: ${finding.conflict}
варианты:
${resolutions}`;
    })
    .join("\n\n");

  const user = `НАЙДЕННЫЕ ПРОТИВОРЕЧИЯ В АНКЕТЕ (посчитаны правилами):
${payload}

Перепиши каждое описание конфликта и каждый вариант выхода живым языком, обращаясь к абитуриенту на «вы».

ЖЁСТКИЕ РАМКИ:
- верни РОВНО те же id противоречий и РОВНО те же id вариантов, что получил;
- не добавляй новых вариантов и не выбрасывай существующие;
- не меняй суть варианта: «поднять бюджет» не может превратиться в «найти стипендию»;
- сохрани все цифры и названия предметов ровно такими, какие они во входных данных;
- не решай за абитуриента, какой вариант правильный.

Формат: {"items": [{"id": "...", "conflict": "...", "resolutions": [{"id": "...", "title": "...", "detail": "..."}]}]}`;

  const outcome = await completeStructured({
    system: SYSTEM,
    user,
    schema: realityCheckSchema,
    temperature: 0.4,
    maxTokens: 1200,
  });

  if (!outcome.ok) return null;
  return applyRealityCheckRewrite(findings, outcome.data.items);
}

/* ——— Сборка диагностики ——————————————————————————————————————————— */

/**
 * Переписывает headline/summary/goal и формулировки проверки реальности.
 * Списки strengths, gaps и СОСТАВ находок остаются детерминированными.
 * Если оба запроса к модели провалились, возвращается исходный разбор.
 */
export async function enrichDiagnosis(
  profile: Profile,
  base: Diagnosis,
): Promise<Diagnosis> {
  const [narrative, realityChecks] = await Promise.all([
    rewriteNarrative(profile, base),
    rewriteRealityChecks(base.realityChecks),
  ]);

  if (!narrative && !realityChecks) return base;

  return {
    ...base,
    headline: narrative?.headline ?? base.headline,
    summary: narrative?.summary ?? base.summary,
    goal: narrative?.goal ?? base.goal,
    realityChecks: realityChecks ?? base.realityChecks,
    // Честность важнее аккуратности ярлыка: если хоть один текст на экране
    // написан моделью, интерфейс обязан это показать.
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
