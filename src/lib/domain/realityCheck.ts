import { COUNTRIES, FIELDS, FIELD_IDS } from "./taxonomy";
import type {
  CountryId,
  FieldId,
  Profile,
  RealityCheckFinding,
  RealityCheckResolution,
} from "./types";

/* ============================================================================
   ПРОВЕРКА РЕАЛЬНОСТИ (детерминированные правила)

   Диагностика отвечает на вопрос «что у меня есть и чего не хватает».
   Здесь другой вопрос: «не спорят ли мои собственные ответы друг с другом».

   Пробел — это отсутствие (нет IELTS). Конфликт — это расхождение: человек
   заявляет одно, а его же вводные тянут в другую сторону. Такие вещи обычно
   говорит живой консультант, и именно их продукт обязан сказать до того, как
   покажет список университетов.

   Правила заданы явной таблицей: каждое правило — чистая функция профиля,
   которая либо возвращает находку, либо null. Никакого LLM: AI-слой поверх
   может только переписать формулировки, но не изменить состав находок.
   ========================================================================= */

/** Больше трёх конфликтов за раз человек не разбирает — остальное уйдёт в шум. */
const MAX_FINDINGS = 3;

/* ——— Справочник: какой предмет на какие направления работает ————————
   Ключ — корень слова, чтобы «Математика», «математика (профиль)» и
   «Высшая математика» попадали в одно правило. Список сознательно широкий:
   задача — не угадать направление, а поймать случай, когда НИ ОДИН выбранный
   предмет не работает на заявленное направление.
   —————————————————————————————————————————————————————————————————————— */

const SUBJECT_FIELDS: { root: string; fields: FieldId[] }[] = [
  { root: "математик", fields: ["cs", "engineering", "economics", "natural-sciences"] },
  { root: "информатик", fields: ["cs"] },
  { root: "программир", fields: ["cs"] },
  { root: "физик", fields: ["engineering", "natural-sciences", "cs"] },
  { root: "хими", fields: ["natural-sciences", "medicine", "engineering"] },
  { root: "биолог", fields: ["medicine", "natural-sciences"] },
  { root: "эконом", fields: ["economics", "business"] },
  { root: "общество", fields: ["social-sciences", "law"] },
  { root: "истори", fields: ["social-sciences", "law", "education"] },
  { root: "право", fields: ["law", "social-sciences"] },
  { root: "географ", fields: ["natural-sciences", "social-sciences"] },
  { root: "литератур", fields: ["media", "education", "social-sciences"] },
  { root: "английск", fields: ["media", "education", "social-sciences"] },
  { root: "язык", fields: ["media", "education"] },
  { root: "психолог", fields: ["social-sciences", "medicine"] },
  { root: "искусств", fields: ["design", "media"] },
  { root: "рисован", fields: ["design"] },
  { root: "черчен", fields: ["design", "engineering"] },
];

/* ——— Справочник: нижняя граница стоимости года ————————————————————
   Значения взяты из каталога Bagyt (минимальная опубликованная стоимость
   обучения по направлению и по стране). Это не утверждение о мире, а факт
   о том, что продукт реально может предложить, — поэтому и формулировки
   в находках говорят «в каталоге», а не «в мире».
   —————————————————————————————————————————————————————————————————————— */

const FIELD_TUITION_FLOOR_USD: Partial<Record<FieldId, number>> = {
  cs: 3800,
  // Ноль — не опечатка: по инженерии в каталоге есть полностью покрытые
  // варианты, поэтому по бюджету к ней не придраться.
  engineering: 0,
  business: 6000,
  economics: 3600,
  law: 6800,
  medicine: 3400,
  "natural-sciences": 2600,
  "social-sciences": 11000,
  design: 20000,
  media: 7000,
};

const COUNTRY_TUITION_FLOOR_USD: Record<CountryId, number> = {
  KZ: 2600,
  GB: 30000,
  TR: 8000,
  AE: 0,
  KR: 3000,
  NL: 11000,
  CZ: 5500,
  PL: 4500,
  HK: 20000,
  MY: 7000,
};

