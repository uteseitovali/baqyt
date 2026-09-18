import { FACTOR_META, FACTOR_ORDER, FIELDS, GRANT_LIKELIHOOD } from "./taxonomy";
import type {
  AdmissionBand,
  FactorId,
  FactorScore,
  FactorStatus,
  GrantLikelihood,
  GrantOutlook,
  MatchResult,
  Profile,
  Program,
} from "./types";

/* ============================================================================
   ДВИЖОК ПОДБОРА

   Принцип: ранжирование детерминированное и объяснимое. LLM не решает, какой
   университет лучше — он только переписывает готовое объяснение человеческим
   языком. Благодаря этому:
     • изменение любого ответа в анкете мгновенно и предсказуемо меняет выдачу;
     • каждую цифру в интерфейсе можно проследить до конкретного правила;
     • демо не зависит от доступности внешнего API.
   ========================================================================= */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function statusOf(score: number): FactorStatus {
  if (score >= 0.72) return "strong";
  if (score >= 0.45) return "ok";
  return "weak";
}

function fmtUSD(n: number): string {
  return `$${n.toLocaleString("ru-RU")}`;
}

/* ——— Фактор 1: направление ———————————————————————————————————————— */

function scoreField(profile: Profile, program: Program) {
  const wanted = profile.preferences.fields;
  if (wanted.length === 0) {
    return {
      score: 0.5,
      detail: "Направления не выбраны — оцениваем нейтрально.",
    };
  }
  if (wanted.includes(program.field)) {
    const label = FIELDS[program.field].label;
    return {
      score: 1,
      detail: `Профильное направление «${label}» — ровно то, что вы выбрали.`,
    };
  }
  const secondary = program.secondaryFields.filter((f) => wanted.includes(f));
  if (secondary.length > 0) {
    const label = FIELDS[secondary[0]].label;
    return {
      score: 0.7,
      detail: `Программа смежная с «${label}»: часть курсов пересекается с вашим интересом.`,
    };
  }
  return {
    score: 0.14,
    detail: `Направление «${FIELDS[program.field].label}» не входит в выбранные вами.`,
  };
}

/* ——— Фактор 2: академика ————————————————————————————————————————— */

const GPA_BASE: Record<Profile["academics"]["gpaBand"], number> = {
  top: 0.9,
  high: 0.74,
  mid: 0.54,
  developing: 0.34,
  unknown: 0.5,
};

/** Отношение «мой балл / требуемый балл» → нормализованная оценка. */
function ratioToScore(ratio: number): number {
  if (ratio >= 1.12) return 1;
  if (ratio >= 1.0) return 0.86;
  if (ratio >= 0.94) return 0.66;
  if (ratio >= 0.86) return 0.44;
  if (ratio >= 0.78) return 0.26;
  return 0.12;
}

function scoreAcademic(profile: Profile, program: Program) {
  const req = program.requirements;
  const a = profile.academics;

  // Берём наиболее релевантную пару «мой балл ↔ требование программы».
  if (req.ibPoints && a.predictedIB) {
    const score = ratioToScore(a.predictedIB / req.ibPoints);
    const delta = a.predictedIB - req.ibPoints;
    const sign = delta >= 0 ? `+${delta}` : `${delta}`;
    return {
      score,
      detail: `Ваши предсказанные ${a.predictedIB} IB против ориентира ${req.ibPoints} (${sign}).`,
    };
  }

  if (req.entScore && a.entScore) {
    const score = ratioToScore(a.entScore / req.entScore);
    const delta = a.entScore - req.entScore;
    return {
      score,
      detail: `ЕНТ ${a.entScore} против ориентира ${req.entScore} (${
        delta >= 0 ? "+" : ""
      }${delta}).`,
    };
  }

  if (req.satScore && a.satScore) {
    const score = ratioToScore(a.satScore / req.satScore);
    return {
      score,
      detail: `SAT ${a.satScore} против ориентира ${req.satScore}.`,
    };
  }

  // Требований в опубликованном виде нет или у пользователя нет этого теста —
  // опираемся на успеваемость и поправку на известность вуза.
  const base = GPA_BASE[a.gpaBand];
  const penalty =
    program.reputationBand === "global-top"
      ? 0.22
      : program.reputationBand === "strong"
        ? 0.08
        : 0;
  const score = clamp01(base - penalty);
  const missing = req.ibPoints
    ? "предсказанных баллов IB"
    : req.entScore
      ? "балла ЕНТ"
      : req.satScore
        ? "балла SAT"
        : "профильного теста";
  return {
    score,
    detail: `Считаем по успеваемости: точного ${missing} пока нет, добавьте его — оценка уточнится.`,
  };
}

