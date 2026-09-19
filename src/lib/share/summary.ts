import type {
  AdmissionBand,
  FactorId,
  MatchResult,
  Program,
} from "@/lib/domain/types";

/* ============================================================================
   СВОДКА ДЛЯ СЕМЬИ

   Что уходит наружу — решает эта функция, и решает по белому списку: номер
   программы, оценка, полоса и до двух «причин». Причина — это ИДЕНТИФИКАТОР
   фактора, а не его текст.

   Почему не match.reasons. Это копии FactorScore.detail, а те собирают строки
   прямо из анкеты: «ЕНТ 137 против ориентира…», «IELTS 7.5 перекрывает…»,
   «при вашем потолке $23 456». Отдать их семье — значит отдать анкету по
   кусочкам, хотя бы «полная анкета» формально и не передавалась. Поэтому
   формулировки живут в REASON_LINES, без цифр, а в сводке лежит только ключ.

   Побочный выигрыш: словарь закрытый. Сервер и декодер ссылки могут отвергнуть
   всё, что в него не входит, — а значит по публичному адресу нельзя разместить
   произвольный текст или ссылку.
   ========================================================================= */

export const SHARE_TOP_N = 3;
export const SHARE_MAX_REASONS = 2;

export interface ShareableProgram {
  /** Ключ в каталоге. Название, вуз и страну берём из каталога при показе. */
  programId: string;
  /** 0..100, как в карточке. */
  score: number;
  band: AdmissionBand;
  /** Сильнейшие факторы, максимум SHARE_MAX_REASONS. Пусто — сильных нет. */
  reasons: FactorId[];
}

export interface ShareableSummary {
  /** Версия формата: ссылки живут 30 дней, а форму мы можем поменять раньше. */
  v: 1;
  programs: ShareableProgram[];
}

/** Формулировки для семьи. Ни одной цифры и ни одного значения из анкеты. */
export const REASON_LINES: Record<FactorId, string> = {
  field: "Направление программы совпадает с тем, что выбрал абитуриент.",
  academic: "Успеваемость и результаты экзаменов соответствуют ориентирам программы.",
  budget: "Стоимость укладывается в заявленный бюджет.",
  language: "Уровень языка достаточен для обучения на этой программе.",
  geography: "Страна подходит под пожелания абитуриента.",
  timeline: "Сроки подготовки к подаче выглядят реалистичными.",
  lifestyle: "Условия — общежитие и формат кампуса — подходят.",
};

/** Показываем, когда сильных факторов нет: молчание выглядело бы как ошибка. */
export const FALLBACK_REASON_LINE = "Сильных совпадений мало — это запасной вариант.";

/**
 * Сводит список совпадений к безопасной сводке.
 *
 * Ждёт список в порядке ранжирования (как отдаёт rankPrograms) и берёт
 * первые SHARE_TOP_N программ БЕЗ жёстких несовпадений: программу с блокером
 * нельзя показывать в «лучших», не показав блокер, а блокеры наружу не идут.
 *
 * Чистая функция: не читает время, не читает окружение, не меняет вход.
 */
export function buildShareable(matches: MatchResult[]): ShareableSummary {
  const programs: ShareableProgram[] = [];

  for (const match of matches) {
    if (programs.length >= SHARE_TOP_N) break;
    if (match.blockers.length > 0) continue;

    programs.push({
      programId: match.program.id,
      score: Math.min(100, Math.max(0, Math.round(match.score * 10) / 10)),
      band: match.band,
      reasons: strongestFactors(match),
    });
  }

  return { v: 1, programs };
}

/** Тот же отбор, что в scoreProgram: сильные факторы по вкладу в итог. */
function strongestFactors(match: MatchResult): FactorId[] {
  return match.factors
    .filter((f) => f.status === "strong")
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, SHARE_MAX_REASONS)
    .map((f) => f.id);
}

export interface ResolvedShareProgram extends ShareableProgram {
  program: Program;
}

/**
 * Достаёт из каталога то, что показываем рядом со сводкой.
 *
 * Название, вуз и город берутся ТОЛЬКО из каталога, не из сводки: иначе
 * подделанная ссылка показала бы под нашим именем любой текст. Программа,
 * которой в каталоге уже нет, отбрасывается и считается в dropped — страница
 * честно скажет, что часть сводки недоступна.
 */
export function resolveShareable(
  summary: ShareableSummary,
  catalog: Program[],
): { items: ResolvedShareProgram[]; dropped: number } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const items: ResolvedShareProgram[] = [];

  for (const entry of summary.programs) {
    const program = byId.get(entry.programId);
    if (program) items.push({ ...entry, program });
  }

  return { items, dropped: summary.programs.length - items.length };
}