const ENGLISH_SELF_WORDS: Record<Profile["languages"]["englishSelf"], string> = {
  none: "почти нет",
  basic: "базовый",
  intermediate: "средний",
  advanced: "продвинутый",
};

/* ——— Вспомогательное ————————————————————————————————————————————— */

function usd(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} $`;
}

function normalizeSubject(raw: string): string {
  return raw.toLowerCase().replace(/ё/g, "е").trim();
}

function fieldsForSubject(raw: string): FieldId[] {
  const normalized = normalizeSubject(raw);
  const out = new Set<FieldId>();
  for (const entry of SUBJECT_FIELDS) {
    if (normalized.includes(entry.root)) entry.fields.forEach((f) => out.add(f));
  }
  return [...out];
}

function fieldLabels(fields: FieldId[]): string {
  return fields.map((f) => FIELDS[f].label).join(", ");
}

function countryLabels(countries: CountryId[]): string {
  return countries.map((c) => COUNTRIES[c].label).join(", ");
}

/* ——— Правила ————————————————————————————————————————————————————— */

interface RealityCheckRule {
  id: RealityCheckFinding["id"];
  detect: (profile: Profile) => RealityCheckFinding | null;
}

/**
 * Направление против сильных предметов.
 * Срабатывает только когда предметы понятны и НИ ОДИН из них не работает на
 * выбранное направление, зато минимум два тянут в одно и то же другое.
 */
function detectFieldVsSubjects(profile: Profile): RealityCheckFinding | null {
  const { fields } = profile.preferences;
  const subjects = profile.academics.strongSubjects;
  if (fields.length === 0) return null;

  const recognized = subjects.filter((s) => fieldsForSubject(s).length > 0);
  if (recognized.length < 2) return null;

  const support = new Map<FieldId, number>();
  for (const subject of recognized) {
    for (const field of fieldsForSubject(subject)) {
      support.set(field, (support.get(field) ?? 0) + 1);
    }
  }

  // Хотя бы одно выбранное направление подкреплено — конфликта нет.
  if (fields.some((f) => support.has(f))) return null;

  // Альтернатива нужна уверенная: минимум два предмета за неё.
  const alternative = FIELD_IDS.filter((f) => (support.get(f) ?? 0) >= 2).sort(
    (a, b) => (support.get(b) ?? 0) - (support.get(a) ?? 0),
  )[0];
  if (!alternative) return null;

  const chosen = FIELDS[fields[0]].label;
  const suggested = FIELDS[alternative].label;

  return {
    id: "field-vs-subjects",
    title: "Направление и сильные предметы смотрят в разные стороны",
    conflict: `В приоритете стоит ${fieldLabels(fields)}, а сильными вы назвали другие предметы: ${recognized.join(", ")}. Они работают скорее на ${suggested}. Приёмная комиссия читает анкету так же, как мы: сначала предметы, потом заявленную мотивацию.`,
    resolutions: [
      {
        id: "keep-field",
        title: `Оставить ${chosen}`,
        detail: `Тогда до подачи нужно подтвердить направление делом: профильный предмет в аттестате, курс, проект или олимпиада. Иначе мотивационное письмо будет опираться только на слова.`,
      },
      {
        id: "switch-field",
        title: `Перевести приоритет на ${suggested}`,
        detail: `Ваши текущие предметы уже работают на это направление — заявка собирается из того, что есть, без дополнительного года подготовки.`,
      },
      {
        id: "check-overlap",
        title: "Проверить стык двух направлений",
        detail: `Оставьте в анкете оба направления и посмотрите на шаге «Рекомендации», есть ли в каталоге программы, где ${chosen.toLowerCase()} соседствует с вашими предметами.`,
      },
    ],
  };
}

/** Бюджет против направления: потолок ниже самой дешёвой программы направления. */
function detectBudgetVsField(profile: Profile): RealityCheckFinding | null {
  const { fields } = profile.preferences;
  const { annualTuitionUSD, needsFunding } = profile.budget;
  if (fields.length === 0) return null;

  // Если хотя бы по одному выбранному направлению нижней границы нет,
  // утверждать что-либо о бюджете нельзя — правило молчит.
  const floors: number[] = [];
  for (const field of fields) {
    const known = FIELD_TUITION_FLOOR_USD[field];
    if (known === undefined) return null;
    floors.push(known);
  }

  const floor = Math.min(...floors);
  if (annualTuitionUSD >= floor) return null;

  const fundingResolution: RealityCheckResolution = needsFunding
    ? {
        id: "funding-only",
        title: "Оставить только программы со стипендией",
        detail:
          "Вы уже отметили, что финансирование критично. Значит список сужается до программ с фондированием, а сроки стипендиальных заявок становятся главными датами маршрута.",
      }
    : {
        id: "enable-funding",
        title: "Включить стипендиальный трек",
        detail:
          "Отметьте в анкете, что стипендия нужна: подбор начнёт отдавать приоритет программам с финансированием, а в маршрут добавятся отдельные дедлайны заявок.",
      };

  return {
    id: "budget-vs-field",
    title: "Бюджет не дотягивает до выбранного направления",
    conflict: `Самая доступная программа по направлению ${fieldLabels(fields)} стоит в каталоге ${usd(floor)} за год, а ваш потолок — ${usd(annualTuitionUSD)}. Разрыв в ${usd(floor - annualTuitionUSD)} за год не закрывается ни выбором города, ни общежитием.`,
    resolutions: [
      fundingResolution,
      {
        id: "raise-ceiling",
        title: `Поднять потолок до ${usd(floor)}`,
        detail:
          "Если такая сумма в принципе достижима вместе с семьёй, проще пересчитать бюджет сейчас, чем обнаружить разрыв после приглашения.",
      },
      {
        id: "shift-field",
        title: "Посмотреть смежные направления",
        detail:
          "У соседних направлений другой ценовой диапазон. Добавьте одно в анкету и сравните выдачу — это дешевле, чем менять решение после подачи.",
      },
    ],
  };
}

/** Английский как язык обучения против собственного уровня без теста. */
function detectLanguageVsPlan(profile: Profile): RealityCheckFinding | null {
  const { languages, preferences, intakeYear } = profile;
  const wantsEnglish = preferences.instructionLanguages.includes("en");
  const hasTest = Boolean(languages.ielts || languages.toefl);
  const weakSelf = languages.englishSelf === "none" || languages.englishSelf === "basic";
  if (!wantsEnglish || hasTest || !weakSelf) return null;

  const localLanguages = [
    languages.kazakh === "fluent" ? "казахском" : null,
    languages.russian === "fluent" ? "русском" : null,
  ].filter(Boolean) as string[];

  const fallback: RealityCheckResolution = localLanguages.length
    ? {
        id: "local-language",
        title: `Добавить программы на ${localLanguages.join(" и ")}`,
        detail:
          "Языки, которыми вы уже владеете свободно, открывают часть каталога прямо сейчас — без года на подготовку к тесту.",
      }
    : {
        id: "language-year",
        title: "Заложить языковой год",
        detail:
          "С нуля до порога англоязычного бакалавриата обычно не успевают за один сезон. Честнее спланировать отдельный год, чем сорвать подачу.",
      };

  return {
    id: "language-vs-plan",
    title: "Обучение на английском при незакрытом английском",
    conflict: `В приоритетах стоит обучение на английском, но собственная оценка уровня — «${ENGLISH_SELF_WORDS[languages.englishSelf]}», а официального теста нет. Это не просто недостающий документ: между текущим уровнем и порогом англоязычной программы лежит учебная работа, а не запись на экзамен.`,
    resolutions: [
      {
        id: "diagnostic-test",
        title: "Начать с пробного теста",
        detail:
          "Пробный IELTS или TOEFL покажет реальную стартовую точку. Без него весь план строится на самооценке, а она чаще всего ошибается в обе стороны.",
      },
      fallback,
      {
        id: "shift-intake",
        title: `Сдвинуть подачу на ${intakeYear + 1} год`,
        detail:
          "Лишний год под язык обычно даёт более сильную заявку, чем спешка с низким баллом и подача в те программы, где порог ниже.",
      },
    ],
  };
}

/** Общеобразовательный трек против списка только зарубежных стран. */
function detectTrackVsGeography(profile: Profile): RealityCheckFinding | null {
  const { track, academics, preferences } = profile;
  const { countries } = preferences;
  if (track !== "national" || countries.length === 0) return null;
  if (countries.includes("KZ")) return null;
  if (academics.satScore || academics.predictedIB) return null;

  return {
    id: "track-vs-geography",
    title: "Зарубежный список без внешнего экзамена",
    conflict: `Учебный трек — общеобразовательная школа, а в списке стран только заграница (${countryLabels(countries)}). Аттестат без SAT или IB приёмные комиссии разных стран читают по-разному, и подтвердить вашу академику сейчас нечем.`,
    resolutions: [
      {
        id: "add-external-exam",
        title: "Добавить SAT в план",
        detail:
          "Внешний экзамен переводит аттестат в понятную для зарубежных вузов шкалу и открывает большую часть каталога.",
      },
      {
        id: "keep-home-option",
        title: "Вернуть Казахстан в список",
        detail:
          "ЕНТ — инструмент, который у вас уже есть по треку. Домашний вариант в списке страхует год подачи, пока готовится внешний экзамен.",
      },
      {
        id: "verify-requirements",
        title: "Проверить требования по каждой программе",
        detail:
          "В карточках программ есть ссылки на первоисточник — посмотрите, что конкретный вуз пишет про аттестат без внешнего экзамена, прежде чем строить на этом план.",
      },
    ],
  };
}

/** Бюджет против географии: ни одна выбранная страна не укладывается в потолок. */
function detectBudgetVsGeography(profile: Profile): RealityCheckFinding | null {
  const { countries } = profile.preferences;
  const { annualTuitionUSD, needsFunding } = profile.budget;
  if (countries.length === 0 || needsFunding) return null;

  const floors = countries.map((c) => COUNTRY_TUITION_FLOOR_USD[c]);
  const floor = Math.min(...floors);
  if (annualTuitionUSD >= floor) return null;

  return {
    id: "budget-vs-geography",
    title: "Бюджет не покрывает ни одну выбранную страну",
    conflict: `В географии выбраны ${countryLabels(countries)}, где самая доступная программа каталога стоит ${usd(floor)} за год. Ваш потолок — ${usd(annualTuitionUSD)}, и стипендию вы не закладывали. Такой набор ответов не даёт ни одного реального варианта.`,
    resolutions: [
      {
        id: "enable-funding",
        title: "Отметить, что нужна стипендия",
        detail:
          "Это меняет логику подбора: программы с финансированием поднимаются вверх, а маршрут получает отдельные сроки под заявки на стипендии.",
      },
      {
        id: "widen-geography",
        title: "Расширить список стран",
        detail:
          "Добавьте страны с более низкой стоимостью обучения — выдача сразу перестанет быть пустой.",
      },
      {
        id: "raise-ceiling",
        title: `Поднять потолок до ${usd(floor)}`,
        detail:
          "Если география принципиальна, честнее пересчитать бюджет под неё сейчас, чем подавать заявки в варианты, которые не получится оплатить.",
      },
    ],
  };
}

/**
 * Таблица правил. Порядок — это приоритет: первые три находки попадают
 * пользователю, остальные отсекаются, чтобы не превращать разбор в список
 * претензий.
 */
const RULES: RealityCheckRule[] = [
  { id: "field-vs-subjects", detect: detectFieldVsSubjects },
  { id: "budget-vs-field", detect: detectBudgetVsField },
  { id: "language-vs-plan", detect: detectLanguageVsPlan },
  { id: "track-vs-geography", detect: detectTrackVsGeography },
  { id: "budget-vs-geography", detect: detectBudgetVsGeography },
];

/**
 * Находит расхождения между заявленными приоритетами и собственными вводными.
 * Чистая функция: одинаковый профиль всегда даёт одинаковый список.
 */
export function detectRealityCheck(profile: Profile): RealityCheckFinding[] {
  const out: RealityCheckFinding[] = [];
  for (const rule of RULES) {
    const finding = rule.detect(profile);
    if (finding) out.push(finding);
  }
  return out.slice(0, MAX_FINDINGS);
}