/* ——— Фактор 3: бюджет ——————————————————————————————————————————— */

/**
 * Запас над порогом, после которого допуск перестаёт быть спорным.
 * Десять баллов из 140 — примерно один сильный профильный вопрос: меньше
 * этого называть допуск надёжным нечестно.
 */
const GRANT_COMFORT_GAP = 10;

function grantLikelihood(gap: number): GrantLikelihood {
  if (gap < 0) return "unlikely";
  return gap < GRANT_COMFORT_GAP ? "competitive" : "reliable";
}

/**
 * Сравнивает балл ЕНТ абитуриента с пороговым баллом грантового конкурса.
 *
 * Возвращает null там, где сравнивать нечего: у программы нет грантового
 * трека или в анкете нет балла ЕНТ. Молчание честнее, чем вывод из пустоты.
 */
function grantOutlook(profile: Profile, program: Program): GrantOutlook | null {
  const grant = program.costs.grant;
  const entScore = profile.academics.entScore;
  if (program.country !== "KZ" || !grant || entScore === undefined) return null;

  const gap = entScore - grant.entThreshold;
  const likelihood = grantLikelihood(gap);

  return {
    entThreshold: grant.entThreshold,
    entScore,
    gap,
    likelihood,
    note: GRANT_LIKELIHOOD[likelihood].description,
  };
}

function scoreBudget(profile: Profile, program: Program) {
  const cap = profile.budget.annualTuitionUSD + profile.budget.livingCoveredUSD;
  const cost = program.costs.tuitionUSDPerYear + program.costs.livingUSDPerYear;
  const grant = program.costs.grant;
  const outlook = grantOutlook(profile, program);

  if (cost === 0) {
    return {
      score: 1,
      detail: "Программа бесплатная при поступлении на грант.",
      grant: outlook ?? undefined,
    };
  }

  const ratio = cap / cost;
  let score =
    ratio >= 1.3
      ? 1
      : ratio >= 1.0
        ? 0.85
        : ratio >= 0.8
          ? 0.58
          : ratio >= 0.6
            ? 0.34
            : 0.1;

  let detail = `Год обучения и жизни ≈ ${fmtUSD(cost)} при вашем потолке ${fmtUSD(cap)}.`;

  if (profile.budget.needsFunding) {
    if (program.costs.fundingAvailable) {
      score = clamp01(score + 0.2);
      detail += " Программа публикует стипендии — итог может быть ниже.";
    } else {
      score = clamp01(score * 0.55);
      detail += " Вам нужна стипендия, а у программы она не заявлена.";
    }
  }

  /* Грант — не восьмой фактор, а второй способ оплатить тот же год, поэтому
     живёт внутри бюджета. На оценку он влияет только когда допуск реален:
     иначе обещанная «бесплатность» перевесила бы настоящую стоимость. */
  if (grant) {
    if (outlook) {
      detail += ` Грант: ЕНТ ${outlook.entScore} против порога ${outlook.entThreshold} — ${GRANT_LIKELIHOOD[outlook.likelihood].label}.`;
      if (outlook.likelihood === "reliable") score = clamp01(score + 0.15);
      else if (outlook.likelihood === "competitive") score = clamp01(score + 0.07);
    } else {
      detail += ` Есть грантовый конкурс, порог ЕНТ — ${grant.entThreshold}; укажите свой балл, чтобы увидеть допуск.`;
    }
  }

  return { score, detail, grant: outlook ?? undefined };
}

/* ——— Фактор 4: язык ————————————————————————————————————————————— */

const SELF_LEVEL: Record<Profile["languages"]["englishSelf"], number> = {
  advanced: 0.58,
  intermediate: 0.38,
  basic: 0.18,
  none: 0.04,
};

function scoreLanguage(profile: Profile, program: Program) {
  const lang = profile.languages;

  // Локальные языки: если обучение на русском/казахском и человек им владеет —
  // языкового барьера нет.
  const localOk =
    (program.instructionLanguage.includes("ru") && lang.russian === "fluent") ||
    (program.instructionLanguage.includes("kk") && lang.kazakh === "fluent");

  if (localOk && !program.requirements.ielts) {
    return {
      score: 1,
      detail: "Обучение на языке, которым вы владеете свободно — тест не нужен.",
    };
  }

  const required = program.requirements.ielts;
  if (!required) {
    return {
      score: 0.8,
      detail: "Отдельного языкового порога программа не публикует.",
    };
  }

  // Приблизительный перевод TOEFL iBT → IELTS для сравнения с порогом.
  const asIelts =
    lang.ielts ??
    (lang.toefl
      ? lang.toefl >= 100
        ? 7.5
        : lang.toefl >= 87
          ? 7
          : lang.toefl >= 72
            ? 6.5
            : lang.toefl >= 60
              ? 6
              : 5.5
      : undefined);

  if (asIelts === undefined) {
    return {
      score: SELF_LEVEL[lang.englishSelf],
      detail: `Нужен IELTS ${required}, официального результата пока нет — это обязательный шаг плана.`,
    };
  }

  const gap = asIelts - required;
  const score =
    gap >= 0.5 ? 1 : gap >= 0 ? 0.88 : gap >= -0.5 ? 0.62 : gap >= -1 ? 0.36 : 0.14;

  return {
    score,
    detail:
      gap >= 0
        ? `IELTS ${asIelts} перекрывает требование ${required}.`
        : `IELTS ${asIelts} против требуемых ${required} — не хватает ${Math.abs(gap).toFixed(1)}.`,
  };
}

/* ——— Фактор 5: география ———————————————————————————————————————— */

function scoreGeography(profile: Profile, program: Program) {
  const wanted = profile.preferences.countries;
  const inList = wanted.includes(program.country);

  if (profile.preferences.preferCloseToHome && program.country === "KZ") {
    return { score: 1, detail: "Казахстан — вы отметили, что хотите быть ближе к дому." };
  }
  if (profile.preferences.preferCloseToHome && program.country !== "KZ") {
    return {
      score: inList ? 0.5 : 0.15,
      detail: inList
        ? "Страна в вашем списке, но вы предпочитаете оставаться ближе к дому."
        : "Переезд далеко от дома при вашем предпочтении остаться рядом.",
    };
  }
  if (wanted.length === 0) {
    return { score: 0.6, detail: "Страны не выбраны — оцениваем нейтрально." };
  }
  return inList
    ? { score: 1, detail: "Страна входит в выбранные вами." }
    : { score: 0.18, detail: "Страна не входит в выбранные вами." };
}

/* ——— Фактор 6: сроки ———————————————————————————————————————————— */

/** Сколько месяцев подготовки требует профиль под конкретную программу. */
export function estimatePrepMonths(profile: Profile, program: Program): number {
  let months = 1; // документы и подача
  const needsIelts = Boolean(program.requirements.ielts);
  const hasIelts = Boolean(profile.languages.ielts || profile.languages.toefl);
  if (needsIelts && !hasIelts) months += 3;
  if (program.requirements.satScore && !profile.academics.satScore) months += 3;
  if (program.requirements.entScore && !profile.academics.entScore) months += 2;
  if (program.country !== "KZ") months += 1; // виза и легализация документов
  return months;
}

export function monthsUntilDeadline(
  program: Program,
  intakeYear: number,
  from = new Date(),
): number {
  // Дедлайн подачи обычно в учебном году, предшествующем зачислению.
  const deadlineYear =
    program.applicationDeadlineMonth > program.intakeMonth
      ? intakeYear - 1
      : intakeYear;
  const deadline = new Date(deadlineYear, program.applicationDeadlineMonth - 1, 15);
  const diff =
    (deadline.getFullYear() - from.getFullYear()) * 12 +
    (deadline.getMonth() - from.getMonth());
  return diff;
}

function scoreTimeline(profile: Profile, program: Program) {
  const need = estimatePrepMonths(profile, program);
  const have = monthsUntilDeadline(program, profile.intakeYear);

  if (have < 0) {
    return {
      score: 0.1,
      detail: `Дедлайн набора ${profile.intakeYear} года уже позади — смотрите следующий цикл.`,
    };
  }
  const score =
    have >= need + 3
      ? 1
      : have >= need
        ? 0.78
        : have >= need * 0.6
          ? 0.45
          : 0.18;

  return {
    score,
    detail: `До подачи ≈ ${have} мес., на подготовку нужно ≈ ${need} мес.`,
  };
}

/* ——— Фактор 7: условия —————————————————————————————————————————— */

function scoreLifestyle(profile: Profile, program: Program) {
  let score = 0.65;
  const notes: string[] = [];

  if (profile.preferences.needsDorm) {
    if (program.dormGuaranteed) {
      score += 0.3;
      notes.push("общежитие гарантировано первокурсникам");
    } else {
      score -= 0.3;
      notes.push("общежитие не гарантировано");
    }
  }

  const pref = profile.preferences.campusPreference;
  if (pref !== "any") {
    if (pref === program.campusSize) {
      score += 0.15;
      notes.push(pref === "big" ? "большой кампус" : "компактный кампус");
    } else {
      score -= 0.1;
      notes.push("формат кампуса отличается от предпочтения");
    }
  }

  return {
    score: clamp01(score),
    detail: notes.length ? notes.join(", ") + "." : "Базовые условия без особенностей.",
  };
}

/* ——— Сборка результата —————————————————————————————————————————— */

const CALCULATORS: Record<
  FactorId,
  (
    p: Profile,
    pr: Program,
  ) => { score: number; detail: string; grant?: GrantOutlook }
> = {
  field: scoreField,
  academic: scoreAcademic,
  budget: scoreBudget,
  language: scoreLanguage,
  geography: scoreGeography,
  timeline: scoreTimeline,
  lifestyle: scoreLifestyle,
};

function decideBand(
  academic: number,
  total: number,
  program: Program,
): AdmissionBand {
  const hard = program.reputationBand === "global-top";
  const threshold = hard ? 0.92 : program.reputationBand === "strong" ? 0.84 : 0.78;

  if (academic >= threshold && total >= 62) return "safe";
  if (academic >= threshold - 0.26) return "target";
  return "reach";
}

function collectBlockers(profile: Profile, program: Program): string[] {
  const blockers: string[] = [];

  const cost =
    program.costs.tuitionUSDPerYear + program.costs.livingUSDPerYear;
  const cap = profile.budget.annualTuitionUSD + profile.budget.livingCoveredUSD;
  if (cost > cap * 2.5 && !program.costs.fundingAvailable) {
    blockers.push(
      `Стоимость ${fmtUSD(cost)} в год более чем вдвое превышает ваш потолок, стипендии не заявлены.`,
    );
  }

  const onlyEnglish =
    program.instructionLanguage.length === 1 &&
    program.instructionLanguage[0] === "en";
  if (onlyEnglish && profile.languages.englishSelf === "none" && !profile.languages.ielts) {
    blockers.push("Обучение только на английском, а уровень указан как нулевой.");
  }

  if (monthsUntilDeadline(program, profile.intakeYear) < 0) {
    blockers.push(`Приём на ${profile.intakeYear} год уже закрыт.`);
  }

  return blockers;
}

/** Считает полный разбор одной программы под профиль. */
export function scoreProgram(profile: Profile, program: Program): MatchResult {
  const factors: FactorScore[] = FACTOR_ORDER.map((id) => {
    const meta = FACTOR_META[id];
    const { score, detail, grant } = CALCULATORS[id](profile, program);
    const normalized = clamp01(score);
    return {
      id,
      label: meta.label,
      score: normalized,
      weight: meta.weight,
      status: statusOf(normalized),
      detail,
      grant,
    };
  });

  const total = factors.reduce((sum, f) => sum + f.score * f.weight, 0) * 100;
  const academic = factors.find((f) => f.id === "academic")!.score;
  const blockers = collectBlockers(profile, program);

  // «Почему подходит» — сильные факторы, отсортированные по вкладу в итог.
  const reasons = factors
    .filter((f) => f.status === "strong")
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((f) => f.detail);

  const watchouts = factors
    .filter((f) => f.status === "weak")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((f) => f.detail);

  return {
    program,
    score: Math.round(total * 10) / 10,
    band: decideBand(academic, total, program),
    factors,
    reasons: reasons.length
      ? reasons
      : ["Сильных совпадений мало — вариант держим как запасной."],
    watchouts,
    blockers,
  };
}

export interface RankOptions {
  /** Сколько вариантов вернуть. */
  limit?: number;
  /** Прятать ли варианты с жёсткими несовпадениями. */
  hideBlocked?: boolean;
  /** Не более N программ одного университета — чтобы выдача была разнообразной. */
  maxPerUniversity?: number;
}

/** Ранжирует каталог под профиль. Чистая функция — легко тестировать. */
export function rankPrograms(
  profile: Profile,
  catalog: Program[],
  options: RankOptions = {},
): MatchResult[] {
  const { limit = 12, hideBlocked = false, maxPerUniversity = 2 } = options;

  let results = catalog.map((p) => scoreProgram(profile, p));

  if (hideBlocked) {
    results = results.filter((r) => r.blockers.length === 0);
  }

  const REPUTATION_RANK = { "global-top": 0, strong: 1, regional: 2 } as const;

  results.sort((a, b) => {
    // 1. Варианты без жёстких несовпадений всегда выше.
    if (a.blockers.length !== b.blockers.length) {
      return a.blockers.length - b.blockers.length;
    }
    // 2. Основной критерий — совпадение с профилем.
    if (b.score !== a.score) return b.score - a.score;
    // 3. При равенстве осмысленнее показать более известную программу…
    const reputation =
      REPUTATION_RANK[a.program.reputationBand] -
      REPUTATION_RANK[b.program.reputationBand];
    if (reputation !== 0) return reputation;
    // 4. …а среди равных по известности — более дешёвую.
    const costA =
      a.program.costs.tuitionUSDPerYear + a.program.costs.livingUSDPerYear;
    const costB =
      b.program.costs.tuitionUSDPerYear + b.program.costs.livingUSDPerYear;
    if (costA !== costB) return costA - costB;
    // 5. Финальный якорь: порядок не должен «плавать» между рендерами.
    return a.program.id.localeCompare(b.program.id);
  });

  const perUniversity = new Map<string, number>();
  const diversified: MatchResult[] = [];
  for (const r of results) {
    const key = r.program.university;
    const count = perUniversity.get(key) ?? 0;
    if (count >= maxPerUniversity) continue;
    perUniversity.set(key, count + 1);
    diversified.push(r);
    if (diversified.length >= limit) break;
  }

  return ensureBandCoverage(diversified, results);
}

/**
 * Гарантирует, что в выдаче есть хотя бы по одному варианту каждой полосы.
 *
 * Зачем: сильные, но дорогие программы проседают по бюджетному фактору и
 * вылетают из окна выдачи целиком. В результате абитуриент вообще не видит
 * амбициозного варианта — а подаваться только в надёжные это плохая стратегия.
 * Поэтому недостающие полосы добираются лучшими кандидатами из полного
 * ранжирования и помечаются как «добор», чтобы не ломать основной порядок.
 */
function ensureBandCoverage(
  selected: MatchResult[],
  all: MatchResult[],
): MatchResult[] {
  const bands: AdmissionBand[] = ["safe", "target", "reach"];
  const present = new Set(selected.map((r) => r.band));
  const chosen = new Set(selected.map((r) => r.program.id));
  const additions: MatchResult[] = [];

  for (const band of bands) {
    if (present.has(band)) continue;

    const pool = all.filter(
      (r) =>
        r.band === band && !chosen.has(r.program.id) && r.blockers.length === 0,
    );
    if (pool.length === 0) continue;

    // Сначала пробуем страну, которую человек сам выбрал: добор не должен
    // подсовывать вариант в стране, которую абитуриент не рассматривает.
    const inChosenCountry = pool.find(
      (r) => (r.factors.find((f) => f.id === "geography")?.score ?? 0) >= 0.5,
    );
    const candidate = inChosenCountry ?? pool[0];

    additions.push(candidate);
    chosen.add(candidate.program.id);
  }

  return [...selected, ...additions];
}

/**
 * Подбирает сбалансированный набор: надёжный + целевой + амбициозный.
 * Это то, что реально советуют консультанты по поступлению.
 */
export function balancedShortlist(results: MatchResult[]): MatchResult[] {
  const picked: MatchResult[] = [];
  const bands: AdmissionBand[] = ["safe", "target", "reach"];
  for (const band of bands) {
    const found = results.find(
      (r) => r.band === band && !picked.includes(r) && r.blockers.length === 0,
    );
    if (found) picked.push(found);
  }
  for (const r of results) {
    if (picked.length >= 3) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.slice(0, 3);
}
